// Ödev kartlarının fotoğrafını bulur. Sıra: sunucudaki konu görseli (getTopicImage: önce konunun kendi sayfası,
// sonra NASA arşivi) → NASA arşivi araması (getSpaceData("nasa_images")) → çevrimdışı yedek görsel.
// Konu görseli önce gelir: serbest NASA araması konuyla ilgisiz cihaz/laboratuvar fotoğrafları döndürebiliyor.

import { createFallbackSpaceImageDataUri } from "./popupController.js";

function isUsablePhoto(entry) {
  return Boolean(entry) && typeof entry === "object" && typeof entry.image_url === "string" && entry.image_url.startsWith("https://");
}

/**
 * Yükleyiciyi kurar. getSpaceData: sözleşme fonksiyonunu döndüren fonksiyon (veri katmanı geç yüklenir).
 * getTopicImage(query, title): ilk denenen kaynak. fallbackSource: yedek görsel etiketi.
 */
export function createHomeworkPhotoLoader({ getSpaceData, getTopicImage, fallbackSource = "" } = {}) {
  const candidatesById = new Map();
  let isDestroyed = false;

  function createFallbackPhoto(item) {
    return { image_url: createFallbackSpaceImageDataUri(item.title, item.template_id), image_title: item.title, image_source: fallbackSource, is_fallback: true };
  }

  async function fetchNasaCandidates(item) {
    const getter = typeof getSpaceData === "function" ? getSpaceData() : null;
    if (typeof getter !== "function" || !item.image_query) return [];
    try {
      const result = await getter("nasa_images", item.image_query);
      return Array.isArray(result) ? result.filter(isUsablePhoto) : [];
    } catch (err) {
      console.warn("Ödev fotoğrafı alınamadı:", err?.message);
      return [];
    }
  }

  async function fetchTopicImage(item) {
    if (typeof getTopicImage !== "function" || !item.image_query) return null;
    try {
      const topicImage = await getTopicImage(item.image_query, item.title);
      return isUsablePhoto(topicImage) ? topicImage : null;
    } catch (err) {
      console.warn("Konu görseli alınamadı:", err?.message);
      return null;
    }
  }

  async function fetchCandidates(item) {
    const topicImage = await fetchTopicImage(item);
    // Konu görseli varsa ilk aday odur; "Başka NASA Fotoğrafı" yine NASA aramasının sonuçlarında gezinir
    const nasaList = await fetchNasaCandidates(item);
    return topicImage ? [topicImage, ...nasaList] : nasaList;
  }

  function pick(item, entry) {
    if (!entry) return createFallbackPhoto(item);
    return { image_url: entry.image_url, image_title: entry.image_title || item.title, image_source: entry.image_source || "", is_fallback: false };
  }

  /**
   * Öğenin ilk fotoğrafını döner. Kart silinmiş ya da yükleyici kapanmışsa null döner (geç gelen yanıt yok sayılır).
   */
  async function loadPhoto(item) {
    const list = await fetchCandidates(item);
    if (isDestroyed) return null;
    candidatesById.set(item.id, { list, index: 0 });
    return pick(item, list[0]);
  }

  /**
   * Sıradaki NASA fotoğrafına geçer; aday yoksa yeniden arar.
   */
  async function getNextPhoto(item) {
    const entry = candidatesById.get(item.id);
    if (!entry || entry.list.length === 0) return loadPhoto(item);
    entry.index = (entry.index + 1) % entry.list.length;
    return pick(item, entry.list[entry.index]);
  }

  /**
   * Öğrencinin seçtiği resim dosyasını fotoğraf kaydına çevirir; okunamazsa null.
   */
  async function loadUserPhoto(file, readFileAsDataUrl, source) {
    try {
      return { image_url: await readFileAsDataUrl(file), image_title: String(file?.name || ""), image_source: source };
    } catch (err) {
      console.warn("Görsel dosyası okunamadı:", err);
      return null;
    }
  }

  return {
    loadPhoto,
    loadUserPhoto,
    getNextPhoto,
    forget: (id) => candidatesById.delete(id),
    destroy() {
      isDestroyed = true;
      candidatesById.clear();
    }
  };
}
