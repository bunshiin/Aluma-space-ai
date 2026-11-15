import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraController } from '../src/three/solarSystemCamera.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

const FRAME_S = 1 / 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function createRig(bodies, camera_position) {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...camera_position);
  const controls = { target: new THREE.Vector3(), update() {} };
  const listeners = {};
  const domElement = {
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
  };
  const bodyMap = new Map();
  Object.entries(bodies).forEach(([id, position]) => {
    const node = new THREE.Group();
    node.position.set(...position);
    bodyMap.set(id, node);
  });
  const controller = createCameraController(THREE, camera, controls, domElement, () => bodyMap);
  return { THREE, camera, controls, listeners, bodyMap, controller };
}

function runFrames(rig, max_frames, onFrame) {
  for (let i = 0; i < max_frames; i += 1) {
    rig.controller.handleCameraFrameUpdate(FRAME_S);
    if (onFrame) onFrame(i);
    if (!rig.controller.isZoomingToTarget()) return i + 1;
  }
  return max_frames;
}

test('Odak geçişi ışınlanmaz: ilk karede yerinde kalır, adım adım ilerler ve hedef pozda biter', () => {
  const rig = createRig({ MARS: [35, 0, 0] }, [0, 85, 165]);
  const start = { x: 0, y: 85, z: 165 };
  rig.controls.target.set(0, 0, 0);
  rig.controller.handleFocusTarget('MARS');
  assert.equal(rig.controller.isZoomingToTarget(), true);

  rig.controller.handleCameraFrameUpdate(FRAME_S);
  assert.ok(dist(rig.camera.position, start) < 0.5, 'ilk karede kamera sıçradı');

  let prev = { x: rig.camera.position.x, y: rig.camera.position.y, z: rig.camera.position.z };
  let max_step = 0;
  const frames = runFrames(rig, 600, () => {
    max_step = Math.max(max_step, dist(rig.camera.position, prev));
    prev = { x: rig.camera.position.x, y: rig.camera.position.y, z: rig.camera.position.z };
  });
  assert.ok(frames < 600, 'geçiş hiç bitmedi');
  assert.ok(max_step < 3, `kare başına adım çok büyük: ${max_step}`);
  const end = { x: 35 + 4 * 0.7, y: 4 * 0.45, z: 4 };
  assert.ok(dist(rig.camera.position, end) < 0.05, 'kamera hedef pozda bitmedi');
  assert.ok(dist(rig.controls.target, { x: 35, y: 0, z: 0 }) < 0.05, 'bakış hedefte bitmedi');
  assert.equal(rig.controller.getActiveFocus().id, 'MARS');
});

test('Güneş\'in arkasındaki hedefe geçişte kamera Güneş\'in içinden geçmez', () => {
  const rig = createRig({ SUN: [0, 0, 0], NEPTUNE: [60, 0, 0] }, [-60, 0, 0]);
  rig.controls.target.set(0, 0, 0);
  rig.controller.handleFocusTarget('NEPTUNE');
  const sun_radius_units = 6.5;
  let min_dist = Infinity;
  runFrames(rig, 900, () => {
    min_dist = Math.min(min_dist, dist(rig.camera.position, { x: 0, y: 0, z: 0 }));
  });
  assert.ok(min_dist >= sun_radius_units, `kamera Güneş'e girdi: ${min_dist}`);
  assert.equal(rig.controller.isZoomingToTarget(), false);
});

test('Mars\'ın arkasındaki yörünge uydusuna geçişte kamera Mars\'ın içinden geçmez ve uydunun yanında biter', () => {
  const rig = createRig({ MARS: [0, 0, 0], MARS_PHOTO_SAT: [1.18, 0, 0] }, [-5, 0.3, 0]);
  rig.controls.target.set(0, 0, 0);
  rig.controller.handleFocusTarget('MARS_PHOTO_SAT');
  const mars_radius_units = 0.85;
  let min_dist = Infinity;
  runFrames(rig, 900, () => {
    min_dist = Math.min(min_dist, dist(rig.camera.position, { x: 0, y: 0, z: 0 }));
  });
  assert.ok(min_dist >= mars_radius_units, `kamera Mars'a girdi: ${min_dist}`);
  assert.ok(dist(rig.camera.position, { x: 1.18, y: 0, z: 0 }) < 0.4, 'kamera uyduya yaklaşmadı');
});

