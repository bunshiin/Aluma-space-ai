import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightDelayController } from '../src/three/lightDelaySimulation.js';
import {
  calculateVisualDuration_s,
  getLightDelayRequest,
  LIGHT_DELAY_PHASES,
} from '../src/three/lightDelayRequest.js';
import { LIGHT_DELAY_COLORS } from '../src/three/lightDelayMeshes.js';
import { create3DMissionScene } from '../src/three/threeSceneFactory.js';
import { calculateCmeArrival, calculateLightDelay } from '../src/physics/spacePhysics.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

// Kılavuz çizgi + paket çekirdek/hale + halka geometrileri; çizgi, çekirdek, hale ve 3 halka materyali
const GEOMETRY_COUNT = 4;
const MATERIAL_COUNT = 6;

function createHarness() {
  const counters = createZeroCounters();
  const { THREE } = createMockThreeDeps(counters);
  const scene = new THREE.Scene();
  const bodies = { EARTH: [26, 0, 0], MARS: [0, 0, 35], JUPITER: [-54, 0, 0], MOON: [28.6, 0, 0] };
  const bodyMap = new Map(
    Object.entries(bodies).map(([id, pos]) => {
      const node = new THREE.Group();
      node.position.set(...pos);
      return [id, node];
    })
  );
  const camera = { shots: 0, began: 0, ended: 0, focused: [] };
  const cameraController = {
    handleBeginCinematic() {
      camera.began += 1;
      return { position: { x: 0, y: 85, z: 165 }, target: { x: 0, y: 0, z: 0 } };
    },
    handleCinematicShot() {
      camera.shots += 1;
    },
    handleEndCinematic() {
      camera.ended += 1;
    },
    handleFocusTarget(id) {
      camera.focused.push(id);
    },
  };
  const ctrl = createLightDelayController(THREE, scene, cameraController, () => bodyMap);
  return { counters, scene, camera, ctrl, bodyMap };
}

function captureStatusEvents(t) {
  const events = [];
  const original = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (event) => {
    if (event.type === 'ag:light-delay-status') events.push(event.detail);
    return true;
  };
  t.after(() => {
    globalThis.dispatchEvent = original;
  });
  return events;
}

function silenceWarnings(t) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => {
    console.warn = original;
  });
  return warnings;
}

function stepUntil(ctrl, phase, maxFrames = 400) {
  for (let i = 0; i < maxFrames; i += 1) {
    if (ctrl.getLightDelayState().phase === phase) return i;
    ctrl.handleLightDelayFrameUpdate(1 / 30);
  }
  return -1;
}

test('one-way: OUTBOUND -> ARRIVED -> CLEARED, durum olayinda spacePhysics degerleri', (t) => {
  const events = captureStatusEvents(t);
  const { ctrl, camera, scene, counters } = createHarness();

  ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'MARS', mode: 'one-way' });
  const state = ctrl.getLightDelayState();
  assert.equal(state.phase, LIGHT_DELAY_PHASES.OUTBOUND);
  assert.equal(state.signal_color_hex, LIGHT_DELAY_COLORS.SIGNAL);
  assert.ok(state.visual_leg_s >= 3 && state.visual_leg_s <= 6);
  assert.equal(scene.children.length, 1);
  assert.equal(camera.began, 1);

  assert.ok(stepUntil(ctrl, LIGHT_DELAY_PHASES.ARRIVED) > 0);
  assert.ok(camera.shots > 0);
  assert.ok(stepUntil(ctrl, LIGHT_DELAY_PHASES.CLEARED) > 0);
  assert.equal(scene.children.length, 0);
  assert.equal(camera.ended, 1);
  assert.equal(counters.geometryDispose, GEOMETRY_COUNT);
  assert.equal(counters.materialDispose, MATERIAL_COUNT);

  const expected = calculateLightDelay('EARTH', 'MARS', 'one-way');
  assert.deepEqual(
    events.map((e) => e.phase),
    ['OUTBOUND', 'ARRIVED', 'CLEARED']
  );
  events.forEach((e) => {
    assert.equal(e.source, 'EARTH');
    assert.equal(e.target, 'MARS');
    assert.equal(e.mode, 'one-way');
    assert.equal(e.delay_s, expected.delay_s);
    assert.equal(e.round_trip_s, expected.round_trip_s);
  });
});

test('round-trip: OUTBOUND -> RETURN (amber) -> COMPLETE, gorsel toplam sure 3-6 sn', (t) => {
  const events = captureStatusEvents(t);
  const { ctrl } = createHarness();

  ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'JUPITER', mode: 'round-trip' });
  const outbound = ctrl.getLightDelayState();
  assert.ok(outbound.visual_leg_s * 2 >= 3 && outbound.visual_leg_s * 2 <= 6);

  stepUntil(ctrl, LIGHT_DELAY_PHASES.RETURN);
  assert.equal(ctrl.getLightDelayState().signal_color_hex, LIGHT_DELAY_COLORS.ECHO);
  assert.ok(stepUntil(ctrl, LIGHT_DELAY_PHASES.COMPLETE) > 0);
  stepUntil(ctrl, LIGHT_DELAY_PHASES.CLEARED);

  const expected = calculateLightDelay('EARTH', 'JUPITER', 'round-trip');
  assert.deepEqual(
    events.map((e) => e.phase),
    ['OUTBOUND', 'RETURN', 'COMPLETE', 'CLEARED']
  );
  assert.equal(events[0].delay_s, expected.delay_s);
  assert.equal(events[0].delay_s, expected.round_trip_s);
});

