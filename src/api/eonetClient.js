// NASA EONET v3 istemcisi: Dünya küresi ve bilgi paneli için normalize edilmiş afet listesi.
// Önbellek ve zaman aşımı dataLayer'da tek yerde; burası sadece URL kurar, çeker ve biçimi sadeleştirir.

import { getFallbackSpaceData } from '../services/spaceDataFallback.js';
import { EONET_CATEGORY_IDS, normalizeEonetResponse, normalizeFallbackEvent } from './eonetNormalizer.js';

const EONET_EVENTS_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';
const EONET_EVENT_LIMIT = 30;

/**
 * Büyük/küçük harf fark etmeden EONET kategori kimliğini bulur ("severestorms" → "severeStorms").
 * Boş veya "all" tüm aktif olaylar demektir; tanınmayan kimlik null döner.
 */
export function getEonetCategoryId(rawCategory) {
  const key = String(rawCategory || '').trim().toLowerCase();
  if (!key || key === 'all' || key === 'default') return 'all';
  return EONET_CATEGORY_IDS.find((id) => id.toLowerCase() === key) || null;
}

export function createEonetEventsUrl(categoryId) {
  const params = new URLSearchParams({ limit: String(EONET_EVENT_LIMIT) });
  if (EONET_CATEGORY_IDS.includes(categoryId)) {
    // Kategori sorgusunda kapanmış olaylar da gelir ki "en son volkan" boş kalmasın
    params.set('category', categoryId);
    params.set('status', 'all');
  } else {
    params.set('status', 'open');
  }
  return `${EONET_EVENTS_URL}?${params.toString()}`;
}

export function getFallbackEonetEvents(categoryId) {
  const list = getFallbackSpaceData('eonet', categoryId) || [];
  const normalized = list.map(normalizeFallbackEvent);
  if (!EONET_CATEGORY_IDS.includes(categoryId)) return normalized;
  return normalized.filter((e) => e.category === categoryId);
}

/**
 * Kategoriye göre olayları çeker. fetchJson(url) → JSON (dataLayer'ın zaman aşımlı çağrısı).
 * Hata ya da boş yanıtta yedek kayıtlar döner; hiçbir durumda null dönmez.
 */
export async function fetchNormalizedEonetEvents(categoryId, fetchJson) {
  try {
    const events = normalizeEonetResponse(await fetchJson(createEonetEventsUrl(categoryId)));
    return events.length > 0 ? events : getFallbackEonetEvents(categoryId);
  } catch (err) {
    console.warn('EONET canlı verisi alınamadı, yedek veriye geçildi:', err?.message);
    return getFallbackEonetEvents(categoryId);
  }
}
