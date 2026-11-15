import { calculateRadFromDeg, SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';

// Uzay araçlarının konum işareti ve yörüngesi gezegenlerden ayrışsın diye tek renk
const SPACECRAFT_COLOR_HEX = 0x38bdf8;
const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'alphaMap'];

/**
 * Sahnedeki tüm geometry, material ve texture kaynaklarını temizler.
 */
export function destroySceneResources(scene) {
  if (!scene || typeof scene.traverse !== 'function') {
    return;
  }
  const disposeMaterial = (mat) => {
    if (!mat) {
      return;
    }
    TEXTURE_KEYS.forEach((key) => {
      if (mat[key] && typeof mat[key].dispose === 'function') {
        mat[key].dispose();
      }
    });
    // Rover gibi PBR modellerde listede olmayan haritalar da olur (clearcoat, sheen, specular...)
    Object.keys(mat).forEach((key) => {
      if (!TEXTURE_KEYS.includes(key) && mat[key]?.isTexture && typeof mat[key].dispose === 'function') {
        mat[key].dispose();
      }
    });
    if (typeof mat.dispose === 'function') {
      mat.dispose();
    }
  };
  scene.traverse((obj) => {
    if (typeof obj.userData?.destroyCraterBeaconsListener === 'function') {
      obj.userData.destroyCraterBeaconsListener();
    }
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      obj.geometry.dispose();
    }
    if (Array.isArray(obj.material)) {
      obj.material.forEach(disposeMaterial);
    } else if (obj.material) {
      disposeMaterial(obj.material);
    }
  });
}

/**
 * GLTFLoader node isimlerindeki noktaları sildiği için aramayı sanitizeNodeName ile yapar.
 */
export function getSanitizedNode(threeLib, rootObject, rawNodeName) {
  if (!rootObject || typeof rawNodeName !== 'string' || !rawNodeName) {
    return null;
  }
  const safeName = threeLib.PropertyBinding.sanitizeNodeName(rawNodeName);
  return rootObject.getObjectByName(safeName) || null;
}

/**
 * Modelin mesh, geometry ve materyaline dokunmadan gömülü ışıkları kapatır,
 * Box3 ile ölçekler ve merkez ofsetini (ör. mars.glb) sıfırlar.
 */
export function handleModelNormalization(threeLib, modelRoot, target_radius_units) {
  if (typeof modelRoot.traverse === 'function') {
    modelRoot.traverse((node) => {
      if (node.isLight || node.name === 'Light') {
        node.visible = false;
        if (typeof node.intensity === 'number') {
          node.intensity = 0;
        }
      }
    });
  }

  if (typeof modelRoot.updateMatrixWorld === 'function') {
    modelRoot.updateMatrixWorld(true);
  }

  const box = new threeLib.Box3().setFromObject(modelRoot);
  const size = new threeLib.Vector3();
  const center = new threeLib.Vector3();
  box.getSize(size);

  const maxExtent = Math.max(size.x, size.y, size.z);
  if (maxExtent > 0 && target_radius_units > 0) {
    const scaleFactor = (target_radius_units * 2) / maxExtent;
    modelRoot.scale.multiplyScalar(scaleFactor);

    if (typeof modelRoot.updateMatrixWorld === 'function') {
      modelRoot.updateMatrixWorld(true);
    }
    box.setFromObject(modelRoot);
    box.getCenter(center);

    modelRoot.position.set(
      modelRoot.position.x - center.x,
      modelRoot.position.y - center.y,
      modelRoot.position.z - center.z
    );
  }
  return modelRoot;
}

/**
 * Görsel yörünge çizgisi oluşturur.
 */
export function createOrbitRing(threeLib, orbit_radius_units, colorHex = 0x3a4a6b) {
  const segments = 96;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta_rad = (i / segments) * Math.PI * 2;
    points.push(
      new threeLib.Vector3(
        Math.cos(theta_rad) * orbit_radius_units,
        0,
        Math.sin(theta_rad) * orbit_radius_units
      )
    );
  }
  const geometry = new threeLib.BufferGeometry().setFromPoints(points);
  const material = new threeLib.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.35,
  });
  return new threeLib.LineLoop(geometry, material);
}

/**
 * Uzay aracı için sabit piksel boyutlu konum işareti kurar.
 * Araç sahne ölçeğinde nokta kadar kaldığından işaret uzaktan da görünür ve tıklanabilir kalır.
 */
export function createSpacecraftBeacon(threeLib) {
  const beacon = new threeLib.Group();
  beacon.name = 'SPACECRAFT_BEACON';
  const marker = new threeLib.Points(
    new threeLib.BufferGeometry().setFromPoints([new threeLib.Vector3(0, 0, 0)]),
    new threeLib.PointsMaterial({ color: SPACECRAFT_COLOR_HEX, size: 4, sizeAttenuation: false, depthWrite: false })
  );
  beacon.add(marker);
  return beacon;
}

/**
 * Merkez Güneş ışığını kurar.
 */
export function createSunLight(threeLib) {
  return new threeLib.PointLight(0xfff4d6, 3.0, 0, 0);
}

/**
 * Tek bir gövde için yörünge pivotu (orbitPivot) ve gövde pivotu (bodyPivot) kurar.
 */
