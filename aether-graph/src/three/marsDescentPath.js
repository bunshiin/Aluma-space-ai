// Mars atmosfer dalışı ve yüzeyden kalkışın kamera yolları. THREE'ye bağımlı değil, düz { x, y, z }.
// Yollar canlı çapaya göre (dönen Mars'taki krater, sürüş yapan rover) her karede yeniden hesaplanır.
import { calculateSmootherstep } from './cameraTransition.js';
import {
  calculateClamp01,
  calculateEaseInOut,
  calculateVecCross,
  calculateVecDot,
  calculateVecMix,
  calculateVecNormalize,
  calculateVecScale,
  calculateVecSum,
} from './flareMath.js';
import { SURFACE_VIEW_OFFSET_M } from './marsSurfaceScene.js';

export const DIVE_DURATION_S = 6.5;
export const LANDING_DURATION_S = 5.5;
export const SURFACE_ASCENT_DURATION_S = 3.2;
export const ORBIT_ASCENT_DURATION_S = 4.5;
// Dalış krater üstünde gezegen yarıçapının bu oranı kadar yükseklikte biter (~80 km gerçek ölçekte)
export const DIVE_END_ALTITUDE_RATIO = 0.025;
// Yüzey sahnesinde inişin başladığı kamera yüksekliği (metre); pus bu noktada tamamen kapalıdır
export const LANDING_START_DISTANCE_M = 420;
// Kamera kratere güneyden, hafif eğik bakar; ufuk çizgisi görünsün diye tam tepeden değil
const DIVE_VIEW_TILT = 0.6;
const LANDING_START_DIR = calculateVecNormalize({ x: 0.25, y: 1, z: 0.35 });

