// SHOW_COMPARISON: Güneş Sistemi'nden bağımsız iki cisim karşılaştırma sahnesi.
// Mod A yan yana boyut kıyası, Mod B yüzeye zoom + astronot düşme testi. İstekler ag:planet-comparison ile gelir.
import { calculatePlanetComparison } from '../physics/spacePhysics.js';
import { destroySceneResources } from './solarSystemBuilder.js';
import { getThreeDependencies } from './threeDependencies.js';
import { createRenderPipeline } from './renderPipeline.js';
import {
  COMPARISON_TIMING,
  calculateComparisonLayout,
  calculateZoomEndPosition,
  resolveComparisonRequest,
} from './planetComparisonConfig.js';
import { createComparisonBodies } from './planetComparisonBodies.js';
import { createSurfaceStage } from './planetComparisonSurface.js';
import { createComparisonCameraRig } from './planetComparisonCamera.js';
import { createComparisonLabels, buildBodyLabelEntries } from './planetComparisonLabels.js';
import { createComparisonLoaders, createComparisonRenderer, createStarfield } from './planetComparisonSetup.js';
import { calculateSmoothStep } from './planetComparisonEasing.js';

export const COMPARISON_REQUEST_EVENT = 'ag:planet-comparison';
export const COMPARISON_STATUS_EVENT = 'ag:planet-comparison-status';

const T = COMPARISON_TIMING;
const LABEL_FADE_IN_S = 0.8;

/**
 * Karşılaştırma sahnesini kurar. Sözleşmedeki create3DMissionScene ile aynı biçimde { destroy } döner,
 * hata fırlatmaz. initialRequest ilk karşılaştırmayı belirler; sonrakiler ag:planet-comparison ile gelir.
 */
