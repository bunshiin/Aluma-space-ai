import { BODY_MOTION_SCALE, calculateRadFromDeg, getCameraTarget, SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';
import { createSceneEnhancements } from './sceneEnhancements.js';
import { createMissionModel, createSolarSystem, destroySceneResources } from './solarSystemBuilder.js';
import { createMarsVisuals } from './marsAtmosphere.js';
import { createLunarSiteMarker } from './lunarSiteMarker.js';
import { createMarsPhotoSatelliteController, MARS_PHOTO_SATELLITE_ID } from './marsPhotoSatellite.js';
import { createMarsSurfaceController } from './marsSurfaceController.js';
import { createLunarSurfaceController } from './lunarSurfaceController.js';
import { createCameraController } from './solarSystemCamera.js';
import { calculateSpacecraftWobbleRad, createSpacecraftTrackerController, SPACECRAFT_CAMERA_TARGETS } from './spacecraftTracker.js';
import { createSolarFlareController } from './solarFlareSimulation.js';
import { getThreeDependencies } from './threeDependencies.js';
import { createRenderPipeline } from './renderPipeline.js';
import { createSolarSystemAsteroids } from './solarSystemAsteroids.js';
import { createLightDelayController } from './lightDelaySimulation.js';
import { createGlobalEventBindings } from './sceneEventBindings.js';
import { calculateAdaptivePixelRatio, createModelLoaders, createSceneControls, createSceneRenderer } from './sceneViewport.js';

function getSolarBodyConfig(bodyId) {
  return SOLAR_SYSTEM_BODIES.find((cfg) => cfg.id === bodyId);
}

/**
 * Güneş Sistemi (SOLAR_SYSTEM, SOLAR_FLARE, MARS_SURFACE) ya da tekil görev modeli sahnesini kurar.
 * Sözleşme kapısı threeSceneFactory.js içindeki create3DMissionScene'dir; burası onun Güneş Sistemi kolu.
 */
export async function createSolarSystemScene(container, modelUrl, onProgress, deps = null) {
  let loadedDeps;
  try {
    loadedDeps = await getThreeDependencies(deps);
  } catch (err) {
    console.warn('create3DMissionScene: Three.js bağımlılıkları yüklenemedi:', err);
    return { destroy() {} };
  }

  const { THREE, GLTFLoader, DRACOLoader, OrbitControls } = loadedDeps;
  const raf = deps?.requestAnimationFrame || globalThis.requestAnimationFrame;
  const caf = deps?.cancelAnimationFrame || globalThis.cancelAnimationFrame;

  const width_px = container.clientWidth || 800;
  const height_px = container.clientHeight || 600;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050a);

  const camera = new THREE.PerspectiveCamera(45, width_px / height_px, 0.05, 2500);
  const overview = getCameraTarget('SOLAR_SYSTEM_OVERVIEW');
  camera.position.set(...overview.position_units);

  const renderer = createSceneRenderer(THREE, container, width_px, height_px);
  const renderPipeline = createRenderPipeline(loadedDeps, renderer, scene, camera, width_px, height_px);
  const controls = createSceneControls(OrbitControls, camera, renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const { gltfLoader, dracoLoader } = createModelLoaders(GLTFLoader, DRACOLoader);

  let is_destroyed = false;
  let raf_id = null;
  let is_paused = false;
  let time_scale = 1;
  const mixers = [];
  let bodyMap = new Map();
  let orbitRigs = [];

  const worldPosBuffer = new THREE.Vector3();
  const cameraController = createCameraController(THREE, camera, controls, renderer.domElement, () => bodyMap, {
    onFocusTarget: (targetName) => handleFocusTarget(targetName),
  });
  const solarFlareController = createSolarFlareController(
    THREE,
    scene,
    cameraController,
    () => orbitRigs.find(({ cfg }) => cfg.id === 'SUN')?.tiltPivot ?? null
  );
  const lightDelayController = createLightDelayController(THREE, scene, cameraController, () => bodyMap);

  // Asteroit katmanı ag:focus-target olayının tek dinleyicisidir; odak Mars yüzeyini ve araç takibini bilen yoldan geçer
  const asteroidController = createSolarSystemAsteroids(THREE, gltfLoader, scene, camera, {
    handleFocusTarget: (targetName) => handleFocusTarget(targetName),
    getActiveFocus: () => cameraController.getActiveFocus(),
  }, () => bodyMap);

  const spacecraftTracker = createSpacecraftTrackerController(cameraController, () => orbitRigs);
  const getOrbitRig = (bodyId) => orbitRigs.find(({ cfg }) => cfg.id === bodyId) ?? null;
  const marsSurface = createMarsSurfaceController({
    deps: loadedDeps,
    renderer,
    domElement: renderer.domElement,
    scene,
    camera,
    controls,
    cameraController,
    renderPipeline,
    gltfLoader,
    onProgress,
    getAspect: () => camera.aspect,
    getMarsRig: () => getOrbitRig('MARS'),
    mars_radius_units: getSolarBodyConfig('MARS').target_radius_units,
    onExitComplete: (targetId) => handleFocusTarget(targetId),
  });
  const lunarSurface = createLunarSurfaceController({
    deps: loadedDeps,
    renderer,
    domElement: renderer.domElement,
    scene,
    camera,
    controls,
    cameraController,
    renderPipeline,
    gltfLoader,
    onProgress,
    getAspect: () => camera.aspect,
    getMoonRig: () => getOrbitRig('MOON'),
    moon_radius_units: getSolarBodyConfig('MOON').target_radius_units,
    onExitComplete: (targetId) => handleFocusTarget(targetId),
  });
  const marsPhotoSatellite = createMarsPhotoSatelliteController({ marsSurface, spacecraftTracker });

  function handleAnimationPaused(paused) {
    is_paused = Boolean(paused);
  }

  function handleTimeScale(multiplier) {
    if (typeof multiplier === 'number' && !Number.isNaN(multiplier) && multiplier >= 0) {
      time_scale = multiplier;
    }
  }

  let is_dispatching_focus = false;
  function dispatchFocusNotification(targetId) {
    if (is_dispatching_focus) return;
    if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try {
        is_dispatching_focus = true;
        globalThis.dispatchEvent(new CustomEvent('ag:focus-target', { detail: { id: targetId, target: targetId } }));
      } finally {
        is_dispatching_focus = false;
      }
    }
  }

  // Yüzey hedefleri (Mars roverları veya Apollo Ay Modülü) ilgili gezegen/uyduya dalış başlatır; başka gezegendeyken önce çıkış yapılır.
  function handleFocusTarget(targetName) {
    const resolved = getCameraTarget(targetName);
    if (marsSurface.isCameraLocked() && !resolved.surface_site_id && resolved.id !== MARS_PHOTO_SATELLITE_ID) {
      marsSurface.handleExitRequest(resolved.id);
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    if (lunarSurface.isCameraLocked() && !resolved.lunar_site_id) {
      lunarSurface.handleExitRequest(resolved.id);
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    if (resolved.surface_site_id && marsSurface.handleSurfaceRequest(resolved.surface_site_id)) {
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    if (resolved.lunar_site_id && lunarSurface.handleSurfaceRequest(resolved.lunar_site_id)) {
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    if (resolved.id === MARS_PHOTO_SATELLITE_ID) {
      marsPhotoSatellite.handleMarsPhotoRequest({ target: targetName });
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    if (SPACECRAFT_CAMERA_TARGETS && SPACECRAFT_CAMERA_TARGETS[resolved.id]) {
      spacecraftTracker.handleSpacecraftFocus({ id: resolved.id });
      dispatchFocusNotification(resolved.id);
      return resolved;
    }
    const result = cameraController.handleFocusTarget(targetName);
    dispatchFocusNotification(resolved.id);
    return result;
  }

  const highlightRing = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.35, 48),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
  );
  highlightRing.rotation.x = Math.PI / 2;
  highlightRing.visible = false;
  scene.add(highlightRing);

  function handleHighlightTarget(targetName, enabled = true) {
    const resolved = getCameraTarget(targetName);
    const node = resolved.body_id ? bodyMap.get(resolved.body_id) : null;
    if (!enabled || !node) {
      highlightRing.visible = false;
      return;
    }
    node.getWorldPosition(worldPosBuffer);
    highlightRing.position.copy(worldPosBuffer);
    highlightRing.visible = true;
  }

  const handleResizeEvent = () => {
    if (is_destroyed || !container) {
      return;
    }
    const nextW_px = container.clientWidth || 800;
    const nextH_px = container.clientHeight || 600;
    camera.aspect = nextW_px / nextH_px;
    camera.updateProjectionMatrix();
    if (typeof renderer.setPixelRatio === 'function' && globalThis.devicePixelRatio) {
      renderer.setPixelRatio(calculateAdaptivePixelRatio(nextW_px, nextH_px, globalThis.devicePixelRatio));
    }
    renderer.setSize(nextW_px, nextH_px);
    renderPipeline.handleRenderResize(nextW_px, nextH_px);
    marsSurface.handleMarsSurfaceResize(camera.aspect);
    lunarSurface.handleLunarSurfaceResize(camera.aspect);
  };
  // Dinleyiciler tek tablodan bağlanır ki destroy'da biri unutulup sızmasın
  const globalEventBindings = createGlobalEventBindings({
    'ag:set-time-scale': (event) => handleTimeScale(event?.detail?.multiplier),
    'ag:solar-flare': (event) => solarFlareController.handleTriggerSolarFlare(event?.detail || {}),
    'ag:light-delay': (event) => lightDelayController.handleTriggerLightDelay(event?.detail || {}),
    'ag:light-delay-clear': () => lightDelayController.handleClearLightDelay(),
    resize: handleResizeEvent,
  });

  const isSolarSystem = !modelUrl || ['SOLAR_SYSTEM', 'SOLAR_FLARE', 'MARS_SURFACE', 'LIGHT_DELAY', 'LUNAR_SURFACE'].includes(modelUrl);
  let enhancements = null;
  if (isSolarSystem) {
    enhancements = createSceneEnhancements(THREE, scene, renderer, getSolarBodyConfig('SUN').target_radius_units);
    const built = await createSolarSystem(THREE, gltfLoader, scene, onProgress, () => is_destroyed);
    bodyMap = built.bodyMap;
    orbitRigs = built.orbitRigs;
    if (Array.isArray(built.mixers)) {
      mixers.push(...built.mixers);
    }
    await asteroidController.handleInitAsteroids(() => is_destroyed);
    if (modelUrl === 'SOLAR_FLARE' && !is_destroyed) {
      solarFlareController.handleTriggerSolarFlare({ flare_category: 'X' });
    }
    // Parametresiz açılışta varsayılan gösterim; Gemini parametreleri ag:light-delay ile gelir
    if (modelUrl === 'LIGHT_DELAY' && !is_destroyed) {
      lightDelayController.handleTriggerLightDelay({ source: 'EARTH', target: 'MARS', mode: 'one-way' });
    }
    const marsRig = getOrbitRig('MARS');
    if (marsRig && !is_destroyed) {
      const marsVisuals = createMarsVisuals(THREE, getSolarBodyConfig('MARS').target_radius_units);
      marsRig.tiltPivot.add(...marsVisuals);
      const craterGroup = marsVisuals.find((v) => v.name === 'MARS_ROVER_SITES');
      if (craterGroup) {
        craterGroup.children.forEach((anchor) => {
          if (anchor.userData?.site_id) bodyMap.set(anchor.userData.site_id, anchor);
          if (anchor.userData?.rover_id) bodyMap.set(anchor.userData.rover_id, anchor);
        });
      }
    }
    const moonRig = getOrbitRig('MOON');
    if (moonRig && !is_destroyed) {
      const lunarMarker = createLunarSiteMarker(THREE, getSolarBodyConfig('MOON').target_radius_units);
      moonRig.tiltPivot.add(lunarMarker);
      bodyMap.set('APOLLO_LUNAR_MODULE', lunarMarker);
      bodyMap.set('TRANQUILITY_BASE', lunarMarker);
    }
    if (modelUrl === 'MARS_SURFACE' && !is_destroyed) {
      handleFocusTarget('PERSEVERANCE');
    }
    if (modelUrl === 'LUNAR_SURFACE' && !is_destroyed) {
      handleFocusTarget('APOLLO_LUNAR_MODULE');
    }
  } else {
    mixers.push(...(await createMissionModel(THREE, gltfLoader, scene, modelUrl, onProgress, () => is_destroyed)));
  }

  let last_time_ms = Date.now();
  let total_s = 0;
  function renderFrame() {
    if (is_destroyed) {
      return;
    }
    raf_id = raf(renderFrame);

    const now_ms = Date.now();
    const delta_s = Math.min((now_ms - last_time_ms) / 1000, 0.1);
    last_time_ms = now_ms;

    if (!is_paused) {
      const scaled_delta_s = delta_s * time_scale;
      const motion_delta_s = scaled_delta_s * BODY_MOTION_SCALE;
      total_s += delta_s;
      orbitRigs.forEach(({ cfg, orbitPivot, tiltPivot }) => {
        orbitPivot.rotation.y += calculateRadFromDeg(cfg.orbit_speed_deg_s * motion_delta_s);
        if (cfg.is_spacecraft) {
          const wobble = calculateSpacecraftWobbleRad(cfg, total_s);
          tiltPivot.rotation.x = wobble.pitch_rad;
          tiltPivot.rotation.y = wobble.yaw_rad;
          tiltPivot.rotation.z = wobble.roll_rad;
        } else {
          tiltPivot.rotation.y += calculateRadFromDeg(cfg.rotation_speed_deg_s * motion_delta_s);
        }
      });
      mixers.forEach((mixer) => mixer.update(scaled_delta_s));
      solarFlareController.handleSolarFlareFrameUpdate(delta_s);
      lightDelayController.handleLightDelayFrameUpdate(delta_s);
      asteroidController.handleAsteroidsFrameUpdate(delta_s);
      if (enhancements) enhancements.handleEnhancementsFrame(total_s);
    }

    spacecraftTracker.handleSpacecraftFrameUpdate(delta_s);
    marsSurface.handleMarsSurfaceFrame(delta_s, is_paused ? 0 : delta_s * time_scale);
    lunarSurface.handleLunarSurfaceFrame(delta_s);
    if (!marsSurface.isCameraLocked() && !lunarSurface.isCameraLocked()) cameraController.handleCameraFrameUpdate(delta_s);
    renderPipeline.handleRenderFrame();
  }

  if (!is_destroyed && typeof raf === 'function') {
    raf_id = raf(renderFrame);
  }

  function destroy() {
    if (is_destroyed) {
      return;
    }
    is_destroyed = true;

    if (raf_id !== null && typeof caf === 'function') {
      caf(raf_id);
      raf_id = null;
    }

    mixers.forEach((mixer) => {
      if (typeof mixer.stopAllAction === 'function') {
        mixer.stopAllAction();
      }
    });
    mixers.length = 0;

    asteroidController.destroyAsteroidsController();
    solarFlareController.destroySolarFlareController();
    lightDelayController.destroyLightDelayController();
    spacecraftTracker.destroySpacecraftTracker();
    marsPhotoSatellite.destroyMarsPhotoSatelliteController();
    marsSurface.destroyMarsSurfaceController();
    lunarSurface.destroyLunarSurfaceController();
    cameraController.destroyCameraController();

    globalEventBindings.destroyGlobalEventBindings();

    if (controls && typeof controls.dispose === 'function') {
      controls.dispose();
    }

    destroySceneResources(scene);

    if (dracoLoader && typeof dracoLoader.dispose === 'function') {
      dracoLoader.dispose();
    }

    renderPipeline.destroyRenderPipeline();
    if (typeof renderer.dispose === 'function') {
      renderer.dispose();
    }

    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  void handleAnimationPaused;
  void handleHighlightTarget;

  return { destroy };
}
