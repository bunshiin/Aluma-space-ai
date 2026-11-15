// 2D prosedürel gezegen (Bölüm F - Mami). Sözleşme: renderProceduralPlanet(canvasId, planetName)
// Dış resim kullanmaz; yüzey isimden türetilen tohumla üretilir, aynı isim her seferinde aynı görünür.

const ROTATION_PERIOD_S = 24;
const DEG_TO_RAD = Math.PI / 180;
const FEATURE_COUNT = 46;
const STAR_COUNT = 90;
const JEZERO = Object.freeze({ latitude_deg: 18.38, longitude_deg: 77.58, radius_deg: 6 });

// Bilinen cisimler gerçekçi renklerle çizilir; bilinmeyen isim tohumdan renk alır
const PLANET_PALETTES = Object.freeze({
  MERCURY: { base: "#8c8680", light: "#b9b3ab", dark: "#4a4642", banded: false },
  VENUS: { base: "#d9b26f", light: "#f2d9a0", dark: "#8a6a35", banded: true },
  EARTH: { base: "#1f5fa8", light: "#3d8a3a", dark: "#0b2f5c", banded: false },
  MOON: { base: "#8f8f8f", light: "#bdbdbd", dark: "#4d4d4d", banded: false },
  MARS: { base: "#b5532a", light: "#d9814f", dark: "#6b2a12", banded: false },
  JUPITER: { base: "#c9a27a", light: "#efdcc0", dark: "#8a5a36", banded: true },
  SATURN: { base: "#d8c28f", light: "#f3e6c2", dark: "#9c8452", banded: true },
  URANUS: { base: "#7fc6d6", light: "#b7e6ef", dark: "#3f8696", banded: true },
  NEPTUNE: { base: "#3456c8", light: "#6f8ef0", dark: "#16286e", banded: true },
  PLUTO: { base: "#c9b29b", light: "#efe2d2", dark: "#7d6a58", banded: false },
});

const activeLoops = new Map();

/**
 * İsimden 32 bit tohum üretir (FNV-1a); aynı isim hep aynı tohumu verir.
 */
