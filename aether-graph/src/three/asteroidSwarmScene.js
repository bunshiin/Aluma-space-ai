// NEO_SWARM sahnesi: Dünya merkezde, yakın geçen asteroitler tehlike seviyesine göre parlayan
// kümeler halinde yörüngede döner. Sözleşme değişmez; veri ve odak olaylarla gelir:
//   'ag:neo-data'     detail = getSpaceData dizisi | { asteroids } | Gemini JSON'u ({ parameters: { asteroids } })
//                     asteroit = { name, close_approach_utc, distance_km, velocity_kmh, is_hazardous }
//                     Renk sadece distance_km'den gelir (yakın kırmızı, orta sarı, uzak yeşil); hazard_level kullanılmaz.
//   'ag:focus-target' detail = { target: '<asteroit adı>' | 'EARTH' }
// Her yeni 'ag:neo-data' listenin tamamıdır: listede olmayan asteroit kaybolur, yeni gelen belirir.
import {
  ASTEROID_CAMERA,
  ASTEROID_MODEL_URLS,
  calculateMoonOrbitUnits,
  calculateRelativeSpeeds,
  EARTH_MODEL_URL,
  EARTH_RADIUS_UNITS,
  getSanitizedAsteroids,
  isBennuAsteroid,
  MAX_ASTEROID_COUNT,
  MOON_MODEL_URL,
  MOON_RADIUS_UNITS,
} from './asteroidSwarmConfig.js';
import { createAsteroidCluster } from './asteroidClusters.js';
import { createAsteroidCameraController } from './asteroidSwarmCamera.js';
import {
  createEarthAtmosphere,
  createEnvironment,
  createLights,
  createSceneEventInbox,
  getGeometryRadius,
  getLoadedModel,
} from './asteroidSceneSetup.js';
import { createOrbitRing, destroySceneResources } from './solarSystemBuilder.js';
import { calculateRadFromDeg } from './solarSystemConfig.js';
import { createStarfield, handleRendererQuality } from './sceneEnhancements.js';
import { createRenderPipeline } from './renderPipeline.js';
import { getThreeDependencies } from './threeDependencies.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const EARTH_ROTATION_DEG_S = 6;
const MOON_ORBIT_DEG_S = 1.2;

/**
 * Asteroit sürüsü sahnesini kurar. create3DMissionScene ile aynı sözleşme: { destroy() } döner.
 */
