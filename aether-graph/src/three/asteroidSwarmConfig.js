// Asteroit sürüsü (NEO_SWARM) sahnesinin sabitleri ve THREE'ye bağımlı olmayan saf hesapları.
// Gelen veri (Taha'nın getSpaceData çıktısı) burada doğrulanır; sahne sadece temiz listeyle çalışır.
import { EARTH_MOON_DISTANCE_KM, EARTH_RADIUS_KM, ORBIT_RADIUS_KM } from '../physics/spacePhysics.js';
import { calculateSeededRandom } from './flareMath.js';

export const ASTEROID_MODEL_URLS = {
  BENNU: '/public/models/bennu.glb',
  GENERIC: '/public/models/itokawa.glb',
};
export const EARTH_MODEL_URL = '/public/models/earth.glb';
export const MOON_MODEL_URL = '/public/models/moon.glb';

export const MAX_ASTEROID_COUNT = 40;

export const EARTH_RADIUS_UNITS = 1.6;
export const MOON_RADIUS_UNITS = 0.42;
// Gerçek oranda (Bennu ~0.5 km, Dünya 6371 km) asteroit görünmez olurdu; Dünya'nın ~1/13'ü,
// genel görünümde küçük ama parıltısıyla seçilebilir, odaklanınca şekli okunur
export const ASTEROID_RADIUS_UNITS = 0.12;

// Asteroit sahnesinin kamera değerleri tek yerde. Odak hedefi asteroidin adıdır (veriden gelir);
// listede olmayan ya da EARTH hedefi Dünya merkezli genel görünüme döner
export const ASTEROID_CAMERA = {
  OVERVIEW_TARGET: 'EARTH',
  // 0,5 AU halkası (20 birim) dahil bütün sürü ilk karede kadraja girsin
  overview_position_units: [0, 20, 46],
  overview_min_distance_units: 3,
  focus_distance_units: ASTEROID_RADIUS_UNITS * 9,
  focus_min_distance_units: ASTEROID_RADIUS_UNITS * 2,
  focus_exit_distance_units: 8,
};

/**
 * Odak hedefini çözer: bilinen asteroit adıysa onu, değilse genel görünümü döner. Hata fırlatmaz.
 */
export function getAsteroidFocusTarget(targetName, knownNames) {
  if (typeof targetName === 'string' && knownNames && typeof knownNames.has === 'function' && knownNames.has(targetName)) {
    return targetName;
  }
  return ASTEROID_CAMERA.OVERVIEW_TARGET;
}

// Renk sadece Dünya'ya olan mesafeden gelir: yakın kırmızı, orta sarı, uzak yeşil (güvenli).
// Eşikler fiziksel noktalara bağlı: Ay mesafesi (1 LD) ve 0,05 AU (NASA'nın "potansiyel tehlikeli" eşiği).
export const DISTANCE_LEVELS = ['NEAR', 'MID', 'FAR'];
export const NEAR_LIMIT_KM = EARTH_MOON_DISTANCE_KM;
export const MID_LIMIT_KM = ORBIT_RADIUS_KM.EARTH * 0.05;

// Kırmızının parlaklığı (luminance) sarı ve yeşilin yaklaşık üçte biri; yoğunluk buna göre seçildi ki
// bloom'da en yakın olan en güçlü parlasın. pulse_depth: parıltının ne kadar söndüğü (0 = hiç, 1 = tamamen).
// NEAR alarm gibi derin ve yavaş yanıp söner, MID hafif nefes alır, FAR sakin yanar.
export const DISTANCE_STYLES = {
  NEAR: { color_rgb: [1.0, 0.07, 0.04], glow_intensity: 7.0, pulse_depth: 0.9, pulse_base_hz: 0.6 },
  MID: { color_rgb: [1.0, 0.78, 0.12], glow_intensity: 2.0, pulse_depth: 0.25, pulse_base_hz: 0.45 },
  FAR: { color_rgb: [0.2, 1.0, 0.38], glow_intensity: 1.5, pulse_depth: 0.12, pulse_base_hz: 0.35 },
};

/**
 * Dünya merkezine olan mesafeden renk seviyesini belirler. Geçersiz mesafe güvenli (FAR) sayılır.
 */
export function calculateDistanceLevel(distance_km) {
  if (typeof distance_km !== 'number' || !Number.isFinite(distance_km) || distance_km <= 0) return 'FAR';
  if (distance_km < NEAR_LIMIT_KM) return 'NEAR';
  if (distance_km < MID_LIMIT_KM) return 'MID';
  return 'FAR';
}

