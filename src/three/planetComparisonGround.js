// Yüzey sahnesinin zemini: gezegenin kendi .glb dosyasındaki yüzey texture'ından kesilen bir parça kullanılır.
// Ayrı texture indirmek yerine yüklenmiş modelin materyalinden okunur; düz renk yalnızca model yüklenemezse yedektir.
import { getSurfacePalette } from './planetComparisonConfig.js';

export const PLATFORM_RADIUS_UNITS = 4.4;
export const PLATFORM_THICKNESS_UNITS = 1.2;

// Küre texture'ı 2:1 (boylam:enlem) olduğu için kesit de 2:1 alınır; yüzeyde kare görünür (~43° x 43°)
const TOP_CROP = { repeat_x: 0.12, repeat_y: 0.24 };
// Kenar şeridi: ekvator çizgisi civarından ince bir bant, katman gibi görünür
const SIDE_CROP = { repeat_x: 0.12, repeat_y: 0.03 };
const SIDE_TINT_HEX = 0x9a9a9a;

/**
 * Modelin ilk yüzey texture'ını verir (Güneş gibi emissive olanlarda emissiveMap). Yoksa null.
 */
export function getBodyGroundTexture(modelRoot) {
  let found = null;
  modelRoot?.traverse?.((node) => {
    if (found || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      if (!found && mat) found = mat.map || mat.emissiveMap || null;
    });
  });
  return found;
}

function createCroppedTexture(texture, crop) {
  const cropped = texture.clone();
  cropped.repeat.set(crop.repeat_x, crop.repeat_y);
  cropped.offset.set(0.5 - crop.repeat_x / 2, 0.5 - crop.repeat_y / 2);
  cropped.needsUpdate = true;
  return cropped;
}

/**
 * Silindir platform kurar. Texture gelince handleGroundTexture ile üst yüze ve kenara uygulanır.
 */
export function createGroundPlatform(THREE, bodyId, x_units) {
  const palette = getSurfacePalette(bodyId);
  const topMaterial = new THREE.MeshStandardMaterial({ color: palette.ground_hex, roughness: 0.95, metalness: 0.02 });
  const sideMaterial = new THREE.MeshStandardMaterial({ color: palette.ground_hex, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_RADIUS_UNITS, PLATFORM_RADIUS_UNITS * 1.06, PLATFORM_THICKNESS_UNITS, 64),
    [sideMaterial, topMaterial, sideMaterial]
  );
  mesh.name = `${bodyId}_GROUND`;
  mesh.position.set(x_units, -PLATFORM_THICKNESS_UNITS / 2, 0);

  function handleGroundTexture(texture) {
    if (!texture || typeof texture.clone !== 'function') return;
    topMaterial.map = createCroppedTexture(texture, TOP_CROP);
    sideMaterial.map = createCroppedTexture(texture, SIDE_CROP);
    // Çarpan renk beyaz olmalı ki texture kendi rengiyle görünsün
    topMaterial.color?.setHex?.(0xffffff);
    sideMaterial.color?.setHex?.(SIDE_TINT_HEX);
    topMaterial.needsUpdate = true;
    sideMaterial.needsUpdate = true;
  }

  return { mesh, handleGroundTexture };
}
