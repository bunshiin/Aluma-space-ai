// Ay yüzeyinde Apollo 11 Ay Modülü'nün yanında duran iki astronot: Neil Armstrong ve Buzz Aldrin.
// Tek model (moonAstrounot.glb) bir kez yüklenir, iki kopya yerleştirilir. Model büyük (≈17 MB) olduğu için
// sahne hazır olmasını beklemez; yüklenince eklenir. 1 birim = 1 metre.

export const ASTRONAUT_MODEL_URL = '/public/models/moonAstrounot.glb';
// A7L uzay kıyafeti ve sırt çantasıyla astronot boyu ≈ 1.9 m (ham model 1.93 m, oran korunur)
export const ASTRONAUT_HEIGHT_M = 1.9;

// Ay Modülü merkezi (0, 0, 0). Ayaklarıyla ≈ 9 m genişlikte; astronotlar ayakların dışında, kameranın gördüğü yanda.
// yaw_offset_deg: kameraya bakış yönünden sapma; ikisi birbirine hafif dönük durur (fotoğraf pozu gibi)
export const LUNAR_ASTRONAUTS = Object.freeze([
  Object.freeze({ id: 'NEIL_ARMSTRONG', position_m: Object.freeze({ x: 6.2, z: 2.6 }), yaw_offset_deg: 18 }),
  Object.freeze({ id: 'BUZZ_ALDRIN', position_m: Object.freeze({ x: 3.0, z: 6.4 }), yaw_offset_deg: -18 }),
]);

const DEG_TO_RAD = Math.PI / 180;

/**
 * Model yüzü −Z yönüne bakar (sırt çantası +Z'de; ham model ölçümü, docs/models.md). Astronotun bakış hedefine
 * dönmesi için gereken Y açısını (radyan) hesaplar. Saf hesaptır.
 */
export function calculateAstronautYaw_rad(position_m, lookAt_m, yaw_offset_deg = 0) {
  const dx = (lookAt_m?.x ?? 0) - (position_m?.x ?? 0);
  const dz = (lookAt_m?.z ?? 0) - (position_m?.z ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) return 0;
  const offset_deg = Number.isFinite(yaw_offset_deg) ? yaw_offset_deg : 0;
  return Math.atan2(-dx, -dz) + offset_deg * DEG_TO_RAD;
}

async function loadAstronautModel(gltfLoader, modelUrl) {
  try {
    const gltf = await gltfLoader.loadAsync(modelUrl);
    return gltf?.scene || gltf?.scenes?.[0] || null;
  } catch (err) {
    console.warn(`Ay yüzeyi: astronot modeli yüklenemedi (${modelUrl}):`, err);
    return null;
  }
}

/**
 * Astronotları yükleyip parent'a ekler. scaleModel(root) modeli boyuna ölçekleyip zemine oturtur.
 * lookAt_m: astronotların döneceği nokta (varsayılan kamera konumu). isCancelled true dönerse yüklenen model eklenmez.
 * Dönen ready Promise'i eklenen astronot sayısını verir; hata fırlatmaz.
 */
export function createLunarAstronauts(THREE, parent, gltfLoader, options = {}) {
  const group = new THREE.Group();
  group.name = 'LUNAR_ASTRONAUTS';
  const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;

  const ready = (async () => {
    if (!gltfLoader || typeof gltfLoader.loadAsync !== 'function') return 0;
    const model = await loadAstronautModel(gltfLoader, options.modelUrl || ASTRONAUT_MODEL_URL);
    if (!model) return 0;
    if (isCancelled()) {
      // Sahne yükleme bitmeden kapandıysa model GPU'ya hiç verilmeden bırakılır
      options.disposeModel?.(model);
      return 0;
    }
    if (typeof options.scaleModel === 'function') options.scaleModel(model);
    LUNAR_ASTRONAUTS.forEach((astronaut, index) => {
      // İlk astronot yüklenen modeli kullanır, ikincisi kopyasını (geometri ve materyal paylaşılır)
      const figure = index === 0 ? model : model.clone(true);
      const holder = new THREE.Group();
      holder.name = astronaut.id;
      holder.position.set(astronaut.position_m.x, 0, astronaut.position_m.z);
      holder.rotation.y = calculateAstronautYaw_rad(astronaut.position_m, options.lookAt_m, astronaut.yaw_offset_deg);
      holder.add(figure);
      group.add(holder);
    });
    parent.add(group);
    return LUNAR_ASTRONAUTS.length;
  })();

  return { group, ready };
}
