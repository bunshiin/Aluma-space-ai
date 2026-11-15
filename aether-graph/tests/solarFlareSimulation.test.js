import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_MOTION_SCALE, CAMERA_TARGETS } from '../src/three/solarSystemConfig.js';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import {
  SOLAR_FLARE_PROFILES,
  createSolarFlareController,
  getSolarFlareProfile,
} from '../src/three/solarFlareSimulation.js';
import {
  calculateFlareShot,
  calculateFlareTimeline,
  calculateWavePulse,
} from '../src/three/solarFlareCinematic.js';
import { calculateClawPaths, createTaperedTubeGeometry } from '../src/three/flareGeometry.js';
import { calculateOrthonormalBasis, calculateVecDistance } from '../src/three/flareMath.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const FRAME_S = 1 / 60;
const SUN_RADIUS_UNITS = 6.5;
const ORIGIN = { x: 0, y: 0, z: 0 };
const overview = CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW;
const OVERVIEW_SHOT = {
  position: { x: overview.position_units[0], y: overview.position_units[1], z: overview.position_units[2] },
  target: ORIGIN,
};

function createFlareRig() {
  const counters = createZeroCounters();
  const { THREE } = createMockThreeDeps(counters);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...overview.position_units);
  const controls = { target: new THREE.Vector3(), update() {} };
  const listeners = {};
  const domElement = {
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
  };
  const camCtrl = createCameraController(THREE, camera, controls, domElement, () => new Map());
  const flareCtrl = createSolarFlareController(THREE, scene, camCtrl);
  return { counters, scene, camera, camCtrl, flareCtrl, listeners };
}

test('Gunes patlamasi: C/M/X renkleri (Mavi/Sari/Kirmizi) korunur', () => {
  assert.equal(getSolarFlareProfile({ flare_class: 'C4.4' }).color_hex, 0x38bdf8);
  assert.equal(getSolarFlareProfile({ radiation_level: 'MODERATE' }).color_hex, 0xfacc15);
  assert.equal(getSolarFlareProfile({ intensity_level: 3 }).color_hex, 0xef4444);
  assert.equal(getSolarFlareProfile({ flare_class: '???' }).flare_category, 'C');
  assert.doesNotThrow(() => getSolarFlareProfile(null));
});

test('Tehlike seviyesi arttikca pence, dalga darbesi ve titreme buyur', () => {
  const { C, M, X } = SOLAR_FLARE_PROFILES;
  const keys = ['claw_count', 'claw_height_units', 'wave_max_radius_units', 'wave_cone_rad', 'wave_pulse_count', 'shake_units'];
  keys.forEach((key) => {
    assert.ok(C[key] <= M[key] && M[key] <= X[key], `${key} C<=M<=X olmali`);
    assert.ok(C[key] < X[key], `${key} X, C'den buyuk olmali`);
  });
});

test('Patlama Gunes yaricapina oranla kucuk kalir ve 1-2-3 seviyesine gore buyur', () => {
  const { C, M, X } = SOLAR_FLARE_PROFILES;
  assert.ok(X.claw_height_units <= SUN_RADIUS_UNITS * 0.5, 'en buyuk pence Gunes yaricapinin yarisini gecmez');
  assert.ok(C.claw_height_units < M.claw_height_units && M.claw_height_units < X.claw_height_units);
  assert.ok(X.wave_max_radius_units <= SUN_RADIUS_UNITS * 2.5);

  // Kemerin gercek yuksekligi (tepe - yuzey) ve ayak acikligi seviyeyle artar, Gunes capinin altinda kalir
  const basis = calculateOrthonormalBasis({ x: 0, y: 0, z: 1 });
  const sizes = [C, M, X].map((profile) => {
    const mains = calculateClawPaths(profile, basis, SUN_RADIUS_UNITS).filter((p) => p.is_main);
    const apex = Math.max(...mains.flatMap((p) => p.points.map((pt) => calculateVecDistance(pt, ORIGIN))));
    const lateral = Math.max(...mains.flatMap((p) => p.points.map((pt) => Math.abs(pt.y))));
    return { height_units: apex - SUN_RADIUS_UNITS, lateral_units: lateral };
  });
  assert.ok(sizes[0].height_units < sizes[1].height_units && sizes[1].height_units < sizes[2].height_units);
  assert.ok(sizes[2].height_units < SUN_RADIUS_UNITS, 'X bile Gunes yaricapindan dusuk');
  assert.ok(sizes[2].lateral_units < SUN_RADIUS_UNITS, 'X bile Gunes yaricapindan dar');
});

