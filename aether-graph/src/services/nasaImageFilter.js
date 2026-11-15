// NASA görsel arşivi sonuçlarından gerçek fotoğraf olmayan kayıtları eler: üzerine rota/harita çizilmiş
// (GPS gibi işaretli) görseller, diyagramlar, illüstrasyonlar, animasyon kareleri. Bütün NASA görsel yolları kullanır.

const NON_PHOTO_PATTERNS = [
  /\bmaps?\b/, /\bmapping\b/, /\btraverse\b/, /\broutes?\b/, /\bpaths?\b/, /\bdrive(?:s|n)?\b/,
  /\bannotat/, /\blabel(?:ed|led|s)?\b/, /\blanding ellipse/, /\bellipse\b/, /\bcontour/,
  /\belevation\b/, /\btopograph/, /\bgeologic/, /\bdiagram/, /\bchart\b/, /\bgraphic/, /\binfographic/,
  /\billustration/, /\bartist'?s? (?:concept|rendering|impression)/, /\banimation\b/, /\bsimulat/,
  /\bplot\b/, /\bcomparison\b/, /\btimeline\b/, /\bpanel discussion/, /\bpress (?:briefing|conference)/,
];

/**
 * Başlık + açıklama metni haritalı/işaretli grafik veya çizim gibi duruyorsa true döner.
 */
export function isNonPhotoImageText(text) {
  const lower = String(text || "").toLowerCase();
  return NON_PHOTO_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * NASA görsel arşivi öğesi (collection.items[]) gerçek gözlem fotoğrafı gibi duruyorsa true döner.
 */
export function isRealPhotoItem(item) {
  const meta = Array.isArray(item?.data) ? item.data[0] : null;
  if (!meta) return false;
  const keywords = Array.isArray(meta.keywords) ? meta.keywords.join(" ") : "";
  return !isNonPhotoImageText(`${meta.title || ""} ${meta.description || ""} ${keywords}`);
}