export function createOrbitRig(threeLib, bodyConfig, index) {
  const orbitPivot = new threeLib.Group();
  orbitPivot.name = `${bodyConfig.id}_ORBIT_PIVOT`;
  if (bodyConfig.orbit_radius_units > 0) {
    const phase_deg = Number.isFinite(bodyConfig.orbit_phase_deg) ? bodyConfig.orbit_phase_deg : (index * 47) % 360;
    orbitPivot.rotation.y = calculateRadFromDeg(phase_deg);
    // ZYX sırası: önce düzlemde dön (y), sonra düzlemi eğ (z); böylece rotation.y yörünge açısı olarak kalır
    orbitPivot.rotation.order = 'ZYX';
    orbitPivot.rotation.z = calculateRadFromDeg(bodyConfig.orbit_inclination_deg || 0);
  }

  // Kaçış yörüngesindeki araçlar ekliptiğin üstünde/altında sabit enlemde durur
  const latitude_rad = calculateRadFromDeg(bodyConfig.ecliptic_latitude_deg || 0);
  const bodyPivot = new threeLib.Group();
  bodyPivot.name = bodyConfig.id;
  bodyPivot.position.set(
    bodyConfig.orbit_radius_units * Math.cos(latitude_rad),
    bodyConfig.orbit_radius_units * Math.sin(latitude_rad),
    0
  );

  const tiltPivot = new threeLib.Group();
  tiltPivot.name = `${bodyConfig.id}_TILT`;
  tiltPivot.rotation.z = calculateRadFromDeg(bodyConfig.axial_tilt_deg || 0);

  bodyPivot.add(tiltPivot);
  orbitPivot.add(bodyPivot);

  return { orbitPivot, bodyPivot, tiltPivot };
}

/**
 * Tekil görev modelini yükler, normalize eder ve varsa gömülü animasyonlarını oynatır.
 * Animasyon karıştırıcılarını döner; yükleme hatasında boş dizi (sahne yine açılır).
 */
export async function createMissionModel(threeLib, gltfLoader, scene, modelUrl, onProgress, isDestroyed) {
  const mixers = [];
  try {
    const gltf = await gltfLoader.loadAsync(modelUrl);
    if (!isDestroyed() && gltf?.scene) {
      handleModelNormalization(threeLib, gltf.scene, 3.0);
      scene.add(gltf.scene);
      if (Array.isArray(gltf.animations) && gltf.animations.length > 0 && threeLib.AnimationMixer) {
        const mixer = new threeLib.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        mixers.push(mixer);
      }
      if (typeof onProgress === 'function') {
        onProgress(100);
      }
    }
  } catch (err) {
    console.warn(`create3DMissionScene: görev modeli yüklenemedi (${modelUrl}):`, err);
  }
  return mixers;
}

/**
 * Tüm Güneş Sistemi modellerini (sun.glb dahil) yükler, ebeveyn-çocuk yörüngelerine bağlar ve ilerlemeyi bildirir.
 */
export async function createSolarSystem(threeLib, gltfLoader, scene, onProgress, isDestroyed) {
  const bodyMap = new Map();
  const orbitRigs = [];
  const mixers = [];

  const pendingRigs = new Map();
  SOLAR_SYSTEM_BODIES.forEach((cfg, idx) => {
    const rig = createOrbitRig(threeLib, cfg, idx);
    if (cfg.id === 'SUN') {
      rig.bodyPivot.add(createSunLight(threeLib));
    }
    if (cfg.is_spacecraft) {
      rig.bodyPivot.add(createSpacecraftBeacon(threeLib));
    }
    pendingRigs.set(cfg.id, { cfg, ...rig });
    bodyMap.set(cfg.id, rig.bodyPivot);
    orbitRigs.push({ cfg, ...rig });
  });

  pendingRigs.forEach(({ cfg, orbitPivot }) => {
    const parentNode = (cfg.parent_id && bodyMap.get(cfg.parent_id)) || scene;
    parentNode.add(orbitPivot);
    // Dönmeyen araçlar (L2, kaçış yörüngesi) bir çember üzerinde gitmez, yanıltıcı halka çizilmez
    if (cfg.orbit_radius_units > 0 && cfg.orbit_speed_deg_s !== 0) {
      let ringColor = cfg.parent_id === 'SUN' ? 0x3a4a6b : 0x556688;
      if (cfg.is_spacecraft) ringColor = SPACECRAFT_COLOR_HEX;
      const ring = createOrbitRing(threeLib, cfg.orbit_radius_units, ringColor);
      ring.rotation.z = calculateRadFromDeg(cfg.orbit_inclination_deg || 0);
      parentNode.add(ring);
    }
  });

  const total = SOLAR_SYSTEM_BODIES.length;
  let completed = 0;

  const loadTasks = SOLAR_SYSTEM_BODIES.map(async (cfg) => {
    if (isDestroyed()) {
      return;
    }
    try {
      const gltf = await gltfLoader.loadAsync(cfg.model_url);
      if (isDestroyed()) {
        return;
      }
      const modelRoot = gltf.scene || gltf.scenes?.[0];
      if (modelRoot) {
        handleModelNormalization(threeLib, modelRoot, cfg.target_radius_units);
        const rig = pendingRigs.get(cfg.id);
        rig.tiltPivot.add(modelRoot);
        if (Array.isArray(gltf.animations) && gltf.animations.length > 0 && threeLib.AnimationMixer) {
          const mixer = new threeLib.AnimationMixer(modelRoot);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
          mixers.push(mixer);
        }
      }
    } catch (err) {
      console.warn(`Model yüklenemedi (${cfg.id}):`, err);
    } finally {
      completed += 1;
      if (typeof onProgress === 'function' && !isDestroyed()) {
        onProgress(Math.round((completed / total) * 100));
      }
    }
  });

  await Promise.all(loadTasks);
  return { bodyMap, orbitRigs, mixers };
}
