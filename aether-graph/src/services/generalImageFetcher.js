// Genel soru pop-up'ı için konunun görselini bulur (sunucuda çalışır).
// Sıra: Wikipedia araması → bulunan sayfanın özet görseli (İngilizce terim, sonra Türkçe başlık) → NASA görsel arşivi.
// Anahtarsız ve açık kaynaklar kullanılır; hiçbiri bulunamazsa null döner, pop-up yine açılır.

import { isRealPhotoItem } from "./nasaImageFilter.js";

const REQUEST_TIMEOUT_MS = 6000;
const MAX_ORIGINAL_IMAGE_PX = 2400;
const PREFERRED_THUMB_PX = 1280;
// Wikimedia API kuralı: istemci kendini tanıtan bir User-Agent göndermeli
const USER_AGENT = "Aluma/1.0 (egitim amacli uzay platformu)";
const wikiSearchUrl = (lang, term) => `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(term)}&limit=5`;
const wikiSummaryUrl = (lang, key) => `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`;
const NASA_IMAGES_SEARCH_URL = "https://images-api.nasa.gov/search";

async function getJson(fetchFn, url) {
  const resp = await fetchFn(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!resp?.ok) return null;
  return await resp.json();
}

// Çok büyük özgün görsel yerine makul boyutlu küçük resim kullanılır (yükleme süresi)
function pickSummaryImage(summary) {
  const original = summary?.originalimage;
  if (original?.source && (!original.width || original.width <= MAX_ORIGINAL_IMAGE_PX)) return original.source;
  const thumb = summary?.thumbnail?.source;
  return thumb ? thumb.replace(/\/\d+px-/, `/${PREFERRED_THUMB_PX}px-`) : original?.source || "";
}

function isListOrMetaPage(key = "") {
  return /_listesi\b|^list_of_|_list_of_|_timeline_|_outline_|_index_of_/i.test(key);
}

async function findWikipediaImage(fetchFn, lang, term) {
  // Gemini terimi tam sayfa başlığı olmayabilir ("black hole accretion disk"); önce en iyi eşleşen sayfa aranır
  const search = await getJson(fetchFn, wikiSearchUrl(lang, term));
  const pages = Array.isArray(search?.pages) ? search.pages : [];
  // Liste veya fihrist sayfaları (örn. Uzay ajansları listesi) alakasız görsel (ISS vb.) taşıyabileceği için elenir
  let page = pages.find((p) => p?.key && p?.thumbnail && !isListOrMetaPage(p.key));
  if (!page && pages[0]?.key && !isListOrMetaPage(pages[0].key)) {
    page = pages[0];
  }
  if (!page) return null;
  const summary = await getJson(fetchFn, wikiSummaryUrl(lang, page.key));
  const image_url = pickSummaryImage(summary);
  if (!image_url || summary?.type === "disambiguation") return null;
  return {
    image_url,
    image_title: String(summary.title || page.title || term),
    image_source: `Wikipedia (${lang})`,
    image_page_url: summary?.content_urls?.desktop?.page || "",
  };
}

async function findNasaImage(fetchFn, term) {
  const params = new URLSearchParams({ q: term, media_type: "image" });
  const json = await getJson(fetchFn, `${NASA_IMAGES_SEARCH_URL}?${params.toString()}`);
  const items = Array.isArray(json?.collection?.items) ? json.collection.items : [];
  const isIssQuery = /\biss\b|international space station|uzay istasyon/i.test(term);
  const item = items.find((i) => {
    if (!i?.links?.[0]?.href || !isRealPhotoItem(i)) return false;
    const title = String(i.data?.[0]?.title || "").toLowerCase();
    // Kullanıcı ISS sormamışsa genel sorgularda (ajans, merkez vb.) ISS fotoğrafı dönmesini engelle
    if (!isIssQuery && /\b(iss|international space station)\b/i.test(title)) return false;
    return true;
  });
  if (!item) return null;
  return {
    image_url: item.links[0].href,
    image_title: String(item.data?.[0]?.title || term),
    image_source: "NASA Görsel Arşivi",
    image_page_url: "",
  };
}

/**
 * imageQuery: İngilizce arama terimi (Gemini'nin image_query alanı), trTitle: Türkçe başlık (yedek).
 */
export async function fetchGeneralTopicImage(imageQuery, trTitle = "", fetchFn = globalThis.fetch) {
  if (typeof fetchFn !== "function") return null;
  const attempts = [];
  if (typeof imageQuery === "string" && imageQuery.trim()) attempts.push(() => findWikipediaImage(fetchFn, "en", imageQuery.trim()));
  if (typeof trTitle === "string" && trTitle.trim()) attempts.push(() => findWikipediaImage(fetchFn, "tr", trTitle.trim()));
  if (typeof imageQuery === "string" && imageQuery.trim()) attempts.push(() => findNasaImage(fetchFn, imageQuery.trim()));
  for (const attempt of attempts) {
    try {
      const found = await attempt();
      if (found) return found;
    } catch (err) {
      console.warn("Genel soru görseli aranamadı:", err?.message);
    }
  }
  return null;
}
