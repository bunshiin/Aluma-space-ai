import test from 'node:test';
import assert from 'node:assert/strict';
import { create3DMissionScene } from '../src/three/threeSceneFactory.js';
import { createMarsSurfaceController } from '../src/three/marsSurfaceController.js';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import { getCameraTarget } from '../src/three/solarSystemConfig.js';
import { createMockRover, createMockThreeDeps, createZeroCounters } from './mockThree.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createControllerContext({ loader } = {}) {
  const counters = createZeroCounters();
  counters.createRoverModel = (THREE) => createMockRover(THREE);
  const deps = createMockThreeDeps(counters);
  const { THREE } = deps;
  const listeners = {};
  const domElement = {
    addEventListener(type, fn) { listeners[type] = (listeners[type] || []).concat(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.05, 2500);
  camera.position.set(40, 3, 10);
  const controls = new deps.OrbitControls();
  const marsPivot = new THREE.Group();
  marsPivot.position.set(35, 0, 0);
  const bodyMap = new Map([['MARS', marsPivot]]);
  const cameraController = createCameraController(THREE, camera, controls, domElement, () => bodyMap);
  const views = [];
  const renderPipeline = { handleRenderView: (s, c) => views.push({ s, c }) };
  const events = [];
  const eventTarget = new EventTarget();
  ['ag:surface-state', 'ag:rover-phase'].forEach((type) => eventTarget.addEventListener(type, (e) => events.push({ type, ...e.detail })));
  const controller = createMarsSurfaceController({
    deps, renderer: new THREE.WebGLRenderer(), domElement, scene, camera, controls, cameraController, renderPipeline,
    gltfLoader: loader || new deps.GLTFLoader(), onProgress: () => {}, getAspect: () => 1.5,
    getMarsRig: () => ({ tiltPivot: marsPivot }), mars_radius_units: 0.85, eventTarget,
  });
  return { counters, deps, scene, camera, controls, cameraController, controller, views, events, listeners, marsPivot };
}

function runUntil(ctx, predicate, maxFrames = 600) {
  for (let i = 0; i < maxFrames && !predicate(); i += 1) ctx.controller.handleMarsSurfaceFrame(0.05, 0.05);
}

test('Tam akış: yörünge → dalış → iniş → yüzey → kalkış → yörünge; yüzey sahnesi temizlenir', async () => {
  const ctx = createControllerContext();
  assert.equal(ctx.controller.handleSurfaceRequest('PERSEVERANCE'), true);
  assert.equal(ctx.controller.getSurfaceState(), 'DIVE');
  assert.equal(ctx.controls.enabled, false);
  assert.equal(ctx.controller.isCameraLocked(), true);
  await flush();

  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE');
  assert.equal(ctx.views.at(-1).s.name, 'MARS_SURFACE_SCENE', 'render yüzey sahnesine geçmedi');
  const states = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state);
  assert.deepEqual(states, ['DIVE', 'LANDING', 'SURFACE']);
  assert.ok(ctx.events.some((e) => e.type === 'ag:rover-phase' && e.site_id === 'JEZERO'));
  // Dalış sırasında yakın düzlem küçüldü, kamera kratere yaklaştı
  assert.ok(ctx.camera.near < 0.05);
  const haze = ctx.scene.getObjectByName('MARS_HAZE_OVERLAY');
  assert.equal(haze, null, 'pus katmanı yüzey sahnesine taşınmalıydı');

  // Başka hedef istenince (RESET_VIEW / EARTH) yüzeyden kalkılır
  ctx.cameraController.handleFocusTarget('EARTH');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ORBIT');
  const allStates = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state);
  assert.deepEqual(allStates.slice(3), ['SURFACE_ASCENT', 'ORBIT_ASCENT', 'ORBIT']);
  assert.equal(ctx.views.at(-1).s, ctx.scene, 'render ana sahneye dönmedi');
  assert.equal(ctx.counters.controlsDispose, 1, 'yüzey OrbitControls temizlenmedi');
  assert.equal(ctx.counters.shadowDispose, 1);
  assert.equal(ctx.camera.near, 0.05);
  assert.equal(ctx.controls.enabled, true);
  assert.equal(ctx.cameraController.getActiveFocus().id, 'EARTH');
  assert.equal(ctx.controller.isCameraLocked(), false);
  assert.ok(ctx.scene.getObjectByName('MARS_HAZE_OVERLAY'), 'pus katmanı ana sahneye geri gelmedi');
  ctx.controller.destroyMarsSurfaceController();
  assert.equal(ctx.listeners.wheel.length, 1, 'kontrolcünün wheel dinleyicisi kaldırılmadı');
});

