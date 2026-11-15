import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_MOON_DISTANCE_KM, EARTH_RADIUS_KM, ORBIT_RADIUS_KM } from '../src/physics/spacePhysics.js';
import {
  ASTEROID_SCALE_RATIO,
  calculateSolarAsteroidOrbitUnits,
  createSolarSystemAsteroids,
  SOLAR_ASTEROID_CAMERA_DISTANCE_UNITS,
  SOLAR_ASTEROID_RADIUS_UNITS,
  SOLAR_EARTH_RADIUS_UNITS,
  SOLAR_MOON_ORBIT_UNITS,
  SOLAR_ORBIT_MAX_UNITS,
  SOLAR_ORBIT_MIN_UNITS,
} from '../src/three/solarSystemAsteroids.js';
import { create3DMissionScene } from '../src/three/threeSceneFactory.js';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import { CAMERA_TARGETS } from '../src/three/solarSystemConfig.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const SAMPLE_ASTEROIDS = [
  { name: '99942 Apophis', close_approach_utc: '2029-04-13T21:46:00Z', distance_km: 31600, velocity_kmh: 107000, is_hazardous: true },
  { name: '101955 Bennu', close_approach_utc: '2026-11-14T22:10:00Z', distance_km: 2200000, velocity_kmh: 100800, is_hazardous: true },
];

function installEventBus() {
  const bus = new EventTarget();
  const prevAdd = globalThis.addEventListener;
  const prevRemove = globalThis.removeEventListener;
  const prevDispatch = globalThis.dispatchEvent;
  globalThis.addEventListener = bus.addEventListener.bind(bus);
  globalThis.removeEventListener = bus.removeEventListener.bind(bus);
  globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);
  return {
    bus,
    restore() {
      globalThis.addEventListener = prevAdd;
      globalThis.removeEventListener = prevRemove;
      globalThis.dispatchEvent = prevDispatch;
    },
  };
}

test('ölçek sıkıştırma: en yakın küme Dünya dışında, 1 LD Ay yörüngesinde (2.6), 0.5 AU <= 6 birim', () => {
  const surfaceOrbit = calculateSolarAsteroidOrbitUnits(EARTH_RADIUS_KM);
  assert.equal(surfaceOrbit, SOLAR_ORBIT_MIN_UNITS);
  assert.ok(surfaceOrbit - SOLAR_ASTEROID_RADIUS_UNITS * 3.8 > SOLAR_EARTH_RADIUS_UNITS);

  const moonOrbit = calculateSolarAsteroidOrbitUnits(EARTH_MOON_DISTANCE_KM);
  assert.ok(Math.abs(moonOrbit - SOLAR_MOON_ORBIT_UNITS) < 1e-9);

  const outerOrbit = calculateSolarAsteroidOrbitUnits(ORBIT_RADIUS_KM.EARTH * 0.5);
  assert.equal(outerOrbit, SOLAR_ORBIT_MAX_UNITS);
  assert.ok(outerOrbit <= 6);

  const nearOrbit = calculateSolarAsteroidOrbitUnits(31600);
  const midOrbit = calculateSolarAsteroidOrbitUnits(2200000);
  assert.ok(surfaceOrbit < nearOrbit && nearOrbit < moonOrbit && moonOrbit < midOrbit && midOrbit < outerOrbit);
  assert.ok(Math.abs(SOLAR_ASTEROID_RADIUS_UNITS - 0.12 * ASTEROID_SCALE_RATIO) < 1e-9);
});

