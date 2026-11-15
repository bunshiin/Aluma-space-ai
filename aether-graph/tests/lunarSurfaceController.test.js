import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import { getCameraTarget } from '../src/three/solarSystemConfig.js';
import { createLunarSurfaceController, MOON_TARGET_ID } from '../src/three/lunarSurfaceController.js';
import { createLunarSiteMarker, getLunarSite, LUNAR_SITES } from '../src/three/lunarSiteMarker.js';
import {
  createLunarSurfaceScene,
  handleLunarModuleScale,
  LUNAR_MODULE_HEIGHT_M,
  LUNAR_MODULE_MODEL_URL,
} from '../src/three/lunarSurfaceScene.js';
import {
  calculateLunarTerrainHeight_m,
  createLunarSurfaceEnvironment,
  LUNAR_FLAT_RADIUS_M,
  LUNAR_GROUND_SIZE_M,
  LUNAR_SKY_COLOR_HEX,
} from '../src/three/lunarSurfaceEnvironment.js';
import { resolveFallbackSceneParams } from '../src/ui/routeFallbackParser.js';
import { detectNasaQueryCategory } from '../src/services/intentDetector.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createControllerContext({ loader } = {}) {
  const counters = createZeroCounters();
  const deps = createMockThreeDeps(counters);
  const { THREE } = deps;
  const listeners = {};
  const domElement = {
    addEventListener(type, fn) { listeners[type] = (listeners[type] || []).concat(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.05, 2500);
  camera.position.set(25, 2, 8);
  const controls = new deps.OrbitControls();
  const moonPivot = new THREE.Group();
  moonPivot.position.set(26, 0, 0);
  const bodyMap = new Map([['MOON', moonPivot]]);
  const cameraController = createCameraController(THREE, camera, controls, domElement, () => bodyMap);
  const views = [];
  const renderPipeline = { handleRenderView: (s, c) => views.push({ s, c }) };
  const events = [];
  const eventTarget = new EventTarget();
  ['ag:lunar-surface-state'].forEach((type) =>
    eventTarget.addEventListener(type, (e) => events.push({ type, ...e.detail }))
  );
  const controller = createLunarSurfaceController({
    deps,
    renderer: new THREE.WebGLRenderer(),
    domElement,
    scene,
    camera,
    controls,
    cameraController,
    renderPipeline,
    gltfLoader: loader || new deps.GLTFLoader(),
    onProgress: () => {},
    getAspect: () => 1.5,
    getMoonRig: () => ({ tiltPivot: moonPivot }),
    moon_radius_units: 0.32,
    eventTarget,
  });
  return { counters, deps, scene, camera, controls, cameraController, controller, views, events, listeners, moonPivot };
}

function runUntil(ctx, predicate, maxFrames = 600) {
  for (let i = 0; i < maxFrames && !predicate(); i += 1) ctx.controller.handleLunarSurfaceFrame(0.05);
}

test('Apollo 11 Ay Modülü GLB modeli diskte mevcut ve 7m gerçek boyutunda ölçeklenir', () => {
  assert.ok(fs.existsSync(new URL(`..${LUNAR_MODULE_MODEL_URL}`, import.meta.url)));
  const deps = createMockThreeDeps(createZeroCounters());
  const mesh = new deps.THREE.Mesh();
  const res = handleLunarModuleScale(deps.THREE, mesh, LUNAR_MODULE_HEIGHT_M);
  assert.equal(res.scale, LUNAR_MODULE_HEIGHT_M / 2);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});

test('Ay yüzey ortamı (lunarSurfaceEnvironment): siyah gökyüzü (atmosfersiz), 6km zemin ve modül çevresi düz zemin', () => {
  assert.equal(LUNAR_SKY_COLOR_HEX, 0x000000);
  assert.equal(LUNAR_GROUND_SIZE_M, 6000);
  assert.equal(calculateLunarTerrainHeight_m(0, 0), 0);
  assert.equal(calculateLunarTerrainHeight_m(5, -5), 0);
  assert.equal(calculateLunarTerrainHeight_m(LUNAR_FLAT_RADIUS_M, 0), 0);
  assert.ok(Math.abs(calculateLunarTerrainHeight_m(100, 100)) > 0);

  const deps = createMockThreeDeps(createZeroCounters());
  const scene = new deps.THREE.Scene();
  const env = createLunarSurfaceEnvironment(deps.THREE, scene, new deps.THREE.WebGLRenderer());
  assert.equal(scene.fog, null, 'Ayda atmosfer olmadığından sis/pus olmamalı');
  assert.ok(scene.getObjectByName('LUNAR_GROUND'), 'zemin var olmalı');
  assert.ok(scene.getObjectByName('LUNAR_STARS'), 'yıldızlar olmalı');
  assert.ok(scene.getObjectByName('LUNAR_SKY_EARTH'), 'Ay göğünde Dünya bulunmalı');
  assert.ok(scene.getObjectByName('LUNAR_SURFACE_SUN'), 'Güneş ışığı olmalı');
  env.destroyLunarSurfaceEnvironment();
});

test('createLunarSiteMarker: Ay küresi üzerinde Mare Tranquillitatis işaretini oluşturur', () => {
  const deps = createMockThreeDeps(createZeroCounters());
  const marker = createLunarSiteMarker(deps.THREE, 0.32);
  assert.equal(marker.name, 'LUNAR_SITE_TRANQUILITY_BASE');
  assert.ok(marker.getObjectByName('LUNAR_SITE_MARKER'));
  assert.ok(marker.getObjectByName('LUNAR_SITE_CORE'));
  assert.ok(marker.getObjectByName('LUNAR_SITE_RING'));
  assert.equal(marker.userData.site_id, 'TRANQUILITY_BASE');
  assert.equal(marker.userData.module_id, 'APOLLO_LUNAR_MODULE');
});

test('Ay yüzey kontrolcüsü tam akış: yörünge → dalış → iniş → yüzey → kalkış → yörünge', async () => {
  const ctx = createControllerContext();
  assert.equal(ctx.controller.handleSurfaceRequest('TRANQUILITY_BASE'), true);
  assert.equal(ctx.controller.getSurfaceState(), 'DIVE');
  assert.equal(ctx.controls.enabled, false);
  assert.equal(ctx.controller.isCameraLocked(), true);
  await flush();

  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE');
  assert.equal(ctx.views.at(-1).s.name, 'LUNAR_SURFACE_SCENE', 'render Ay yüzey sahnesine geçmeli');
  const states = ctx.events.map((e) => e.surface_state);
  assert.deepEqual(states, ['DIVE', 'LANDING', 'SURFACE']);

  // Başka hedef istendiğinde (EARTH) yüzeyden yörüngeye dönülür
  ctx.cameraController.handleFocusTarget('EARTH');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ORBIT');
  const allStates = ctx.events.map((e) => e.surface_state);
  assert.deepEqual(allStates.slice(3), ['SURFACE_ASCENT', 'ORBIT_ASCENT', 'ORBIT']);
  assert.equal(ctx.views.at(-1).s, ctx.scene, 'render ana sahneye dönmeli');
  assert.equal(ctx.cameraController.getActiveFocus().id, 'EARTH');
  assert.equal(ctx.controller.isCameraLocked(), false);
  ctx.controller.destroyLunarSurfaceController();
});

test('Kamera hedefleri ve Gemini/fallback komutları Ay Modülünü TRANQUILITY_BASE yüzey sahnesi ile eşleştirir', () => {
  ['APOLLO_LUNAR_MODULE', 'LUNAR_MODULE', 'AY_MODULU', 'EAGLE', 'TRANQUILITY_BASE'].forEach((alias) => {
    const target = getCameraTarget(alias);
    assert.equal(target.body_id, 'MOON');
    assert.equal(target.lunar_site_id, 'TRANQUILITY_BASE');
  });

  ['ay modülünü göster', 'lunar module nedir?', 'APOLLO_LUNAR_MODULE', 'eagle ay inişi'].forEach((cmd) => {
    const params = resolveFallbackSceneParams(cmd);
    assert.equal(params.model_url, 'SOLAR_SYSTEM');
    assert.equal(params.camera_target, 'APOLLO_LUNAR_MODULE');
  });

  const cat = detectNasaQueryCategory('apollo 11 ay modülü eagle nasıl indi?');
  assert.equal(cat?.queryType, 'mission');
  assert.equal(cat?.identifier, 'apollo_11');
});
