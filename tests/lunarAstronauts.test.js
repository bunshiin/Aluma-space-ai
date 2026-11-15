import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASTRONAUT_MODEL_URL,
  LUNAR_ASTRONAUTS,
  calculateAstronautYaw_rad,
  createLunarAstronauts,
} from '../src/three/lunarAstronauts.js';
import { LUNAR_SURFACE_VIEW_OFFSET_M, createLunarSurfaceScene } from '../src/three/lunarSurfaceScene.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const LUNAR_MODULE_HALF_WIDTH_M = 4.7;

test('Armstrong ve Aldrin modül ayaklarının dışında, birbirine çarpmadan durur', () => {
  assert.deepEqual(LUNAR_ASTRONAUTS.map((a) => a.id), ['NEIL_ARMSTRONG', 'BUZZ_ALDRIN']);
  for (const astronaut of LUNAR_ASTRONAUTS) {
    const dist_m = Math.hypot(astronaut.position_m.x, astronaut.position_m.z);
    assert.ok(dist_m > LUNAR_MODULE_HALF_WIDTH_M + 1, `${astronaut.id} modülün içine girmemeli (${dist_m} m)`);
    assert.ok(dist_m < 9, `${astronaut.id} kayaların başladığı 9 m'nin içinde kalmalı`);
  }
  const [a, b] = LUNAR_ASTRONAUTS;
  assert.ok(Math.hypot(a.position_m.x - b.position_m.x, a.position_m.z - b.position_m.z) > 2, 'astronotlar üst üste binmez');
});

test('calculateAstronautYaw_rad −Z yüzlü modeli hedefe çevirir, bozuk girdide 0 döner', () => {
  // Açılar modülo 2π karşılaştırılır (−π ile π aynı yöndür)
  const close = (actual, expected) => {
    const diff = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
    assert.ok(Math.abs(diff) < 1e-9, `${actual} ≈ ${expected}`);
  };
  close(calculateAstronautYaw_rad({ x: 0, z: 0 }, { x: 0, z: -5 }), 0);
  close(calculateAstronautYaw_rad({ x: 0, z: 0 }, { x: 0, z: 5 }), Math.PI);
  close(calculateAstronautYaw_rad({ x: 0, z: 0 }, { x: -5, z: 0 }), Math.PI / 2);
  close(calculateAstronautYaw_rad({ x: 0, z: 0 }, { x: 0, z: -5 }, 90), Math.PI / 2);
  assert.equal(calculateAstronautYaw_rad({ x: 1, z: 1 }, { x: 1, z: 1 }), 0);
  assert.equal(calculateAstronautYaw_rad(null, { x: Number.NaN, z: 0 }), 0);
});

test('createLunarAstronauts modeli bir kez yükler, iki astronotu ölçekleyip yerleştirir', async () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const parent = new THREE.Group();
  const urls = [];
  const scaled = [];
  const loader = { async loadAsync(url) { urls.push(url); return { scene: new THREE.Mesh() }; } };
  const astronauts = createLunarAstronauts(THREE, parent, loader, {
    lookAt_m: LUNAR_SURFACE_VIEW_OFFSET_M,
    scaleModel: (root) => scaled.push(root),
  });
  assert.equal(await astronauts.ready, 2);
  assert.deepEqual(urls, [ASTRONAUT_MODEL_URL]);
  assert.equal(scaled.length, 1, 'ölçek bir kez uygulanır, kopya onu taşır');
  assert.equal(parent.children[0], astronauts.group);
  const holders = astronauts.group.children;
  assert.deepEqual(holders.map((h) => h.name), ['NEIL_ARMSTRONG', 'BUZZ_ALDRIN']);
  assert.equal(holders[0].position.x, 6.2);
  assert.equal(holders[0].position.y, 0, 'ayaklar zeminde');
  assert.notEqual(holders[0].children[0], holders[1].children[0], 'ikinci astronot ayrı bir kopya');
});

test('model yüklenemezse veya sahne kapandıysa çökmez, eklemez; kapanmışsa modeli serbest bırakır', async () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const parent = new THREE.Group();
    const failing = createLunarAstronauts(THREE, parent, { async loadAsync() { throw new Error('404'); } });
    assert.equal(await failing.ready, 0);
    assert.equal(parent.children.length, 0);

    const disposed = [];
    const cancelled = createLunarAstronauts(THREE, parent, { async loadAsync() { return { scene: new THREE.Mesh() }; } }, {
      isCancelled: () => true,
      disposeModel: (root) => disposed.push(root),
    });
    assert.equal(await cancelled.ready, 0);
    assert.equal(parent.children.length, 0);
    assert.equal(disposed.length, 1);

    assert.equal(await createLunarAstronauts(THREE, parent, null).ready, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test('Ay yüzey sahnesi modülü ve astronotları birlikte yükler; destroy sonrası geç gelen model eklenmez', async () => {
  const counters = createZeroCounters();
  const deps = createMockThreeDeps(counters);
  const urls = [];
  let releaseAstronaut;
  const loader = {
    async loadAsync(url) {
      urls.push(url);
      if (url === ASTRONAUT_MODEL_URL) await new Promise((resolve) => { releaseAstronaut = resolve; });
      return { scene: new deps.THREE.Mesh() };
    },
  };
  const surface = await createLunarSurfaceScene(deps, new deps.THREE.WebGLRenderer(), null, 1.5, loader);
  assert.equal(surface.is_module_ready, true, 'astronot modeli yüklenmeden sahne hazır olur');
  assert.ok(urls.includes(ASTRONAUT_MODEL_URL));
  surface.destroyLunarSurfaceScene();
  releaseAstronaut();
  assert.equal(await surface.astronauts_ready, 0);
  assert.equal(surface.scene.children.some((c) => c.name === 'LUNAR_ASTRONAUTS'), false);
});