const smoothstep = (a, b, x) => {
  const t = calculateClamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Dalışın son bakış yönü: yüzey normali ile güneye doğru hafif eğim.
 */
export function calculateDiveEndDirection(normal, north) {
  return calculateVecNormalize(calculateVecSum(normal, calculateVecScale(north, -DIVE_VIEW_TILT)));
}

// İki yön arasında yumuşak geçiş; zıt yönlerde sıfır vektöre düşmemek için normali ekler
function calculateDirectionBlend(from, to, t, fallback) {
  const mixed = calculateVecMix(from, to, t);
  if (Math.hypot(mixed.x, mixed.y, mixed.z) < 1e-3) {
    return calculateVecNormalize(calculateVecSum(mixed, calculateVecScale(fallback, 0.05)));
  }
  return calculateVecNormalize(mixed);
}

// Yön dönüşü sürenin bu kadarında biter, kalan kısım kraterin üstüne doğrudan alçalmadır
const DIVE_TURN_PORTION = 0.8;
// Kraterden uzakken (≥ ~50°) kamera yüzeyden en az bu oran kadar yukarıdan geçer; yakınken ince ayarla iner
const DIVE_FAR_ALTITUDE_RATIO = 0.6;

function calculateLength(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function calculateSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * a yönünden b yönüne küre üzerinde sabit açısal hızla geçer (büyük daire). Zıt yönlerde dönüş ekseni
 * belirsiz olduğu için hint'e dik bir eksen seçilir; yön hiçbir zaman sıfır vektöre düşmez.
 */
function calculateSlerpDirection(a, b, t, hint) {
  const angle = Math.acos(Math.max(-1, Math.min(1, calculateVecDot(a, b))));
  if (angle < 1e-6) return { dir: a, angle: 0 };
  let axis = calculateVecCross(a, b);
  if (calculateLength(axis) < 1e-6) axis = calculateVecCross(a, hint);
  if (calculateLength(axis) < 1e-6) axis = calculateVecCross(a, { x: 1, y: 0, z: 0 });
  axis = calculateVecNormalize(axis);
  const theta = angle * t;
  const cross = calculateVecCross(axis, a);
  const dir = calculateVecNormalize(calculateVecSum(
    calculateVecScale(a, Math.cos(theta)),
    calculateVecScale(cross, Math.sin(theta))
  ));
  return { dir, angle };
}

// Dalışın dönüş açısı büyüdükçe süre uzar; kamera uzun bir yayı aynı sürede hızla süpürmesin
const DIVE_TURN_EXTRA_DURATION_RATIO = 0.7;

function calculateDiveGeometry(site, normal, north, startOffset, endDistance_units) {
  const radius_units = endDistance_units / DIVE_END_ALTITUDE_RATIO;
  const center = calculateVecSum(site, calculateVecScale(normal, -radius_units));
  const endPos = calculateVecSum(site, calculateVecScale(calculateDiveEndDirection(normal, north), endDistance_units));
  const startPos = calculateVecSum(site, startOffset);
  const startRel = calculateSub(startPos, center);
  const endRel = calculateSub(endPos, center);
  const startR = Math.max(1e-6, calculateLength(startRel));
  const endR = Math.max(1e-6, calculateLength(endRel));
  return {
    radius_units, center, startPos, endPos, startR, endR,
    startDir: calculateVecScale(startRel, 1 / startR),
    endDir: calculateVecScale(endRel, 1 / endR),
  };
}

/**
 * Dalış/yükseliş süresi: temel süre, kameranın gezegen etrafında döneceği açıya göre uzar (π rad → +%70).
 */
export function calculateDiveDuration_s(site, normal, north, startOffset, endDistance_units, base_s = DIVE_DURATION_S) {
  const { startDir, endDir } = calculateDiveGeometry(site, normal, north, startOffset, endDistance_units);
  const angle_rad = Math.acos(Math.max(-1, Math.min(1, calculateVecDot(startDir, endDir))));
  return base_s * (1 + DIVE_TURN_EXTRA_DURATION_RATIO * (angle_rad / Math.PI));
}

/**
 * Yörüngeden kratere tek parça, sürekli dalış (u: 0 → 1). Kamera gezegen merkezi etrafında büyük daire
 * üzerinde döner ve yarıçapı tekdüze azalır; bu yüzden yön hiçbir yerde sıçramaz, kamera yarıçapı
 * hiçbir zaman gezegen yüzeyinin altına inmez. Kraterden uzakken yüzeyden yüksek, yakınken alçak uçar.
 */
export function calculateDivePose(site, normal, north, startOffset, endDistance_units, u) {
  const { radius_units, center, startPos, endPos, startR, endR, startDir, endDir } =
    calculateDiveGeometry(site, normal, north, startOffset, endDistance_units);
  if (u <= 0) return { position: startPos, look_at: site, distance_units: calculateLength(startOffset) };
  if (u >= 1) return { position: endPos, look_at: site, distance_units: endDistance_units };

  const e = calculateEaseInOut(u);
  const turnT = calculateSmootherstep(e / DIVE_TURN_PORTION);
  const { dir, angle } = calculateSlerpDirection(startDir, endDir, turnT, north);
  const remaining_rad = angle * (1 - turnT);

  const profileR = startR * Math.pow(endR / startR, e);
  const minAltitudeRatio = DIVE_END_ALTITUDE_RATIO + DIVE_FAR_ALTITUDE_RATIO * smoothstep(0.05, 0.9, remaining_rad);
  // Başlangıç zaten bu kabuğun altındaysa (alçak yükselişten devralma) sıçrama olmasın diye kabuk başlangıca kadar indirilir
  const minR = Math.min(radius_units * (1 + minAltitudeRatio), startR);
  const r = Math.max(profileR, minR);

  const position = calculateVecSum(center, calculateVecScale(dir, r));
  return { position, look_at: site, distance_units: calculateLength(calculateSub(position, site)) };
}

/**
 * Dalışta pus: küre dokusu bulanıklaşmadan (yaklaşık 1500 km'nin altı) önce ekranı kaplamaya başlar.
 */
export function calculateDiveHaze(u) {
  return smoothstep(0.45, 0.88, calculateEaseInOut(u));
}

/**
 * Yüzey sahnesinde iniş (u: 0 → 1): rover üstünden 420 m'den varsayılan takip açısına iner.
 */
export function calculateLandingPose(anchor, u) {
  const e = calculateEaseInOut(u);
  const endDist = Math.hypot(SURFACE_VIEW_OFFSET_M.x, SURFACE_VIEW_OFFSET_M.y, SURFACE_VIEW_OFFSET_M.z);
  const endDir = calculateVecScale(SURFACE_VIEW_OFFSET_M, 1 / endDist);
  const dir = calculateDirectionBlend(LANDING_START_DIR, endDir, smoothstep(0.2, 1, e), endDir);
  const dist = LANDING_START_DISTANCE_M * Math.pow(endDist / LANDING_START_DISTANCE_M, e);
  return { position: calculateVecSum(anchor, calculateVecScale(dir, dist)), look_at: anchor };
}

export function calculateLandingHaze(u) {
  return 1 - smoothstep(0, 0.5, calculateEaseInOut(u));
}

/**
 * Yüzeyden kalkış (u: 0 → 1): kameranın o anki açısından rover üstüne yükselir.
 */
export function calculateSurfaceAscentPose(anchor, startOffset, u) {
  const e = calculateEaseInOut(u);
  const startDist = Math.max(0.5, Math.hypot(startOffset.x, startOffset.y, startOffset.z));
  const dir = calculateDirectionBlend(calculateVecScale(startOffset, 1 / startDist), LANDING_START_DIR, e, LANDING_START_DIR);
  const dist = startDist * Math.pow(LANDING_START_DISTANCE_M / startDist, e);
  return { position: calculateVecSum(anchor, calculateVecScale(dir, dist)), look_at: anchor };
}

export function calculateSurfaceAscentHaze(u) {
  return smoothstep(0.35, 0.95, calculateEaseInOut(u));
}

/**
 * Atmosferden yörüngeye çıkış: dalışın tersi, Mars odak pozunda biter.
 */
export function calculateOrbitAscentPose(site, normal, north, focusOffset, endDistance_units, u) {
  return calculateDivePose(site, normal, north, focusOffset, endDistance_units, 1 - u);
}

export function calculateOrbitAscentHaze(u) {
  return 1 - smoothstep(0, 0.4, calculateEaseInOut(u));
}

/**
 * Kamera yüzeye ne kadar yaklaşırsa yakın kırpma düzlemi o kadar küçülür (gezegen kesilmesin).
 */
export function calculateNearPlane_units(distance_units, default_near_units) {
  if (!Number.isFinite(distance_units) || distance_units <= 0) return default_near_units;
  return Math.max(0.0002, Math.min(default_near_units, distance_units * 0.05));
}
