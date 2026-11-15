// Panelde gösterilen değerlerin okunabilir biçime çevrilmesi (saf fonksiyonlar, metinler texts'ten)

const MS_PER_DAY = 86400000;

export function fillTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? ""));
}

export function formatDateTr(isoText) {
  const date = new Date(isoText);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("tr-TR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

export function formatRelativeDay(isoText, texts, now = new Date()) {
  const timeMs = Date.parse(isoText);
  if (!Number.isFinite(timeMs)) return "";
  const days = Math.floor((now.getTime() - timeMs) / MS_PER_DAY);
  if (days <= 0) return texts.relative_today;
  if (days === 1) return texts.relative_yesterday;
  return fillTemplate(texts.relative_days_ago, { n: days.toLocaleString("tr-TR") });
}

export function formatCoordinates(coordinates) {
  const lat = Number(coordinates?.latitude_deg);
  const lon = Number(coordinates?.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const latText = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "K" : "G"}`;
  const lonText = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "D" : "B"}`;
  return `${latText}, ${lonText}`;
}

export function formatMagnitude(event, texts) {
  if (typeof event?.magnitude_value !== "number") return texts.field_unknown;
  const unit = texts.magnitude_units?.[event.magnitude_unit] || event.magnitude_unit || "";
  return `${event.magnitude_value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} ${unit}`.trim();
}

export function getCategoryLabel(category, texts) {
  return texts.categories?.[category] || category || "";
}
