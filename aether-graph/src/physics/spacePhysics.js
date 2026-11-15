// AETHER-GRAPH uzay fiziği sabitleri ve saf hesaplama motoru (km, m, kg, sn). Güneş konumu: solarPosition.js

export const SPEED_OF_LIGHT_KMS = 299792.458;
export const EARTH_RADIUS_KM = 6371;
export const EARTH_MOON_DISTANCE_KM = 384400;
export const MARS_RADIUS_KM = 3389.5; // ortalama yarıçap; yüzeyde enlem/boylam → metre dönüşümü için
export const J2000_JULIAN_DAY = 2451545.0;
export const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
export const MS_PER_DAY = 86400000;

// Güneş merkezli ortalama yörünge yarıçapları (km)
export const ORBIT_RADIUS_KM = {
  SUN: 0, MERCURY: 57909050, VENUS: 108208000, EARTH: 149597871, MARS: 227939200,
  JUPITER: 778479000, SATURN: 1433530000, URANUS: 2870972000, NEPTUNE: 4498400000,
  CERES: 413700000, PLUTO: 5906380000, HAUMEA: 6452000000, MAKEMAKE: 6850000000, ERIS: 10125000000
};

// Yüzey yerçekimi ivmeleri (m/s^2)
export const PLANET_GRAVITY_MS2 = {
  SUN: 274, MERCURY: 3.7, VENUS: 8.87, EARTH: 9.80665, MOON: 1.62, MARS: 3.72,
  JUPITER: 24.79, SATURN: 10.44, URANUS: 8.69, NEPTUNE: 11.15,
  // Uydular ve cüce gezegenler: listede olmasalar Dünya değerine düşüp kıyası bozarlardı
  IO: 1.796, EUROPA: 1.314, GANYMEDE: 1.428, CALLISTO: 1.235, TITAN: 1.352, TRITON: 0.779,
  CERES: 0.28, PLUTO: 0.62, HAUMEA: 0.401, MAKEMAKE: 0.57, ERIS: 0.82
};

// Ortalama yarıçaplar (km); basık Haumea için eşdeğer küre yarıçapı
export const BODY_RADIUS_KM = {
  SUN: 695700, MERCURY: 2439.7, VENUS: 6051.8, EARTH: EARTH_RADIUS_KM, MOON: 1737.4, MARS: 3389.5,
  JUPITER: 69911, SATURN: 58232, URANUS: 25362, NEPTUNE: 24622,
  IO: 1821.6, EUROPA: 1560.8, GANYMEDE: 2634.1, CALLISTO: 2410.3, TITAN: 2574.7, TRITON: 1353.4,
  CERES: 469.7, PLUTO: 1188.3, HAUMEA: 780, MAKEMAKE: 715, ERIS: 1163
};

// Güneş etrafındaki yörünge süreleri (Dünya günü)
export const ORBITAL_PERIOD_DAYS = {
  MERCURY: 87.97, VENUS: 224.7, EARTH: 365.25, MARS: 686.98,
  JUPITER: 4332.59, SATURN: 10759.22, URANUS: 30688.5, NEPTUNE: 60182,
  CERES: 1680, PLUTO: 90560, HAUMEA: 103410, MAKEMAKE: 111845, ERIS: 203830
};

// Uydunun Güneş etrafındaki yılı ve merkez mesafesi bağlı olduğu gezegene göre çözülür
const SATELLITE_PARENT = {
  MOON: 'EARTH', IO: 'JUPITER', EUROPA: 'JUPITER', GANYMEDE: 'JUPITER', CALLISTO: 'JUPITER', TITAN: 'SATURN', TRITON: 'NEPTUNE'
};
const SATELLITE_DISTANCE_KM = {
  MOON: EARTH_MOON_DISTANCE_KM, IO: 421700, EUROPA: 671100, GANYMEDE: 1070400, CALLISTO: 1882700, TITAN: 1221870, TRITON: 354759
};

const SCENE_SCALE_PER_KM = 1e-6; // Km -> Three.js sahne birimi çarpanı tek yerde tutulur

function resolveBodyKey(name) {
  return typeof name === 'string' ? name.trim().toUpperCase() : '';
}

