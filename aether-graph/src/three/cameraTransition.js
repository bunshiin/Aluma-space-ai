// Kamera geçişlerinin saf matematiği: başlangıçtan hedefe yumuşak, gövdelerin (küre) dışından dolaşan yol.
// THREE'ye bağımlı değil, düz { x, y, z } kullanır. Her kare canlı hedefe göre yeniden hesaplanır.
import {
  calculateClamp01,
  calculateVecCross,
  calculateVecDot,
  calculateVecMix,
  calculateVecNormalize,
  calculateVecScale,
  calculateVecSum,
} from './flareMath.js';

// Kamera, bir gövdenin yarıçapının bu katından fazla içeri giremez (mesh'e girmeyi kesin engeller)
export const TRANSITION_CLEARANCE_RATIO = 1.18;
// Yolu büken pay: doğru, kürenin bu katından yakın geçiyorsa yol dışarı kavis alır
const DETOUR_RATIO = 1.7;
const MIN_DURATION_S = 1.4;
const MAX_DURATION_S = 4.5;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v) => Math.hypot(v.x, v.y, v.z);

/**
 * Başı ve sonu sıfır hızlı yumuşak geçiş (6t⁵ − 15t⁴ + 10t³).
 */
export function calculateSmootherstep(t) {
  const x = calculateClamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Mesafeye göre geçiş süresi: yakın hedef çabuk, uzak hedef daha uzun sürer ama hiçbir zaman ani olmaz.
 */
export function calculateTransitionDuration_s(distance_units) {
  const d = Number.isFinite(distance_units) ? Math.max(0, distance_units) : 0;
  return Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, 0.9 + 0.5 * Math.sqrt(d)));
}

function getValidSpheres(spheres) {
  if (!Array.isArray(spheres)) return [];
  return spheres.filter((s) => s && s.center && Number.isFinite(s.radius_units) && s.radius_units > 0);
}

/**
 * Noktayı, içinde kaldığı her kürenin güvenli yarıçapının dışına iter. İç içe kürelerde (Mars + uydusu)
 * bir itme diğerine girmesin diye iki tur uygulanır.
 */
export function calculateClearedPoint(point, spheres, margin = TRANSITION_CLEARANCE_RATIO) {
  let result = { x: point.x, y: point.y, z: point.z };
  const valid = getValidSpheres(spheres);
  for (let pass = 0; pass < 2; pass += 1) {
    valid.forEach(({ center, radius_units }) => {
      const offset = sub(result, center);
      const dist = length(offset);
      const safe = radius_units * margin;
      if (dist >= safe) return;
      const dir = dist > 1e-9 ? calculateVecScale(offset, 1 / dist) : { x: 0, y: 1, z: 0 };
      result = calculateVecSum(center, calculateVecScale(dir, safe));
    });
  }
  return result;
}

// Doğru parçasının küreye en yakın noktası (s ∈ [0, 1])
function calculateClosestSegmentParam(start, end, center) {
  const seg = sub(end, start);
  const segLen2 = calculateVecDot(seg, seg);
  if (segLen2 < 1e-12) return 0;
  return calculateClamp01(calculateVecDot(sub(center, start), seg) / segLen2);
}

/**
 * Doğrudan yol bir küreye çok yaklaşıyorsa ortadaki kontrol noktasını küreden uzağa iter;
 * böylece kamera gezegenin üstünden/yanından dolanır, içinden geçmez.
 */
function calculateDetourControl(start, end, spheres, margin) {
  const mid = calculateVecMix(start, end, 0.5);
  const seg = sub(end, start);
  const segLen = length(seg);
  let control = mid;
  getValidSpheres(spheres).forEach(({ center, radius_units }) => {
    const detourRadius = radius_units * margin * DETOUR_RATIO;
    // Başlangıç veya bitiş zaten kürenin yakınındaysa o küre hedefin kendisidir; çevresinde dönmeye gerek yok
    if (length(sub(start, center)) < detourRadius || length(sub(end, center)) < detourRadius) return;
    const s = calculateClosestSegmentParam(start, end, center);
    const closest = calculateVecSum(start, calculateVecScale(seg, s));
    const away = sub(closest, center);
    const dist = length(away);
    if (dist >= detourRadius) return;
    let dir;
    if (dist > 1e-6) {
      dir = calculateVecScale(away, 1 / dist);
    } else {
      const axis = segLen > 1e-9 ? calculateVecScale(seg, 1 / segLen) : { x: 0, y: 0, z: 1 };
      const side = calculateVecCross(axis, { x: 0, y: 1, z: 0 });
      dir = length(side) > 1e-6 ? calculateVecNormalize(side) : { x: 1, y: 0, z: 0 };
    }
    // İkinci derece Bezier'de orta nokta sapması kontrol sapmasının yarısıdır, bu yüzden iki katı itilir
    control = calculateVecSum(control, calculateVecScale(dir, (detourRadius - dist) * 2));
  });
  return control;
}

/**
 * Geçişin t anındaki (0 → 1, zaten yumuşatılmış) kamera konumu. t=0 başlangıç, t=1 canlı bitiş noktasıdır.
 */
export function calculateTransitionPoint(start, end, spheres, t, margin = TRANSITION_CLEARANCE_RATIO) {
  const x = calculateClamp01(t);
  if (x <= 0) return { x: start.x, y: start.y, z: start.z };
  if (x >= 1) return { x: end.x, y: end.y, z: end.z };
  const valid = getValidSpheres(spheres);
  const control = calculateDetourControl(start, end, valid, margin);
  const a = calculateVecMix(start, control, x);
  const b = calculateVecMix(control, end, x);
  const point = calculateVecMix(a, b, x);
  // Gövde yolun üstüne hareket ettiyse de kamera içeri girmesin; başlangıç/bitiş küresi (hedefin kendisi) hariç
  const obstacles = valid.filter(({ center, radius_units }) => {
    const safe = radius_units * margin;
    return length(sub(start, center)) >= safe && length(sub(end, center)) >= safe;
  });
  return calculateClearedPoint(point, obstacles, margin);
}