test('ag:neo-data kümeleri EARTH altına ekler, bodyMap/CAMERA_TARGETS günceller ve boş listede siler', async () => {
  const events = installEventBus();
  try {
    const deps = createMockThreeDeps(createZeroCounters());
    const { THREE, GLTFLoader } = deps;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const earthNode = new THREE.Group();
    earthNode.name = 'EARTH';
    const bodyMap = new Map([['EARTH', earthNode]]);
    const cameraCtrl = createCameraController(THREE, camera, null, null, () => bodyMap);
    const controller = createSolarSystemAsteroids(THREE, new GLTFLoader(), scene, camera, cameraCtrl, () => bodyMap);

    // Model yüklenmeden önce gelen veri bekletilip hazır olunca uygulanmalı
    globalThis.dispatchEvent(new CustomEvent('ag:neo-data', { detail: { parameters: { asteroids: SAMPLE_ASTEROIDS } } }));
    await controller.handleInitAsteroids(() => false);

    assert.equal(bodyMap.has('99942 Apophis'), true);
    assert.equal(bodyMap.has('101955 Bennu'), true);
    assert.equal(CAMERA_TARGETS['99942 Apophis'].camera_distance_units, SOLAR_ASTEROID_CAMERA_DISTANCE_UNITS);
    assert.ok(earthNode.children.some((c) => c.name === 'ASTEROID_99942 Apophis'));
    assert.ok(bodyMap.get('99942 Apophis').position.x < SOLAR_MOON_ORBIT_UNITS);
    assert.ok(bodyMap.get('101955 Bennu').position.x > SOLAR_MOON_ORBIT_UNITS);
    assert.ok(bodyMap.get('101955 Bennu').position.x <= 6);

    // Boş liste gelince tüm asteroit hedefleri bodyMap ve CAMERA_TARGETS'tan kalkmalı
    globalThis.dispatchEvent(new CustomEvent('ag:neo-data', { detail: { parameters: { asteroids: [] } } }));
    assert.equal(bodyMap.has('99942 Apophis'), false);
    assert.equal(bodyMap.has('101955 Bennu'), false);
    assert.equal(Object.hasOwn(CAMERA_TARGETS, '99942 Apophis'), false);
    assert.equal(CAMERA_TARGETS.EARTH.camera_distance_units, 5.0);

    controller.destroyAsteroidsController();
  } finally {
    events.restore();
  }
});

test('bilinmeyen odak hedefi ve bozuk veri hata fırlatmaz, console.warn yazar', async () => {
  const events = installEventBus();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const { THREE, GLTFLoader } = createMockThreeDeps(createZeroCounters());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const bodyMap = new Map([['EARTH', new THREE.Group()]]);
    const cameraCtrl = createCameraController(THREE, camera, null, null, () => bodyMap);
    const controller = createSolarSystemAsteroids(THREE, new GLTFLoader(), scene, camera, cameraCtrl, () => bodyMap);
    await controller.handleInitAsteroids(() => false);

    assert.doesNotThrow(() => {
      globalThis.dispatchEvent(new CustomEvent('ag:neo-data', { detail: null }));
      globalThis.dispatchEvent(new CustomEvent('ag:neo-data', { detail: { parameters: { asteroids: 'bozuk' } } }));
      globalThis.dispatchEvent(new CustomEvent('ag:focus-target', { detail: { target: 'BILINMEYEN_ASTEROIT' } }));
      controller.handleFocusTarget(null);
    });

    assert.ok(warnings.length >= 2);
    assert.equal(cameraCtrl.getActiveFocus().id, 'SOLAR_SYSTEM_OVERVIEW');
    controller.destroyAsteroidsController();
  } finally {
    console.warn = origWarn;
    events.restore();
  }
});

test('10 kez ac-kapa (destroy) testi asteroitler yukluyken de gecer', async () => {
  const events = installEventBus();
  try {
    const counters = createZeroCounters();
    const container = { clientWidth: 1280, clientHeight: 720, appendChild() {} };

    for (let i = 0; i < 10; i += 1) {
      const deps = createMockThreeDeps(counters);
      const sceneHandle = await create3DMissionScene(container, 'SOLAR_SYSTEM', () => {}, deps);
      globalThis.dispatchEvent(new CustomEvent('ag:neo-data', { detail: { parameters: { asteroids: SAMPLE_ASTEROIDS } } }));
      sceneHandle.destroy();
    }

    assert.equal(counters.rendererDispose, 10);
    assert.equal(counters.cancelAnimationFrame, 10);
    assert.equal(counters.controlsDispose, 10);
    assert.equal(counters.dracoDispose, 10);
    assert.equal(Object.hasOwn(CAMERA_TARGETS, '99942 Apophis'), false);
    assert.equal(CAMERA_TARGETS.EARTH.camera_distance_units, 5.0);
  } finally {
    events.restore();
  }
});
