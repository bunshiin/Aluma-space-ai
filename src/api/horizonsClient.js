/**
 * @file horizonsClient.js
 * @description NASA JPL Horizons REST API istemcisi.
 * Uzay araçlarının (Voyager, JWST, Parker vb.) anlık 3D konum, mesafe ve ışık gecikmesi verilerini çeker.
 */

const KM_PER_AU = 149597870.7; // 1 Astronomik Birim (AU) = ~149.6 milyon km

export const SPACECRAFT_REGISTRY = {
  voyager_1: {
    command_id: '-31',
    name: 'Voyager 1',
    status: 'Interstellar Space',
    fallback_distance_km: 25892000000,
    fallback_lt_s: 86366,
    fallback_speed_kms: 27.15,
    description: "Yıldızlararası uzaydaki en uzak insan yapımı nesne."
  },
  voyager_2: {
    command_id: '-32',
    name: 'Voyager 2',
    status: 'Interstellar Space',
    fallback_distance_km: 21540000000,
    fallback_lt_s: 71850,
    fallback_speed_kms: 25.10,
    description: "Güneş Sistemi'nin heliosfer sınırını aşmış ikinci yıldızlararası sonda."
  },
  jwst: {
    command_id: '-170',
    name: 'James Webb Space Telescope',
    status: 'Sun-Earth L2',
    fallback_distance_km: 1500000,
    fallback_lt_s: 5.0,
    fallback_speed_kms: 0.2,
    description: "Dünya'dan 1.5 milyon km uzakta L2 yörüngesindeki dev kızılötesi uzay teleskobu."
  },
  parker: {
    command_id: '-96',
    name: 'Parker Solar Probe',
    status: 'Inner Solar System / Corona',
    fallback_distance_km: 140000000,
    fallback_lt_s: 467.0,
    fallback_speed_kms: 150.0,
    description: "Güneş tacına en çok yaklaşan ve insanlık tarihinin en yüksek hızına ulaşan araştırma aracı."
  },
  new_horizons: {
    command_id: '-98',
    name: 'New Horizons',
    status: 'Kuiper Belt',
    fallback_distance_km: 8800000000,
    fallback_lt_s: 29350,
    fallback_speed_kms: 13.8,
    description: "Plüton ve Arrokoth'u ziyaret ettikten sonra Kuiper Kuşağı'nda ilerleyen keşif aracı."
  },
  juno: {
    command_id: '-61',
    name: 'Juno',
    status: 'Jupiter Orbit',
    fallback_distance_km: 780000000,
    fallback_lt_s: 2600.0,
    fallback_speed_kms: 35.0,
    description: "Jüpiter'in atmosferini, manyetosferini ve kutup fırtınalarını inceleyen yörünge sondası."
  },
  hubble: {
    command_id: '-48',
    name: 'Hubble Space Telescope',
    status: 'Low Earth Orbit',
    fallback_distance_km: 6849,
    fallback_lt_s: 0.02,
    fallback_speed_kms: 7.59,
    description: "Alçak Dünya Yörüngesi'nde evreni gözlemleyen uzay teleskobu."
  },
  iss: {
    command_id: '-125544',
    name: 'International Space Station',
    status: 'Low Earth Orbit',
    fallback_distance_km: 6789,
    fallback_lt_s: 0.02,
    fallback_speed_kms: 7.66,
    description: "Alçak Dünya Yörüngesi'nde astronotların görev yaptığı uzay istasyonu."
  }
};

/**
 * JPL Horizons ham metin çıktısından vektör verilerini ayrıştırır.
 */
function parseHorizonsVectors(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const xMatch = rawText.match(/\bX\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);
  const yMatch = rawText.match(/\bY\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);
  const zMatch = rawText.match(/\bZ\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);
  const ltMatch = rawText.match(/\bLT\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);
  const rgMatch = rawText.match(/\bRG\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);
  const rrMatch = rawText.match(/\bRR\s*=\s*([+-]?\d+\.\d+E[+-]?\d+)/);

  if (!rgMatch || !ltMatch) return null;

  const distanceKm = parseFloat(rgMatch[1]);
  const lightTimeS = parseFloat(ltMatch[1]);
  const roundedLt = parseFloat(lightTimeS.toFixed(1));
  const relativeSpeedKms = rrMatch ? Math.abs(parseFloat(rrMatch[1])) : 0;

  return {
    distance_km: distanceKm,
    distance_au: parseFloat((distanceKm / KM_PER_AU).toFixed(4)),
    light_time_s: roundedLt,
    round_trip_s: parseFloat((roundedLt * 2).toFixed(1)),
    velocity_kmh: Math.round(relativeSpeedKms * 3600),
    relative_speed_kms: parseFloat(relativeSpeedKms.toFixed(2)),
    position_vectors: {
      x_km: xMatch ? parseFloat(xMatch[1]) : 0,
      y_km: yMatch ? parseFloat(yMatch[1]) : 0,
      z_km: zMatch ? parseFloat(zMatch[1]) : 0
    }
  };
}

/**
 * Belirtilen uzay aracı için NASA JPL Horizons verisini çeker.
 * Hata veya zaman aşımında güvenli fallback döner.
 */
export async function fetchSpacecraftData(spacecraftKey, fetchFn) {
  const rawKey = String(spacecraftKey || '').trim().toLowerCase();
  const normalizedKey = rawKey === 'james_webb' ? 'jwst' : (rawKey || 'voyager_1');
  const meta = SPACECRAFT_REGISTRY[normalizedKey];

  // Bilinmeyen uzay aracı kimliği için sözleşme gereği boş dizi döner
  if (!meta) {
    return [];
  }

  const fallbackData = {
    id: normalizedKey,
    name: meta.name,
    status: meta.status,
    distance_km: meta.fallback_distance_km,
    distance_au: parseFloat((meta.fallback_distance_km / KM_PER_AU).toFixed(4)),
    light_time_s: meta.fallback_lt_s,
    round_trip_s: meta.fallback_lt_s * 2,
    velocity_kmh: Math.round(meta.fallback_speed_kms * 3600),
    relative_speed_kms: meta.fallback_speed_kms,
    position_vectors: { x_km: 0, y_km: 0, z_km: 0 },
    description: meta.description
  };

  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Dünya merkezli (@399) vektör sorgusu
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='${meta.command_id}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='@399'&START_TIME='${today}'&STOP_TIME='${tomorrow}'&STEP_SIZE='1d'`;

    const json = await fetchFn(url);
    const parsed = parseHorizonsVectors(json?.result);

    if (!parsed) {
      return fallbackData;
    }

    return {
      id: normalizedKey,
      name: meta.name,
      status: meta.status,
      ...parsed,
      description: meta.description
    };
  } catch (err) {
    console.warn(`[Horizons] ${meta.name} canlı sorgusu başarısız, yedek veriye geçiliyor:`, err.message);
    return fallbackData;
  }
}