test('Yüzeyde MARS (odak değişmeyen) isteği de kalkış yapar; inişteyken gelen istek yüzeye varınca uygulanır', async () => {
  const ctx = createControllerContext();
  ctx.controller.handleSurfaceRequest('JEZERO');
  await flush();
  // Dalış sürerken RESET_VIEW gelir: iniş tamamlanır, ardından kalkılır ve genel görünüme dönülür
  ctx.controller.handleExitRequest('SOLAR_SYSTEM_OVERVIEW');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ORBIT');
  let states = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state);
  assert.deepEqual(states, ['DIVE', 'LANDING', 'SURFACE', 'SURFACE_ASCENT', 'ORBIT_ASCENT', 'ORBIT']);
  assert.equal(ctx.cameraController.getActiveFocus().id, 'SOLAR_SYSTEM_OVERVIEW');

  ctx.events.length = 0;
  ctx.controller.handleSurfaceRequest('JEZERO');
  await flush();
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  ctx.controller.handleExitRequest('MARS');
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE_ASCENT');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ORBIT');
  assert.equal(ctx.cameraController.getActiveFocus().id, 'MARS');
  states = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state);
  assert.equal(states.at(-1), 'ORBIT');
  assert.equal(ctx.counters.controlsDispose, 2);
  // Yörüngedeyken çıkış isteği bir şey yapmaz
  ctx.controller.handleExitRequest('EARTH');
  assert.equal(ctx.controller.getSurfaceState(), 'ORBIT');
  ctx.controller.destroyMarsSurfaceController();
});

test('Rover yüklenmeden atmosfere girilirse pus içinde beklenir (ENTRY_HOLD), yükleme bitince inilir', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const counters = { createRoverModel: null };
  const slowLoader = { loadAsync: async () => { await gate; return { scene: counters.createRoverModel() }; } };
  const ctx = createControllerContext({ loader: slowLoader });
  counters.createRoverModel = () => createMockRover(ctx.deps.THREE);
  ctx.controller.handleSurfaceRequest('JEZERO');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ENTRY_HOLD');
  assert.equal(ctx.controller.getSurfaceState(), 'ENTRY_HOLD');
  for (let i = 0; i < 20; i += 1) ctx.controller.handleMarsSurfaceFrame(0.05, 0.05);
  assert.equal(ctx.controller.getSurfaceState(), 'ENTRY_HOLD');
  release();
  await flush();
  await flush();
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE');
  ctx.controller.destroyMarsSurfaceController();
  assert.equal(ctx.counters.controlsDispose, 1);
});

test('Yükleme sürerken destroy: yükleme bitince yüzey sahnesi kendini temizler (sızıntı yok)', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const ctxRef = {};
  const slowLoader = { loadAsync: async () => { await gate; return { scene: createMockRover(ctxRef.THREE) }; } };
  const ctx = createControllerContext({ loader: slowLoader });
  ctxRef.THREE = ctx.deps.THREE;
  ctx.controller.handleSurfaceRequest('JEZERO');
  ctx.controller.destroyMarsSurfaceController();
  release();
  await flush();
  await flush();
  assert.equal(ctx.counters.controlsDispose, 1);
  assert.equal(ctx.counters.instancedDispose, 1);
  assert.equal(ctx.controller.handleSurfaceRequest('JEZERO'), false);
});

test('Tekerlek yakınlaştırma Mars\'a girdirmez (niyet olmadan dalış yok); dalışta yeni istek yutulur', async () => {
  const ctx = createControllerContext();
  ctx.cameraController.handleFocusTarget('MARS');
  ctx.camera.position.set(36, 0.5, 0.5);
  ctx.listeners.wheel.forEach((fn) => fn({ deltaY: -120 }));
  ctx.controller.handleMarsSurfaceFrame(0.05, 0.05);
  assert.equal(ctx.controller.getSurfaceState(), 'ORBIT', 'yakınlaştırma Mars\'a girdirdi');
  // Niyet sistemi (handleSurfaceRequest) ile başlayan dalışta tekrar istek: true döner (yutuldu)
  assert.equal(ctx.controller.handleSurfaceRequest('PERSEVERANCE'), true);
  assert.equal(ctx.controller.getSurfaceState(), 'DIVE');
  assert.equal(ctx.controller.handleSurfaceRequest('JEZERO'), true);
  assert.equal(ctx.controller.getSurfaceState(), 'DIVE');
  ctx.controller.destroyMarsSurfaceController();
  await flush();
});