test('Patlama Gunes govdesine baglanir: govde donunce birlikte doner, yoksa sahneye duser', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const scene = new THREE.Scene();
  const sunBody = new THREE.Group();
  const withSun = createSolarFlareController(THREE, scene, null, () => sunBody);
  withSun.handleTriggerSolarFlare({ flare_category: 'X' });
  assert.equal(sunBody.children.length, 1);
  assert.equal(scene.children.length, 0);
  withSun.destroySolarFlareController();
  assert.equal(sunBody.children.length, 0);

  const withoutSun = createSolarFlareController(THREE, scene, null);
  withoutSun.handleTriggerSolarFlare({ flare_category: 'C' });
  assert.equal(scene.children.length, 1);
  withoutSun.destroySolarFlareController();
  assert.equal(scene.children.length, 0);
});

test('Gezegen hareket carpani yavaslatir ama durdurmaz', () => {
  assert.ok(BODY_MOTION_SCALE > 0 && BODY_MOTION_SCALE < 1);
});

test('Dalga darbeleri sirayla, yavasca acilir, sinirli yaricapta biter ve darbe sayisi kadardir', () => {
  Object.values(SOLAR_FLARE_PROFILES).forEach((profile) => {
    const timeline = calculateFlareTimeline(profile);
    for (let k = 0; k < profile.wave_pulse_count; k += 1) {
      const start_s = timeline.wave_launch_s + k * timeline.wave_pulse_period_s;
      assert.equal(calculateWavePulse(profile, timeline, k, start_s - 0.01).is_active, false);
      let prev = 0;
      // Kayan nokta hatasi darbe basinda yaşi hafif negatif yapabilir, bu yuzden ufak pay birakilir
      for (let t = start_s + 1e-6; t < start_s + timeline.wave_pulse_duration_s - 1e-6; t += FRAME_S) {
        const pulse = calculateWavePulse(profile, timeline, k, t);
        assert.ok(pulse.is_active);
        assert.ok(pulse.radius_units >= prev);
        assert.ok(pulse.radius_units <= profile.wave_max_radius_units);
        prev = pulse.radius_units;
      }
      assert.equal(calculateWavePulse(profile, timeline, k, start_s + timeline.wave_pulse_duration_s + 0.1).is_active, false);
    }
    assert.ok(Number.isFinite(timeline.wave_end_s));
  });
});

test('Sinematik kamera isinlanmaz, patlama noktasinda kalir ve genel gorunume geri donmez', () => {
  Object.values(SOLAR_FLARE_PROFILES).forEach((profile) => {
    const basis = calculateOrthonormalBasis({ x: 0.3, y: 0.28, z: 0.91 });
    const timeline = calculateFlareTimeline(profile);
    let prev = calculateFlareShot(profile, basis, timeline, 0, OVERVIEW_SHOT, SUN_RADIUS_UNITS);
    assert.ok(calculateVecDistance(prev.position, OVERVIEW_SHOT.position) < 1e-6);

    for (let t = FRAME_S; t <= 120; t += FRAME_S) {
      const shot = calculateFlareShot(profile, basis, timeline, t, OVERVIEW_SHOT, SUN_RADIUS_UNITS);
      assert.ok(calculateVecDistance(shot.position, prev.position) < 5, `${profile.flare_category} t=${t.toFixed(2)} sicrama`);
      assert.ok(calculateVecDistance(shot.target, prev.target) < 5);
      // Yaklasma bittikten sonra kamera Gunes'in icine girmez ve patlama bolgesinden uzaga gitmez
      if (t >= timeline.approach_end_s) {
        const sunDist_units = calculateVecDistance(shot.position, ORIGIN);
        assert.ok(sunDist_units > SUN_RADIUS_UNITS + 3 && sunDist_units < 60);
      }
      prev = shot;
    }
    assert.ok(calculateVecDistance(prev.position, OVERVIEW_SHOT.position) > 20);
  });
});