export function calculateNameSeed(planetName) {
  const text = String(planetName || "").trim().toUpperCase();
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Tohumlu sözde rastgele üreteç (mulberry32): [0, 1) aralığında deterministik dizi.
 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getPlanetPalette(planetName) {
  const key = String(planetName || "").trim().toUpperCase();
  if (Object.hasOwn(PLANET_PALETTES, key)) return PLANET_PALETTES[key];
  const hue = calculateNameSeed(key) % 360;
  return { base: `hsl(${hue} 45% 45%)`, light: `hsl(${hue} 55% 65%)`, dark: `hsl(${hue} 50% 20%)`, banded: false };
}

/**
 * Yüzey özelliklerini (leke, krater, bulut) isim tohumuyla üretir. Aynı isim → aynı liste.
 */
export function createSurfaceFeatures(planetName) {
  const random = createSeededRandom(calculateNameSeed(planetName));
  return Array.from({ length: FEATURE_COUNT }, () => ({
    latitude_deg: Math.asin(random() * 2 - 1) / DEG_TO_RAD,
    longitude_deg: random() * 360 - 180,
    radius_deg: 3 + random() * 14,
    is_light: random() > 0.55,
    alpha: 0.18 + random() * 0.3,
  }));
}

/**
 * Enlem/boylamı kameraya bakan yarıküreye ortografik izdüşümle çevirir.
 * Nokta ancak cos(boylam) > 0 iken (ön yüzde) görünür; arka yüzde is_visible false döner.
 */
export function calculateSurfaceProjection(latitude_deg, longitude_deg, rotation_rad) {
  const lat_rad = latitude_deg * DEG_TO_RAD;
  const lon_rad = longitude_deg * DEG_TO_RAD + rotation_rad;
  return {
    x: Math.cos(lat_rad) * Math.sin(lon_rad),
    y: -Math.sin(lat_rad),
    depth: Math.cos(lat_rad) * Math.cos(lon_rad),
    is_visible: Math.cos(lon_rad) > 0,
  };
}

export function isJezeroVisible(rotation_rad) {
  return calculateSurfaceProjection(JEZERO.latitude_deg, JEZERO.longitude_deg, rotation_rad).is_visible;
}

function drawStars(ctx, width_px, height_px, seed) {
  const random = createSeededRandom(seed ^ 0x9e3779b9);
  ctx.fillStyle = "#03050a";
  ctx.fillRect(0, 0, width_px, height_px);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    ctx.globalAlpha = 0.2 + random() * 0.6;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(random() * width_px, random() * height_px, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

// Gaz devlerinde enlem bantları, kayalık cisimlerde düz zemin
function drawBase(ctx, cx, cy, r, palette, seed) {
  ctx.fillStyle = palette.base;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (!palette.banded) return;
  const random = createSeededRandom(seed);
  for (let y = -r; y < r; y += r * (0.05 + random() * 0.08)) {
    ctx.globalAlpha = 0.18 + random() * 0.22;
    ctx.fillStyle = random() > 0.5 ? palette.light : palette.dark;
    ctx.fillRect(cx - r, cy + y, r * 2, r * (0.03 + random() * 0.06));
  }
  ctx.globalAlpha = 1;
}

// Kenara yaklaşan leke dairesel değil elips görünür (ön kısalma)
function drawFeature(ctx, cx, cy, r, feature, rotation_rad, color) {
  const p = calculateSurfaceProjection(feature.latitude_deg, feature.longitude_deg, rotation_rad);
  if (!p.is_visible) return;
  const size_px = r * feature.radius_deg * DEG_TO_RAD;
  ctx.globalAlpha = feature.alpha * Math.min(1, p.depth * 3);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx + p.x * r, cy + p.y * r, Math.max(0.5, size_px * Math.max(0.05, p.depth)), size_px, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawJezero(ctx, cx, cy, r, rotation_rad) {
  const p = calculateSurfaceProjection(JEZERO.latitude_deg, JEZERO.longitude_deg, rotation_rad);
  if (!p.is_visible) return;
  const size_px = r * JEZERO.radius_deg * DEG_TO_RAD;
  ctx.globalAlpha = Math.min(1, p.depth * 4);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx + p.x * r, cy + p.y * r, Math.max(0.5, size_px * p.depth), size_px, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Radyal gölgelendirme: merkez parlak, kenar (limb) ve gece tarafı koyu
function drawLimbDarkening(ctx, cx, cy, r) {
  const limb = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  limb.addColorStop(0, "rgba(255, 255, 255, 0.10)");
  limb.addColorStop(0.65, "rgba(0, 0, 0, 0.05)");
  limb.addColorStop(1, "rgba(0, 0, 0, 0.78)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function drawPlanetFrame(ctx, width_px, height_px, planetName, features, rotation_rad) {
  const seed = calculateNameSeed(planetName);
  const palette = getPlanetPalette(planetName);
  const [cx, cy, r] = [width_px / 2, height_px / 2, Math.min(width_px, height_px) * 0.34];
  drawStars(ctx, width_px, height_px, seed);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  drawBase(ctx, cx, cy, r, palette, seed);
  if (!palette.banded) features.forEach((f) => drawFeature(ctx, cx, cy, r, f, rotation_rad, f.is_light ? palette.light : palette.dark));
  if (String(planetName).trim().toUpperCase() === "MARS") drawJezero(ctx, cx, cy, r, rotation_rad);
  drawLimbDarkening(ctx, cx, cy, r);
  ctx.restore();
}

function stopLoop(canvasId) {
  const loop = activeLoops.get(canvasId);
  if (loop) globalThis.cancelAnimationFrame?.(loop.frame_id);
  activeLoops.delete(canvasId);
}

/**
 * Gezegeni verilen canvas'a çizer ve kendi ekseninde döndürür. Aynı canvas'a yeniden çağrılırsa eski döngü durur.
 * Canvas gizlenince (bölünmüş ekran kapanınca) döngü kendini durdurur. Hata fırlatmaz.
 */
export function renderProceduralPlanet(canvasId, planetName) {
  const canvas = typeof document !== "undefined" ? document.getElementById(canvasId) : null;
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) {
    console.warn("renderProceduralPlanet: canvas bulunamadı:", canvasId);
    return;
  }
  stopLoop(canvasId);
  const name = String(planetName || "MARS").trim().toUpperCase() || "MARS";
  const features = createSurfaceFeatures(name);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const start_ms = performance.now();

  const loop = { frame_id: 0 };
  activeLoops.set(canvasId, loop);
  const step = (now_ms) => {
    if (!canvas.isConnected || canvas.offsetParent === null) {
      stopLoop(canvasId);
      return;
    }
    const width_px = Math.max(1, Math.round((canvas.clientWidth || 560) * pixelRatio));
    const height_px = Math.max(1, Math.round((canvas.clientHeight || 560) * pixelRatio));
    if (canvas.width !== width_px) canvas.width = width_px;
    if (canvas.height !== height_px) canvas.height = height_px;
    const rotation_rad = (((now_ms - start_ms) / 1000) / ROTATION_PERIOD_S) * Math.PI * 2;
    drawPlanetFrame(ctx, width_px, height_px, name, features, rotation_rad);
    loop.frame_id = requestAnimationFrame(step);
  };
  loop.frame_id = requestAnimationFrame(step);
}
