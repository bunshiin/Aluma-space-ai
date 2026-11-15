// Ay yüzey sahnesi: Mare Tranquillitatis (Sükûnet Üssü) ovasında gerçek boyutlu Apollo 11 Ay Modülü (Eagle).
// Güneş Sistemi ile aynı renderer'ı kullanır ama kendi sahnesi/kamerası vardır (1 birim = 1 metre).
import { destroySceneResources } from './solarSystemBuilder.js';
import { ASTRONAUT_HEIGHT_M, createLunarAstronauts } from './lunarAstronauts.js';
import { createLunarSurfaceEnvironment } from './lunarSurfaceEnvironment.js';

export const LUNAR_MODULE_MODEL_URL = '/public/models/apollo_lunar_module.glb';
// Gerçek Apollo LM: iniş + yükseliş kademesi ~7.0 m yükseklik, açık ayaklarla ~9.4 m genişlik
export const LUNAR_MODULE_HEIGHT_M = 7.0;
// Kameranın modül etrafındaki varsayılan yeri (metre); modülün tamamı ve çevresindeki düz ova kadraja girer
export const LUNAR_SURFACE_VIEW_OFFSET_M = { x: 15, y: 5.5, z: 17 };
export const LUNAR_MODULE_LOOK_HEIGHT_M = 3.2;
// Uzaklaşınca modülün ovaya göre küçüklüğü okunur; tamamen dışarı çekilince yörüngeye dönülür
const SURFACE_LIMITS = { minDistance: 6, maxDistance: 320, minPolarAngle: 0.02, maxPolarAngle: Math.PI * 0.485 };

function createSurfaceControls(OrbitControls, camera, domElement) {
  if (!OrbitControls || !domElement) return null;
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  Object.assign(controls, SURFACE_LIMITS);
  controls.enabled = false;
  return controls;
}

async function loadModuleModel(gltfLoader, modelUrl, onProgress) {
  const handleXhr = (xhr) => {
    if (typeof onProgress === 'function' && xhr?.total) onProgress(Math.round((xhr.loaded / xhr.total) * 100));
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const gltf = await gltfLoader.loadAsync(modelUrl, handleXhr);
      const root = gltf?.scene || gltf?.scenes?.[0] || null;
      if (root) return root;
    } catch (err) {
      if (attempt === 1) console.warn(`Ay yüzeyi: modül modeli yüklenemedi (${modelUrl}):`, err);
    }
  }
  return null;
}

/**
 * Modeli gerçek yüksekliğine (metre) ölçekler, ayaklarını y = 0 zeminine oturtur ve x/z'de ortalar.
 * Gömülü ışıklar kapatılır, mesh'ler gölge atar/alır.
 */
export function handleLunarModuleScale(THREE, modelRoot, height_m = LUNAR_MODULE_HEIGHT_M) {
  modelRoot.traverse?.((node) => {
    if (node.isLight) {
      node.visible = false;
      if (typeof node.intensity === 'number') node.intensity = 0;
    }
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  modelRoot.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!(size.y > 0)) return { scale: 1, size_m: size };
  const scale = height_m / size.y;
  modelRoot.scale.multiplyScalar(scale);
  modelRoot.updateMatrixWorld?.(true);
  box.setFromObject(modelRoot);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const minY = Number.isFinite(box.min?.y) ? box.min.y : center.y - height_m / 2;
  modelRoot.position.set(modelRoot.position.x - center.x, modelRoot.position.y - minY, modelRoot.position.z - center.z);
  return { scale, size_m: { x: size.x * scale, y: size.y * scale, z: size.z * scale } };
}

/**
 * Ay yüzey sahnesini kurar. Modül yüklenemese de zeminli sahne döner (akış kilitlenmez).
 */
export async function createLunarSurfaceScene(deps, renderer, domElement, aspect, gltfLoader, options = {}) {
  const { THREE, OrbitControls } = deps;
  const scene = new THREE.Scene();
  scene.name = 'LUNAR_SURFACE_SCENE';
  const camera = new THREE.PerspectiveCamera(42, aspect || 1, 0.1, 30000);
  const controls = createSurfaceControls(OrbitControls, camera, domElement);
  const wasShadowEnabled = Boolean(renderer?.shadowMap?.enabled);
  if (renderer?.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const environment = createLunarSurfaceEnvironment(THREE, scene, renderer);
  const moduleRoot = new THREE.Group();
  moduleRoot.name = 'LUNAR_MODULE_ROOT';
  scene.add(moduleRoot);

  const model = await loadModuleModel(gltfLoader, options.modelUrl || LUNAR_MODULE_MODEL_URL, options.onProgress);
  let module_size_m = null;
  if (model) {
    module_size_m = handleLunarModuleScale(THREE, model).size_m;
    moduleRoot.add(model);
  }
  const anchor = new THREE.Vector3();
  let is_destroyed = false;
  // Armstrong ve Aldrin modülün yanında; büyük model sahneyi bekletmeden arkadan yüklenir
  const astronauts = createLunarAstronauts(THREE, scene, gltfLoader, {
    modelUrl: options.astronautModelUrl,
    lookAt_m: LUNAR_SURFACE_VIEW_OFFSET_M,
    scaleModel: (root) => handleLunarModuleScale(THREE, root, ASTRONAUT_HEIGHT_M),
    disposeModel: (root) => destroySceneResources(root),
    isCancelled: () => is_destroyed,
  });

  function getModuleAnchor() {
    return anchor.set(moduleRoot.position.x, LUNAR_MODULE_LOOK_HEIGHT_M, moduleRoot.position.z);
  }

  function handleSurfaceFrame() {
    if (is_destroyed) return;
    environment.handleEnvironmentFrame(moduleRoot.position);
    if (controls && controls.enabled) controls.update();
  }

  function handleSurfaceResize(nextAspect) {
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  }

  function destroyLunarSurfaceScene() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (controls && typeof controls.dispose === 'function') controls.dispose();
    environment.destroyLunarSurfaceEnvironment();
    scene.traverse((obj) => {
      if (obj.isInstancedMesh && typeof obj.dispose === 'function') obj.dispose();
    });
    destroySceneResources(scene);
    scene.clear?.();
    if (renderer?.shadowMap) renderer.shadowMap.enabled = wasShadowEnabled;
  }

  if (typeof options.isCancelled === 'function' && options.isCancelled()) destroyLunarSurfaceScene();

  return {
    scene,
    camera,
    controls,
    is_module_ready: Boolean(model),
    module_size_m,
    astronauts_ready: astronauts.ready,
    getModuleAnchor,
    handleSurfaceFrame,
    handleSurfaceResize,
    destroyLunarSurfaceScene,
  };
}
