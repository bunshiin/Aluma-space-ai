import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateOrbitAngleRad,
  calculateSpacecraftWobbleRad,
  createSpacecraftTrackerController,
  resolveSpacecraftId,
  SPACECRAFT_BODIES,
  SPACECRAFT_CAMERA_TARGETS,
} from '../src/three/spacecraftTracker.js';
import { CAMERA_TARGETS, getCameraTarget, SOLAR_SYSTEM_BODIES } from '../src/three/solarSystemConfig.js';
import { createOrbitRig, createSolarSystem } from '../src/three/solarSystemBuilder.js';
import { calculateFollowedPoint, calculateSatelliteCameraPos } from '../src/three/cameraFollow.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const SPACECRAFT_IDS = ['ISS', 'HUBBLE', 'JWST', 'MARS_PHOTO_SAT', 'PARKER', 'NEW_HORIZONS', 'VOYAGER_1', 'VOYAGER_2'];

// Kamera kontrolcüsünün sadece tracker'ın kullandığı yüzü; odak çağrılarını kaydeder
function createFakeCamera({ settleAfterFrames = 0 } = {}) {
  let focus = CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW;
  let framesLeft = 0;
  const calls = [];
  return {
    calls,
    handleFocusTarget(name) {
      calls.push(name);
      focus = getCameraTarget(name);
      framesLeft = settleAfterFrames;
    },
    getActiveFocus: () => focus,
    isZoomingToTarget: () => {
      if (framesLeft > 0) {
        framesLeft -= 1;
        return true;
      }
      return false;
    },
  };
}

function createRig(THREE, id, parent_id, rotation_y = 0) {
  const orbitPivot = new THREE.Group();
  orbitPivot.rotation.y = rotation_y;
  return { cfg: { id, parent_id }, orbitPivot };
}

function runFrames(tracker, count, delta_s = 0.1) {
  for (let i = 0; i < count; i += 1) tracker.handleSpacecraftFrameUpdate(delta_s);
}

function normalizeRad(angle_rad) {
  return Math.atan2(Math.sin(angle_rad), Math.cos(angle_rad));
}

test('Envanter: 7 arac tabloda, kamera hedeflerinde ve Gunes Sistemi listesinde; rover/Apollo yok', () => {
  assert.deepEqual(SPACECRAFT_BODIES.map((b) => b.id), SPACECRAFT_IDS);
  assert.deepEqual(Object.keys(SPACECRAFT_CAMERA_TARGETS), SPACECRAFT_IDS);
  SPACECRAFT_BODIES.forEach((cfg) => {
    assert.equal(cfg.is_spacecraft, true);
    assert.ok(cfg.target_radius_units > 0 && cfg.orbit_radius_units > 0);
    assert.ok(['EARTH', 'SUN', 'MARS'].includes(cfg.parent_id));
    assert.ok(SOLAR_SYSTEM_BODIES.includes(cfg));
    assert.equal(CAMERA_TARGETS[cfg.id], SPACECRAFT_CAMERA_TARGETS[cfg.id]);
    assert.ok(fs.existsSync(new URL(`..${cfg.model_url}`, import.meta.url)), `${cfg.model_url} yok`);
  });
  const urls = SOLAR_SYSTEM_BODIES.map((b) => b.model_url).join(' ');
  ['perseverance', 'curiosity', 'saturn_v', 'apollo_lunar_module'].forEach((name) => {
    assert.ok(!urls.includes(`/${name}.glb`), `${name} dahil edilmemeli`);
  });
  assert.equal(new Set(SOLAR_SYSTEM_BODIES.map((b) => b.id)).size, SOLAR_SYSTEM_BODIES.length);
});