function resolveGravity_ms2(targetOrGravity_ms2) {
  if (typeof targetOrGravity_ms2 === 'number' && Number.isFinite(targetOrGravity_ms2) && targetOrGravity_ms2 > 0) {
    return targetOrGravity_ms2;
  }
  const key = resolveBodyKey(targetOrGravity_ms2);
  return PLANET_GRAVITY_MS2[key] || PLANET_GRAVITY_MS2.EARTH;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Yarıçap tablosunda olmayan cisim kıyaslanamaz; çağıranın verdiği varsayılana düşer
function resolveComparisonKey(name, fallbackKey) {
  const key = resolveBodyKey(name);
  return Object.hasOwn(BODY_RADIUS_KM, key) ? key : fallbackKey;
}

function getDistanceBetweenBodies_km(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return 0;
  if (SATELLITE_PARENT[sourceKey] === targetKey) return SATELLITE_DISTANCE_KM[sourceKey] || 0;
  if (SATELLITE_PARENT[targetKey] === sourceKey) return SATELLITE_DISTANCE_KM[targetKey] || 0;
  if (SATELLITE_PARENT[sourceKey] && SATELLITE_PARENT[sourceKey] === SATELLITE_PARENT[targetKey]) {
    return Math.abs((SATELLITE_DISTANCE_KM[targetKey] || 0) - (SATELLITE_DISTANCE_KM[sourceKey] || 0));
  }
  const srcRadius = ORBIT_RADIUS_KM[SATELLITE_PARENT[sourceKey] || sourceKey];
  const tgtRadius = ORBIT_RADIUS_KM[SATELLITE_PARENT[targetKey] || targetKey];
  return typeof srcRadius === 'number' && typeof tgtRadius === 'number' ? Math.abs(tgtRadius - srcRadius) : 0;
}

/**
 * İki gök cismi arasındaki ışık gecikmesini hesaplar.
 * @param {string} source - Kaynak gök cismi
 * @param {string} target - Hedef gök cismi
 * @param {'one-way'|'round-trip'} [mode='one-way'] - Hesaplama modu
 * @returns {{ delay_s: number, round_trip_s: number }}
 */
export function calculateLightDelay(source, target, mode = 'one-way') {
  const srcKey = resolveBodyKey(source);
  const tgtKey = resolveBodyKey(target);
  const distance_km = getDistanceBetweenBodies_km(srcKey, tgtKey);

  const oneWay_s = distance_km / SPEED_OF_LIGHT_KMS;
  const roundTripRaw_s = oneWay_s * 2;
  const selectedDelay_s = mode === 'round-trip' ? roundTripRaw_s : oneWay_s;

  return {
    delay_s: Number(selectedDelay_s.toFixed(2)),
    round_trip_s: Number(roundTripRaw_s.toFixed(2))
  };
}

/**
 * Serbest düşme süresini hesaplar: T = sqrt(2H / g)
 */
export function calculateFallTime(height_m, targetOrGravity_ms2 = 'EARTH') {
  if (typeof height_m !== 'number' || !Number.isFinite(height_m) || height_m <= 0) {
    return 0;
  }
  const gravity_ms2 = resolveGravity_ms2(targetOrGravity_ms2);
  return Number(Math.sqrt((2 * height_m) / gravity_ms2).toFixed(4));
}

/**
 * Serbest düşmede yere çarpma hızını hesaplar: v = sqrt(2gH) (m/sn)
 */
export function calculateImpactSpeed(height_m, targetOrGravity_ms2 = 'EARTH') {
  if (typeof height_m !== 'number' || !Number.isFinite(height_m) || height_m <= 0) {
    return 0;
  }
  const gravity_ms2 = resolveGravity_ms2(targetOrGravity_ms2);
  return Number(Math.sqrt(2 * gravity_ms2 * height_m).toFixed(4));
}

/**
 * Serbest düşmede t anında yere kalan yükseklik (m): H - g·t²/2, yere değince 0.
 */
export function calculateFallRemainingHeight(height_m, elapsed_s, targetOrGravity_ms2 = 'EARTH') {
  if (!isPositiveNumber(height_m)) return 0;
  if (!isPositiveNumber(elapsed_s)) return height_m;
  const gravity_ms2 = resolveGravity_ms2(targetOrGravity_ms2);
  return Math.max(0, height_m - 0.5 * gravity_ms2 * elapsed_s * elapsed_s);
}

/**
 * Kullanıcının hedef gök cismindeki eşdeğer ağırlığını (kg) hesaplar.
 */
export function calculatePlanetWeight(mass_kg, target = 'EARTH') {
  if (typeof mass_kg !== 'number' || !Number.isFinite(mass_kg) || mass_kg <= 0) {
    return 0;
  }
  const gravity_ms2 = resolveGravity_ms2(target);
  return Number((mass_kg * (gravity_ms2 / PLANET_GRAVITY_MS2.EARTH)).toFixed(2));
}

/**
 * İki gök cisminin yerçekimini kıyaslar; Gemini/UI'dan kütle (`mass_kg`) veya yükseklik (`height_m`)
 * gelirse sadece o zaman ağırlık ve düşme süresi alanlarını sonuca ekler.
 * @param {string} [source='EARTH'] - Kaynak gök cismi
 * @param {string} [target='MARS'] - Hedef gök cismi
 * @param {{ mass_kg?: number, height_m?: number }} [options={}] - Opsiyonel kullanıcı parametreleri
 * @returns {Object}
 */
export function calculateGravityComparison(source = 'EARTH', target = 'MARS', options = {}) {
  const srcKey = resolveBodyKey(source) || 'EARTH';
  const tgtKey = resolveBodyKey(target) || 'MARS';
  const srcGravity_ms2 = resolveGravity_ms2(srcKey);
  const tgtGravity_ms2 = resolveGravity_ms2(tgtKey);
  const gravity_ratio = Number((srcGravity_ms2 / tgtGravity_ms2).toFixed(2));

  const result = {
    source: srcKey,
    target: tgtKey,
    source_gravity_ms2: srcGravity_ms2,
    target_gravity_ms2: tgtGravity_ms2,
    gravity_ratio
  };

  const safeOpts = options && typeof options === 'object' ? options : {};
  if (typeof safeOpts.mass_kg === 'number' && Number.isFinite(safeOpts.mass_kg) && safeOpts.mass_kg > 0) {
    result.mass_kg = safeOpts.mass_kg;
    result.source_weight_kg = calculatePlanetWeight(safeOpts.mass_kg, srcKey);
    result.target_weight_kg = calculatePlanetWeight(safeOpts.mass_kg, tgtKey);
  }
  if (typeof safeOpts.height_m === 'number' && Number.isFinite(safeOpts.height_m) && safeOpts.height_m > 0) {
    result.height_m = safeOpts.height_m;
    result.source_fall_time_s = calculateFallTime(safeOpts.height_m, srcKey);
    result.target_fall_time_s = calculateFallTime(safeOpts.height_m, tgtKey);
  }

  return result;
}

/**
 * İki gök cismini boyut ve yerçekimi açısından kıyaslar. Bilinmeyen cisim EARTH / MARS varsayılanına düşer.
 * mass_kg, height_m, age_years verilirse ağırlık, düşme süresi ve yaş alanları eklenir.
 */
export function calculatePlanetComparison(primary_object, secondary_object, options = {}) {
  const primary = resolveComparisonKey(primary_object, 'EARTH');
  const secondary = resolveComparisonKey(secondary_object, 'MARS');
  const opts = options && typeof options === 'object' ? options : {};
  const primaryGravity_ms2 = resolveGravity_ms2(primary);
  const secondaryGravity_ms2 = resolveGravity_ms2(secondary);
  const result = {
    primary_object: primary, secondary_object: secondary,
    primary_radius_km: BODY_RADIUS_KM[primary], secondary_radius_km: BODY_RADIUS_KM[secondary],
    // Güneş/Plüton gibi uç oranlarda ondalık kaybolmasın diye anlamlı basamakla yuvarlanır
    radius_ratio: Number((BODY_RADIUS_KM[primary] / BODY_RADIUS_KM[secondary]).toPrecision(6)),
    primary_gravity_ms2: primaryGravity_ms2, secondary_gravity_ms2: secondaryGravity_ms2,
    gravity_ratio: Number((primaryGravity_ms2 / secondaryGravity_ms2).toPrecision(6)),
    distance_km: getDistanceBetweenBodies_km(primary, secondary)
  };
  if (isPositiveNumber(opts.mass_kg)) {
    result.mass_kg = opts.mass_kg;
    result.primary_weight_kg = calculatePlanetWeight(opts.mass_kg, primary);
    result.secondary_weight_kg = calculatePlanetWeight(opts.mass_kg, secondary);
  }
  if (isPositiveNumber(opts.height_m)) {
    result.height_m = opts.height_m;
    result.primary_fall_time_s = calculateFallTime(opts.height_m, primary);
    result.secondary_fall_time_s = calculateFallTime(opts.height_m, secondary);
  }
  if (isPositiveNumber(opts.age_years)) {
    result.age_years = opts.age_years;
    result.primary_age_years = calculatePlanetAge(opts.age_years, primary);
    result.secondary_age_years = calculatePlanetAge(opts.age_years, secondary);
  }
  return result;
}

/**
 * Dünya yaşını hedef gezegen yılına çevirir.
 */
export function calculatePlanetAge(age_years, target = 'EARTH') {
  if (typeof age_years !== 'number' || !Number.isFinite(age_years) || age_years <= 0) {
    return 0;
  }
  const bodyKey = resolveBodyKey(target);
  const key = SATELLITE_PARENT[bodyKey] || bodyKey;
  const period_days = ORBITAL_PERIOD_DAYS[key] || ORBITAL_PERIOD_DAYS.EARTH;
  return Number((age_years * (ORBITAL_PERIOD_DAYS.EARTH / period_days)).toFixed(2));
}

/**
 * Güneş patlamasının (CME) verilen hızla Dünya'ya varış süresini (saat) hesaplar.
 */
export function calculateCmeArrival(speed_kms) {
  if (typeof speed_kms !== 'number' || !Number.isFinite(speed_kms) || speed_kms <= 0) {
    return 0;
  }
  const arrival_hours = ORBIT_RADIUS_KM.EARTH / speed_kms / 3600;
  return Number(arrival_hours.toFixed(2));
}

/**
 * Asteroit mesafesini Ay uzaklığı (LD) katı olarak hesaplar.
 */
export function calculateLunarDistanceRatio(distance_km) {
  if (typeof distance_km !== 'number' || !Number.isFinite(distance_km) || distance_km <= 0) {
    return 0;
  }
  return Number((distance_km / EARTH_MOON_DISTANCE_KM).toFixed(2));
}

/**
 * Dairesel alçak yörüngede bir turun kaç dakika sürdüğünü hesaplar.
 */
export function calculateOrbitPeriod(altitude_km, velocity_kmh) {
  if (
    typeof altitude_km !== 'number' || !Number.isFinite(altitude_km) || altitude_km < 0 ||
    typeof velocity_kmh !== 'number' || !Number.isFinite(velocity_kmh) || velocity_kmh <= 0
  ) {
    return 0;
  }
  const orbitCircumference_km = 2 * Math.PI * (EARTH_RADIUS_KM + altitude_km);
  const period_minutes = (orbitCircumference_km / velocity_kmh) * 60;
  return Number(period_minutes.toFixed(2));
}

/**
 * Zaman hızlandırma çarpanını uygular.
 */
export function calculateAcceleratedTime(delta_s, speed_multiplier = 1) {
  if (typeof delta_s !== 'number' || !Number.isFinite(delta_s) || delta_s <= 0) {
    return 0;
  }
  const safeMultiplier =
    typeof speed_multiplier === 'number' && Number.isFinite(speed_multiplier) && speed_multiplier >= 0
      ? speed_multiplier
      : 1;
  return delta_s * safeMultiplier;
}

/**
 * Kilometreyi Three.js sahne birimine çevirir.
 */
export function kmToSceneUnits(distance_km) {
  if (typeof distance_km !== 'number' || !Number.isFinite(distance_km) || distance_km <= 0) {
    return 0;
  }
  return distance_km * SCENE_SCALE_PER_KM;
}
