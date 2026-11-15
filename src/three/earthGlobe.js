// EONET Dünya küresi sahnesi: render döngüsü, bloom, kamera odaklama, afet efekti ve işaret yönetimi

import { getThreeDependencies } from "./threeDependencies.js";
import { calculateSurfaceNormal, calculateScenePosition } from "./geoMath.js";
import { createEarthMeshes, createStarField, loadEarthTextures } from "./earthLayers.js";
import { createDisasterEffect } from "./disasterEffects.js";
import { getDisasterStyle } from "./disasterStyles.js";
import { createEventMarkers } from "./eventMarkers.js";
import { disposeObjectTree } from "./effectLayers.js";
import { createCameraFocus } from "./cameraFocus.js";
import { calculateSubsolarPoint } from "../physics/solarPosition.js";

const DEFAULT_CAMERA_DISTANCE = 3.4;
const LABEL_ALTITUDE = 1.0;
const SUN_UPDATE_INTERVAL_S = 60;
const FOV_DEG = 38;

// Düzgün (rastgele olmayan) titreşim: farklı frekanslı sinüsler sert sıçrama yapmaz
function createShakeOffset(THREE, timeS, amplitude) {
  if (amplitude <= 0) return new THREE.Vector3();
  return new THREE.Vector3(
    Math.sin(timeS * 53) + Math.sin(timeS * 37 + 1.3),
    Math.sin(timeS * 61 + 2.1) + Math.sin(timeS * 29),
    Math.sin(timeS * 47 + 0.6)
  ).multiplyScalar(amplitude * 0.5);
}

function createRenderer(THREE, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "eonet-globe-canvas";
  container.appendChild(renderer.domElement);
  return renderer;
}

function updateSunDirection(THREE, sunUniform) {
  const sun = calculateSubsolarPoint(new Date());
  const dir = calculateSurfaceNormal(sun.latitude_deg, sun.longitude_deg);
  sunUniform.value.set(dir.x, dir.y, dir.z).normalize();
}

export async function createEarthEventGlobe(container, onProgress) {
  const deps = await getThreeDependencies();
  const { THREE } = deps;
  const renderer = createRenderer(THREE, container);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.01, 200);
  camera.position.set(0, 0.9, DEFAULT_CAMERA_DISTANCE);

  const shared = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uViewScale: { value: 1 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
  updateSunDirection(THREE, shared.uSunDir);

  const textures = await loadEarthTextures(THREE, renderer.capabilities.getMaxAnisotropy(), onProgress);
  const earth = createEarthMeshes(THREE, textures, shared);
  scene.add(earth.group, createStarField(THREE, shared));

  const controls = new deps.OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, enablePan: false, minDistance: 1.35, maxDistance: 7, rotateSpeed: 0.5, zoomSpeed: 0.7, autoRotate: true, autoRotateSpeed: 0.35 });

  const composer = new deps.EffectComposer(renderer);
  const bloom = new deps.UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.35, 1.0);
  composer.addPass(new deps.RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new deps.OutputPass());

  const cameraFocus = createCameraFocus(THREE, camera, controls);
  const state = { effect: null, markers: null, viewShift: { x_px: 0, y_px: 0 }, frameId: 0, lastSunUpdate: 0, frameListeners: new Set() };
  const clock = new THREE.Clock();

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, state.viewShift.x_px, state.viewShift.y_px, width, height);
    camera.updateProjectionMatrix();
    shared.uViewScale.value = height / (2 * Math.tan((FOV_DEG * Math.PI) / 360));
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Kullanıcı sürüklerse otomatik dönüş ve yarım kalan odak animasyonu bırakılır
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    cameraFocus.cancel();
  });

  function renderFrame() {
    state.frameId = requestAnimationFrame(renderFrame);
    const nowS = clock.getElapsedTime();
    shared.uTime.value = nowS;
    if (nowS - state.lastSunUpdate > SUN_UPDATE_INTERVAL_S) {
      updateSunDirection(THREE, shared.uSunDir);
      state.lastSunUpdate = nowS;
    }
    cameraFocus.update(nowS);
    controls.update();
    state.effect?.update();
    // Titreme sadece çizim anında uygulanır, sonra geri alınır; kamera konumu kalıcı bozulmaz
    const shake = state.effect?.getShake() || 0;
    const offset = createShakeOffset(THREE, nowS, shake);
    camera.position.add(offset);
    composer.render();
    camera.position.sub(offset);
    state.frameListeners.forEach((listener) => listener());
  }
  renderFrame();

  function clearEvents() {
    state.effect?.destroy();
    state.markers?.destroy();
    state.effect = null;
    state.markers = null;
  }

  return {
    showEvents(events, focusEvent) {
      clearEvents();
      const others = (events || []).filter((e) => e !== focusEvent);
      state.markers = createEventMarkers(THREE, shared, others);
      scene.add(state.markers.object);
      if (!focusEvent) return;
      state.effect = createDisasterEffect(THREE, shared, focusEvent);
      scene.add(state.effect.object);
      const n = calculateSurfaceNormal(focusEvent.coordinates.latitude_deg, focusEvent.coordinates.longitude_deg);
      cameraFocus.focusOnSurface(clock.getElapsedTime(), [n.x, n.y, n.z], getDisasterStyle(focusEvent.category).kind);
    },
    clearEvents,
    resetView() {
      clearEvents();
      cameraFocus.reset(clock.getElapsedTime(), DEFAULT_CAMERA_DISTANCE);
      controls.autoRotate = true;
    },
    setViewShift(xPx, yPx) {
      state.viewShift = { x_px: Number.isFinite(xPx) ? xPx : 0, y_px: Number.isFinite(yPx) ? yPx : 0 };
      resize();
    },
    pickEvent(clientX, clientY) {
      return state.markers?.pickEvent(clientX, clientY, camera, renderer.domElement.getBoundingClientRect()) || null;
    },
    // UI etiketi işaret ışınının tepesine konur; görünürlük yüzey noktasına göre hesaplanır
    projectEvent(event) {
      const s = calculateScenePosition(event.coordinates.latitude_deg, event.coordinates.longitude_deg, 1);
      const surface = new THREE.Vector3(s.x, s.y, s.z);
      const visible = camera.position.clone().sub(surface).dot(surface) > 0;
      const point = surface.multiplyScalar(LABEL_ALTITUDE).project(camera);
      return { x: ((point.x + 1) / 2) * container.clientWidth, y: ((1 - point.y) / 2) * container.clientHeight, visible };
    },
    onFrame(listener) {
      state.frameListeners.add(listener);
      return () => state.frameListeners.delete(listener);
    },
    destroy() {
      cancelAnimationFrame(state.frameId);
      resizeObserver.disconnect();
      state.frameListeners.clear();
      clearEvents();
      controls.dispose();
      composer.passes.forEach((pass) => pass.dispose?.());
      disposeObjectTree(scene);
      Object.values(textures).forEach((tex) => tex.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