export async function createAsteroidSwarmScene(container, onProgress, deps = null) {
  if (!container || typeof container !== 'object') {
    console.warn('createAsteroidSwarmScene: geçersiz container, yedek boş sahne dönüldü.');
    return { destroy() {} };
  }
  // İlk await'ten önce: kurulum sürerken gelen veri ve odak olayları kaybolmasın
  const inbox = createSceneEventInbox();

  let loadedDeps;
  try {
    loadedDeps = await getThreeDependencies(deps);
  } catch (err) {
    console.warn('createAsteroidSwarmScene: Three.js bağımlılıkları yüklenemedi:', err);
    inbox.destroyInbox();
    return { destroy() {} };
  }

  const { THREE, GLTFLoader, DRACOLoader, OrbitControls } = loadedDeps;
  const raf = deps?.requestAnimationFrame || globalThis.requestAnimationFrame;
  const caf = deps?.cancelAnimationFrame || globalThis.cancelAnimationFrame;
  const width_px = container.clientWidth || 800;
  const height_px = container.clientHeight || 600;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(45, width_px / height_px, 0.05, 2500);
  camera.position.set(...ASTEROID_CAMERA.overview_position_units);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width_px, height_px);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (typeof renderer.setPixelRatio === 'function') renderer.setPixelRatio(pixelRatio);
  if (renderer.domElement && typeof container.appendChild === 'function') {
    container.appendChild(renderer.domElement);
  }
  handleRendererQuality(THREE, renderer);
  const renderPipeline = createRenderPipeline(loadedDeps, renderer, scene, camera, width_px, height_px);

  const controls = OrbitControls ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = ASTEROID_CAMERA.overview_min_distance_units;
    controls.maxDistance = 90;
  }

  const { fillLight } = createLights(THREE, scene);
  const envTarget = createEnvironment(THREE, renderer, scene);
  scene.add(createStarfield(THREE, pixelRatio));

  const dracoLoader = DRACOLoader ? new DRACOLoader() : null;
  dracoLoader?.setDecoderPath?.(DRACO_DECODER_PATH);
  const gltfLoader = new GLTFLoader();
  if (dracoLoader) gltfLoader.setDRACOLoader?.(dracoLoader);

  let is_destroyed = false;
  let raf_id = null;
  const clusters = new Map();
  const activeAsteroidMap = new Map();
  const templates = {};
  let has_warned_no_template = false;

  // Odaklanabilir asteroitler: adı → yörüngede dönen düğüm. Kaybolmakta olanlar seçilemez
  function getFocusNodes() {
    const nodes = new Map();
    clusters.forEach((cluster, name) => {
      if (!cluster.isClusterRemoving()) nodes.set(name, cluster.focusNode);
    });
    return nodes;
  }
  const cameraController = createAsteroidCameraController(THREE, camera, controls, renderer.domElement, getFocusNodes);

  // Dünya eğik eksende döner; Ay referans halkası 1 LD mesafesini gösterir
  const earthTilt = new THREE.Group();
  earthTilt.rotation.z = calculateRadFromDeg(23.4);
  scene.add(earthTilt);
  scene.add(createEarthAtmosphere(THREE, EARTH_RADIUS_UNITS));
  const moonOrbit = new THREE.Group();
  scene.add(moonOrbit);
  scene.add(createOrbitRing(THREE, calculateMoonOrbitUnits(), 0x4a5a7a));

  // Kalıplar sahnede gizli durur: destroySceneResources onları da temizlesin diye
  const templateGroup = new THREE.Group();
  templateGroup.visible = false;
  scene.add(templateGroup);

  function handleAsteroidData(rawList, is_append = false) {
    if (is_destroyed) return;
    if (!templates.BENNU && !templates.GENERIC) {
      if (!has_warned_no_template) console.warn('NEO_SWARM: asteroit modelleri yüklenemedi, sürü çizilmiyor.');
      has_warned_no_template = true;
      return;
    }
    const incoming = getSanitizedAsteroids(rawList);
    if (!is_append) {
      activeAsteroidMap.clear();
    }
    incoming.forEach((asteroid) => activeAsteroidMap.set(asteroid.name, asteroid));
    const asteroids = Array.from(activeAsteroidMap.values()).slice(-MAX_ASTEROID_COUNT);
    const relativeSpeeds = calculateRelativeSpeeds(asteroids);
    const incomingNames = new Set();
    asteroids.forEach((asteroid, idx) => {
      incomingNames.add(asteroid.name);
      const existing = clusters.get(asteroid.name);
      if (existing) {
        existing.handleClusterData(asteroid, relativeSpeeds[idx]);
        return;
      }
      const template = (isBennuAsteroid(asteroid.name) && templates.BENNU) || templates.GENERIC || templates.BENNU;
      const cluster = createAsteroidCluster(THREE, template, asteroid, relativeSpeeds[idx]);
      scene.add(cluster.root);
      clusters.set(asteroid.name, cluster);
    });
    clusters.forEach((cluster, name) => {
      if (!incomingNames.has(name)) cluster.handleClusterRemoval();
    });
  }

  const handleResizeEvent = () => {
    if (is_destroyed) return;
    const nextW_px = container.clientWidth || 800;
    const nextH_px = container.clientHeight || 600;
    camera.aspect = nextW_px / nextH_px;
    camera.updateProjectionMatrix();
    renderer.setSize(nextW_px, nextH_px);
    renderPipeline.handleRenderResize(nextW_px, nextH_px);
  };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('resize', handleResizeEvent);
  }

  const loadPlan = [
    { key: 'EARTH', url: EARTH_MODEL_URL, radius_units: EARTH_RADIUS_UNITS },
    { key: 'MOON', url: MOON_MODEL_URL, radius_units: MOON_RADIUS_UNITS },
    { key: 'BENNU', url: ASTEROID_MODEL_URLS.BENNU, radius_units: 1 },
    { key: 'GENERIC', url: ASTEROID_MODEL_URLS.GENERIC, radius_units: 1 },
  ];
  let completed = 0;
  const loaded = await Promise.all(
    loadPlan.map(async (item) => {
      const modelRoot = await getLoadedModel(THREE, gltfLoader, item.url, item.radius_units);
      completed += 1;
      if (typeof onProgress === 'function' && !is_destroyed) {
        onProgress(Math.round((completed / loadPlan.length) * 100));
      }
      return { ...item, modelRoot };
    })
  );

  if (!is_destroyed) {
    loaded.forEach(({ key, modelRoot }) => {
      if (!modelRoot) return;
      if (key === 'EARTH') {
        earthTilt.add(modelRoot);
      } else if (key === 'MOON') {
        const moonAnchor = new THREE.Group();
        moonAnchor.position.set(calculateMoonOrbitUnits(), 0, 0);
        moonAnchor.add(modelRoot);
        moonOrbit.add(moonAnchor);
      } else {
        templateGroup.add(modelRoot);
        templates[key] = { modelRoot, geometry_radius: getGeometryRadius(modelRoot) };
      }
    });
    // Sahne hazır: bekleyen veri ve odak şimdi uygulanır, bundan sonrakiler doğrudan işlenir
    inbox.handleInboxReady(handleAsteroidData, cameraController.handleFocusTarget);
  }

  let last_time_ms = Date.now();
  function renderFrame() {
    if (is_destroyed) return;
    raf_id = raf(renderFrame);
    const now_ms = Date.now();
    const delta_s = Math.min((now_ms - last_time_ms) / 1000, 0.1);
    last_time_ms = now_ms;

    earthTilt.rotation.y += calculateRadFromDeg(EARTH_ROTATION_DEG_S * delta_s);
    moonOrbit.rotation.y += calculateRadFromDeg(MOON_ORBIT_DEG_S * delta_s);
    clusters.forEach((cluster, name) => {
      cluster.handleClusterFrame(delta_s, camera.position);
      if (cluster.isClusterGone()) {
        cluster.destroyCluster();
        clusters.delete(name);
      }
    });
    cameraController.handleCameraFrameUpdate();
    fillLight.position.copy(camera.position);
    renderPipeline.handleRenderFrame();
  }

  if (!is_destroyed && typeof raf === 'function') {
    raf_id = raf(renderFrame);
  }

  function destroy() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (raf_id !== null && typeof caf === 'function') {
      caf(raf_id);
      raf_id = null;
    }
    inbox.destroyInbox();
    if (typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('resize', handleResizeEvent);
    }
    cameraController.destroyCameraController();
    clusters.forEach((cluster) => cluster.destroyCluster());
    clusters.clear();
    activeAsteroidMap.clear();
    controls?.dispose?.();
    destroySceneResources(scene);
    envTarget?.dispose?.();
    dracoLoader?.dispose?.();
    renderPipeline.destroyRenderPipeline();
    renderer.dispose?.();
    renderer.domElement?.parentNode?.removeChild(renderer.domElement);
  }

  return { destroy };
}
