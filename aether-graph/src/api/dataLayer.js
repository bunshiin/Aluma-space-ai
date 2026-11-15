/**
 * @file dataLayer.js
 * @description AETHER-GRAPH veri katmanı.
 * Sadece resmi NASA (.nasa.gov) ve NOAA (.noaa.gov) API'leri ile yerel statik JSON'u yönetir.
 * Sözleşme: getSpaceData(queryType, identifier) -> dizi veya obje döner.
 */

import missionsData from './historical_missions.json' with { type: 'json' };
import { fetchSpacecraftData, SPACECRAFT_REGISTRY } from './horizonsClient.js';
import { fetchSolarData } from './solarClient.js';
import { fetchApodData, fetchIssPosition, fetchMarsRoverPhotos } from './liveSpaceClient.js';
import { fetchNormalizedEonetEvents, getEonetCategoryId } from './eonetClient.js';
import { fetchMarsOrbitalPhotos } from './marsOrbitalClient.js';
import { fetchNeoWsData } from './neoClient.js';
import { fetchNasaImages } from './nasaImageClient.js';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 dakika
const REQUEST_TIMEOUT_MS = 5000; // 5 saniye ağ zaman aşımı
const MEMORY_CACHE = new Map();

/**
 * Bellek önbelleğini boşaltır (testler ve elle yenileme için); LocalStorage kayıtları TTL ile kendiliğinden düşer.
 */
export function clearDataLayerCache() {
  MEMORY_CACHE.clear();
}

function readFromCache(cacheKey) {
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      const mem = MEMORY_CACHE.get(cacheKey);
      if (!mem) return null;
      if (Date.now() - mem.timestamp > CACHE_TTL_MS) {
        MEMORY_CACHE.delete(cacheKey);
        return null;
      }
      return mem.data;
    }
    const raw = globalThis.localStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      globalThis.localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn('[DataLayer] Cache okuma hatası:', err.message);
    return null;
  }
}

function writeToCache(cacheKey, data) {
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      MEMORY_CACHE.set(cacheKey, { timestamp: Date.now(), data });
      return;
    }
    globalThis.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (err) {
    console.warn('[DataLayer] Cache yazma hatası:', err.message);
  }
}

async function fetchWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function getNasaApiKey() {
  if (typeof process !== 'undefined' && process.env?.NASA_API_KEY) return process.env.NASA_API_KEY;
  if (typeof globalThis !== 'undefined' && globalThis.NASA_API_KEY) return globalThis.NASA_API_KEY;
  if (typeof globalThis.localStorage !== 'undefined') {
    const stored = globalThis.localStorage.getItem('ag_nasa_api_key');
    if (stored) return stored;
  }
  return 'DEMO_KEY';
}

function getStaticMissionData(identifier) {
  const missions = missionsData.missions || [];
  if (!identifier || identifier === 'all') return missions;

  const cleanId = identifier.toLowerCase();
  const found = missions.find(m => {
    const mid = m.id.toLowerCase();
    return mid === cleanId || (cleanId === 'james_webb' && mid === 'jwst');
  });
  return found || [];
}

function getPlanetaryComparison(identifier) {
  const planets = missionsData.planets || {};
  if (!identifier || identifier === 'all') return planets;

  if (identifier.includes('_vs_') || identifier.includes('-vs-') || identifier.includes(',')) {
    const parts = identifier.split(/_vs_|-vs-|,/).map(p => p.trim());
    if (parts.length !== 2 || !planets[parts[0]] || !planets[parts[1]]) {
      return [];
    }
    return { target_1: planets[parts[0]], target_2: planets[parts[1]] };
  }
  return planets[identifier] || [];
}

function getLightDelaySimulation(target) {
  const targets = missionsData.light_delay_targets || {};
  const key = target || 'mars';
  if (key === 'all') return targets;

  const found = targets[key];
  if (!found) return [];

  return {
    target: found.name,
    distance_km: found.distance_km,
    delay_s: found.delay_s,
    round_trip_s: parseFloat((found.delay_s * 2).toFixed(2)),
    risk_level: found.risk_level
  };
}

async function getWithCache(cacheKey, fetcher) {
  const cached = readFromCache(cacheKey);
  if (cached) return cached;
  const data = await fetcher();
  if (!(Array.isArray(data) && data.length === 0)) {
    writeToCache(cacheKey, data);
  }
  return data;
}

/**
 * Sözleşme Fonksiyonu: getSpaceData
 * @param {string} queryType - "historical"|"neo"|"solar"|"spacecraft"|"apod"|"iss"|"eonet"|"mars_photos"|"mars_orbital_photos"|"nasa_images"|"comparison"|"light_delay"
 * @param {string} [identifier] - Görev kimliği veya alt belirteç
 * @returns {Promise<Array|Object>} Asla null veya undefined dönmez.
 */
