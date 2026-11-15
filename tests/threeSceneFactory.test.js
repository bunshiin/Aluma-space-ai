import test from 'node:test';
import assert from 'node:assert/strict';
import { create3DMissionScene } from '../src/three/threeSceneFactory.js';
import {
  CAMERA_TARGETS,
  calculateRadFromDeg,
  calculateSceneUnitsFromKm,
  getCameraTarget,
} from '../src/three/solarSystemConfig.js';
import { getSanitizedNode, handleModelNormalization } from '../src/three/solarSystemBuilder.js';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

test('10 kez ac-kapa (destroy) testi: renderer.dispose ve cancelAnimationFrame her seferinde cagrilir', async () => {
  const counters = createZeroCounters();
  const container = { clientWidth: 1280, clientHeight: 720, appendChild() {} };

  for (let i = 0; i < 10; i += 1) {
    const deps = createMockThreeDeps(counters);
    const sceneHandle = await create3DMissionScene(container, 'SOLAR_SYSTEM', () => {}, deps);
    assert.equal(typeof sceneHandle.destroy, 'function');
    sceneHandle.destroy();
  }

  assert.equal(counters.rendererDispose, 10);
  assert.equal(counters.cancelAnimationFrame, 10);
  assert.equal(counters.controlsDispose, 10);
  assert.equal(counters.dracoDispose, 10);
  assert.ok(counters.geometryDispose >= 10);
  assert.ok(counters.materialDispose >= 10);
});

test('Sozlesme guvenligi: gecersiz container hata firlatmaz, { destroy } doner', async () => {
  const handle = await create3DMissionScene(null, 'SOLAR_SYSTEM', () => {});
  assert.equal(typeof handle?.destroy, 'function');
  assert.doesNotThrow(() => handle.destroy());
});

test('Bilinmeyen camera_target hata firlatmaz ve varsayilan gorunume doner', () => {
  assert.doesNotThrow(() => getCameraTarget('UNKNOWN_PLANET'));
  assert.doesNotThrow(() => getCameraTarget(null));
  assert.doesNotThrow(() => getCameraTarget(123));

  assert.deepEqual(getCameraTarget('UNKNOWN_PLANET'), CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW);
  assert.deepEqual(getCameraTarget('EARTH'), CAMERA_TARGETS.EARTH);
  assert.deepEqual(getCameraTarget('ERIS'), CAMERA_TARGETS.ERIS);
});

test('Birim donusumleri, gomulu isik kapatma ve getSanitizedNode dogru calisir', () => {
  assert.ok(calculateSceneUnitsFromKm(149597870) > 29.9 && calculateSceneUnitsFromKm(149597870) < 30.1);
  assert.equal(calculateSceneUnitsFromKm(-10), 0);
  assert.ok(Math.abs(calculateRadFromDeg(180) - Math.PI) < 1e-9);

  const { THREE } = createMockThreeDeps(createZeroCounters());
  const root = new THREE.Group();
  const child = new THREE.Group();
  child.name = 'Mars_Material002_0';
  const embeddedLight = new THREE.Group();
  embeddedLight.name = 'Light';
  embeddedLight.intensity = 5;
  root.add(child);
  root.add(embeddedLight);

  assert.equal(getSanitizedNode(THREE, root, 'Mars_Material.002_0'), child);
  handleModelNormalization(THREE, root, 2.0);
  assert.equal(embeddedLight.visible, false);
  assert.equal(embeddedLight.intensity, 0);
});

test('Gezegen/uydu zoom sonrasi merkezlenir, zoom out yapilinca otomatik Gunese doner', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera();
  const controls = { target: new THREE.Vector3(), update() {} };
  const listeners = {};
  const domElement = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
  };
  const marsNode = new THREE.Group();
  marsNode.position.set(35, 0, 0);
  const bodyMap = new Map([['MARS', marsNode]]);

  const ctrl = createCameraController(THREE, camera, controls, domElement, () => bodyMap);
  ctrl.handleFocusTarget('MARS');
  assert.equal(ctrl.getActiveFocus().id, 'MARS');

  // Kamerayi uzaklastirip wheel zoom-out tetiklendiginde otomatik Gunese donmeli
  camera.position.set(100, 0, 0);
  listeners.wheel({ deltaY: 120 });
  assert.equal(ctrl.getActiveFocus().id, 'SOLAR_SYSTEM_OVERVIEW');
  ctrl.destroyCameraController();
});

test('Sozlesme kapisi: EARTH_EVENTS tarayici disinda hata firlatmaz, { destroy } doner', async () => {
  const handle = await create3DMissionScene({ clientWidth: 800, clientHeight: 600, appendChild() {} }, 'EARTH_EVENTS', () => {});
  assert.equal(typeof handle?.destroy, 'function');
  assert.doesNotThrow(() => handle.destroy());
});
