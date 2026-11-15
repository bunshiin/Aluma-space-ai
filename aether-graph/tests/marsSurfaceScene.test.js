import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarsSurfaceScene } from '../src/three/marsSurfaceScene.js';
import { createMockRover, createMockThreeDeps, createZeroCounters } from './mockThree.js';

function createSurfaceContext() {
  const counters = createZeroCounters();
  const spy = { disposed: 0 };
  counters.createRoverModel = (THREE) => createMockRover(THREE, spy);
  const deps = createMockThreeDeps(counters);
  const renderer = new deps.THREE.WebGLRenderer();
  const loader = new deps.GLTFLoader();
  return { counters, spy, deps, renderer, loader };
}

test('Yüzey sahnesi 10 kez aç-kapa: kontrol, gölge, kaya, doku ve ayrılan teker geometrisi temizlenir', async () => {
  const { counters, spy, deps, renderer, loader } = createSurfaceContext();
  for (let i = 0; i < 10; i += 1) {
    const surface = await createMarsSurfaceScene(deps, renderer, {}, 1.5, loader);
    assert.equal(surface.is_rover_ready, true);
    assert.equal(renderer.shadowMap.enabled, true);
    for (let f = 0; f < 30; f += 1) surface.handleSurfaceFrame(1 / 30, true);
    surface.destroyMarsSurfaceScene();
    surface.destroyMarsSurfaceScene();
    assert.equal(surface.scene.children.length, 0);
    assert.equal(renderer.shadowMap.enabled, false, 'renderer gölge ayarı eski haline dönmedi');
  }
  assert.equal(counters.controlsDispose, 10);
  assert.equal(counters.shadowDispose, 10);
  assert.equal(counters.instancedDispose, 10);
  assert.equal(spy.disposed, 10, 'sahne ağacından çıkarılan teker geometrisi dispose edilmedi');
  // Zemin dokusu + kenar alfası her sahnede
  assert.ok(counters.textureDispose >= 20);
  // Zemin + kaya geometrisi/materyali her sahnede
  assert.ok(counters.geometryDispose >= 20 && counters.materialDispose >= 20);
});

test('Rover animasyonu: görev durumu eklemlere, matkaba ve rover köküne yansır; faz değişimi bildirilir', async () => {
  const { deps, renderer, loader } = createSurfaceContext();
  const phases = [];
  const surface = await createMarsSurfaceScene(deps, renderer, {}, 1.5, loader, { onPhase: (id) => phases.push(id) });
  const root = surface.scene.getObjectByName('ROVER_ROOT');
  const elbow = surface.scene.getObjectByName('arm');
  const drill = surface.scene.getObjectByName('corring_drill');
  const head = surface.scene.getObjectByName('head');

  for (let t = 0; t < 4; t += 1 / 30) surface.handleSurfaceFrame(1 / 30, false);
  assert.ok(Math.hypot(root.position.x, root.position.z) > 0.5, 'rover sürmedi');
  assert.equal(root.rotation.y, surface.motion.drive.yaw_rad);

  // Kol fazına (9 + 4 + 18 sn sonra) ve delmeye kadar ilerle
  for (let t = 4; t < 9 + 4 + 18 + 10; t += 1 / 30) surface.handleSurfaceFrame(1 / 30, false);
  assert.equal(surface.motion.phase_id, 'ARM_CORE_DRILL');
  assert.ok(Math.abs(elbow.quaternion.angle_rad - surface.motion.arm_rad[2]) < 1e-9);
  assert.ok(elbow.quaternion.angle_rad > 2, 'dirsek açılmadı');
  assert.ok(drill.rotation.y > 0, 'matkap dönmedi');
  assert.ok(phases.includes('DRIVE') && phases.includes('MAST_PANORAMA') && phases.includes('ARM_CORE_DRILL'));
  assert.ok(head.quaternion.axis, 'mast başı pan-tilt uygulanmadı');
  surface.destroyMarsSurfaceScene();
});

test('Rover modeli yüklenemezse sahne yine açılır ve temizlenir; yükleme iptal edildiyse hemen temizlenir', async () => {
  const counters = createZeroCounters();
  const deps = createMockThreeDeps(counters);
  const renderer = new deps.THREE.WebGLRenderer();
  const failingLoader = { loadAsync: async () => { throw new Error('404'); } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const surface = await createMarsSurfaceScene(deps, renderer, {}, 1, failingLoader);
    assert.equal(surface.is_rover_ready, false);
    assert.doesNotThrow(() => surface.handleSurfaceFrame(0.1, true));
    surface.destroyMarsSurfaceScene();

    const cancelled = await createMarsSurfaceScene(deps, renderer, {}, 1, failingLoader, { isCancelled: () => true });
    assert.equal(cancelled.scene.children.length, 0);
    assert.equal(counters.controlsDispose, 2);
    assert.equal(renderer.shadowMap.enabled, false);
  } finally {
    console.warn = warn;
  }
});
