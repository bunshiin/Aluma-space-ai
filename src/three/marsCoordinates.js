// Mars yüzeyi koordinat altyapısı: (latitude_deg, longitude_deg) → model uzayında nokta ve normal.
// THREE'ye bağımlı değil; düz { x, y, z } döner, testte gerçek model UV'leriyle doğrulanır.
import { MARS_RADIUS_KM } from '../physics/spacePhysics.js';
import { calculateRadFromDeg } from './solarSystemConfig.js';

const RAD_TO_DEG = 180 / Math.PI;
const METERS_PER_KM = 1000;

// mars.glb kalibrasyonu (docs/models.md, "Mars koordinat çerçevesi"): normalize edilmiş modelde
// kuzey kutbu +Y, boylam 0° +X, doğu (+90°) −Z. Doku dikeyde ters gömülü: v = 0.5 + enlem/180.

/**
 * Rover iniş noktaları (gezegen merkezli enlem, doğu boylamı, derece, krater/bölge adı ve 3D model yolu).
 * Bilinmeyen id JEZERO'ya düşer.
 */
export const MARS_SITES = {
  JEZERO: {
    id: 'JEZERO',
    crater_name: 'Jezero Crater',
    rover_id: 'PERSEVERANCE',
    model_url: '/public/models/perseverance.glb',
    latitude_deg: 18.38,
    longitude_deg: 77.58,
  },
  GALE: {
    id: 'GALE',
    crater_name: 'Gale Crater',
    rover_id: 'CURIOSITY',
    model_url: '/public/models/curiosity.glb',
    latitude_deg: -4.5895,
    longitude_deg: 137.4417,
  },
  ARES_VALLIS: {
    id: 'ARES_VALLIS',
    crater_name: 'Ares Vallis',
    rover_id: 'PATHFINDER',
    model_url: '/public/models/pathfinder.glb',
    latitude_deg: 19.13,
    longitude_deg: -33.22,
  },
  MERIDIANI: {
    id: 'MERIDIANI',
    crater_name: 'Meridiani Planum',
    rover_id: 'OPPORTUNITY',
    model_url: '/public/models/perseverance.glb',
    latitude_deg: -1.9462,
    longitude_deg: -5.5266,
  },
  GUSEV: {
    id: 'GUSEV',
    crater_name: 'Gusev Crater',
    rover_id: 'SPIRIT',
    model_url: '/public/models/perseverance.glb',
    latitude_deg: -14.5684,
    longitude_deg: 175.4726,
  },
  UTOPIA: {
    id: 'UTOPIA',
    crater_name: 'Utopia Planitia',
    rover_id: 'ZHURONG',
    model_url: '/public/models/perseverance.glb',
    latitude_deg: 25.066,
    longitude_deg: 109.925,
  },
};

// 3D modeli mevcut olan aktif Mars yüzey rover bölgeleri
export const MARS_ROVER_SITE_IDS = ['JEZERO', 'GALE', 'ARES_VALLIS'];

const DEFAULT_SITE_ID = 'JEZERO';

const SITE_ALIASES = {
  JEZERO_CRATER: 'JEZERO',
  INGENUITY: 'JEZERO',
  MARS_HELICOPTER: 'JEZERO',
  HELICOPTER: 'JEZERO',
  GALE_CRATER: 'GALE',
  BRADBURY: 'GALE',
  MSL: 'GALE',
  ARES: 'ARES_VALLIS',
  ARES_VALLIS_CRATER: 'ARES_VALLIS',
  MARS_PATHFINDER: 'ARES_VALLIS',
  SOJOURNER: 'ARES_VALLIS',
  CARL_SAGAN_STATION: 'ARES_VALLIS',
};

/**
 * Site, krater adı ya da rover kimliğiyle ("GALE", "CURIOSITY", "PATHFINDER", "ARES_VALLIS") iniş noktasını döner.
 */
export function getMarsSite(siteOrRoverId) {
  if (typeof siteOrRoverId === 'string' && siteOrRoverId.trim()) {
    const normalized = siteOrRoverId.trim().toUpperCase().replace(/\s+/g, '_');
    const resolvedKey = SITE_ALIASES[normalized] || normalized;
    if (Object.hasOwn(MARS_SITES, resolvedKey)) {
      return MARS_SITES[resolvedKey];
    }
    const byRoverOrCrater = Object.values(MARS_SITES).find(
      (site) =>
        site.rover_id === resolvedKey ||
        site.crater_name.toUpperCase().replace(/\s+/g, '_') === resolvedKey
    );
    if (byRoverOrCrater) {
      return byRoverOrCrater;
    }
  }
  return MARS_SITES[DEFAULT_SITE_ID];
}

function calculateSafeLatitude_deg(latitude_deg) {
  if (typeof latitude_deg !== 'number' || !Number.isFinite(latitude_deg)) {
    return 0;
  }
  return Math.max(-90, Math.min(90, latitude_deg));
}

/**
 * Boylamı (−180, 180] aralığına sarar; 360° doğu yazımı (354.47) ile −5.53 aynı noktaya gider.
 */