test('Alias cozumlemesi ve bilinmeyen kimlik ana gorunume doner', () => {
  assert.equal(resolveSpacecraftId('JAMES_WEBB'), 'JWST');
  assert.equal(resolveSpacecraftId('HUBBLE_SPACE_TELESCOPE'), 'HUBBLE');
  assert.equal(resolveSpacecraftId('PARKER_SOLAR_PROBE'), 'PARKER');
  assert.equal(resolveSpacecraftId('VOYAGER'), 'VOYAGER_1');
  assert.equal(resolveSpacecraftId('SPACE_STATION'), 'ISS');
  assert.equal(resolveSpacecraftId('VOYAGER_2'), 'VOYAGER_2');
  [undefined, null, 42, {}, 'jwst', 'EARTH', 'UNKNOWN_PROBE'].forEach((bad) => {
    assert.equal(resolveSpacecraftId(bad), 'SOLAR_SYSTEM_OVERVIEW');
  });
  assert.equal(getCameraTarget('JAMES_WEBB'), CAMERA_TARGETS.JWST);
  assert.equal(getCameraTarget('SPACE_STATION'), CAMERA_TARGETS.ISS);
  assert.equal(getCameraTarget('NOT_A_TARGET'), CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW);
});

test('calculateOrbitAngleRad ekliptik boylami verir, bozuk vektorde null doner', () => {
  assert.ok(Math.abs(calculateOrbitAngleRad({ x_km: 1, y_km: 0, z_km: 9 }) - 0) < 1e-12);
  assert.ok(Math.abs(calculateOrbitAngleRad({ x_km: 0, y_km: 5, z_km: 0 }) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(calculateOrbitAngleRad([{ x_km: -3, y_km: 0, z_km: 0 }]) - Math.PI) < 1e-12);
  [null, undefined, 'x', {}, { x_km: 0, y_km: 0 }, { x_km: NaN, y_km: 1 }, { x_km: '1', y_km: 2 }, []].forEach((bad) => {
    assert.equal(calculateOrbitAngleRad(bad), null);
  });
});

test('position_vectors araci ebeveyn donusunu hesaba katarak yumusakca hizalar', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const earthRig = createRig(THREE, 'EARTH', 'SUN', 1.0);
  const issRig = createRig(THREE, 'ISS', 'EARTH', 0);
  const rigs = [createRig(THREE, 'SUN', null), earthRig, issRig];
  const events = new EventTarget();
  const tracker = createSpacecraftTrackerController(createFakeCamera(), () => rigs, events);

  events.dispatchEvent(new CustomEvent('ag:spacecraft-focus', {
    detail: { id: 'ISS', position_vectors: { x_km: 0, y_km: 6771, z_km: 120 } },
  }));
  tracker.handleSpacecraftFrameUpdate(0.1);
  const firstStep_rad = issRig.orbitPivot.rotation.y;
  // Tek karede hedefe ışınlanmamalı
  assert.ok(Math.abs(normalizeRad(firstStep_rad + 1.0 - Math.PI / 2)) > 0.1);

  runFrames(tracker, 60);
  assert.ok(Math.abs(normalizeRad(issRig.orbitPivot.rotation.y + 1.0 - Math.PI / 2)) < 1e-3);
  tracker.destroySpacecraftTracker();
});

test('ag:spacecraft-focus -> ag:spacecraft-ready akisi: kamera oturunca bir kez yayinlanir', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const rigs = [createRig(THREE, 'EARTH', 'SUN'), createRig(THREE, 'JWST', 'EARTH')];
  const events = new EventTarget();
  const camera = createFakeCamera({ settleAfterFrames: 5 });
  const tracker = createSpacecraftTrackerController(camera, () => rigs, events);
  const readyDetails = [];
  events.addEventListener('ag:spacecraft-ready', (e) => readyDetails.push(e.detail));

  const parameters = { topic: 'mirror' };
  events.dispatchEvent(new CustomEvent('ag:spacecraft-focus', {
    detail: { id: 'JAMES_WEBB', action_type: 'SHOW_FACT_CARD', parameters },
  }));
  assert.deepEqual(camera.calls, ['JWST']);

  runFrames(tracker, 4);
  assert.equal(readyDetails.length, 0, 'kamera oturmadan ready gelmemeli');
  runFrames(tracker, 10);
  assert.equal(readyDetails.length, 1);
  assert.deepEqual(readyDetails[0], { id: 'JWST', action_type: 'SHOW_FACT_CARD', parameters });
  tracker.destroySpacecraftTracker();
});

