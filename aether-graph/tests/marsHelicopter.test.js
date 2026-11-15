import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateHelicopterFlightPose,
  calculateMastTrackingAnglesRad,
  HELICOPTER_CRUISE_ALTITUDE_M,
  HELICOPTER_ORBIT_RADIUS_M,
  isMarsHelicopterRequest,
} from '../src/three/marsHelicopter.js';
import { createMarsSurfaceScene } from '../src/three/marsSurfaceScene.js';
import { getMarsSite } from '../src/three/marsCoordinates.js';
import { getCameraTarget } from '../src/three/solarSystemConfig.js';
import { createMockRover, createMockThreeDeps, createZeroCounters } from './mockThree.js';

function createMockHelicopter(THREE) {
  const root = new THREE.Group();
  root.name = 'bus';
  const upperRotor = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  upperRotor.name = 'rotors_01';
  const lowerRotor = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  lowerRotor.name = 'rotors_02';
  root.add(upperRotor, lowerRotor);
  return root;
}

test('isMarsHelicopterRequest ve hedef cozumlemesi: INGENUITY Jezero sahnesine baglanir', () => {
  assert.equal(isMarsHelicopterRequest('INGENUITY'), true);
  assert.equal(isMarsHelicopterRequest('mars_helicopter'), true);
  assert.equal(isMarsHelicopterRequest('HELICOPTER'), true);
  assert.equal(isMarsHelicopterRequest('PERSEVERANCE'), false);
  assert.equal(isMarsHelicopterRequest('JEZERO'), false);
  assert.equal(isMarsHelicopterRequest(null), false);

  assert.equal(getMarsSite('INGENUITY').id, 'JEZERO');
  assert.equal(getCameraTarget('INGENUITY').surface_site_id, 'INGENUITY');
});

test('calculateHelicopterFlightPose: yerden kalkar ve Perseverance etrafinda dairesel ucar', () => {
  const roverPose = { x_m: 2, z_m: -3, yaw_rad: 0 };
  const startPose = calculateHelicopterFlightPose(roverPose, 0);
  assert.equal(startPose.takeoff_u, 0);
  assert.ok(startPose.y_m < 0.3, 'baslangicta yere yakin olmali');

  const cruisePoseA = calculateHelicopterFlightPose(roverPose, 4);
  const cruisePoseB = calculateHelicopterFlightPose(roverPose, 8);
  assert.equal(cruisePoseA.takeoff_u, 1);
  assert.ok(Math.abs(cruisePoseA.y_m - HELICOPTER_CRUISE_ALTITUDE_M) < 0.3);

  const distA_m = Math.hypot(cruisePoseA.x_m - roverPose.x_m, cruisePoseA.z_m - roverPose.z_m);
  assert.ok(Math.abs(distA_m - HELICOPTER_ORBIT_RADIUS_M) < 1e-6);
  assert.ok(
    Math.hypot(cruisePoseB.x_m - cruisePoseA.x_m, cruisePoseB.z_m - cruisePoseA.z_m) > 1.5,
    'helikopter Perseverance etrafinda ilerlemeli'
  );
  assert.ok(cruisePoseB.rotor_angle_rad > cruisePoseA.rotor_angle_rad, 'rotorlar donmeli');
});

test('calculateMastTrackingAnglesRad: Perseverance kamerasi helikopterin konumuna gore pan ve tilt yapar', () => {
  const roverPose = { x_m: 0, z_m: 0, yaw_rad: 0 };
  const frontHeli = { x_m: -0.522, y_m: 2.8, z_m: 3.713 };
  const rightHeli = { x_m: 2.5, y_m: 2.8, z_m: 0.713 };

  const frontTrack = calculateMastTrackingAnglesRad(roverPose, frontHeli);
  const rightTrack = calculateMastTrackingAnglesRad(roverPose, rightHeli);

  assert.ok(Math.abs(frontTrack.pan_rad) < 0.05, 'ondeki helikoptere pan ~ 0 olmali');
  assert.ok(frontTrack.tilt_rad < -0.15, 'yukaridaki helikoptere kamera yukari (-tilt) bakmali');
  assert.ok(rightTrack.pan_rad > 1.2, 'yandaki helikoptere pan donmeli');
});

test('Kullanici cagirmadigi surece helikopter yuklenmez/gorunmez; cagrildiginda ucar ve Perseverance kamerasi onu izler', async () => {
  const counters = createZeroCounters();
  const spy = { disposed: 0 };
  const deps = createMockThreeDeps(counters);
  const renderer = new deps.THREE.WebGLRenderer();
  const customLoader = {
    loadAsync: async (url) => {
      if (String(url).includes('ingenuity')) {
        return { scene: createMockHelicopter(deps.THREE) };
      }
      return { scene: createMockRover(deps.THREE, spy) };
    },
  };

  const surface = await createMarsSurfaceScene(deps, renderer, {}, 1.5, customLoader);
  assert.equal(surface.isHelicopterActive(), false);
  assert.equal(surface.getHelicopterRig(), null);
  assert.equal(surface.scene.getObjectByName('INGENUITY_ROOT'), null, 'cagrilmadan helikopter sahnede olmamali');

  // Kullanıcı helikopteri çağırdığında yüklenir ve uçuşa başlar
  await surface.handleHelicopterRequest(true);
  assert.equal(surface.isHelicopterActive(), true);
  const heliRoot = surface.scene.getObjectByName('INGENUITY_ROOT');
  assert.ok(heliRoot, 'cagrildiktan sonra INGENUITY_ROOT sahnede olmali');

  const panHistory = [];
  for (let i = 0; i < 90; i += 1) {
    surface.handleSurfaceFrame(1 / 15, false);
    panHistory.push(surface.motion.mast_rad[0]);
  }
  assert.equal(surface.motion.phase_id, 'INGENUITY_FLIGHT');
  assert.ok(heliRoot.position.y > 1.8, 'helikopter yukselmeli');
  const panSpan_rad = Math.max(...panHistory) - Math.min(...panHistory);
  assert.ok(panSpan_rad > 0.8, `Perseverance mast kamerasi helikopteri donerek takip etmeli (span=${panSpan_rad})`);

  surface.destroyMarsSurfaceScene();
});

test('ingenuity.glb dosyasi mevcuttur ve bus, rotors_01, rotors_02 dugumlerini icerir', () => {
  const buf = fs.readFileSync(new URL('../public/models/ingenuity.glb', import.meta.url));
  const jsonLen = buf.readUInt32LE(12);
  const gltfJson = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const nodeNames = new Set(gltfJson.nodes.map((n) => n.name));
  assert.ok(nodeNames.has('bus'));
  assert.ok(nodeNames.has('rotors_01'));
  assert.ok(nodeNames.has('rotors_02'));
});