test('Pence kollari Gunes yuzeyinden kalkip ucu tekrar Gunes icine dalan kemerlerdir', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const profile = SOLAR_FLARE_PROFILES.X;
  const basis = calculateOrthonormalBasis({ x: 0, y: 0, z: 1 });
  const paths = calculateClawPaths(profile, basis, SUN_RADIUS_UNITS);
  const mainPaths = paths.filter((path) => path.is_main);
  assert.equal(mainPaths.length, profile.claw_count);
  // Her ana kol + etrafina sarilan iki ince iplik
  assert.equal(paths.length, profile.claw_count * 3);

  mainPaths.forEach((path) => {
    const last = path.points.length - 1;
    const footA_units = calculateVecDistance(path.points[0], ORIGIN);
    const footB_units = calculateVecDistance(path.points[last], ORIGIN);
    assert.ok(Math.abs(footA_units - SUN_RADIUS_UNITS) < 0.1, 'taban yuzeyde');
    assert.ok(Math.abs(footB_units - SUN_RADIUS_UNITS) < 0.1, 'uc yuzeye geri doner');
    const apex_units = Math.max(...path.points.map((p) => calculateVecDistance(p, ORIGIN)));
    assert.ok(apex_units > SUN_RADIUS_UNITS + profile.claw_height_units * 0.5, 'kemer yukselir');
    assert.ok(calculateVecDistance(path.points[0], path.points[last]) > profile.claw_height_units * 0.2, 'iki ayak ayri noktalar');
    // Uca yaklasirken Gunes'e dogru iner: son noktalar tepe noktasindan alcak
    const preTip_units = calculateVecDistance(path.points[last - 4], ORIGIN);
    assert.ok(preTip_units < apex_units);
    assert.ok(path.tip_radius_units < path.base_radius_units);
  });

  paths.forEach((path) => {
    const geometry = createTaperedTubeGeometry(THREE, path, 10);
    assert.equal(geometry.attributes.position.array.length, path.points.length * 11 * 3);
    assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  });
});

test('Patlama kalicidir: darbeler biter ama pence ve parcaciklar sahne kapanana kadar surer', () => {
  const { counters, camera, camCtrl, flareCtrl } = createFlareRig();
  flareCtrl.handleTriggerSolarFlare({ flare_class: 'X2.8', coordinates: { latitude_deg: 16, longitude_deg: 20 } });
  assert.equal(camCtrl.getActiveFocus().id, 'SUN');

  const { timeline, wave, particles } = flareCtrl.getActiveFlare();
  let maxVisibleShells = 0;
  for (let t = 0; t < 90; t += FRAME_S) {
    flareCtrl.handleSolarFlareFrameUpdate(FRAME_S);
    camCtrl.handleCameraFrameUpdate();
    maxVisibleShells = Math.max(maxVisibleShells, wave.shells.filter(({ mesh }) => mesh.visible).length);
  }

  assert.ok(maxVisibleShells >= 1, 'EM dalgasi gorunmeli');
  assert.ok(90 > timeline.wave_end_s, 'test darbelerin bitmesinden sonrasini da kapsar');
  assert.ok(wave.shells.every(({ mesh }) => !mesh.visible), 'darbeler bitince kabuklar gorunmez');
  assert.ok(flareCtrl.getActiveFlare(), 'patlama sahne kapanana kadar surer');
  assert.equal(camCtrl.getActiveFocus().id, 'SUN');
  assert.ok(Math.hypot(camera.position.x, camera.position.y, camera.position.z) < 60, 'kamera olay yerinde');

  // Darbeler bittikten sonra da parcaciklar kemer boyunca akmaya devam eder
  const before = Array.from(particles.positions.slice(0, 30));
  flareCtrl.handleSolarFlareFrameUpdate(0.25);
  const after = Array.from(particles.positions.slice(0, 30));
  assert.notDeepEqual(before, after);
  assert.equal(particles.uniforms.uOpacity.value > 0.5, true);

  flareCtrl.destroySolarFlareController();
  assert.equal(flareCtrl.getActiveFlare(), null);
  assert.equal(camCtrl.getActiveFocus().id, 'SOLAR_SYSTEM_OVERVIEW');
  assert.ok(counters.geometryDispose > 0 && counters.materialDispose > 0);
});

test('Kullanici tekerlek veya surukleme ile mudahale ederse sinematik kamera birakir', () => {
  ['wheel', 'pointerdown'].forEach((eventName) => {
    const { camera, camCtrl, flareCtrl, listeners } = createFlareRig();
    flareCtrl.handleTriggerSolarFlare({ flare_category: 'M' });
    flareCtrl.handleSolarFlareFrameUpdate(0.5);
    listeners[eventName]({ deltaY: 120, clientX: 0, clientY: 0 });
    camera.position.set(50, 50, 50);
    flareCtrl.handleSolarFlareFrameUpdate(FRAME_S);
    camCtrl.handleCameraFrameUpdate();
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [50, 50, 50]);
    assert.ok(flareCtrl.getActiveFlare(), 'kamera birakilsa da patlama surer');
    assert.doesNotThrow(() => flareCtrl.destroySolarFlareController());
  });
});
