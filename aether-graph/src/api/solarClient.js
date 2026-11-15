/**
 * @file solarClient.js
 * @description NOAA SWPC Güneş Patlaması (Solar Flare) ve leke koordinatları istemcisi.
 */

export const FALLBACK_SOLAR_DATA = {
  flare_class: 'M2.4',
  begin_time: '2026-11-14T02:15:00Z',
  peak_time: '2026-11-14T02:30:00Z',
  source_region: 'AR3889',
  radiation_level: 'MODERATE',
  coordinates: { latitude_deg: 18, longitude_deg: -77, heliographic_location: 'N18W77' }
};

/**
 * Aktif Güneş bölgelerini (leke koordinatları) çeker.
 */
async function fetchSolarRegionCoordinates(fetchFn) {
  try {
    const url = 'https://services.swpc.noaa.gov/json/solar_regions.json';
    const regions = await fetchFn(url);
    if (Array.isArray(regions) && regions.length > 0) {
      const active = regions[0];
      return {
        latitude_deg: typeof active.latitude === 'number' ? active.latitude : 8,
        longitude_deg: typeof active.longitude === 'number' ? active.longitude : -9,
        heliographic_location: active.location || 'N08W09',
        region_number: active.region || 4573
      };
    }
  } catch (err) {
    // Bölge sorgusu başarısız olursa sessizce varsayılan dön
  }
  return FALLBACK_SOLAR_DATA.coordinates;
}

const VALID_SOLAR_IDENTIFIERS = new Set(['', 'default', 'latest', 'all', 'list', 'recent']);

/**
 * Canlı NOAA Güneş Patlaması (Solar Flare) verisini çeker.
 */
export async function fetchSolarData(identifier = '', fetchFn) {
  const cleanId = String(identifier || '').trim().toLowerCase();
  if (!VALID_SOLAR_IDENTIFIERS.has(cleanId)) {
    return [];
  }

  try {
    const url = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';
    const rawData = await fetchFn(url);

    if (Array.isArray(rawData) && rawData.length > 0) {
      const coords = await fetchSolarRegionCoordinates(fetchFn);

      if (cleanId === 'list' || cleanId === 'recent' || cleanId === 'all') {
        return rawData.slice(-10).reverse().map(item => ({
          flare_class: item.max_class || 'C1.0',
          begin_time: item.begin_time || item.time_tag,
          peak_time: item.max_time || item.time_tag,
          end_time: item.end_time || '',
          radiation_level: item.max_class?.startsWith('X') ? 'HIGH' : item.max_class?.startsWith('M') ? 'MODERATE' : 'LOW',
          coordinates: coords
        }));
      }

      const latest = rawData[rawData.length - 1];
      const flareClass = latest.max_class || 'C1.0';
      return {
        flare_class: flareClass,
        begin_time: latest.begin_time || latest.time_tag || new Date().toISOString(),
        peak_time: latest.max_time || latest.time_tag || new Date().toISOString(),
        end_time: latest.end_time || '',
        source_region: `Region ${coords.region_number || 'Active'}`,
        radiation_level: flareClass.startsWith('X') ? 'HIGH' : flareClass.startsWith('M') ? 'MODERATE' : 'LOW',
        coordinates: coords
      };
    }

    return FALLBACK_SOLAR_DATA;
  } catch (err) {
    console.warn('[DataLayer] NOAA API çağrısı başarısız, yedek veriye geçiliyor:', err.message);
    return FALLBACK_SOLAR_DATA;
  }
}
