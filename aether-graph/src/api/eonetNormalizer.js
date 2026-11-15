// NASA EONET v3 ham olaylarını UI'nın kullandığı sade biçime çevirir (saf fonksiyonlar)

export const EONET_CATEGORY_IDS = Object.freeze([
  "drought", "dustHaze", "earthquakes", "floods", "landslides", "manmade",
  "seaLakeIce", "severeStorms", "snow", "tempExtremes", "volcanoes",
  "waterColor", "wildfires",
]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Polygon olaylarda (buzul, sel alanı) tek nokta yok, köşelerin ortalaması işaret noktası olur
function calculateGeometryCenter(geometry) {
  const coords = geometry?.coordinates;
  if (geometry?.type === "Point" && Array.isArray(coords)) {
    return { longitude_deg: coords[0], latitude_deg: coords[1] };
  }
  if (geometry?.type === "Polygon" && Array.isArray(coords?.[0]) && coords[0].length > 0) {
    const ring = coords[0];
    const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return { longitude_deg: sum[0] / ring.length, latitude_deg: sum[1] / ring.length };
  }
  return null;
}

function getTimeMs(isoText) {
  const ms = Date.parse(isoText);
  return Number.isFinite(ms) ? ms : 0;
}

// Olayın en son ölçümü konum ve büyüklük için esas alınır (kasırga hareket eder)
function getLatestGeometry(geometryList) {
  if (!Array.isArray(geometryList) || geometryList.length === 0) return null;
  return [...geometryList].sort((a, b) => getTimeMs(b?.date) - getTimeMs(a?.date))[0];
}

export function normalizeEonetEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== "object") return null;
  const geometryList = Array.isArray(rawEvent.geometry) ? rawEvent.geometry : [];
  const latest = getLatestGeometry(geometryList);
  const center = calculateGeometryCenter(latest);
  if (!center || !isFiniteNumber(center.latitude_deg) || !isFiniteNumber(center.longitude_deg)) return null;

  const firstDate = geometryList.map((g) => g?.date).filter(Boolean).sort()[0] || latest.date;
  const category = rawEvent.categories?.[0] || {};
  const source = Array.isArray(rawEvent.sources) ? rawEvent.sources[0] : null;

  return {
    id: String(rawEvent.id || ""),
    title: String(rawEvent.title || "Adsız olay"),
    category: EONET_CATEGORY_IDS.includes(category.id) ? category.id : "manmade",
    category_title: String(category.title || ""),
    timestamp_utc: latest.date || "",
    first_seen_utc: firstDate || "",
    status: rawEvent.closed ? "CLOSED" : "OPEN",
    closed_utc: rawEvent.closed || "",
    coordinates: {
      latitude_deg: Number(center.latitude_deg.toFixed(4)),
      longitude_deg: Number(center.longitude_deg.toFixed(4)),
    },
    magnitude_value: isFiniteNumber(latest.magnitudeValue) ? latest.magnitudeValue : null,
    magnitude_unit: latest.magnitudeUnit || "",
    description: rawEvent.description || "",
    source_id: source?.id || "",
    source_url: source?.url || "",
    eonet_url: rawEvent.link || "",
    track_point_count: geometryList.length,
  };
}

export function normalizeEonetResponse(rawJson) {
  const list = Array.isArray(rawJson?.events) ? rawJson.events : [];
  return list
    .map(normalizeEonetEvent)
    .filter(Boolean)
    .sort((a, b) => getTimeMs(b.timestamp_utc) - getTimeMs(a.timestamp_utc));
}

// Eski yedek kayıtlar (spaceDataFallback) aynı biçime tamamlanır, UI tek şemayla çalışır
export function normalizeFallbackEvent(item) {
  return {
    id: String(item?.id || ""),
    title: String(item?.title || "Adsız olay"),
    category: EONET_CATEGORY_IDS.includes(item?.category) ? item.category : "manmade",
    category_title: "",
    timestamp_utc: item?.timestamp_utc || "",
    first_seen_utc: item?.timestamp_utc || "",
    status: "OPEN",
    closed_utc: "",
    coordinates: {
      latitude_deg: Number(item?.coordinates?.latitude_deg) || 0,
      longitude_deg: Number(item?.coordinates?.longitude_deg) || 0,
    },
    magnitude_value: isFiniteNumber(item?.magnitude_value) ? item.magnitude_value : null,
    magnitude_unit: item?.magnitude_unit || "",
    description: item?.description || "",
    source_id: "FALLBACK",
    source_url: "",
    eonet_url: "",
    track_point_count: 1,
  };
}