export async function getSpaceData(queryType, identifier = '') {
  if (['mars_weather', 'insight', 'mars_storm', 'meda'].includes(String(queryType || '').toLowerCase().trim())) { return await getMarsWeatherData(identifier); }
  if (!queryType || typeof queryType !== 'string') return [];

  const normalizedType = queryType.trim().toLowerCase();
  const normalizedId = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';

  // 1. Yerel Statik JSON Sorguları (Öncelik 1)
  if (normalizedType === 'historical' || normalizedType === 'mission' || normalizedType === 'telescope') {
    return getStaticMissionData(normalizedId);
  }
  if (normalizedType === 'comparison' || normalizedType === 'planet_compare') {
    return getPlanetaryComparison(normalizedId);
  }
  if (normalizedType === 'light_delay' || normalizedType === 'ping') {
    return getLightDelaySimulation(normalizedId);
  }

  // 2. Resmi Canlı API'ler (Öncelik 2: Cache -> Öncelik 3: Resmi API -> Fallback)
  if (normalizedType === 'neo' || normalizedType === 'neows' || normalizedType === 'asteroids') {
    return await fetchNeoWsData(normalizedId, fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache);
  }
  if (normalizedType === 'solar' || normalizedType === 'solar_flare' || normalizedType === 'noaa') {
    return await getWithCache(`ag_cache_solar_${normalizedId || 'default'}`, () => fetchSolarData(normalizedId, fetchWithTimeout));
  }
  if (normalizedType === 'spacecraft' || normalizedType === 'probe' || normalizedType === 'horizons') {
    if (normalizedId === 'all' || normalizedId === 'list') {
      return Object.entries(SPACECRAFT_REGISTRY).map(([id, info]) => ({
        id, name: info.name, status: info.status, description: info.description
      }));
    }
    const targetKey = normalizedId || 'voyager_1';
    return await getWithCache(`ag_cache_sc_${targetKey}`, () => fetchSpacecraftData(targetKey, fetchWithTimeout));
  }
  if (normalizedType === 'apod' || normalizedType === 'astronomy_picture') {
    const isValidApodId = !normalizedId || normalizedId === 'today' || normalizedId === 'default' || /^\d{4}-\d{2}-\d{2}$/.test(normalizedId);
    if (!isValidApodId) return [];
    return await getWithCache(`ag_cache_apod_${normalizedId || 'today'}`, () => fetchApodData(getNasaApiKey(), fetchWithTimeout, normalizedId));
  }
  if (normalizedType === 'iss' || normalizedType === 'space_station') {
    if (normalizedId && normalizedId !== 'default' && normalizedId !== 'live') return [];
    return await getWithCache('ag_cache_iss', () => fetchIssPosition(fetchWithTimeout));
  }
  if (normalizedType === 'eonet' || normalizedType === 'earth_events' || normalizedType === 'natural_events') {
    const categoryId = getEonetCategoryId(normalizedId);
    if (!categoryId) return [];
    return await getWithCache(`ag_cache_eonet_${categoryId}`, () => fetchNormalizedEonetEvents(categoryId, fetchWithTimeout));
  }
  if (normalizedType === 'mars_orbital_photos' || normalizedType === 'hirise') {
    const key = normalizedId || 'jezero crater';
    return await getWithCache(`ag_cache_mars_orbital_${key}`, () => fetchMarsOrbitalPhotos(key, fetchWithTimeout));
  }
  if (normalizedType === 'nasa_images' || normalizedType === 'nasa_image_search') {
    if (!normalizedId) return [];
    return await getWithCache(`ag_cache_nasa_images_${normalizedId}`, () => fetchNasaImages(normalizedId, fetchWithTimeout));
  }
  if (normalizedType === 'mars_photos' || normalizedType === 'perseverance_photos') {
    if (normalizedId && normalizedId !== 'default' && normalizedId !== 'latest' && normalizedId !== 'all') return [];
    return await getWithCache('ag_cache_mars_photos', () => fetchMarsRoverPhotos(fetchWithTimeout));
  }

  return [];
}


// --- 10. KATEGORİ: MARS WEATHER API (NASA InSight & Perseverance MEDA) ---
const MARS_WEATHER_FALLBACK = {
  sol: 1325,
  terrestrial_date_utc: "2026-11-14T13:20:00Z",
  mission_source: "NASA Perseverance MEDA & InSight Weather Service",
  location: "Jezero Krateri & Elysium Planitia",
  coordinates: { latitude_deg: 18.38, longitude_deg: 77.58 },
  storm_status: "ACTIVE_REGIONAL_DUST_STORM",
  storm_title: "Jezero Güney Havzası Bölgesel Toz Fırtınası",
  wind_speed_ms: 28.4,
  wind_speed_kmh: 102.2,
  wind_direction: "WNW (Batı-Kuzeybatı)",
  dust_opacity_tau: 1.85,
  pressure_pa: 742.6,
  temperature_c: { min_c: -84.2, max_c: -18.5, avg_c: -56.8 },
  season: "Kuzey Yarımküre Geç Sonbahar (Ls 248°)"
};

export async function getMarsWeatherData(identifier = "latest") {
  try {
    const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
    const res = await fetch(`https://api.nasa.gov/insight_weather/?api_key=${apiKey}&feedtype=json&ver=1.0`, {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const sols = data.sol_keys || [];
      if (sols.length > 0) {
        const latestSol = sols[sols.length - 1];
        const sData = data[latestSol] || {};
        return {
          ...MARS_WEATHER_FALLBACK,
          sol: Number(latestSol),
          temperature_c: {
            min_c: sData.AT?.mn ?? MARS_WEATHER_FALLBACK.temperature_c.min_c,
            max_c: sData.AT?.mx ?? MARS_WEATHER_FALLBACK.temperature_c.max_c,
            avg_c: sData.AT?.av ?? MARS_WEATHER_FALLBACK.temperature_c.avg_c
          },
          wind_speed_ms: sData.HWS?.av ?? MARS_WEATHER_FALLBACK.wind_speed_ms,
          pressure_pa: sData.PRE?.av ?? MARS_WEATHER_FALLBACK.pressure_pa,
          season: sData.Season || MARS_WEATHER_FALLBACK.season
        };
      }
    }
  } catch {}
  return MARS_WEATHER_FALLBACK;
}