export function calculateWrappedLongitude_deg(longitude_deg) {
  if (typeof longitude_deg !== 'number' || !Number.isFinite(longitude_deg)) {
    return 0;
  }
  const wrapped = ((((longitude_deg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * Enlem/boylamdan Mars model uzayında birim yön (aynı zamanda yüzey normali).
 */
export function calculateMarsSurfaceDirection(latitude_deg, longitude_deg) {
  const lat_rad = calculateRadFromDeg(calculateSafeLatitude_deg(latitude_deg));
  const lon_rad = calculateRadFromDeg(calculateWrappedLongitude_deg(longitude_deg));
  const cosLat = Math.cos(lat_rad);
  return {
    x: cosLat * Math.cos(lon_rad),
    y: Math.sin(lat_rad),
    z: -cosLat * Math.sin(lon_rad),
  };
}

/**
 * Mars model uzayındaki bir yöne açısal olarak en yakın 3D rover iniş bölgesini (JEZERO, GALE, ARES_VALLIS) döner.
 */
export function getClosestMarsRoverSite(direction) {
  const len = Math.hypot(direction?.x || 0, direction?.y || 0, direction?.z || 0);
  if (!len) {
    return MARS_SITES[DEFAULT_SITE_ID];
  }
  const dx = direction.x / len;
  const dy = direction.y / len;
  const dz = direction.z / len;
  let bestSite = MARS_SITES[DEFAULT_SITE_ID];
  let bestDot = -Infinity;
  for (const id of MARS_ROVER_SITE_IDS) {
    const site = MARS_SITES[id];
    const normal = calculateMarsSurfaceDirection(site.latitude_deg, site.longitude_deg);
    const dot = dx * normal.x + dy * normal.y + dz * normal.z;
    if (dot > bestDot) {
      bestDot = dot;
      bestSite = site;
    }
  }
  return bestSite;
}

/**
 * Enlem/boylamdaki yüzey noktası ve normali. radius_units modelin sahnedeki yarıçapıdır.
 */
export function calculateMarsSurfacePoint(latitude_deg, longitude_deg, radius_units) {
  const normal = calculateMarsSurfaceDirection(latitude_deg, longitude_deg);
  const r = typeof radius_units === 'number' && Number.isFinite(radius_units) && radius_units > 0 ? radius_units : 1;
  return {
    position: { x: normal.x * r, y: normal.y * r, z: normal.z * r },
    normal,
  };
}

/**
 * Yüzey noktasındaki yerel çerçeve: normal (yukarı), east (doğu), north (kuzey).
 */
export function calculateMarsSurfaceFrame(latitude_deg, longitude_deg) {
  const normal = calculateMarsSurfaceDirection(latitude_deg, longitude_deg);
  const lon_rad = calculateRadFromDeg(calculateWrappedLongitude_deg(longitude_deg));
  const is_pole = Math.abs(calculateSafeLatitude_deg(latitude_deg)) > 89.999;
  const east = is_pole ? { x: 0, y: 0, z: -1 } : { x: -Math.sin(lon_rad), y: 0, z: -Math.cos(lon_rad) };
  const north = {
    x: normal.y * east.z - normal.z * east.y,
    y: normal.z * east.x - normal.x * east.z,
    z: normal.x * east.y - normal.y * east.x,
  };
  return { normal, east, north };
}

/**
 * Model uzayındaki yönü enlem/boylama geri çevirir.
 */
export function calculateMarsLatLon(direction) {
  const len = Math.hypot(direction?.x || 0, direction?.y || 0, direction?.z || 0);
  if (!len) {
    return { latitude_deg: 0, longitude_deg: 0 };
  }
  const y = direction.y / len;
  return {
    latitude_deg: Math.asin(Math.max(-1, Math.min(1, y))) * RAD_TO_DEG,
    longitude_deg: calculateWrappedLongitude_deg(Math.atan2(-direction.z, direction.x) * RAD_TO_DEG),
  };
}

/**
 * mars.glb dokusunda enlem/boylamın UV karşılığı (glTF: v = 0 resmin üst satırı).
 */
export function calculateMarsTextureUv(latitude_deg, longitude_deg) {
  return {
    u: (calculateWrappedLongitude_deg(longitude_deg) + 180) / 360,
    v: 0.5 + calculateSafeLatitude_deg(latitude_deg) / 180,
  };
}

/**
 * Yüzey sahnesi 1 birim = 1 metre çalışır; km → yüzey birimi çevirisi yalnızca burada yapılır.
 */
export function calculateSurfaceUnitsFromKm(distance_km) {
  if (typeof distance_km !== 'number' || !Number.isFinite(distance_km)) {
    return 0;
  }
  return distance_km * METERS_PER_KM;
}

/**
 * Bir koordinatın iniş noktasına göre yerel ofseti (yüzey birimi = metre).
 */
export function calculateSiteOffset(site, latitude_deg, longitude_deg) {
  const base = site && typeof site === 'object' ? site : getMarsSite(DEFAULT_SITE_ID);
  const dLat_rad = calculateRadFromDeg(calculateSafeLatitude_deg(latitude_deg) - base.latitude_deg);
  const dLon_deg = calculateWrappedLongitude_deg(calculateWrappedLongitude_deg(longitude_deg) - base.longitude_deg);
  const cosLat = Math.cos(calculateRadFromDeg(base.latitude_deg));
  return {
    east_units: calculateSurfaceUnitsFromKm(calculateRadFromDeg(dLon_deg) * cosLat * MARS_RADIUS_KM),
    north_units: calculateSurfaceUnitsFromKm(dLat_rad * MARS_RADIUS_KM),
  };
}