test('Kullanıcı tekerleği geçişi bırakır; kamera yerinde kalır ve kavga etmez', () => {
  const rig = createRig({ MARS: [35, 0, 0] }, [0, 85, 165]);
  rig.controller.handleFocusTarget('MARS');
  for (let i = 0; i < 10; i += 1) rig.controller.handleCameraFrameUpdate(FRAME_S);
  rig.listeners.wheel({ deltaY: -120 });
  assert.equal(rig.controller.isZoomingToTarget(), false);
  const at = { x: rig.camera.position.x, y: rig.camera.position.y, z: rig.camera.position.z };
  rig.controller.handleCameraFrameUpdate(FRAME_S);
  assert.ok(dist(rig.camera.position, at) < 1e-6, 'geçiş iptal edildi ama kamera hâlâ itiliyor');
  rig.controller.destroyCameraController();
});

test('Genel görünüme dönüş de yumuşak uçar ve genel görünüm pozunda biter', () => {
  const rig = createRig({ MARS: [35, 0, 0] }, [39, 2, 4]);
  rig.controls.target.set(35, 0, 0);
  rig.controller.handleFocusTarget('SOLAR_SYSTEM_OVERVIEW');
  assert.equal(rig.controller.isZoomingToTarget(), true);
  rig.controller.handleCameraFrameUpdate(FRAME_S);
  assert.ok(dist(rig.camera.position, { x: 39, y: 2, z: 4 }) < 0.5);
  runFrames(rig, 900);
  assert.ok(dist(rig.camera.position, { x: 0, y: 85, z: 165 }) < 0.05);
  assert.ok(dist(rig.controls.target, { x: 0, y: 0, z: 0 }) < 0.05);
});

test('Sahnede olmayan hedefte geçiş takılı kalmaz; bozuk kare süresi hata vermez', () => {
  const rig = createRig({ MARS: [35, 0, 0] }, [0, 85, 165]);
  rig.controller.handleFocusTarget('JUPITER');
  assert.equal(rig.controller.isZoomingToTarget(), false);
  rig.controller.handleFocusTarget('MARS');
  assert.doesNotThrow(() => rig.controller.handleCameraFrameUpdate(NaN));
  assert.doesNotThrow(() => rig.controller.handleCameraFrameUpdate(-1));
  assert.doesNotThrow(() => rig.controller.handleCameraFrameUpdate());
});

test('Zaten odaklı olunan hedefe (ISS) tekrar handleFocusTarget çağrıldığında kamera geçişi yeniden başlamaz', () => {
  const rig = createRig({ EARTH: [25, 0, 0], ISS: [25.5, 0, 0] }, [0, 85, 165]);
  rig.controls.target.set(0, 0, 0);
  rig.controller.handleFocusTarget('ISS');
  assert.equal(rig.controller.isZoomingToTarget(), true);
  runFrames(rig, 900);
  assert.equal(rig.controller.isZoomingToTarget(), false);
  assert.equal(rig.controller.getActiveFocus().id, 'ISS');

  rig.controller.handleFocusTarget('ISS');
  assert.equal(rig.controller.isZoomingToTarget(), false, 'aynı hedefe tekrar odak istendiğinde zoom yeniden başlamamalı');
});

test('getBodyAtPointer ve pointerUp: gezegen gövdesine veya uzay aracına tıklama odağı tetikler', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
  camera.position.set(0, 0, 50);

  // Mock project fonksiyonunu ekran koordinatı oluşturacak şekilde ayarla
  THREE.Vector3.prototype.project = function(cam) {
    const camZ = cam?.position?.z || 50;
    this.x = (this.x / (camZ * 0.2)) || 0;
    this.y = (this.y / (camZ * 0.2)) || 0;
    this.z = 0.5;
    return this;
  };

  const domElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener(type, fn) { this.listeners[type] = fn; },
    removeEventListener() {},
    listeners: {},
  };

  const earthNode = new THREE.Group();
  earthNode.position.set(0, 0, 0); // Ekranda merkezde (400, 300)
  const issNode = new THREE.Group();
  issNode.position.set(2, 0, 0); // Ekranda sağa kayık (480, 300)

  const bodyMap = new Map([
    ['EARTH', earthNode],
    ['ISS', issNode],
  ]);

  let focused = null;
  const controller = createCameraController(THREE, camera, { target: new THREE.Vector3(), update() {} }, domElement, () => bodyMap, {
    onFocusTarget: (id) => { focused = id; },
  });

  // Dünya merkezine tıklama (400, 300)
  domElement.listeners.pointerdown?.({ clientX: 400, clientY: 300 });
  domElement.listeners.pointerup?.({ clientX: 400, clientY: 300 });
  assert.equal(focused, 'EARTH', 'Dünya merkezine tıklanınca EARTH seçilmeli');

  // ISS'in konumuna tıklama (480, 300)
  domElement.listeners.pointerdown?.({ clientX: 480, clientY: 300 });
  domElement.listeners.pointerup?.({ clientX: 480, clientY: 300 });
  assert.equal(focused, 'ISS', 'ISS yanına tıklanınca ISS seçilmeli');

  controller.destroyCameraController();
});

