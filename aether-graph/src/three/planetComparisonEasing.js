// Karşılaştırma sahnesinin bütün hareketleri aynı yumuşatma eğrilerini kullanır (saf, Three.js'siz)

export function calculateClamp01(t) {
  if (typeof t !== 'number' || Number.isNaN(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/** Başı ve sonu yumuşak (3t² - 2t³). Kararma ve etiket geçişleri için. */
export function calculateSmoothStep(t) {
  const c = calculateClamp01(t);
  return c * c * (3 - 2 * c);
}

/** Smoothstep'ten daha uzun yavaş başlangıç/bitiş (6t⁵ - 15t⁴ + 10t³). Kamera hareketleri için. */
export function calculateSmootherStep(t) {
  const c = calculateClamp01(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/** Hızlı başlayıp yavaşça oturan eğri; gezegenlerin belirme animasyonunda kullanılır. */
export function calculateEaseOutCubic(t) {
  const c = calculateClamp01(t);
  return 1 - (1 - c) ** 3;
}
