// Patlama sahnesinin THREE'ye bağımlı olmayan saf vektör yardımcıları; kamera yolu ve geometri
// testte gerçek WebGL olmadan doğrulanabilsin diye düz { x, y, z } objeleriyle çalışır.

export function calculateVec(x, y, z) {
  return { x, y, z };
}

export function calculateVecSum(...vectors) {
  return vectors.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
    { x: 0, y: 0, z: 0 }
  );
}

export function calculateVecScale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function calculateVecMix(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function calculateVecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function calculateVecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function calculateVecNormalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function calculateVecDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function calculateClamp01(t) {
  return Math.max(0, Math.min(1, t));
}

/**
 * Smootherstep: hem hız hem ivme uçlarda sıfır, kamera geçişlerinde sarsıntı olmasın diye.
 */
export function calculateEaseInOut(t) {
  const k = calculateClamp01(t);
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/**
 * Aynı tohum her seferinde aynı sayıyı verir; patlama şekli her tetiklemede tutarlı kalsın diye.
 */
export function calculateSeededRandom(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Patlama yönüne (dir) dik iki eksen üretir: right (yan) ve up (yukarı).
 */
export function calculateOrthonormalBasis(dir) {
  const ref = Math.abs(dir.y) < 0.9 ? calculateVec(0, 1, 0) : calculateVec(1, 0, 0);
  const right = calculateVecNormalize(calculateVecCross(dir, ref));
  const up = calculateVecCross(right, dir);
  return { dir: calculateVec(dir.x, dir.y, dir.z), right, up };
}