test('Gezegen arkasında kalan (occluded) nesne seçilmez, öndeki gezegen seçilir; hover imleci pointer olur', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
  camera.position.set(0, 0, 50);

  THREE.Vector3.prototype.project = function(cam) {
    const camZ = cam?.position?.z || 50;
    this.x = (this.x / (camZ * 0.2)) || 0;
    this.y = (this.y / (camZ * 0.2)) || 0;
    this.z = 0.5;
    return this;
  };

  const domElement = {
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener(type, fn) { this.listeners[type] = fn; },
    removeEventListener(type) { delete this.listeners[type]; },
    listeners: {},
  };

  // Jüpiter kameraya yakın (z = 0, camDist = 50), Io Jüpiter'in tam arkasında (z = -10, camDist = 60)
  const jupiterNode = new THREE.Group();
  jupiterNode.position.set(0, 0, 0); // Ekran merkezi (400, 300)
  const ioNode = new THREE.Group();
  ioNode.position.set(0, 0, -10); // Ekran merkezi (400, 300) ama arkada!

  const bodyMap = new Map([
    ['JUPITER', jupiterNode],
    ['IO', ioNode],
  ]);

  let focused = null;
  const controller = createCameraController(THREE, camera, { target: new THREE.Vector3(), update() {} }, domElement, () => bodyMap, {
    onFocusTarget: (id) => { focused = id; },
  });

  // Hover testi: Jüpiter üzerindeyken imleç pointer olmalı
  domElement.listeners.pointermove?.({ clientX: 400, clientY: 300 });
  assert.equal(domElement.style.cursor, 'pointer', 'Gezegen üzerindeyken imleç pointer olmalı');

  // Boş uzaydayken imleç default olmalı
  domElement.listeners.pointermove?.({ clientX: 50, clientY: 50 });
  assert.equal(domElement.style.cursor, 'default', 'Boşluktayken imleç default olmalı');

  // Tıklama: Jüpiter arkasındaki IO yerine öndeki JUPITER seçilmeli
  domElement.listeners.pointerdown?.({ clientX: 400, clientY: 300 });
  domElement.listeners.pointerup?.({ clientX: 400, clientY: 300 });
  assert.equal(focused, 'JUPITER', 'Arkadaki IO yerine öndeki JUPITER seçilmeli');

  controller.destroyCameraController();
  assert.equal(domElement.style.cursor, '', 'Destroy sonrası imleç sıfırlanmalı');
});

test('Kamera hedefe vardığında ag:focus-arrived yayınlanır, giriş kilitliyken yayınlanmaz', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
  camera.position.set(0, 0, 50);
  const marsNode = new THREE.Group();
  marsNode.position.set(18, 0, 0);
  const bodyMap = new Map([['MARS', marsNode]]);
  const arrived = [];
  const prevDispatch = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (ev) => {
    if (ev?.type === 'ag:focus-arrived') arrived.push(ev.detail.target);
    return true;
  };

  try {
    const controller = createCameraController(THREE, camera, { target: new THREE.Vector3(), update() {} }, null, () => bodyMap);
    controller.handleFocusTarget('MARS');
    controller.handleCameraFrameUpdate(0.1);
    assert.deepEqual(arrived, [], 'geçiş sürerken ag:focus-arrived yayınlanmamalı');

    for (let i = 0; i < 60; i += 1) controller.handleCameraFrameUpdate(0.1);
    assert.deepEqual(arrived, ['MARS'], 'varışta hedefle ag:focus-arrived yayınlanmalı');

    controller.handleInputEnabled(false);
    controller.handleFocusTarget('SUN');
    for (let i = 0; i < 60; i += 1) controller.handleCameraFrameUpdate(0.1);
    assert.deepEqual(arrived, ['MARS'], 'giriş kilitliyken varış yayınlanmamalı');
  } finally {
    globalThis.dispatchEvent = prevDispatch;
  }
});
