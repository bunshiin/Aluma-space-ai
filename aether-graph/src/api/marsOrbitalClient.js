// Mars yörünge fotoğrafları (MRO HiRISE/CTX): NASA resmi görsel arşivi (images-api.nasa.gov).
// Uydu sahnesi sorguyu (krater adı, kamera) yayınlar; UI bu istemciyi getSpaceData üzerinden çağırır.

import { isRealPhotoItem } from '../services/nasaImageFilter.js';

const NASA_IMAGES_SEARCH_URL = 'https://images-api.nasa.gov/search';
const MAX_ORBITAL_PHOTOS = 6;
const DEFAULT_INSTRUMENT = 'hirise';

// Ağ yoksa gösterilen resmi NASA arşiv kaydı (images-api.nasa.gov üzerinde doğrulandı)
const FALLBACK_ORBITAL_PHOTOS = Object.freeze([
  {
    nasa_id: 'PIA24331',
    title: "Perseverance's Landing Spot in Jezero Crater",
    date_taken_utc: '2021-02-22T00:00:00Z',
    image_url: 'https://images-assets.nasa.gov/image/PIA24331/PIA24331~small.jpg',
    description: 'MRO yörüngesinden Jezero Krateri ve Perseverance iniş noktası.',
    camera_instrument: 'HIRISE',
  },
]);

/**
 * "jezero crater" + "hirise" → "HiRISE jezero crater". Bilinmeyen kamera HiRISE'a düşer.
 */
export function createOrbitalSearchTerm(identifier) {
  const [rawPlace = '', rawInstrument = ''] = String(identifier || '').split('|');
  const place = rawPlace.trim() || 'jezero crater';
  const instrument = ['hirise', 'ctx'].includes(rawInstrument.trim().toLowerCase()) ? rawInstrument.trim().toLowerCase() : DEFAULT_INSTRUMENT;
  return `${instrument === 'ctx' ? 'CTX' : 'HiRISE'} ${place}`;
}

/**
 * NASA görsel arşivi yanıtını UI'nın kullandığı sade biçime çevirir; ham NASA verisi UI'ya gitmez.
 */
export function normalizeOrbitalPhotoResponse(rawJson) {
  const items = Array.isArray(rawJson?.collection?.items) ? rawJson.collection.items : [];
  // Rota/harita çizilmiş veya illüstrasyon olan kayıtlar gerçek yörünge fotoğrafı değildir
  return items
    .filter(isRealPhotoItem)
    .map((item) => {
      const data = Array.isArray(item?.data) ? item.data[0] : null;
      const image_url = Array.isArray(item?.links) ? item.links.find((l) => l?.render === 'image')?.href || item.links[0]?.href : '';
      if (!data?.nasa_id || !image_url) return null;
      return {
        nasa_id: String(data.nasa_id),
        title: String(data.title || data.nasa_id),
        date_taken_utc: String(data.date_created || ''),
        image_url: String(image_url),
        description: String(data.description || '').slice(0, 400),
        camera_instrument: /ctx/i.test(`${data.title} ${(data.keywords || []).join(' ')}`) ? 'CTX' : 'HIRISE',
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.date_taken_utc || 0) - Date.parse(a.date_taken_utc || 0))
    .slice(0, MAX_ORBITAL_PHOTOS);
}

export function getFallbackOrbitalPhotos() {
  return FALLBACK_ORBITAL_PHOTOS.map((photo) => ({ ...photo }));
}

/**
 * identifier: "<krater adı>|<kamera>" (örn. "gale crater|ctx"). fetchJson(url) → JSON.
 * Hata ya da boş yanıtta yedek kayıt döner; null dönmez.
 */
export async function fetchMarsOrbitalPhotos(identifier, fetchJson) {
  try {
    const params = new URLSearchParams({ q: createOrbitalSearchTerm(identifier), media_type: 'image' });
    const photos = normalizeOrbitalPhotoResponse(await fetchJson(`${NASA_IMAGES_SEARCH_URL}?${params.toString()}`));
    return photos.length > 0 ? photos : getFallbackOrbitalPhotos();
  } catch (err) {
    console.warn('Mars yörünge fotoğrafı alınamadı, yedek kayda geçildi:', err?.message);
    return getFallbackOrbitalPhotos();
  }
}
