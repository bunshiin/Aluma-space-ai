// NEO_SWARM sahnesinin kurulum yardımcıları: ışık, ortam ışığı ve model yükleme.
// Sahne dosyası 300 satırı aşmasın diye ayrıldı.
import { destroySceneResources, handleModelNormalization } from './solarSystemBuilder.js';
import { getAsteroidListFromPayload, isAsteroidAppendPayload } from './asteroidSwarmConfig.js';
import { ATMOSPHERE_FRAGMENT_SHADER, ATMOSPHERE_VERTEX_SHADER } from './asteroidGlowShaders.js';

export const NEO_DATA_EVENT = 'ag:neo-data';
export const FOCUS_TARGET_EVENT = 'ag:focus-target';

/**
 * Sahnenin dinlediği olayları kurulumun en başında yakalar. Router create3DMissionScene'i beklemeden
 * veri ya da odak gönderebilir; modeller yüklenene kadar gelen güncellemeler saklanır,
 * sahne hazır olunca sırayla uygulanır. Hiçbir olay kaybolmaz.
 */
export function createSceneEventInbox() {
  const state = { pendingUpdates: [], focus_target: null, handleData: null, handleFocus: null };
  const handleDataEvent = (event) => {
    const list = getAsteroidListFromPayload(event?.detail);
    const is_append = isAsteroidAppendPayload(event?.detail);
    if (state.handleData) {
      state.handleData(list, is_append);
    } else if (is_append) {
      state.pendingUpdates.push({ list, is_append: true });
    } else {
      state.pendingUpdates = [{ list, is_append: false }];
    }
  };
  const handleFocusEvent = (event) => {
    const target = event?.detail?.target;
    if (state.handleFocus) state.handleFocus(target);
    else state.focus_target = target;
  };
  const canListen = typeof globalThis.addEventListener === 'function';
  if (canListen) {
    globalThis.addEventListener(NEO_DATA_EVENT, handleDataEvent);
    globalThis.addEventListener(FOCUS_TARGET_EVENT, handleFocusEvent);
  }
  return {
    handleInboxReady(handleData, handleFocus) {
      state.handleData = handleData;
      state.handleFocus = handleFocus;
      state.pendingUpdates.forEach(({ list, is_append }) => handleData(list, is_append));
      if (state.focus_target !== null) handleFocus(state.focus_target);
      state.pendingUpdates = [];
      state.focus_target = null;
    },
    destroyInbox() {
      state.handleData = null;
      state.handleFocus = null;
      state.pendingUpdates = [];
      if (canListen && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener(NEO_DATA_EVENT, handleDataEvent);
        globalThis.removeEventListener(FOCUS_TARGET_EVENT, handleFocusEvent);
      }
    },
  };
}

const SUN_DIRECTION = [-0.82, 0.29, 0.49];
const ATMOSPHERE_SCALE = 1.1;

/**
 * Dünya'nın atmosfer halesi. Modelin kendisine dokunmaz, ayrı bir küre olarak sahneye eklenir.
 */
export function createEarthAtmosphere(THREE, earth_radius_units) {
  const radius_units = earth_radius_units * ATMOSPHERE_SCALE;
  // Arka yüzde Dünya kenarına denk gelen bakış açısı: halenin en parlak olduğu yer
  const limbDot = Math.sqrt(1 - 1 / (ATMOSPHERE_SCALE * ATMOSPHERE_SCALE));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0.32, 0.6, 1.0) },
      uSunDirection: { value: new THREE.Vector3(...SUN_DIRECTION).normalize() },
      uLimbDot: { value: limbDot },
      uIntensity: { value: 0.85 },
    },
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius_units, 64, 32), material);
  mesh.name = 'EARTH_ATMOSPHERE';
  return mesh;
}

export function createLights(THREE, scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  // Güneş ışığı tek yönden: asteroitlerin pürüzlü yüzeyi gölgeyle okunsun
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(...SUN_DIRECTION.map((v) => v * 50));
  scene.add(sun);
  // Kamerayla gezen zayıf dolgu ışığı: Güneş asteroidin arkasında kalınca yakın planda gövde
  // kapkara olmasın. Sönümsüz (decay 0), Güneş'in yanında belirleyici olmayacak kadar zayıf
  const fill = new THREE.PointLight(0xcfd8ff, 0.9, 0, 0);
  scene.add(fill);
  return { fillLight: fill };
}

/**
 * Asteroit materyalleri yarı metalik (metallic 0.5); ortam haritası olmadan metal kısım siyah görünür.
 * Materyale dokunmak yerine sahneye Güneş yönünde parlak lekesi olan basit bir ortam ışığı verilir.
 */
export function createEnvironment(THREE, renderer, scene) {
  if (!THREE.PMREMGenerator) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x1c2436, side: THREE.BackSide })
  );
  const sunPatch = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
  sunPatch.position.set(...SUN_DIRECTION.map((v) => v * 8));
  envScene.add(sky, sunPatch);
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.9;
  destroySceneResources(envScene);
  pmrem.dispose();
  return envTarget;
}

export async function getLoadedModel(THREE, loader, url, radius_units) {
  try {
    const gltf = await loader.loadAsync(url);
    const modelRoot = gltf?.scene || gltf?.scenes?.[0];
    if (!modelRoot) return null;
    handleModelNormalization(THREE, modelRoot, radius_units);
    return modelRoot;
  } catch (err) {
    console.warn(`NEO_SWARM: model yüklenemedi (${url}):`, err);
    return null;
  }
}

export function getGeometryRadius(modelRoot) {
  let radius = 1;
  modelRoot.traverse((node) => {
    if (node.isMesh && node.geometry) {
      if (!node.geometry.boundingSphere && typeof node.geometry.computeBoundingSphere === 'function') {
        node.geometry.computeBoundingSphere();
      }
      radius = node.geometry.boundingSphere?.radius || radius;
    }
  });
  return radius;
}
