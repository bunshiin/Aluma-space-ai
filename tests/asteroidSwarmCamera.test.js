import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFocusCameraPosition, createAsteroidCameraController } from '../src/three/asteroidSwarmCamera.js';
import { ASTEROID_CAMERA, getAsteroidFocusTarget } from '../src/three/asteroidSwarmConfig.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

function createFixture() {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...ASTEROID_CAMERA.overview_position_units);
  const controls = { target: new THREE.Vector3(), minDistance: 3, update() {} };
  const node = new THREE.Group();
  node.position.set(5, 0, 0);
  const nodes = new Map([['99942 Apophis', node]]);
  const controller = createAsteroidCameraController(THREE, camera, controls, null, () => nodes);
  return { camera, controls, node, nodes, controller };
}

test('getAsteroidFocusTarget: bilinen ad döner, bilinmeyen ve bozuk girdi genel görünüme düşer', () => {
  const known = new Set(['99942 Apophis']);
  assert.equal(getAsteroidFocusTarget('99942 Apophis', known), '99942 Apophis');
  assert.equal(getAsteroidFocusTarget('YOK', known), ASTEROID_CAMERA.OVERVIEW_TARGET);
  assert.equal(getAsteroidFocusTarget(null, known), ASTEROID_CAMERA.OVERVIEW_TARGET);
  assert.equal(getAsteroidFocusTarget('99942 Apophis', null), ASTEROID_CAMERA.OVERVIEW_TARGET);
});

test('calculateFocusCameraPosition: kamera asteroidin dış tarafında ve üstünde durur', () => {
  const pos = calculateFocusCameraPosition({ x: 5, y: 0, z: 0 }, 1);
  assert.deepEqual(pos, { x: 6, y: 0.45, z: 0 });
  // Asteroit tam merkezdeyse bölme hatası olmaz
  const center = calculateFocusCameraPosition({ x: 0, y: 0, z: 0 }, 1);
  assert.ok(Object.values(center).every(Number.isFinite));
});

test('odaklanınca kamera asteroide yaklaşır, asteroit hareket edince onu takip eder', () => {
  const { camera, controls, node, controller } = createFixture();
  assert.equal(controller.handleFocusTarget('99942 Apophis'), '99942 Apophis');
  assert.equal(controls.minDistance, ASTEROID_CAMERA.focus_min_distance_units);
  const startDist = Math.hypot(camera.position.x - 5, camera.position.y, camera.position.z);
  for (let i = 0; i < 200; i += 1) controller.handleCameraFrameUpdate();
  const nearDist = Math.hypot(camera.position.x - 5, camera.position.y, camera.position.z);
  assert.ok(nearDist < startDist / 5, `kamera yaklaşmadı: ${nearDist}`);

  // Asteroit yörüngede 1 birim ilerlerse kamera da aynı miktar kayar (ışınlanma değil, takip)
  const before = camera.position.z;
  node.position.set(5, 0, 1);
  controller.handleCameraFrameUpdate();
  assert.ok(Math.abs(camera.position.z - before - 1) < 0.05);
});

test('bilinmeyen hedef ve veriden çıkan asteroit genel görünüme döndürür, hata fırlatmaz', () => {
  const { controls, nodes, controller } = createFixture();
  assert.doesNotThrow(() => controller.handleFocusTarget(undefined));
  assert.equal(controller.getActiveFocus(), ASTEROID_CAMERA.OVERVIEW_TARGET);

  controller.handleFocusTarget('99942 Apophis');
  nodes.clear();
  assert.doesNotThrow(() => controller.handleCameraFrameUpdate());
  assert.equal(controller.getActiveFocus(), ASTEROID_CAMERA.OVERVIEW_TARGET);
  assert.equal(controls.minDistance, ASTEROID_CAMERA.overview_min_distance_units);
});

test('odak değişince ag:focus-changed olayı bir kez yayınlanır', () => {
  const target = new EventTarget();
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  const received = [];
  target.addEventListener('ag:focus-changed', (e) => received.push(e.detail.target));
  try {
    const { controller } = createFixture();
    controller.handleFocusTarget('99942 Apophis');
    controller.handleFocusTarget('99942 Apophis');
    controller.handleFocusTarget('EARTH');
    assert.deepEqual(received, ['99942 Apophis', 'EARTH']);
  } finally {
    delete globalThis.dispatchEvent;
  }
});
