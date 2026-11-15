import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanetComparisonScene } from '../src/three/planetComparisonScene.js';
import { ASTRONAUT_MODEL_URL, calculateComparisonLayout, resolveComparisonRequest } from '../src/three/planetComparisonConfig.js';
import { buildBodyLabelEntries } from '../src/three/planetComparisonLabels.js';
import { calculatePlanetComparison } from '../src/physics/spacePhysics.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

// Paket testi: sahneyi doğrudan import eder, fabrikaya bağlı değildir
function createHarness(counters = createZeroCounters()) {
  const deps = createMockThreeDeps(counters);
  const scenes = [];
  const BaseScene = deps.THREE.Scene;
  deps.THREE.Scene = class extends BaseScene {
    constructor() {
      super();
      scenes.push(this);
    }
  };
  const urls = [];
  const BaseLoader = deps.GLTFLoader;
  deps.GLTFLoader = class extends BaseLoader {
    async loadAsync(url) {
      urls.push(url);
      return super.loadAsync(url);
    }
  };
  let nextId = 1;
  deps.requestAnimationFrame = () => nextId++;
  const listeners = { value: 0 };
  const target = new EventTarget();
  deps.eventTarget = {
    addEventListener(type, fn) { listeners.value += 1; target.addEventListener(type, fn); },
    removeEventListener(type, fn) { listeners.value -= 1; target.removeEventListener(type, fn); },
    dispatchEvent: (event) => target.dispatchEvent(event),
  };
  const statuses = [];
  target.addEventListener('ag:planet-comparison-status', (event) => statuses.push(event.detail));
  return { deps, scenes, urls, listeners, statuses, counters, dispatch: (detail) => target.dispatchEvent(new CustomEvent('ag:planet-comparison', { detail })) };
}

const container = () => ({ clientWidth: 1280, clientHeight: 720, appendChild() {} });
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

test('Sözleşme: { destroy } döner, Mod A sadece iki gezegen modelini yükler', async () => {
  const h = createHarness();
  const handle = await createPlanetComparisonScene(container(), { primary_object: 'JUPITER', secondary_object: 'MOON' }, () => {}, h.deps);
  assert.equal(typeof handle.destroy, 'function');
  assert.deepEqual(h.urls.sort(), ['/public/models/jupiter.glb', '/public/models/moon.glb']);
  assert.equal(h.urls.includes(ASTRONAUT_MODEL_URL), false);
  assert.equal(h.statuses.at(-1).primary_object, 'JUPITER');
  handle.destroy();
});

test('Olayla yeni istek: bozuk istek çökmez', async () => {
  const h = createHarness();
  const handle = await createPlanetComparisonScene(container(), { primary_object: 'EARTH', secondary_object: 'MARS' }, () => {}, h.deps);
  assert.doesNotThrow(() => h.dispatch(undefined));
  assert.doesNotThrow(() => h.dispatch({ primary_object: 'NIBIRU', secondary_object: 7 }));
  await flushAsync();
  handle.destroy();
});

test('Bilinmeyen/eksik parametre EARTH vs MARS varsayılanına düşer', () => {
  assert.deepEqual(resolveComparisonRequest(null), { primary_object: 'EARTH', secondary_object: 'MARS', is_gravity_test: false });
  assert.equal(resolveComparisonRequest({ is_gravity_test: true }).height_m, 10);
});

test('Geçersiz container: hata yok, boş destroy döner', async () => {
  const handle = await createPlanetComparisonScene(null, {}, () => {});
  assert.doesNotThrow(() => handle.destroy());
});

test('destroy() 10 kez aç-kapa: renderer, rAF, controls, DRACO ve dinleyiciler temizlenir', async () => {
  const counters = createZeroCounters();
  for (let i = 0; i < 10; i += 1) {
    const h = createHarness(counters);
    const handle = await createPlanetComparisonScene(container(), { primary_object: 'SATURN', secondary_object: 'CERES' }, () => {}, h.deps);
    handle.destroy();
    handle.destroy(); // ikinci çağrı güvenli
    assert.equal(h.listeners.value, 0);
  }
  assert.equal(counters.rendererDispose, 10);
  assert.equal(counters.cancelAnimationFrame, 10);
  assert.equal(counters.controlsDispose, 10);
  assert.equal(counters.dracoDispose, 10);
});

test('Karşılaştırma sahnesi iki nesne arasında COMPARISON_DISTANCE_LINE ve DISTANCE etiketi kurar', async () => {
  const h = createHarness();
  const handle = await createPlanetComparisonScene(container(), { primary_object: 'EARTH', secondary_object: 'MARS' }, () => {}, h.deps);
  const scene = h.scenes[0];
  const distanceLine = scene.getObjectByName('COMPARISON_DISTANCE_LINE');
  assert.ok(distanceLine, 'COMPARISON_DISTANCE_LINE sahneye eklenmiş olmalı');
  assert.ok(distanceLine.children.length >= 6);

  const comparison = calculatePlanetComparison('EARTH', 'MARS');
  const layout = calculateComparisonLayout(comparison, 16 / 9, 45);
  assert.ok(layout.distance_line.distance_km > 0);
  assert.ok(layout.distance_line.end_x_units > layout.distance_line.start_x_units);

  const labels = buildBodyLabelEntries(layout, comparison);
  const distanceLabel = labels.find((entry) => entry.key === 'DISTANCE');
  assert.ok(distanceLabel, 'DISTANCE etiketi üretilmeli');
  assert.equal(distanceLabel.lines[0], 'MESAFE');
  assert.match(distanceLabel.lines[1], /milyon km/);
  handle.destroy();
});