test('ag:focus-target sadece arac hedefliyse ready akisini baslatir', () => {
  const events = new EventTarget();
  const camera = createFakeCamera();
  const tracker = createSpacecraftTrackerController(camera, () => [], events);
  const ready = [];
  events.addEventListener('ag:spacecraft-ready', (e) => ready.push(e.detail.id));

  events.dispatchEvent(new CustomEvent('ag:focus-target', { detail: { target: 'MARS' } }));
  runFrames(tracker, 3);
  assert.deepEqual(ready, []);

  events.dispatchEvent(new CustomEvent('ag:focus-target', { detail: { target: 'VOYAGER' } }));
  runFrames(tracker, 3);
  assert.deepEqual(ready, ['VOYAGER_1']);
  tracker.destroySpacecraftTracker();
});

test('Bilinmeyen kimlik ve bozuk detail cokmez, ana gorunume odaklar', () => {
  const events = new EventTarget();
  const camera = createFakeCamera();
  const tracker = createSpacecraftTrackerController(camera, () => null, events);
  const ready = [];
  events.addEventListener('ag:spacecraft-ready', (e) => ready.push(e.detail));

  assert.doesNotThrow(() => {
    events.dispatchEvent(new CustomEvent('ag:spacecraft-focus', { detail: null }));
    events.dispatchEvent(new CustomEvent('ag:spacecraft-focus', {
      detail: { id: 'DEATH_STAR', parameters: 'bozuk', position_vectors: 'bozuk' },
    }));
    runFrames(tracker, 2, NaN);
    runFrames(tracker, 2);
  });
  assert.deepEqual(camera.calls, ['SOLAR_SYSTEM_OVERVIEW', 'SOLAR_SYSTEM_OVERVIEW']);
  assert.deepEqual(ready, [{ id: 'SOLAR_SYSTEM_OVERVIEW', action_type: null, parameters: {} }]);
  tracker.destroySpacecraftTracker();
});

test('Model yuklenmemisse ready zaman asiminda yine yayinlanir; baska hedefe gecilirse iptal olur', () => {
  const events = new EventTarget();
  const camera = createFakeCamera({ settleAfterFrames: 1000 });
  const tracker = createSpacecraftTrackerController(camera, () => [], events);
  const ready = [];
  events.addEventListener('ag:spacecraft-ready', (e) => ready.push(e.detail.id));

  tracker.handleSpacecraftFocus({ id: 'PARKER', position_vectors: { x_km: 1, y_km: 1, z_km: 0 } });
  runFrames(tracker, 49);
  assert.deepEqual(ready, []);
  runFrames(tracker, 2);
  assert.deepEqual(ready, ['PARKER']);

  tracker.handleSpacecraftFocus({ id: 'HUBBLE' });
  camera.handleFocusTarget('MARS');
  runFrames(tracker, 60);
  assert.deepEqual(ready, ['PARKER']);
  tracker.destroySpacecraftTracker();
});

test('destroySpacecraftTracker dinleyicileri kaldirir', () => {
  const events = new EventTarget();
  const camera = createFakeCamera();
  const tracker = createSpacecraftTrackerController(camera, () => [], events);
  tracker.destroySpacecraftTracker();
  events.dispatchEvent(new CustomEvent('ag:spacecraft-focus', { detail: { id: 'ISS' } }));
  events.dispatchEvent(new CustomEvent('ag:focus-target', { detail: { target: 'ISS' } }));
  assert.deepEqual(camera.calls, []);
});

