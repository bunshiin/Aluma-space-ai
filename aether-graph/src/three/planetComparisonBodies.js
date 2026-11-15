// Karşılaştırma sahnesinde iki gök cismini yan yana kurar: model yükleme, eksen eğikliği, dönüş,
// yumuşak belirme ve küçük cismin üstündeki ok işaretçisi
import { calculateRadFromDeg } from './solarSystemConfig.js';
import { destroySceneResources, handleModelNormalization } from './solarSystemBuilder.js';
import { COMPARISON_TIMING, getComparisonBodyConfig } from './planetComparisonConfig.js';
import { calculateClamp01, calculateEaseOutCubic } from './planetComparisonEasing.js';
import { getBodyGroundTexture } from './planetComparisonGround.js';

const SPIN_SPEED_DEG_S = 12;
// Dönüş hızı belirmeyle birlikte yavaşça yükselir; ani başlangıç olmaz
const SPIN_RAMP_S = 1.8;
const MARKER_COLOR_HEX = 0xfbbf24;
const MARKER_BOB_SPEED = 2.4;
const MARKER_BOB_AMPLITUDE = 0.15;
const MARKER_MIN_SCALE = 0.001;

/**
 * Küçük cismin üstünde aşağı bakan sarı ok: etrafına halka çizmek yerine "buraya bak" işareti.
 * Satürn'ün halkasıyla karışmasın diye bilerek halka değil, uçlu ok.
 */
function createSmallBodyMarker(THREE, slot) {
  const size_units = slot.marker_size_units;
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(size_units * 0.45, size_units, 24),
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR_HEX })
  );
  marker.name = 'COMPARISON_SMALL_MARKER';
  marker.rotation.x = Math.PI; // koni ucu aşağı baksın
  marker.base_y_units = slot.model_radius_units + size_units * 1.1;
  marker.position.y = marker.base_y_units;
  return marker;
}

/**
 * Tek slot için pivot zinciri kurar: slotPivot (konum, belirme ölçeği) → tiltPivot (eksen eğikliği) → spinPivot (dönüş).
 */
function createBodySlot(THREE, slot, slotName) {
  const cfg = getComparisonBodyConfig(slot.body_id);
  const slotPivot = new THREE.Group();
  slotPivot.name = `${slotName}_BODY`;
  slotPivot.position.set(slot.x_units, 0, 0);
  slotPivot.scale.set(MARKER_MIN_SCALE, MARKER_MIN_SCALE, MARKER_MIN_SCALE);

  const tiltPivot = new THREE.Group();
  tiltPivot.rotation.z = calculateRadFromDeg(cfg?.axial_tilt_deg || 0);
  const spinPivot = new THREE.Group();
  tiltPivot.add(spinPivot);
  slotPivot.add(tiltPivot);

  const marker = slot.has_marker ? createSmallBodyMarker(THREE, slot) : null;
  if (marker) slotPivot.add(marker);

  // Retrograd dönen cisimler (Venüs, Uranüs) kıyasta da ters yönde döner
  const spinSign = (cfg?.rotation_speed_deg_s ?? 1) < 0 ? -1 : 1;
  return { cfg, slotPivot, spinPivot, marker, spin_deg_s: SPIN_SPEED_DEG_S * spinSign };
}

async function handleBodyModelLoad(THREE, gltfLoader, bodySlot, slot, isStale, onLoaded) {
  const result = { mixer: null, texture: null };
  try {
    const gltf = await gltfLoader.loadAsync(bodySlot.cfg.model_url);
    const modelRoot = gltf?.scene || gltf?.scenes?.[0];
    if (!modelRoot) return result;
    if (isStale()) {
      destroySceneResources(modelRoot);
      return result;
    }
    handleModelNormalization(THREE, modelRoot, slot.model_radius_units);
    bodySlot.spinPivot.add(modelRoot);
    result.texture = getBodyGroundTexture(modelRoot);
    if (Array.isArray(gltf.animations) && gltf.animations.length > 0 && THREE.AnimationMixer) {
      result.mixer = new THREE.AnimationMixer(modelRoot);
      gltf.animations.forEach((clip) => result.mixer.clipAction(clip).play());
    }
  } catch (err) {
    console.warn(`Karşılaştırma modeli yüklenemedi (${bodySlot.cfg?.id}):`, err);
  } finally {
    onLoaded();
  }
  return result;
}

/**
 * İki cismi verilen gruba yerleştirir ve modelleri paralel yükler.
 * Dönüş: { load: Promise<{ mixers, groundTextures: Map }>, handleBodiesReveal(), handleBodiesFrame(delta_s) }
 */
export function createComparisonBodies(THREE, gltfLoader, parentGroup, layout, isStale, onLoaded) {
  const bodySlots = [
    { slot: layout.primary, ...createBodySlot(THREE, layout.primary, 'PRIMARY') },
    { slot: layout.secondary, ...createBodySlot(THREE, layout.secondary, 'SECONDARY') },
  ];
  bodySlots.forEach(({ slotPivot }) => parentGroup.add(slotPivot));

  const load = Promise.all(
    bodySlots.map((bodySlot) => {
      if (!bodySlot.cfg) {
        onLoaded();
        return { mixer: null, texture: null };
      }
      return handleBodyModelLoad(THREE, gltfLoader, bodySlot, bodySlot.slot, isStale, onLoaded);
    })
  ).then((results) => ({
    mixers: results.map((result) => result.mixer).filter(Boolean),
    groundTextures: new Map(results.map((result, index) => [bodySlots[index].slot.body_id, result.texture])),
  }));

  let reveal_s = 0;
  let is_revealing = false;
  let total_s = 0;

  // Cisimler siyah perde açılırken büyüyerek belirir; zamanlayıcı perde açılınca başlatılır
  function handleBodiesReveal() {
    is_revealing = true;
    reveal_s = 0;
  }

  function handleBodiesFrame(delta_s) {
    total_s += delta_s;
    if (is_revealing) reveal_s += delta_s;
    const reveal = is_revealing ? calculateEaseOutCubic(reveal_s / COMPARISON_TIMING.reveal_s) : 0;
    const scale = Math.max(MARKER_MIN_SCALE, reveal);
    const spinRamp = calculateClamp01(reveal_s / SPIN_RAMP_S);
    bodySlots.forEach((bodySlot) => {
      bodySlot.slotPivot.scale.set(scale, scale, scale);
      bodySlot.spinPivot.rotation.y += calculateRadFromDeg(bodySlot.spin_deg_s * delta_s * spinRamp);
      if (bodySlot.marker) {
        const bob = Math.sin(total_s * MARKER_BOB_SPEED) * bodySlot.slot.marker_size_units * MARKER_BOB_AMPLITUDE;
        bodySlot.marker.position.y = bodySlot.marker.base_y_units + bob;
      }
    });
  }

  return { load, handleBodiesReveal, handleBodiesFrame };
}