test('speed_kms: turuncu dalga, cme_arrival_h spacePhysics ile ayni, tek yon akar', (t) => {
  const events = captureStatusEvents(t);
  const { ctrl } = createHarness();

  ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'MARS', mode: 'round-trip', speed_kms: 1000 });
  const state = ctrl.getLightDelayState();
  assert.equal(state.signal_color_hex, LIGHT_DELAY_COLORS.WAVE);
  assert.equal(state.mode, 'one-way');
  assert.equal(events[0].speed_kms, 1000);
  assert.equal(events[0].cme_arrival_h, calculateCmeArrival(1000));
  assert.ok(stepUntil(ctrl, LIGHT_DELAY_PHASES.ARRIVED) > 0);
});

test('bilinmeyen/eksik parametreler cokmez, EARTH -> MARS one-way varsayilanina duser', (t) => {
  const warnings = silenceWarnings(t);
  const { ctrl } = createHarness();

  for (const detail of [undefined, null, 42, {}, { source: 'VULCAN', target: 'MARS' }, { source: 'EARTH' }, { source: 'earth', target: 'mars' }]) {
    assert.doesNotThrow(() => ctrl.handleTriggerLightDelay(detail));
    const state = ctrl.getLightDelayState();
    assert.equal(state.source, 'EARTH');
    assert.equal(state.target, 'MARS');
    assert.equal(state.mode, 'one-way');
  }
  assert.equal(getLightDelayRequest({ source: 'EARTH', target: 'MOON', mode: 'sideways' }).mode, 'one-way');
  assert.equal(getLightDelayRequest({ source: 'EARTH', target: 'MARS', speed_kms: -5 }).speed_kms, null);
  assert.ok(warnings.length > 0);
  assert.doesNotThrow(() => ctrl.handleLightDelayFrameUpdate(Number.NaN));
});

test('ayni cisim: isin cizilmez, cisme odaklanir, delay_s 0', (t) => {
  const events = captureStatusEvents(t);
  const { ctrl, scene, camera } = createHarness();

  ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'EARTH', mode: 'one-way' });
  assert.equal(scene.children.length, 0);
  assert.deepEqual(camera.focused, ['EARTH']);
  assert.equal(camera.began, 0);
  assert.equal(events.at(-1).phase, LIGHT_DELAY_PHASES.FOCUSED);
  assert.equal(events.at(-1).delay_s, 0);
});

test('gezegenler yuklenmeden kare guncellemesi ilerlemez ve cokmez', () => {
  const { ctrl, bodyMap } = createHarness();
  bodyMap.clear();
  ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'MARS' });
  for (let i = 0; i < 300; i += 1) ctrl.handleLightDelayFrameUpdate(0.1);
  assert.equal(ctrl.getLightDelayState().phase, LIGHT_DELAY_PHASES.OUTBOUND);
});

test('RESET_VIEW temizligi ve destroy(): tum gecici geometry/material dispose edilir', () => {
  const reset = createHarness();
  reset.ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'MARS' });
  reset.ctrl.handleLightDelayFrameUpdate(0.5);
  reset.ctrl.handleClearLightDelay();
  assert.equal(reset.scene.children.length, 0);
  assert.equal(reset.counters.geometryDispose, GEOMETRY_COUNT);
  assert.equal(reset.counters.materialDispose, MATERIAL_COUNT);
  assert.equal(reset.ctrl.getLightDelayState().phase, LIGHT_DELAY_PHASES.CLEARED);

  const destroyed = createHarness();
  destroyed.ctrl.handleTriggerLightDelay({ source: 'EARTH', target: 'JUPITER', speed_kms: 800 });
  destroyed.ctrl.handleLightDelayFrameUpdate(0.5);
  destroyed.ctrl.destroyLightDelayController();
  assert.equal(destroyed.scene.children.length, 0);
  assert.equal(destroyed.counters.geometryDispose, GEOMETRY_COUNT);
  assert.equal(destroyed.counters.materialDispose, MATERIAL_COUNT);
  assert.doesNotThrow(() => destroyed.ctrl.destroyLightDelayController());
  assert.doesNotThrow(() => destroyed.ctrl.handleLightDelayFrameUpdate(0.1));
});

test('gorsel sure olcekleme 3-6 sn araliginda kalir', () => {
  assert.equal(calculateVisualDuration_s(0), 3);
  assert.equal(calculateVisualDuration_s(-10), 3);
  assert.equal(calculateVisualDuration_s(Number.NaN), 3);
  assert.equal(calculateVisualDuration_s(1e9), 6);
  const moon_s = calculateVisualDuration_s(calculateLightDelay('EARTH', 'MOON').delay_s);
  const jupiter_s = calculateVisualDuration_s(calculateLightDelay('EARTH', 'JUPITER').delay_s);
  assert.ok(moon_s > 3 && moon_s < jupiter_s && jupiter_s <= 6);
});

test('LIGHT_DELAY sahnesi Gunes Sistemi olarak kurulur ve destroy temizler', async () => {
  const counters = createZeroCounters();
  const container = { clientWidth: 1280, clientHeight: 720, appendChild() {} };
  const handle = await create3DMissionScene(container, 'LIGHT_DELAY', () => {}, createMockThreeDeps(counters));
  assert.doesNotThrow(() => handle.destroy());
  assert.equal(counters.rendererDispose, 1);
  assert.equal(counters.cancelAnimationFrame, 1);
});