test('Builder: araclarda mavi halka yok, sadece isaret; donmeyen araclara yorunge cizgisi cizilmez', async () => {
  const { THREE, GLTFLoader } = createMockThreeDeps(createZeroCounters());
  const scene = new THREE.Scene();
  const { bodyMap } = await createSolarSystem(THREE, new GLTFLoader(), scene, () => {}, () => false);

  SPACECRAFT_IDS.forEach((id) => {
    const beacon = bodyMap.get(id).children.find((c) => c.name === 'SPACECRAFT_BEACON');
    assert.ok(beacon, `${id} isareti yok`);
    assert.equal(beacon.children.length, 1, 'halka kalmamali, sadece isaret noktasi');
    assert.ok(beacon.children[0] instanceof THREE.Points);
  });
  assert.ok(!bodyMap.get('MARS').children.some((c) => c.name === 'SPACECRAFT_BEACON'));

  let cyanRings = 0;
  scene.traverse((node) => {
    if (node.material?.color === 0x38bdf8 && node.material.opacity === 0.35) cyanRings += 1;
  });
  const orbiting = SPACECRAFT_BODIES.filter((b) => b.orbit_speed_deg_s !== 0);
  assert.deepEqual(orbiting.map((b) => b.id), ['ISS', 'HUBBLE', 'MARS_PHOTO_SAT', 'PARKER']);
  assert.equal(cyanRings, orbiting.length);
});

test('Gercek mesafe sirasi: alcak yorunge Ay icinde, JWST Ay disinda, Voyagerlar en dista ve ekliptik disinda', () => {
  const byId = Object.fromEntries(SOLAR_SYSTEM_BODIES.map((b) => [b.id, b]));
  const earth = byId.EARTH;
  ['ISS', 'HUBBLE'].forEach((id) => {
    const cfg = byId[id];
    assert.ok(cfg.orbit_radius_units - cfg.target_radius_units > earth.target_radius_units, `${id} Dunya'ya giriyor`);
    assert.ok(cfg.orbit_radius_units < earth.target_radius_units * 1.1, `${id} alcak yorungede degil`);
  });
  assert.ok(byId.ISS.orbit_radius_units < byId.HUBBLE.orbit_radius_units);
  assert.ok(Math.abs(byId.JWST.orbit_radius_units / byId.MOON.orbit_radius_units - 3.9) < 0.05);
  assert.ok(byId.PARKER.orbit_radius_units - byId.PARKER.target_radius_units > byId.SUN.target_radius_units);
  assert.ok(byId.PARKER.orbit_radius_units < byId.MERCURY.orbit_radius_units);
  const outer = Math.max(...SOLAR_SYSTEM_BODIES.filter((b) => !b.is_spacecraft).map((b) => b.orbit_radius_units));
  assert.ok(byId.NEW_HORIZONS.orbit_radius_units > byId.MAKEMAKE.orbit_radius_units);
  assert.ok(byId.VOYAGER_2.orbit_radius_units > outer && byId.VOYAGER_1.orbit_radius_units > byId.VOYAGER_2.orbit_radius_units);

  const { THREE } = createMockThreeDeps(createZeroCounters());
  const v1 = createOrbitRig(THREE, byId.VOYAGER_1, 0);
  const elevation_deg = (Math.atan2(v1.bodyPivot.position.y, v1.bodyPivot.position.x) * 180) / Math.PI;
  assert.ok(Math.abs(elevation_deg - 35) < 1e-9);
  assert.ok(Math.abs(v1.orbitPivot.rotation.y - (256 * Math.PI) / 180) < 1e-9);
  const iss = createOrbitRig(THREE, byId.ISS, 3);
  assert.equal(iss.orbitPivot.rotation.order, 'ZYX');
  assert.ok(Math.abs(iss.orbitPivot.rotation.z - (51.6 * Math.PI) / 180) < 1e-9);
});

