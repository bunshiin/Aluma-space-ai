// NASA canlı ve yedek fotoğraf adaylarını getiren servis modülü

import {
  UNIVERSAL_PHOTO_FALLBACKS,
  hasFirstAndLatestIntent,
  hasLatestIntent,
  isSpaceObservationItem,
  resolveNasaImageSearchConfig,
} from "./nasaPhotoRules.js";

export { resolveNasaImageSearchConfig, hasFirstAndLatestIntent };

const shownPhotoIds = new Set();

export function clearShownPhotoHistory() {
  shownPhotoIds.clear();
}

export function markPhotoAsShown(nasaId) {
  if (nasaId) shownPhotoIds.add(nasaId);
}

async function fetchMarsRoverRawCandidates(cfg, todayIso, limit = 10, preferLatest = false) {
  try {
    const page = preferLatest ? 0 : Math.floor(shownPhotoIds.size / 15);
    const rssRes = await fetch(
      `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020,ingenuity&feedtype=json&num=25&page=${page}&order=sol+desc`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!rssRes.ok) return [];
    const rssData = await rssRes.json();
    const images = Array.isArray(rssData?.images) ? rssData.images : [];

    const mapped = [];
    for (const img of images) {
      const imgUrl = img?.image_files?.full_res || img?.image_files?.large;
      if (!imgUrl) continue;
      const nasaId = img.imageid || `MARS2020-SOL${img.sol ?? 0}-${mapped.length}`;
      if (shownPhotoIds.has(nasaId)) continue;

      mapped.push({
        subject: "NASA Mars 2020 Perseverance Rover",
        nasa_id: nasaId,
        sol: img.sol ?? 1415,
        camera: img.camera?.instrument || cfg.instrumentDefault,
        date_taken_utc: img.date_taken_utc || todayIso,
        image_url: imgUrl,
        hd_image_url: imgUrl,
        nasa_gallery_url: "https://mars.nasa.gov/mars2020/multimedia/raw-images/",
        title: img.title || `Perseverance Sol ${img.sol ?? ""} Yüzey Görüntüsü`,
        description: img.caption || "Mars 2020 Perseverance ham yüzey görüntüsü.",
        coordinates: { latitude_deg: 18.38, longitude_deg: 77.58 },
        credit: "NASA/JPL-Caltech/ASU",
      });
      if (mapped.length >= limit) break;
    }
    return mapped;
  } catch (err) {
    console.warn("Mars rover canlı görsel servisine ulaşılamadı:", err.message);
    return [];
  }
}

