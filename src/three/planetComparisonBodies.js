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
const DISTANCE_LINE_HEX = 0x38bdf8;
const MARKER_BOB_SPEED = 2.4;
const MARKER_BOB_AMPLITUDE = 0.15;
const MARKER_MIN_SCALE = 0.001;

/**
 * İki cisim arasındaki mesafe ölçüm çizgisini ve uç kumpas işaretlerini kurar.
 */
function createDistanceLine(THREE, distanceLine) {
  if (!distanceLine || !(distanceLine.distance_km > 0)) return null;
  const { start_x_units, end_x_units, mid_x_units } = distanceLine;
  const length_units = end_x_units - start_x_units;
  if (!(length_units > 0)) return null;

  const group = new THREE.Group();
  group.name = 'COMPARISON_DISTANCE_LINE';
  group.scale.set(MARKER_MIN_SCALE, MARKER_MIN_SCALE, MARKER_MIN_SCALE);

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([start_x_units, 0, 0, end_x_units, 0, 0]), 3));
  group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: DISTANCE_LINE_HEX, transparent: true, opacity: 0.9 })));

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(length_units, 0.035, 0.035),
    new THREE.MeshBasicMaterial({ color: DISTANCE_LINE_HEX, transparent: true, opacity: 0.75 })
  );
  bar.position.set(mid_x_units, 0, 0);
  group.add(bar);

  const tickGeometry = new THREE.BoxGeometry(0.035, 0.42, 0.035);
  const endpointGeometry = new THREE.SphereGeometry(0.075, 16, 12);
  const endpointMaterial = new THREE.MeshBasicMaterial({ color: DISTANCE_LINE_HEX });
  [start_x_units, end_x_units].forEach((x_units) => {
    const tick = new THREE.Mesh(tickGeometry, endpointMaterial);
    tick.position.set(x_units, 0, 0);
    const endpoint = new THREE.Mesh(endpointGeometry, endpointMaterial);
    endpoint.position.set(x_units, 0, 0);
    group.add(tick, endpoint);
  });
  return group;
}

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
  const distanceLine = createDistanceLine(THREE, layout.distance_line);
  if (distanceLine) parentGroup.add(distanceLine);

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
    if (distanceLine) distanceLine.scale.set(scale, scale, scale);
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
