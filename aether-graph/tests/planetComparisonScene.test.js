import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanetComparisonScene } from '../src/three/planetComparisonScene.js';
import { ASTRONAUT_MODEL_URL, resolveComparisonRequest } from '../src/three/planetComparisonConfig.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

// Paket testi: sahneyi doğrudan import eder, fabrikaya bağlı değildir
function createHarness(counters = createZeroCounters()) {
  const deps = createMockThreeDeps(counters);
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
  return { deps, urls, listeners, statuses, counters, dispatch: (detail) => target.dispatchEvent(new CustomEvent('ag:planet-comparison', { detail })) };
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
