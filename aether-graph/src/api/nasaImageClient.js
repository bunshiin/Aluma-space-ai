// NASA Görsel Arşivi (images-api.nasa.gov) araması: sadece gerçek fotoğraf kayıtları, sadece gereken alanlar.

import { isRealPhotoItem } from '../services/nasaImageFilter.js';

const NASA_IMAGES_SEARCH_URL = 'https://images-api.nasa.gov/search';
const MAX_RESULTS = 6;
const MAX_QUERY_LENGTH = 100;

/**
 * Ham arşiv kaydını UI'nın kullandığı dar biçime indirger; bağlantısı olmayan kayıt null döner.
 */
export function normalizeNasaImageItem(item) {
  const href = item?.links?.[0]?.href;
  const data = item?.data?.[0];
  if (typeof href !== 'string' || !href.startsWith('https://')) return null;
  return {
    nasa_id: String(data?.nasa_id || href),
    image_title: String(data?.title || '').slice(0, 160),
    image_url: href,
    image_source: 'NASA Görsel Arşivi',
    date_created_utc: typeof data?.date_created === 'string' ? data.date_created : ''
  };
}

/**
 * Sorguya uyan fotoğrafları getirir. Hata, zaman aşımı veya internet yoksa boş dizi döner.
 */
export async function fetchNasaImages(query, fetchWithTimeout) {
  const term = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (!term) return [];
  try {
    const params = new URLSearchParams({ q: term, media_type: 'image' });
    const json = await fetchWithTimeout(`${NASA_IMAGES_SEARCH_URL}?${params.toString()}`);
    const items = Array.isArray(json?.collection?.items) ? json.collection.items : [];
    return items.filter(isRealPhotoItem).map(normalizeNasaImageItem).filter(Boolean).slice(0, MAX_RESULTS);
  } catch (err) {
    console.warn('[DataLayer] NASA görsel arşivi sorgusu başarısız:', err?.message);
    return [];
  }
}