export async function createPlanetComparisonScene(container, initialRequest, onProgress, deps = null) {
  if (!container || typeof container !== 'object') {
    console.warn('createPlanetComparisonScene: geçersiz container, yedek boş sahne dönüldü.');
    return { destroy() {} };
  }
  let loadedDeps;
  try {
    loadedDeps = await getThreeDependencies(deps);
  } catch (err) {
    console.warn('createPlanetComparisonScene: Three.js bağımlılıkları yüklenemedi:', err);
    return { destroy() {} };
  }

  const { THREE, GLTFLoader, DRACOLoader, OrbitControls } = loadedDeps;
  const raf = deps?.requestAnimationFrame || globalThis.requestAnimationFrame;
  const caf = deps?.cancelAnimationFrame || globalThis.cancelAnimationFrame;
  const eventTarget = deps?.eventTarget || globalThis;
  const width_px = container.clientWidth || 800;
  const height_px = container.clientHeight || 600;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(45, width_px / height_px, 0.05, 2000);
  scene.add(camera);
  const renderer = createComparisonRenderer(THREE, container, width_px, height_px);
  const renderPipeline = createRenderPipeline(loadedDeps, renderer, scene, camera, width_px, height_px);
  const controls = OrbitControls ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableZoom = false;
  }
  const cameraRig = createComparisonCameraRig(THREE, camera, controls);
  const labels = createComparisonLabels(THREE, container, camera);
  const { dracoLoader, gltfLoader } = createComparisonLoaders(GLTFLoader, DRACOLoader);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
  keyLight.position.set(-10, 6, 12);
  scene.add(keyLight);
  scene.add(createStarfield(THREE));

  let is_destroyed = false;
  let raf_id = null;
  let request_token = 0;
  let content = null;
  let phase = 'LOADING';
  let phaseElapsed_s = 0;
  const leaveResolvers = [];
  const cleanups = [];

  function handleStatusDispatch(comparison) {
    if (typeof eventTarget.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent(COMPARISON_STATUS_EVENT, { detail: comparison }));
    }
  }

  function destroyContent() {
    if (!content) return;
    content.mixers.forEach((mixer) => mixer.stopAllAction?.());
    destroySceneResources(content.group);
    scene.remove(content.group);
    content = null;
  }

  function handleSetPhase(nextPhase) {
    phase = nextPhase;
    phaseElapsed_s = 0;
  }

  // Yeni istek geldiğinde eski sahne aniden kaybolmaz: önce kararır, kararma bitince yerine yenisi kurulur
  function handleLeaveTransition() {
    handleSetPhase('LEAVING');
    cameraRig.handleFadeTo(1, T.leave_s);
    return new Promise((resolve) => leaveResolvers.push(resolve));
  }

  function handleSurfaceSwitch() {
    content.bodiesGroup.visible = false;
    content.surfaceGroup.visible = true;
    const { camera_position_units: finalPos, camera_target_units: target } = content.surface;
    // Yüzeye yakından girip geri çekilerek "iniş" hissi verilir
    cameraRig.handleCameraJump([finalPos[0], finalPos[1] - 1.5, finalPos[2] * 0.55], target);
    cameraRig.handleCameraTween(finalPos, target, T.settle_s);
    cameraRig.handleFadeTo(0, T.surface_fade_in_s);
    content.surface.handleFallReset();
    handleSetPhase('SURFACE');
  }

  function handleZoomStart() {
    cameraRig.handleCameraTween(calculateZoomEndPosition(content.layout), [0, 0, 0], T.zoom_s);
    content.is_zoom_fading = false;
    handleSetPhase('ZOOM');
  }

  async function handleComparisonRequest(rawRequest) {
    request_token += 1;
    const token = request_token;
    const isStale = () => is_destroyed || token !== request_token;
    const request = resolveComparisonRequest(rawRequest);
    const comparison = calculatePlanetComparison(request.primary_object, request.secondary_object, {
      mass_kg: request.mass_kg,
      height_m: request.height_m,
      age_years: request.age_years,
    });
    handleStatusDispatch(comparison);

    if (content) await handleLeaveTransition();
    if (isStale()) return;
    destroyContent();
    labels.handleLabelsSet([]);
    cameraRig.handleFadeOpacity(1);

    const group = new THREE.Group();
    const bodiesGroup = new THREE.Group();
    const surfaceGroup = new THREE.Group();
    surfaceGroup.visible = false;
    group.add(bodiesGroup);
    group.add(surfaceGroup);
    scene.add(group);

    const layout = calculateComparisonLayout(comparison, camera.aspect, camera.fov);
    const total_loads = request.is_gravity_test ? 4 : 2;
    let completed_loads = 0;
    const onLoaded = () => {
      completed_loads += 1;
      if (!isStale() && typeof onProgress === 'function') {
        onProgress(Math.round((completed_loads / total_loads) * 100));
      }
    };
    const bodies = createComparisonBodies(THREE, gltfLoader, bodiesGroup, layout, isStale, onLoaded);
    const surface = request.is_gravity_test
      ? createSurfaceStage(THREE, gltfLoader, surfaceGroup, comparison, isStale, onLoaded)
      : null;
    content = { request, comparison, layout, group, bodiesGroup, surfaceGroup, bodies, surface, mixers: [] };
    handleSetPhase('LOADING');
    // Kamera siyah perdenin arkasında yeni kadraja geçer; görünür bir kayma olmaz
    cameraRig.handleCameraJump([0, layout.camera_distance_units * 0.12, layout.camera_distance_units], layout.look_at_units);

    const [{ mixers, groundTextures }] = await Promise.all([bodies.load, surface?.load]);
    if (isStale()) {
      mixers.forEach((mixer) => mixer.stopAllAction?.());
      return;
    }
    content.mixers.push(...mixers);
    surface?.handleGroundTextures(groundTextures);
    bodies.handleBodiesReveal();
    labels.handleLabelsSet(buildBodyLabelEntries(layout, comparison));
    cameraRig.handleFadeTo(0, T.fade_in_s);
    if (request.is_gravity_test) {
      handleZoomStart();
    } else {
      handleSetPhase('SIDE_BY_SIDE');
    }
  }

  function handlePhaseFrame(delta_s) {
    phaseElapsed_s += delta_s;
    if (phase === 'ZOOM') {
      const progress = cameraRig.getTweenProgress();
      if (!content.is_zoom_fading && progress >= T.zoom_fade_start_progress) {
        content.is_zoom_fading = true;
        cameraRig.handleFadeTo(1, T.zoom_fade_out_s);
      }
      if (progress >= 1 && cameraRig.getFadeOpacity() >= 0.99) handleSurfaceSwitch();
    } else if (phase === 'SURFACE') {
      const state = content.surface.handleSurfaceFrame(delta_s);
      labels.handleLabelsSet(content.surface.getLabelEntries(state));
    }
  }

  // Etiketler kararma perdesiyle uyumlu görünür; yaklaşırken cisimlerden önce silinir
  function getLabelOpacity() {
    if (!content || phase === 'LOADING') return 0;
    const clearOfFade = 1 - cameraRig.getFadeOpacity();
    if (phase === 'SIDE_BY_SIDE') return Math.min(clearOfFade, calculateSmoothStep(phaseElapsed_s / LABEL_FADE_IN_S));
    if (phase === 'ZOOM') {
      const progress = cameraRig.getTweenProgress() / T.labels_hide_progress;
      return Math.min(clearOfFade, 1 - calculateSmoothStep(progress), calculateSmoothStep(phaseElapsed_s / LABEL_FADE_IN_S));
    }
    return clearOfFade;
  }

  let last_time_ms = Date.now();
  function renderFrame() {
    if (is_destroyed) return;
    raf_id = raf(renderFrame);
    const now_ms = Date.now();
    const delta_s = Math.min((now_ms - last_time_ms) / 1000, 0.05);
    last_time_ms = now_ms;

    if (content && phase !== 'LOADING') {
      content.bodies.handleBodiesFrame(delta_s);
      content.mixers.forEach((mixer) => mixer.update(delta_s));
      handlePhaseFrame(delta_s);
    }
    cameraRig.handleCameraFrame(delta_s);
    if (leaveResolvers.length > 0 && cameraRig.getFadeOpacity() >= 0.999) {
      leaveResolvers.splice(0).forEach((resolve) => resolve());
    }
    if (controls && typeof controls.update === 'function') controls.update();
    labels.handleLabelsOpacity(getLabelOpacity());
    labels.handleLabelsFrame();
    renderPipeline.handleRenderFrame();
  }

  const handleRequestEvent = (event) => {
    handleComparisonRequest(event?.detail).catch((err) => console.warn('Karşılaştırma isteği işlenemedi:', err));
  };
  const handleResizeEvent = () => {
    if (is_destroyed) return;
    const nextW_px = container.clientWidth || 800;
    const nextH_px = container.clientHeight || 600;
    camera.aspect = nextW_px / nextH_px;
    camera.updateProjectionMatrix();
    renderer.setSize(nextW_px, nextH_px);
    renderPipeline.handleRenderResize(nextW_px, nextH_px);
    // Dar pencerede iki cisim yatayda sığmaz; yan yana görünümde kadraj yeni orana göre yumuşakça yeniden ayarlanır
    if (content && phase === 'SIDE_BY_SIDE') {
      const layout = calculateComparisonLayout(content.comparison, camera.aspect, camera.fov);
      cameraRig.handleCameraTween([0, layout.camera_distance_units * 0.12, layout.camera_distance_units], layout.look_at_units, T.leave_s * 2);
    }
  };
  if (typeof eventTarget.addEventListener === 'function') {
    eventTarget.addEventListener(COMPARISON_REQUEST_EVENT, handleRequestEvent);
    eventTarget.addEventListener('resize', handleResizeEvent);
    cleanups.push(() => {
      eventTarget.removeEventListener(COMPARISON_REQUEST_EVENT, handleRequestEvent);
      eventTarget.removeEventListener('resize', handleResizeEvent);
    });
  }

  if (typeof raf === 'function') raf_id = raf(renderFrame);
  try {
    await handleComparisonRequest(initialRequest);
  } catch (err) {
    console.warn('createPlanetComparisonScene: ilk karşılaştırma kurulamadı:', err);
  }

  function destroy() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (raf_id !== null && typeof caf === 'function') {
      caf(raf_id);
      raf_id = null;
    }
    cleanups.forEach((cleanup) => cleanup());
    cleanups.length = 0;
    labels.destroyComparisonLabels();
    content?.mixers.forEach((mixer) => mixer.stopAllAction?.());
    content = null;
    if (controls && typeof controls.dispose === 'function') controls.dispose();
    destroySceneResources(scene);
    if (dracoLoader && typeof dracoLoader.dispose === 'function') dracoLoader.dispose();
    renderPipeline.destroyRenderPipeline();
    if (typeof renderer.dispose === 'function') renderer.dispose();
    if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { destroy };
}
