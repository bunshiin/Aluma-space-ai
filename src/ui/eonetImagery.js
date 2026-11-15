// Afet görseli: olayın tarih ve konumundaki NASA Worldview uydu karesi + NASA görsel arşivi araması

const WORLDVIEW_SNAPSHOT_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";
const NASA_IMAGES_SEARCH_URL = "https://images-api.nasa.gov/search";
const IMAGE_WIDTH_PX = 960;
const IMAGE_HEIGHT_PX = 600;
const ARCHIVE_TIMEOUT_MS = 8000;
const MS_PER_DAY = 86400000;
// Uydu karesinin enlem genişliği (derece): kasırga büyük alan, volkan küçük alan ister
const VIEW_SPAN_DEG = { severeStorms: 14, seaLakeIce: 8, floods: 4, earthquakes: 3, volcanoes: 1.6, wildfires: 1.6 };
const DEFAULT_SPAN_DEG = 4;
const TRUE_COLOR_LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor";
const FIRE_LAYER = "MODIS_Combined_Thermal_Anomalies_All";

// Bugünün uydu karesi henüz işlenmemiş olabilir; en yakın tam gün olarak bir gün öncesi alınır
export function getImageryDate(isoText, now = new Date()) {
  const timeMs = Date.parse(isoText);
  const safeMs = Number.isFinite(timeMs) ? Math.min(timeMs, now.getTime() - MS_PER_DAY) : now.getTime() - MS_PER_DAY;
  return new Date(safeMs).toISOString().slice(0, 10);
}

export function createWorldviewSnapshotUrl(event, now = new Date()) {
  const lat = Number(event?.coordinates?.latitude_deg) || 0;
  const lon = Number(event?.coordinates?.longitude_deg) || 0;
  const latSpan = VIEW_SPAN_DEG[event?.category] || DEFAULT_SPAN_DEG;
  const lonSpan = (latSpan * (IMAGE_WIDTH_PX / IMAGE_HEIGHT_PX)) / Math.max(Math.cos((lat * Math.PI) / 180), 0.25);
  const south = Math.max(lat - latSpan / 2, -90);
  const north = Math.min(lat + latSpan / 2, 90);
  // Snapshot servisi 180° boylamını aşan kutuyu reddeder; kutu kenara dayanacak şekilde kaydırılır
  const shift = Math.max(lon + lonSpan / 2 - 180, 0) - Math.max(-180 - (lon - lonSpan / 2), 0);
  const west = Math.max(lon - lonSpan / 2 - shift, -180);
  const east = Math.min(lon + lonSpan / 2 - shift, 180);
  const layers = event?.category === "wildfires" ? `${TRUE_COLOR_LAYER},${FIRE_LAYER}` : TRUE_COLOR_LAYER;
  const params = new URLSearchParams({
    REQUEST: "GetSnapshot",
    TIME: getImageryDate(event?.timestamp_utc, now),
    BBOX: [south, west, north, east].map((v) => v.toFixed(3)).join(","),
    CRS: "EPSG:4326",
    LAYERS: layers,
    WIDTH: String(IMAGE_WIDTH_PX),
    HEIGHT: String(IMAGE_HEIGHT_PX),
    FORMAT: "image/jpeg",
  });
  return { url: `${WORLDVIEW_SNAPSHOT_URL}?${params.toString()}`, layer_name: "MODIS Terra", date: params.get("TIME") };
}

// "Nevados del Chillan Volcano, Chile" → "Nevados del Chillan Volcano"
export function createArchiveSearchTerm(title) {
  return String(title || "").split(",")[0].replace(/\d{4,}/g, "").trim();
}

export async function getNasaArchivePhoto(event) {
  const term = createArchiveSearchTerm(event?.title);
  if (term.length < 3) return null;
  try {
    const params = new URLSearchParams({ q: term, media_type: "image" });
    const resp = await fetch(`${NASA_IMAGES_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const item = (await resp.json())?.collection?.items?.find((it) => it?.links?.[0]?.href);
    if (!item) return null;
    return { url: item.links[0].href, title: item.data?.[0]?.title || term };
  } catch (err) {
    console.warn("NASA arşiv görseli alınamadı:", err.message);
    return null;
  }
}
