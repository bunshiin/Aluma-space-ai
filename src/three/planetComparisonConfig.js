// Gezegen karşılaştırma sahnesinin istek doğrulaması, yerleşim hesabı ve görsel sabitleri (saf, Three.js'siz)
import { SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';

export const COMPARISON_DEFAULT_PRIMARY = 'EARTH';
export const COMPARISON_DEFAULT_SECONDARY = 'MARS';
export const DEFAULT_FALL_HEIGHT_M = 10;
export const ASTRONAUT_MODEL_URL = '/public/models/advanced_crew_escape_suit.glb';
export const ASTRONAUT_HEIGHT_UNITS = 2.8;

// Tüm sahne geçişlerinin süreleri (sn) tek yerde; hareketlerin birbirine bağlanması için
export const COMPARISON_TIMING = {
  leave_s: 0.35,
  fade_in_s: 0.9,
  reveal_s: 1.0,
  zoom_s: 4.8,
  zoom_fade_start_progress: 0.78,
  zoom_fade_out_s: 1.0,
  labels_hide_progress: 0.35,
  settle_s: 2.0,
  surface_fade_in_s: 1.0,
  surface_start_delay_s: 0.9,
};

// Yan yana görünümde büyük cismin yarıçapı; küçüğü radius_ratio ile bundan türetilir
const LARGEST_RADIUS_UNITS = 3.2;
// Bu orandan büyük farkta küçük cisim kaybolmasın diye üstüne ok işaretçisi konur
const MARKER_RATIO_THRESHOLD = 6;
// Ok boyu kamera mesafesine oranlanır; yakın ya da uzak kadrajda aynı görünür büyüklükte kalır
const MARKER_SIZE_PER_CAMERA_DISTANCE = 0.04;
const FRAME_MARGIN = 1.5;
// Yaklaşmada kamera cismin yarıçapının en az bu katı kadar uzakta kalır (içine girmez)
const ZOOM_CLEARANCE_RATIO = 1.3;
const ZOOM_DISTANCE_RATIO = 0.22;
const ZOOM_END_HEIGHT_RATIO = 0.03;
// Bakış noktası büyük cismin yarıçapının bu kadarı aşağı çekilir (etiket payı)
const LABEL_ROOM_LOOK_OFFSET = 0.3;
// Yüzey sahnesinde düşme yüksekliği bu kadar birimi geçmesin; uzun düşüşler kadraja sığsın
const MAX_STAGE_DROP_UNITS = 11;

// Model sınır kutusu cismin gövdesinden büyükse (Satürn halkası) çap / kutu oranı: docs/models.md
// saturn.glb: gövde 1.98, halka dahil kutu 5.40
const MODEL_EXTENT_PER_BODY_DIAMETER = { SATURN: 5.4 / 1.98 };

// Yüzey platformu (zemin) ve arkasındaki gökyüzü paneli renkleri
const SURFACE_PALETTE = {
  SUN: { ground_hex: 0xff8a1f, sky_hex: 0xffc266 },
  MERCURY: { ground_hex: 0x8c8580, sky_hex: 0x1a1a22 },
  VENUS: { ground_hex: 0xb5793a, sky_hex: 0xe8b35c },
  EARTH: { ground_hex: 0x4f7a3a, sky_hex: 0x5a9be0 },
  MOON: { ground_hex: 0x9a9a9a, sky_hex: 0x101018 },
  MARS: { ground_hex: 0xa5502a, sky_hex: 0xd99a6c },
  CERES: { ground_hex: 0x6f6a64, sky_hex: 0x101018 },
  JUPITER: { ground_hex: 0xc49a6c, sky_hex: 0xe0c49a },
  IO: { ground_hex: 0xd9c24a, sky_hex: 0x15140f },
  EUROPA: { ground_hex: 0xcfc2a8, sky_hex: 0x10131a },
  GANYMEDE: { ground_hex: 0x857a6c, sky_hex: 0x101018 },
  CALLISTO: { ground_hex: 0x5f574d, sky_hex: 0x101018 },
  SATURN: { ground_hex: 0xd2b47c, sky_hex: 0xeadbb0 },
  TITAN: { ground_hex: 0x9a6a2e, sky_hex: 0xd99a3c },
  URANUS: { ground_hex: 0x7fc6cc, sky_hex: 0xb4e6ea },
  NEPTUNE: { ground_hex: 0x3c5fc4, sky_hex: 0x6f8fe6 },
  TRITON: { ground_hex: 0xc9b6ad, sky_hex: 0x10121a },
  PLUTO: { ground_hex: 0xc9a98a, sky_hex: 0x0e0e16 },
  HAUMEA: { ground_hex: 0xd8d8d8, sky_hex: 0x0e0e16 },
  MAKEMAKE: { ground_hex: 0xb07a5a, sky_hex: 0x0e0e16 },
  ERIS: { ground_hex: 0xe6e6e6, sky_hex: 0x0e0e16 },
};

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getComparisonBodyConfig(bodyId) {
  return SOLAR_SYSTEM_BODIES.find((cfg) => cfg.id === bodyId) || null;
}

export function getSurfacePalette(bodyId) {
  return SURFACE_PALETTE[bodyId] || SURFACE_PALETTE.EARTH;
}

function resolveBodyId(rawId, fallbackId) {
  return typeof rawId === 'string' && getComparisonBodyConfig(rawId) ? rawId : fallbackId;
}

/**
 * Gemini/UI'dan gelen ham isteği doğrular. Bilinmeyen alan yok sayılır, bilinmeyen cisim
 * EARTH / MARS varsayılanına düşer. Hiçbir durumda hata fırlatmaz.
 */
export function resolveComparisonRequest(rawRequest) {
  const raw = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
  const has_mass = isPositiveNumber(raw.mass_kg);
  const has_height = isPositiveNumber(raw.height_m);
  const is_gravity_test = raw.is_gravity_test === true || has_mass || has_height;
  const request = {
    primary_object: resolveBodyId(raw.primary_object, COMPARISON_DEFAULT_PRIMARY),
    secondary_object: resolveBodyId(raw.secondary_object, COMPARISON_DEFAULT_SECONDARY),
    is_gravity_test,
  };
  if (has_mass) request.mass_kg = raw.mass_kg;
  // Düşme testi yüksekliksiz gelirse animasyon için varsayılan yükseklik kullanılır
  if (is_gravity_test) request.height_m = has_height ? raw.height_m : DEFAULT_FALL_HEIGHT_M;
  if (isPositiveNumber(raw.age_years)) request.age_years = raw.age_years;
  return request;
}

function calculateModelRadiusUnits(bodyId, body_radius_units) {
  return body_radius_units * (MODEL_EXTENT_PER_BODY_DIAMETER[bodyId] || 1);
}

/**
 * Yan yana kıyas yerleşimi: gövde yarıçapları radius_ratio ile gerçek orandadır, iki cisim
 * x ekseninde ortalanır ve kamera mesafesi ikisini birden kadraja alacak şekilde hesaplanır.
 */
export function calculateComparisonLayout(comparison, aspect = 16 / 9, vertical_fov_deg = 45) {
  const ratio = isPositiveNumber(comparison?.radius_ratio) ? comparison.radius_ratio : 1;
  const primaryBody_units = ratio >= 1 ? LARGEST_RADIUS_UNITS : LARGEST_RADIUS_UNITS * ratio;
  const secondaryBody_units = ratio >= 1 ? LARGEST_RADIUS_UNITS / ratio : LARGEST_RADIUS_UNITS;
  const primaryModel_units = calculateModelRadiusUnits(comparison?.primary_object, primaryBody_units);
  const secondaryModel_units = calculateModelRadiusUnits(comparison?.secondary_object, secondaryBody_units);

  const gap_units = Math.max(primaryModel_units, secondaryModel_units) * 0.85;
  const totalWidth_units = primaryModel_units * 2 + gap_units + secondaryModel_units * 2;
  const primaryX_units = -totalWidth_units / 2 + primaryModel_units;
  const secondaryX_units = totalWidth_units / 2 - secondaryModel_units;
  const start_x_units = primaryX_units + primaryModel_units;
  const end_x_units = secondaryX_units - secondaryModel_units;
  const mid_x_units = (start_x_units + end_x_units) / 2;
  const distance_km = isPositiveNumber(comparison?.distance_km) ? comparison.distance_km : 0;

  const halfVertical_rad = (vertical_fov_deg * Math.PI) / 360;
  const safeAspect = isPositiveNumber(aspect) ? aspect : 16 / 9;
  const halfHorizontal_rad = Math.atan(Math.tan(halfVertical_rad) * safeAspect);
  const halfHeight_units = Math.max(primaryModel_units, secondaryModel_units);
  const camera_distance_units =
    Math.max(
      totalWidth_units / 2 / Math.tan(halfHorizontal_rad),
      halfHeight_units / Math.tan(halfVertical_rad)
    ) * FRAME_MARGIN;

  const createSlot = (body_id, body_units, model_units, x_units, other_units) => ({
    body_id,
    body_radius_units: body_units,
    model_radius_units: model_units,
    x_units,
    has_marker: other_units / body_units >= MARKER_RATIO_THRESHOLD,
    marker_size_units: camera_distance_units * MARKER_SIZE_PER_CAMERA_DISTANCE,
  });

  return {
    primary: createSlot(comparison?.primary_object, primaryBody_units, primaryModel_units, primaryX_units, secondaryBody_units),
    secondary: createSlot(comparison?.secondary_object, secondaryBody_units, secondaryModel_units, secondaryX_units, primaryBody_units),
    distance_line: { start_x_units, end_x_units, mid_x_units, distance_km },
    camera_distance_units,
    // Kamera biraz aşağıya bakar: cisimler yukarı kayar, altlarındaki bilgi etiketlerine yer kalır
    look_at_units: [0, -halfHeight_units * LABEL_ROOM_LOOK_OFFSET, 0],
  };
}

/**
 * Yüzeye geçmeden önceki yaklaşmanın bitiş konumu. Kamera iki cismin ortasına doğru gider ama hiçbirinin
 * yarıçapı * ZOOM_CLEARANCE_RATIO içine girmez; modelin iç yüzü (arka yüzler) hiçbir karede görünmesin diye.
 * Kamera x=0 doğrusunda z boyunca ilerlediği için cisimlere uzaklık en çok bitiş noktasında küçüktür.
 */
export function calculateZoomEndPosition(layout) {
  const distance_units = layout.camera_distance_units;
  const y_units = distance_units * ZOOM_END_HEIGHT_RATIO;
  const preferredZ_units = distance_units * ZOOM_DISTANCE_RATIO;
  const safeZ_units = [layout.primary, layout.secondary].reduce((maxZ, slot) => {
    const clearance_units = slot.model_radius_units * ZOOM_CLEARANCE_RATIO;
    const rest_units = clearance_units ** 2 - slot.x_units ** 2 - y_units ** 2;
    return rest_units > 0 ? Math.max(maxZ, Math.sqrt(rest_units)) : maxZ;
  }, 0);
  // Başlangıç mesafesinden geriye gitmez: yaklaşma her zaman ileri yönlüdür
  return [0, y_units, Math.min(distance_units, Math.max(preferredZ_units, safeZ_units))];
}

/**
 * Yüzey sahnesinde metreyi sahne birimine çevirir (tek yer). Kısa düşüşler 1 m = 1 birim,
 * uzun düşüşler kadraja sığsın diye sıkıştırılır; süreler fizikteki gerçek değerde kalır.
 */
export function calculateStageUnitsFromM(distance_m, height_m) {
  if (!isPositiveNumber(distance_m)) return 0;
  const scale = isPositiveNumber(height_m) ? Math.min(1, MAX_STAGE_DROP_UNITS / height_m) : 1;
  return distance_m * scale;
}
