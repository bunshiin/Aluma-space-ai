/**
 * @file neoClient.js
 * @description NASA NeoWs (Near-Earth Objects) istemcisi: canlı yakın geçiş akışı,
 * tarihsel en güncel N asteroit seçimi ve kayıtlı en büyük asteroit sorguları.
 */

export const FALLBACK_NEO_DATA = [
  { name: '433 Eros', distance_km: 26700000, velocity_kmh: 84600, is_hazardous: false },
  { name: '99942 Apophis', distance_km: 31000, velocity_kmh: 107000, is_hazardous: true },
  { name: '101955 Bennu', distance_km: 480000, velocity_kmh: 101000, is_hazardous: true },
];

const FALLBACK_DETAILED_NEO = [
  {
    name: '99942 Apophis',
    close_approach_utc: '2026-11-14T19:40:00Z',
    distance_km: 31000,
    velocity_kmh: 107000,
    is_hazardous: true,
    diameter_km: 0.37,
  },
  {
    name: '101955 Bennu',
    close_approach_utc: '2026-11-14T15:10:00Z',
    distance_km: 480000,
    velocity_kmh: 101000,
    is_hazardous: true,
    diameter_km: 0.56,
  },
  {
    name: '2024 BX1',
    close_approach_utc: '2026-11-14T09:15:00Z',
    distance_km: 450000,
    velocity_kmh: 54000,
    is_hazardous: false,
    diameter_km: 0.01,
  },
  {
    name: '1036 Ganymed (A924 UB)',
    close_approach_utc: '2024-10-13T01:56:00Z',
    distance_km: 55964000,
    velocity_kmh: 63200,
    is_hazardous: false,
    diameter_km: 38.5,
  },
];

/**
 * Varsayılan sözleşme formatı: sadece 4 temel alanı döndürür.
 */
export function filterNeoData(rawJson) {
  const nearEarthObjects = rawJson?.near_earth_objects;
  if (!nearEarthObjects || typeof nearEarthObjects !== 'object') return FALLBACK_NEO_DATA;

  const allAsteroids = Array.isArray(nearEarthObjects)
    ? nearEarthObjects
    : Object.values(nearEarthObjects).flat();
  if (allAsteroids.length === 0) return FALLBACK_NEO_DATA;

  return allAsteroids.map((item) => {
    const approach = item.close_approach_data?.[0] || {};
    return {
      name: String(item.name || 'Bilinmeyen Asteroit'),
      distance_km: parseFloat(approach.miss_distance?.kilometers) || 0,
      velocity_kmh: parseFloat(approach.relative_velocity?.kilometers_per_hour) || 0,
      is_hazardous: Boolean(item.is_potentially_hazardous_asteroid),
    };
  });
}

function parseApproachEpochMs(approach) {
  if (!approach || typeof approach !== 'object') return 0;
  if (typeof approach.epoch_date_close_approach === 'number' && Number.isFinite(approach.epoch_date_close_approach)) {
    return approach.epoch_date_close_approach;
  }
  if (typeof approach.close_approach_date_full === 'string' && approach.close_approach_date_full) {
    const parsed = Date.parse(`${approach.close_approach_date_full} UTC`);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof approach.close_approach_date === 'string' && approach.close_approach_date) {
    const parsed = Date.parse(`${approach.close_approach_date}T00:00:00Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pickRelevantApproach(approaches) {
  if (!Array.isArray(approaches) || approaches.length === 0) return null;
  const earthOnly = approaches.filter((a) => !a.orbiting_body || a.orbiting_body === 'Earth');
  const pool = earthOnly.length > 0 ? earthOnly : approaches;
  if (pool.length === 1) return pool[0];

  const nowMs = Date.now();
  let best = pool[0];
  let bestDiff = Math.abs(parseApproachEpochMs(best) - nowMs);
  for (let i = 1; i < pool.length; i += 1) {
    const diff = Math.abs(parseApproachEpochMs(pool[i]) - nowMs);
    if (diff < bestDiff) {
      best = pool[i];
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * NASA NeoWs feed veya browse yanıtını tarih ve çap bilgisiyle ayrıştırıp en güncel tarihe göre sıralar.
 */
export function extractDetailedNeoList(rawJson) {
  const neo = rawJson?.near_earth_objects;
  const rawItems = Array.isArray(neo)
    ? neo
    : neo && typeof neo === 'object'
      ? Object.values(neo).flat()
      : [];

  if (rawItems.length === 0) return [];

  const mapped = rawItems.map((item) => {
    const approach = pickRelevantApproach(item.close_approach_data);
    const epoch_ms = parseApproachEpochMs(approach);
    const utc = epoch_ms > 0
      ? new Date(epoch_ms).toISOString()
      : String(approach?.close_approach_date_full || approach?.close_approach_date || '');
    const estKm = item.estimated_diameter?.kilometers;
    const diameter_km = Number(estKm?.estimated_diameter_max) || Number(estKm?.estimated_diameter_min) || 0;
    const distKm = parseFloat(approach?.miss_distance?.kilometers);
    const velKmh = parseFloat(approach?.relative_velocity?.kilometers_per_hour);

    return {
      name: String(item.name || 'Bilinmeyen Asteroit'),
      close_approach_utc: utc,
      epoch_ms,
      distance_km: Number.isFinite(distKm) && distKm > 0 ? distKm : (approach ? 0 : 26700000),
      velocity_kmh: Number.isFinite(velKmh) ? velKmh : 0,
      is_hazardous: Boolean(item.is_potentially_hazardous_asteroid),
      diameter_km,
    };
  });

  mapped.sort((a, b) => b.epoch_ms - a.epoch_ms);
  return mapped;
}

function stripInternalNeoFields(list) {
  return list.map(({ epoch_ms, ...publicFields }) => publicFields);
}

async function getDetailedFeedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache) {
  const cacheKey = 'ag_cache_neo_detailed_feed';
  let detailed = readFromCache(cacheKey);
  if (!detailed) {
    try {
      const apiKey = getNasaApiKey();
      const rawData = await fetchWithTimeout(`https://api.nasa.gov/neo/rest/v1/feed?api_key=${encodeURIComponent(apiKey)}`);
      detailed = extractDetailedNeoList(rawData);
      if (detailed.length > 0) writeToCache(cacheKey, detailed);
    } catch (err) {
      console.warn('[DataLayer] NeoWs detaylı feed başarısız, yedek veriye geçiliyor:', err.message);
      detailed = [];
    }
  }
  return detailed && detailed.length > 0 ? detailed : FALLBACK_DETAILED_NEO;
}