test('Uzaktayken ve yakınken tekerlek dalış başlatmaz; Mars rig yoksa istek reddedilir', () => {
  const ctx = createControllerContext();
  ctx.cameraController.handleFocusTarget('MARS');
  ctx.camera.position.set(60, 0, 0);
  ctx.listeners.wheel.forEach((fn) => fn({ deltaY: -120 }));
  assert.equal(ctx.controller.getSurfaceState(), 'ORBIT');
  ctx.camera.position.set(36, 0.5, 0.5);
  for (let i = 0; i < 5; i += 1) ctx.listeners.wheel.forEach((fn) => fn({ deltaY: -120 }));
  ctx.controller.handleMarsSurfaceFrame(0.05, 0.05);
  assert.equal(ctx.controller.getSurfaceState(), 'ORBIT');
  ctx.controller.destroyMarsSurfaceController();

  const counters = createZeroCounters();
  const deps = createMockThreeDeps(counters);
  const noMars = createMarsSurfaceController({
    deps, renderer: {}, domElement: null, scene: new deps.THREE.Scene(), camera: new deps.THREE.PerspectiveCamera(),
    controls: null, cameraController: {}, renderPipeline: {}, gltfLoader: null, getAspect: () => 1,
    getMarsRig: () => null, mars_radius_units: 0.85, eventTarget: null,
  });
  assert.equal(noMars.handleSurfaceRequest('JEZERO'), false);
  assert.doesNotThrow(() => noMars.handleMarsSurfaceFrame(0.1, 0.1));
  noMars.destroyMarsSurfaceController();
});

test('PERSEVERANCE/JEZERO, CURIOSITY/GALE ve PATHFINDER/ARES_VALLIS kamera hedefleri Mars yüzeyine bağlı', () => {
  assert.equal(getCameraTarget('PERSEVERANCE').surface_site_id, 'JEZERO');
  assert.equal(getCameraTarget('JEZERO').body_id, 'MARS');
  assert.equal(getCameraTarget('CURIOSITY').surface_site_id, 'GALE');
  assert.equal(getCameraTarget('GALE').surface_site_id, 'GALE');
  assert.equal(getCameraTarget('PATHFINDER').surface_site_id, 'ARES_VALLIS');
  assert.equal(getCameraTarget('ARES_VALLIS').surface_site_id, 'ARES_VALLIS');
  assert.equal(getCameraTarget('MARS').surface_site_id, undefined);
});

test('Marstan çıkıp geri girildiğinde (yörüngeden veya kalkış sırasında) rover kaybolmaz', async () => {
  const ctx = createControllerContext();
  ctx.controller.handleSurfaceRequest('PERSEVERANCE');
  await flush();
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.ok(ctx.views.at(-1).s.getObjectByName('ROVER_ROOT')?.children.length > 0, 'ilk girişte rover yok');

  // Çıkış başlatılır ve yörüngeye dönülür, ardından tekrar girilir
  ctx.controller.handleExitRequest('MARS');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'ORBIT');
  ctx.controller.handleSurfaceRequest('PERSEVERANCE');
  await flush();
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.ok(ctx.views.at(-1).s.getObjectByName('ROVER_ROOT')?.children.length > 0, 'ikinci girişte rover kayboldu');

  // Kalkış sürerken (SURFACE_ASCENT) tekerlekle geri dönülünce de rover korunur
  ctx.controller.handleExitRequest('MARS');
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE_ASCENT');
  // Tekerlek yakınlaştırması kalkış sırasında yeniden iniş başlatmaz
  ctx.listeners.wheel.forEach((fn) => fn({ deltaY: -120 }));
  assert.equal(ctx.controller.getSurfaceState(), 'SURFACE_ASCENT');
  // Niyet ile yeniden istek gelince kalkış sürerken iniş başlar ve rover korunur
  ctx.controller.handleSurfaceRequest('PERSEVERANCE');
  assert.equal(ctx.controller.getSurfaceState(), 'LANDING');
  runUntil(ctx, () => ctx.controller.getSurfaceState() === 'SURFACE');
  assert.ok(ctx.views.at(-1).s.getObjectByName('ROVER_ROOT')?.children.length > 0, 'kalkıştan dönüşte rover kayboldu');
  ctx.controller.destroyMarsSurfaceController();
});

test('MARS_SURFACE görevi 10 kez aç-kapa: renderer, rAF ve yüzey kaynakları her seferinde temizlenir', async () => {
  const counters = createZeroCounters();
  counters.createRoverModel = (THREE) => createMockRover(THREE);
  const container = { clientWidth: 1280, clientHeight: 720, appendChild() {} };
  for (let i = 0; i < 10; i += 1) {
    const handle = await create3DMissionScene(container, 'MARS_SURFACE', () => {}, createMockThreeDeps(counters));
    handle.destroy();
  }
  await flush();
  await flush();
  assert.equal(counters.rendererDispose, 10);
  assert.equal(counters.cancelAnimationFrame, 10);
  // 10 ana sahne + dalışta yüklenip destroy sonrası kendini temizleyen 10 yüzey kontrolü
  assert.equal(counters.controlsDispose, 20);
  assert.equal(counters.instancedDispose, 10);
  assert.equal(counters.shadowDispose, 10);
});