// NeoWs mesafesi (miss_distance) Dünya merkezinden ölçülür ve yüzeyi sıyıran ~6.400 km ile
// ~0,5 AU arasında 10.000 kat değişir. Doğrusal ölçekte Ay bile ekran dışına düşer; log ölçek kullanılır.
// Alt sınır Dünya yüzeyi: hiçbir asteroit Dünya'nın içine çizilmez. Üst sınır 0,5 AU.
// Ara noktalar: 31 bin km ≈ 5,2 birim · GEO ≈ 5,8 · Ay (1 LD) ≈ 10,0 · 0,05 AU (PHA eşiği) ≈ 15,6 · 0,5 AU = 20
const ORBIT_MIN_KM = EARTH_RADIUS_KM;
const ORBIT_MAX_KM = ORBIT_RADIUS_KM.EARTH * 0.5;
// Yüzeye en yakın küme, etrafındaki parçalarla birlikte Dünya'ya değmesin diye yüzeyden biraz dışarıda başlar
const ORBIT_MIN_UNITS = 2.15;
const ORBIT_MAX_UNITS = 20.0;

const ORBIT_SPEED_MIN_DEG_S = 2.5;
const ORBIT_SPEED_MAX_DEG_S = 11.0;
// Hızlı asteroit seviyenin temel yanıp sönme hızını biraz artırır, yavaş olan biraz azaltır
const PULSE_SPEED_MIN_FACTOR = 0.8;
const PULSE_SPEED_MAX_FACTOR = 1.25;
const TUMBLE_MIN_DEG_S = 8;
const TUMBLE_MAX_DEG_S = 24;
const MAX_INCLINATION_DEG = 35;

/**
 * Km cinsinden yaklaşma mesafesini sahne yörünge yarıçapına çevirir (log ölçek, tek yer).
 */
export function calculateAsteroidOrbitUnits(distance_km) {
  if (typeof distance_km !== 'number' || !Number.isFinite(distance_km) || distance_km <= 0) {
    return ORBIT_MIN_UNITS;
  }
  const clamped_km = Math.min(Math.max(distance_km, ORBIT_MIN_KM), ORBIT_MAX_KM);
  const t = Math.log10(clamped_km / ORBIT_MIN_KM) / Math.log10(ORBIT_MAX_KM / ORBIT_MIN_KM);
  return ORBIT_MIN_UNITS + t * (ORBIT_MAX_UNITS - ORBIT_MIN_UNITS);
}

export function calculateMoonOrbitUnits() {
  return calculateAsteroidOrbitUnits(EARTH_MOON_DISTANCE_KM);
}

export function isBennuAsteroid(name) {
  return typeof name === 'string' && /bennu|101955/i.test(name);
}

function getPositiveNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 'ag:neo-data' olayının yükünden asteroit listesini çıkarır. Router hangisini elinde tutuyorsa onu
 * dönüştürmeden gönderebilsin diye üç biçim kabul edilir: getSpaceData dizisi, { asteroids } ve
 * Gemini JSON'u ({ parameters: { asteroids } }). Tanınmayan yük boş dizi döner.
 */
export function getAsteroidListFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.asteroids)) return payload.asteroids;
    if (Array.isArray(payload.parameters?.asteroids)) return payload.parameters.asteroids;
  }
  return [];
}

/**
 * Gelen asteroit yükünün mevcut sahneye ekleme (append) mi yoksa değiştirme (replace) mi
 * istediğini kontrol eder.
 */
export function isAsteroidAppendPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  return (
    payload.append === true ||
    payload.query_mode === 'append' ||
    payload.parameters?.query_mode === 'append' ||
    payload.parameters?.append === true
  );
}

/**
 * Dışarıdan gelen asteroit listesini doğrular: bilinmeyen alanı atar, eksik alana varsayılan koyar,
 * aynı isimli tekrarları ve üst sınırı aşanları çıkarır. Her zaman dizi döner.
 */
export function getSanitizedAsteroids(rawList) {
  if (!Array.isArray(rawList)) {
    return [];
  }
  const seenNames = new Set();
  const result = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    result.push({
      name,
      close_approach_utc: typeof item.close_approach_utc === 'string' ? item.close_approach_utc : '',
      distance_km: getPositiveNumber(item.distance_km, EARTH_MOON_DISTANCE_KM),
      velocity_kmh: getPositiveNumber(item.velocity_kmh, 0),
      is_hazardous: item.is_hazardous === true,
    });
    if (result.length >= MAX_ASTEROID_COUNT) break;
  }
  return result;
}