async function getLargestRecordedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache, count) {
  const cacheKey = 'ag_cache_neo_largest_browse';
  let browseList = readFromCache(cacheKey);

  if (!browseList) {
    try {
      const apiKey = getNasaApiKey();
      const browseUrl = `https://api.nasa.gov/neo/rest/v1/neo/browse?page=0&size=20&api_key=${encodeURIComponent(apiKey)}`;
      const rawBrowse = await fetchWithTimeout(browseUrl);
      browseList = extractDetailedNeoList(rawBrowse);
      if (browseList.length > 0) writeToCache(cacheKey, browseList);
    } catch (err) {
      console.warn('[DataLayer] NeoWs Browse API başarısız, feed/yedek kontrol ediliyor:', err.message);
      browseList = [];
    }
  }

  const feedList = await getDetailedFeedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache);
  const combined = [...(browseList || []), ...feedList];
  const byName = new Map();
  for (const item of combined) {
    const existing = byName.get(item.name);
    if (!existing || item.diameter_km > existing.diameter_km) {
      byName.set(item.name, item);
    }
  }

  const sorted = Array.from(byName.values()).sort((a, b) => (b.diameter_km || 0) - (a.diameter_km || 0));
  return stripInternalNeoFields(sorted.slice(0, count));
}

/**
 * Identifier'a göre standart, en güncel N adet, tehlikeli veya kayıtlı en büyük asteroitleri döner.
 */
export async function fetchNeoWsData(identifier, fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache) {
  const cleanId = String(identifier || '').trim().toLowerCase();

  const largestMatch = /^(?:largest|biggest)(?::(\d+))?$/.exec(cleanId);
  if (largestMatch) {
    const count = Math.max(1, Math.min(Number(largestMatch[1] || 1), 10));
    return await getLargestRecordedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache, count);
  }

  const latestMatch = /^(latest|recent)(?::(\d+))?$/.exec(cleanId);
  if (latestMatch) {
    const defaultCount = latestMatch[1] === 'recent' ? 3 : 1;
    const count = Math.max(1, Math.min(Number(latestMatch[2] || defaultCount), 40));
    const detailed = await getDetailedFeedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache);
    const sorted = [...detailed].sort(
      (a, b) => (b.epoch_ms ?? (Date.parse(b.close_approach_utc || '') || 0)) - (a.epoch_ms ?? (Date.parse(a.close_approach_utc || '') || 0))
    );
    return stripInternalNeoFields(sorted.slice(0, count));
  }

  if (cleanId === 'hazardous') {
    const detailed = await getDetailedFeedList(fetchWithTimeout, getNasaApiKey, readFromCache, writeToCache);
    const hazards = detailed.filter((item) => item.is_hazardous);
    const chosen = hazards.length > 0 ? hazards : detailed.slice(0, 3);
    return stripInternalNeoFields(chosen);
  }

  const cacheKey = 'ag_cache_neo_default';
  let list = readFromCache(cacheKey);
  if (!list) {
    try {
      const apiKey = getNasaApiKey();
      const url = `https://api.nasa.gov/neo/rest/v1/feed?api_key=${encodeURIComponent(apiKey)}`;
      const rawData = await fetchWithTimeout(url);
      list = filterNeoData(rawData);
      writeToCache(cacheKey, list);
    } catch (err) {
      console.warn('[DataLayer] NeoWs API çağrısı başarısız, yedek veriye geçiliyor:', err.message);
      list = FALLBACK_NEO_DATA;
    }
  }

  if (!cleanId || cleanId === 'default' || cleanId === 'all' || cleanId === 'today') {
    return list;
  }
  return list.filter((item) => item.name.toLowerCase().includes(cleanId));
}