test('Uydu kamerasi gezegenin disinda kalir ve arac donerken ebeveyn etrafinda onunla doner', () => {
  const parent = { x: 26, y: 0, z: 0 };
  const R = 1.15;
  for (let a = 0; a < 360; a += 15) {
    const t = (a * Math.PI) / 180;
    const body = { x: parent.x + 1.226 * Math.cos(t), y: 1.226 * Math.sin(t) * 0.6, z: parent.z + 1.226 * Math.sin(t) * 0.8 };
    const cam = calculateSatelliteCameraPos(body, parent, 0.25);
    assert.ok(Math.hypot(cam.x - parent.x, cam.y - parent.y, cam.z - parent.z) > R);
  }

  // Yarim tur sonra, sabit dunya ofsetiyle tasinan kamera gezegenin icine duserdi; donen takip dusmez
  let cam = calculateSatelliteCameraPos({ x: 27.226, y: 0, z: 0 }, parent, 0.25);
  let prevBody = { x: 27.226, y: 0, z: 0 };
  for (let a = 5; a <= 180; a += 5) {
    const t = (a * Math.PI) / 180;
    const body = { x: parent.x + 1.226 * Math.cos(t), y: 0, z: -1.226 * Math.sin(t) };
    cam = calculateFollowedPoint(cam, prevBody, body, parent, parent);
    prevBody = body;
  }
  assert.ok(Math.hypot(cam.x - parent.x, cam.y - parent.y, cam.z - parent.z) > R);
  assert.ok(cam.x < parent.x, 'kamera aracin disarisinda kalmali');

  const moved = calculateFollowedPoint({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: -1 }, null, null);
  assert.deepEqual(moved, { x: 6, y: 2, z: 2 });
});

test('Mars uydusu (MARS_PHOTO_SAT) ve Hubble (HUBBLE) sabit donmez, 3 eksende hafif yalpalanir', () => {
  const marsSat = SPACECRAFT_BODIES.find((b) => b.id === 'MARS_PHOTO_SAT');
  const hubble = SPACECRAFT_BODIES.find((b) => b.id === 'HUBBLE');
  const w0 = calculateSpacecraftWobbleRad(marsSat, 0);
  const w1 = calculateSpacecraftWobbleRad(marsSat, 1.4);
  assert.notEqual(w0.pitch_rad, w1.pitch_rad);
  assert.notEqual(w0.yaw_rad, w1.yaw_rad);
  assert.notEqual(w0.roll_rad, w1.roll_rad);

  const h0 = calculateSpacecraftWobbleRad(hubble, 0);
  const h1 = calculateSpacecraftWobbleRad(hubble, 1.4);
  assert.notEqual(h0.pitch_rad, h1.pitch_rad);
  assert.notEqual(h0.yaw_rad, h1.yaw_rad);
  assert.notEqual(h0.roll_rad, h1.roll_rad);
  assert.notEqual(w1.pitch_rad, h1.pitch_rad, 'farklı uydular aynı fazda sallanmamalı');
});

test('Kamera kilitliyken (Mars yüzeyinden çıkış) bekleme süresi işlemez; kilit açılınca uydu hazır olur', () => {
  const camera = createFakeCamera();
  let is_input_enabled = false;
  camera.isInputEnabled = () => is_input_enabled;
  const events = new EventTarget();
  const ready = [];
  events.addEventListener('ag:spacecraft-ready', (e) => ready.push(e.detail.id));
  const tracker = createSpacecraftTrackerController(camera, () => [], events);

  tracker.handleSpacecraftFocus({ id: 'MARS_PHOTO_SAT' });
  // 5 sn'lik zaman aşımından çok daha uzun süre kilitli kalsa bile hazır olmamalı
  runFrames(tracker, 100, 0.1);
  assert.deepEqual(ready, [], 'kamera varmadan hazır bildirildi');

  is_input_enabled = true;
  runFrames(tracker, 3, 0.1);
  assert.deepEqual(ready, ['MARS_PHOTO_SAT']);
  tracker.destroySpacecraftTracker();
});
