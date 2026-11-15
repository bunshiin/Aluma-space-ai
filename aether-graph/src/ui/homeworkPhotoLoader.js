// Ödev kartlarının fotoğrafını bulur. Sıra: NASA arşivi (getSpaceData("nasa_images")) → sunucudaki konu görseli
// (getTopicImage) → çevrimdışı yedek görsel.

import { createFallbackSpaceImageDataUri } from "./popupController.js";

function isUsablePhoto(entry) {
  return Boolean(entry) && typeof entry === "object" && typeof entry.image_url === "string" && entry.image_url.startsWith("https://");
}

/**
 * Yükleyiciyi kurar. getSpaceData: sözleşme fonksiyonunu döndüren fonksiyon (veri katmanı geç yüklenir).
 * getTopicImage(query, title): NASA sonuç vermezse denenen ikinci kaynak. fallbackSource: yedek görsel etiketi.
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

  async function fetchCandidates(item) {
    const nasaList = await fetchNasaCandidates(item);
    if (nasaList.length > 0 || typeof getTopicImage !== "function" || !item.image_query) return nasaList;
    try {
      const topicImage = await getTopicImage(item.image_query, item.title);
      return isUsablePhoto(topicImage) ? [topicImage] : [];
    } catch (err) {
      console.warn("Konu görseli alınamadı:", err?.message);
      return [];
    }
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

  return {
    loadPhoto,
    getNextPhoto,
    forget: (id) => candidatesById.delete(id),
    destroy() {
      isDestroyed = true;
      candidatesById.clear();
    }
  };
}