/**
 * Hızları listedeki en yavaş (0) ile en hızlı (1) arasına yerleştirir; tek asteroit ya da eşit hızlar 0.5 olur.
 * Sahnedeki hareket ve parıltı mutlak hıza değil, asteroitlerin birbirine göre durumuna bağlıdır.
 */
export function calculateRelativeSpeeds(asteroids) {
  const speeds = Array.isArray(asteroids) ? asteroids.map((a) => a?.velocity_kmh || 0) : [];
  if (speeds.length === 0) return [];
  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  if (max - min < 1e-9) return speeds.map(() => 0.5);
  return speeds.map((v) => (v - min) / (max - min));
}

/**
 * Mesafe seviyesi ve göreli hızdan parıltı ve yörünge hareketi değerlerini üretir.
 * Renk ve yanıp sönme derinliği seviyeden, hız farkı ise göreli hızdan gelir.
 */
export function calculateAsteroidMotionStyle(distance_level, relative_speed) {
  const style = DISTANCE_STYLES[distance_level] || DISTANCE_STYLES.FAR;
  const s = typeof relative_speed === 'number' && Number.isFinite(relative_speed)
    ? Math.min(Math.max(relative_speed, 0), 1)
    : 0.5;
  return {
    color_rgb: style.color_rgb,
    glow_intensity: style.glow_intensity * (0.8 + 0.5 * s),
    pulse_depth: style.pulse_depth,
    pulse_hz: style.pulse_base_hz * (PULSE_SPEED_MIN_FACTOR + (PULSE_SPEED_MAX_FACTOR - PULSE_SPEED_MIN_FACTOR) * s),
    orbit_speed_deg_s: ORBIT_SPEED_MIN_DEG_S + (ORBIT_SPEED_MAX_DEG_S - ORBIT_SPEED_MIN_DEG_S) * s,
  };
}

/**
 * İsimden sabit bir tohum üretir: aynı asteroit her açılışta aynı yörüngede ve aynı şekilde yuvarlanır.
 */
export function calculateNameSeed(name) {
  const text = typeof name === 'string' ? name : '';
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000003;
  }
  return hash;
}

function calculateRandomAxis(seed) {
  const u = calculateSeededRandom(seed);
  const v = calculateSeededRandom(seed + 0.37);
  const theta_rad = u * Math.PI * 2;
  const cosPhi = 2 * v - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  return { x: sinPhi * Math.cos(theta_rad), y: cosPhi, z: sinPhi * Math.sin(theta_rad) };
}

/**
 * Asteroidin yörünge eğimi, başlangıç açısı ve kendi ekseni etrafındaki yuvarlanması (tohumlu).
 */
export function calculateAsteroidLayout(name) {
  const seed = calculateNameSeed(name);
  const r = (k) => calculateSeededRandom(seed + k * 13.7);
  return {
    inclination_deg: (r(1) * 2 - 1) * MAX_INCLINATION_DEG,
    node_deg: r(2) * 360,
    phase_deg: r(3) * 360,
    tumble_axis: calculateRandomAxis(seed + 5.1),
    tumble_speed_deg_s: TUMBLE_MIN_DEG_S + r(4) * (TUMBLE_MAX_DEG_S - TUMBLE_MIN_DEG_S),
    debris_count: 3 + Math.floor(r(6) * 4),
  };
}

/**
 * Kümedeki küçük parçaların ana asteroide göre konumu, boyutu ve yuvarlanması (tohumlu).
 */
export function calculateDebrisLayout(name, index) {
  const seed = calculateNameSeed(name) + (index + 1) * 101.3;
  const r = (k) => calculateSeededRandom(seed + k * 7.9);
  const dir = calculateRandomAxis(seed + 3.3);
  const distance_units = ASTEROID_RADIUS_UNITS * (1.8 + r(1) * 1.6);
  return {
    offset_units: { x: dir.x * distance_units, y: dir.y * distance_units * 0.6, z: dir.z * distance_units },
    radius_units: ASTEROID_RADIUS_UNITS * (0.18 + r(2) * 0.22),
    tumble_axis: calculateRandomAxis(seed + 9.1),
    tumble_speed_deg_s: TUMBLE_MIN_DEG_S + r(4) * (TUMBLE_MAX_DEG_S - TUMBLE_MIN_DEG_S) * 1.5,
  };
}