async function queryNasaImagesApi(searchQuery, yearStart = null, center = null, pageSize = 25) {
  const params = new URLSearchParams({
    q: searchQuery,
    media_type: "image",
    page_size: String(pageSize),
  });
  if (yearStart) params.set("year_start", String(yearStart));
  if (center) params.set("center", center);

  const url = `https://images-api.nasa.gov/search?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (!res.ok) return [];

  const data = await res.json();
  const items = data?.collection?.items || [];
  return items.filter(
    (it) => it?.data?.[0] && it?.links?.[0]?.href && it.links[0].href.startsWith("http")
  );
}

function mapLibraryItemToPhoto(top, cfg, todayIso) {
  const meta = top.data[0];
  const previewUrl = top.links[0].href;
  return {
    subject: meta.title || cfg.searchQuery.toUpperCase(),
    nasa_id: meta.nasa_id || "NASA-IMG",
    camera: cfg.instrumentDefault,
    center: meta.center || "NASA/STScI/JPL",
    date_taken_utc: meta.date_created || todayIso,
    title: meta.title || "NASA Official Space Image",
    description: (meta.description || "").slice(0, 450),
    image_url: previewUrl,
    hd_image_url: previewUrl.replace(/~(thumb|small|medium|large)\./, "~orig."),
    nasa_gallery_url: cfg.galleryUrl,
    credit: meta.photographer || meta.secondary_creator || "NASA Official Archive",
  };
}

function combineFirstAndLatestPhotos(firstPhoto, latestPhoto) {
  return {
    ...latestPhoto,
    first_nasa_id: firstPhoto.nasa_id,
    first_title: firstPhoto.title,
    first_date_taken_utc: firstPhoto.date_taken_utc,
    first_image_url: firstPhoto.image_url,
    first_hd_image_url: firstPhoto.hd_image_url || firstPhoto.image_url,
    description: `İLK FOTOĞRAF (${firstPhoto.date_taken_utc} - ${firstPhoto.title}): ${firstPhoto.description || ""} | SON FOTOĞRAF (${latestPhoto.date_taken_utc} - ${latestPhoto.title}): ${latestPhoto.description || ""}`,
  };
}

async function fetchFirstAndLatestPair(cfg, todayIso) {
  try {
    let validItems = await queryNasaImagesApi(cfg.searchQuery, null, cfg.center, 80);
    if (validItems.length < 2 && cfg.center) {
      validItems = await queryNasaImagesApi(cfg.searchQuery, null, null, 80);
    }
    const observations = validItems.filter(isSpaceObservationItem);
    const pool = observations.length >= 2 ? observations : validItems;
    if (pool.length === 0) return [];

    pool.sort((a, b) => {
      const da = new Date(a.data[0].date_created || 0).getTime();
      const db = new Date(b.data[0].date_created || 0).getTime();
      return da - db;
    });

    const oldestPhoto = mapLibraryItemToPhoto(pool[0], cfg, todayIso);
    const newestPhoto = mapLibraryItemToPhoto(pool[pool.length - 1], cfg, todayIso);
    return [combineFirstAndLatestPhotos(oldestPhoto, newestPhoto)];
  } catch (err) {
    console.warn("İlk ve son görsel arşivi sorgusu başarısız:", err.message);
    return [];
  }
}

async function fetchNasaImageLibraryCandidates(cfg, todayIso, resultIndex = 0, limit = 10, preferLatest = false) {
  try {
    const currentYear = new Date(todayIso).getUTCFullYear();
    const minNeeded = Math.max(limit, resultIndex + 1 + shownPhotoIds.size);
    let validItems = [];

    if (preferLatest) {
      validItems = await queryNasaImagesApi(cfg.searchQuery, currentYear - 2, cfg.center, 35);
    }
    if (validItems.filter(isSpaceObservationItem).length < minNeeded) {
      validItems = await queryNasaImagesApi(cfg.searchQuery, null, cfg.center, 50);
    }
    if (validItems.filter(isSpaceObservationItem).length < minNeeded && cfg.center) {
      validItems = await queryNasaImagesApi(cfg.searchQuery, null, null, 50);
    }
    if (validItems.length === 0) return [];

    const observations = validItems.filter(isSpaceObservationItem);
    const pool = observations.length > 0 ? observations : validItems;

    if (preferLatest) {
      pool.sort((a, b) => {
        const da = new Date(a.data[0].date_created || 0).getTime();
        const db = new Date(b.data[0].date_created || 0).getTime();
        return db - da;
      });
    }

    const unseenPool = pool.filter((item) => !shownPhotoIds.has(item.data[0].nasa_id));
    const activePool = unseenPool.length > 0 ? unseenPool : pool;
    const startIdx = resultIndex > 0 ? resultIndex % activePool.length : 0;
    const rotated = [...activePool.slice(startIdx), ...activePool.slice(0, startIdx)];

    return rotated.slice(0, limit).map((item) => mapLibraryItemToPhoto(item, cfg, todayIso));
  } catch (err) {
    console.warn("NASA görsel arşivi sorgusu başarısız:", err.message);
    return [];
  }
}

function buildFallbackCandidate(cfg, todayIso, wantBoth) {
  const fb = UNIVERSAL_PHOTO_FALLBACKS[cfg.key] || UNIVERSAL_PHOTO_FALLBACKS.default;
  const base = {
    ...fb,
    date_taken_utc: fb.date_taken_utc || todayIso,
    description: `${fb.title} — Resmi NASA arşiv kaydı.`,
  };
  if (wantBoth && !base.first_image_url) {
    base.first_nasa_id = `${base.nasa_id}-FIRST`;
    base.first_title = `${base.subject} İlk Arşiv Görüntüsü`;
    base.first_date_taken_utc = "1986-01-25T00:00:00Z";
    base.first_image_url = base.image_url;
    base.first_hd_image_url = base.hd_image_url || base.image_url;
  }
  return base;
}

export async function fetchUniversalNasaPhotoCandidates(promptText, resultIndex = 0, limit = 10) {
  const cfg = resolveNasaImageSearchConfig(promptText);
  const todayIso = new Date().toISOString();
  const wantBoth = hasFirstAndLatestIntent(promptText);
  const preferLatest = hasLatestIntent(promptText);

  if (wantBoth) {
    const pairList = await fetchFirstAndLatestPair(cfg, todayIso);
    if (pairList.length > 0) return pairList;
    return [buildFallbackCandidate(cfg, todayIso, true)];
  }

  if (cfg.isMarsRover) {
    const marsList = await fetchMarsRoverRawCandidates(cfg, todayIso, limit, preferLatest);
    if (marsList.length > 0) return marsList;
  }

  const libList = await fetchNasaImageLibraryCandidates(cfg, todayIso, resultIndex, limit, preferLatest);
  if (libList.length > 0) return libList;

  return [buildFallbackCandidate(cfg, todayIso, false)];
}

export async function fetchUniversalNasaPhoto(promptText, resultIndex = 0) {
  const candidates = await fetchUniversalNasaPhotoCandidates(promptText, resultIndex, 1);
  const chosen = candidates[0];
  if (chosen?.nasa_id) markPhotoAsShown(chosen.nasa_id);
  return chosen;
}