test('Kraterden kratere geçiş: yüzeyden ana sahneye kesme yok; önce yükselir, yükselişin ortasından yeni kratere dalar, kamera sıçramaz', async () => {
  const ctx = createControllerContext();
  const getState = () => ctx.controller.getSurfaceState();
  ctx.controller.handleSurfaceRequest('JEZERO');
  await flush();
  runUntil(ctx, () => getState() === 'SURFACE');
  ctx.events.length = 0;

  assert.equal(ctx.controller.handleSurfaceRequest('CURIOSITY'), true);
  assert.equal(getState(), 'SURFACE_ASCENT', 'istek yüzeyden yükselişi başlatmalı');
  assert.equal(ctx.views.at(-1).s.name, 'MARS_SURFACE_SCENE', 'yüzey görüntüsünden doğrudan ana sahneye atlandı');
  assert.equal(ctx.controller.getActiveSite().id, 'JEZERO', 'hedef krater dalış başlamadan değişmemeli');

  let prev = null;
  let max_step = 0;
  for (let i = 0; i < 2000 && getState() !== 'ENTRY_HOLD'; i += 1) {
    ctx.controller.handleMarsSurfaceFrame(0.033, 0.033);
    if (['ORBIT_ASCENT', 'DIVE', 'ENTRY_HOLD'].includes(getState())) {
      const p = { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z };
      if (prev) max_step = Math.max(max_step, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      prev = p;
    }
  }
  await flush();
  await flush();
  runUntil(ctx, () => getState() === 'SURFACE');
  assert.equal(getState(), 'SURFACE');
  assert.equal(ctx.controller.getActiveSite().id, 'GALE');
  const states = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state).filter((s) => s !== 'ENTRY_HOLD');
  assert.deepEqual(states, ['SURFACE_ASCENT', 'ORBIT_ASCENT', 'DIVE', 'LANDING', 'SURFACE']);
  assert.ok(max_step < 0.4, `ana kamera ardışık karelerde sıçradı: ${max_step}`);
  ctx.controller.destroyMarsSurfaceController();
});

test('Kraterden kratere geçiş sürerken başka hedef istenirse zincir iptal olur ve istenen hedefe çıkılır', async () => {
  const ctx = createControllerContext();
  const getState = () => ctx.controller.getSurfaceState();
  ctx.controller.handleSurfaceRequest('JEZERO');
  await flush();
  runUntil(ctx, () => getState() === 'SURFACE');
  ctx.events.length = 0;

  ctx.controller.handleSurfaceRequest('CURIOSITY');
  ctx.controller.handleExitRequest('EARTH');
  runUntil(ctx, () => getState() === 'ORBIT');
  const states = ctx.events.filter((e) => e.type === 'ag:surface-state').map((e) => e.surface_state);
  assert.deepEqual(states, ['SURFACE_ASCENT', 'ORBIT_ASCENT', 'ORBIT']);
  assert.equal(ctx.controller.getActiveSite().id, 'JEZERO');
  assert.equal(ctx.cameraController.getActiveFocus().id, 'EARTH');
  ctx.controller.destroyMarsSurfaceController();
});

test('Yükseliş bitince kamera kontrolcüsü ana kameranın bakışıyla devralır: bakış noktası sıçramaz', async () => {
  const ctx = createControllerContext();
  const getState = () => ctx.controller.getSurfaceState();
  ctx.controller.handleSurfaceRequest('PERSEVERANCE');
  await flush();
  runUntil(ctx, () => getState() === 'SURFACE');
  ctx.controller.handleExitRequest('MARS');
  runUntil(ctx, () => getState() === 'ORBIT');
  // Mars düğümü (35,0,0): yükselişin son bakışı gezegen merkezidir, kontrol hedefi de aynısıdır
  assert.ok(Math.hypot(ctx.controls.target.x - 35, ctx.controls.target.y, ctx.controls.target.z) < 1e-6);
  assert.equal(ctx.cameraController.isZoomingToTarget(), true, 'çıkış hedefine geçiş başlamalı');
  const before = { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z };
  ctx.cameraController.handleCameraFrameUpdate(1 / 60);
  assert.ok(Math.hypot(ctx.camera.position.x - before.x, ctx.camera.position.y - before.y, ctx.camera.position.z - before.z) < 0.5, 'devir tesliminde kamera sıçradı');
  ctx.controller.destroyMarsSurfaceController();
});
