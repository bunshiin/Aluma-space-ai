// Kullanıcı girdisinden NASA/uzay veri niyetini algılar ve güvenli veri çeker

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchUniversalNasaPhoto, resolveNasaImageSearchConfig } from "./nasaPhotoFetcher.js";
import { getFallbackSpaceData } from "./spaceDataFallback.js";
import { hasKeyword } from "./keywordMatch.js";

const PHOTO_INTENT_KEYWORDS = [
  "foto", "görsel", "gorsel", "resim", "resmi",
  "çektiği", "cektigi", "çekilen", "cekilen", "çekilmiş", "cekilmis", "ne çekti", "ne cekti",
  "görüntü", "goruntu", "kare", "çekim", "cekim", "image", "photo",
];

const APOD_KEYWORDS = [
  "apod", "günün uzay", "günün gök", "günün fotoğrafı", "günün resmi", "günün görseli",
];

const MARS_WEATHER_TARGETS = ["mars", "kızıl gezegen", "jezero"];
const MARS_WEATHER_TERMS = [
  "fırtına", "firtina", "hava durumu", "rüzgar", "ruzgar",
  "toz", "basınç", "meteoroloji", "insight", "meda",
];

// Sıra önemli: "volkan patlaması" Güneş patlaması sanılmasın diye EONET, solar'dan önce bakılır
const EONET_CATEGORY_KEYWORDS = [
  { category: "volcanoes", keywords: ["volkan", "yanardağ", "yanardag", "lav akı", "püskür", "puskur"] },
  { category: "earthquakes", keywords: ["deprem", "sismik", "sarsıntı", "sarsinti"] },
  { category: "wildfires", keywords: ["yangın", "yangin", "orman yang"] },
  { category: "severeStorms", keywords: ["kasırga", "kasirga", "tayfun", "siklon", "hortum", "fırtına", "firtina"] },
  { category: "floods", keywords: ["taşkın", "taskin", "su baskın", "sel felak"] },
  { category: "seaLakeIce", keywords: ["buzul", "buzdağ", "buzdag", "deniz buz", "göl buz"] },
  { category: "snow", keywords: ["kar fırtına", "kar yağ", "çığ", "cig "] },
  { category: "dustHaze", keywords: ["toz bulut", "kum fırtına", "duman"] },
  { category: "drought", keywords: ["kuraklık", "kuraklik"] },
  { category: "landslides", keywords: ["heyelan", "toprak kay"] },
  { category: "tempExtremes", keywords: ["sıcak hava dalga", "aşırı sıcak", "soğuk hava dalga"] },
];

const EONET_GENERAL_KEYWORDS = ["afet", "eonet", "doğal olay", "dogal olay"];

// Güneş/Mars bağlamındaki "fırtına" Dünya afeti değildir
const NON_EARTH_CONTEXT = ["güneş", "gunes", "manyetik", "uzay hava", ...MARS_WEATHER_TARGETS];

// "sel" kısa olduğu için "görsel", "kişisel" gibi kelimelerin içinde aranmaz, tam kelime olmalı
function hasFloodWord(t) {
  return t.split(/[\s.,!?;:]+/).some((w) => /^sel(ler|leri|de|den|i|in)?('.*)?$/.test(w));
}

function resolveEonetCategory(t) {
  if (NON_EARTH_CONTEXT.some((kw) => hasKeyword(t, kw))) return null;
  if (hasFloodWord(t)) return "floods";
  const match = EONET_CATEGORY_KEYWORDS.find((entry) => entry.keywords.some((kw) => hasKeyword(t, kw)));
  return match ? match.category : null;
}

function detectEonetIntent(t) {
  const category = resolveEonetCategory(t);
  if (!category && !EONET_GENERAL_KEYWORDS.some((kw) => hasKeyword(t, kw))) return null;
  const cat = category || "all";
  return {
    queryType: "eonet",
    identifier: cat,
    categoryName: `NASA EONET Doğal Afetler [${cat.toUpperCase()}]`,
  };
}

const CELESTIAL_OBJECT_ALIASES = [
  { id: "jupiter", patterns: ["jüpiter", "jupiter"] },
  { id: "saturn", patterns: ["satürn", "saturn"] },
  { id: "uranus", patterns: ["uranüs", "uranus"] },
  { id: "neptune", patterns: ["neptün", "neptune"] },
  { id: "earth", patterns: ["dünya", "dunya", "earth"] },
  { id: "venus", patterns: ["venüs", "venus"] },
  { id: "mars", patterns: ["mars"] },
  { id: "mercury", patterns: ["merkür", "merkur", "mercury"] },
  { id: "sun", patterns: ["güneş", "gunes", "sun"] },
  { id: "pluto", patterns: ["plüton", "pluton", "pluto"] },
  { id: "moon", patterns: ["moon"], wordPatterns: ["ay"] },
];

function findMentionedCelestialObjects(lowerText) {
  const found = [];
  for (const entry of CELESTIAL_OBJECT_ALIASES) {
    let matchedIndex = -1;
    for (const pat of entry.patterns) {
      const idx = lowerText.indexOf(pat);
      if (idx !== -1 && (matchedIndex === -1 || idx < matchedIndex)) {
        matchedIndex = idx;
      }
    }
    if (matchedIndex === -1 && Array.isArray(entry.wordPatterns)) {
      for (const w of entry.wordPatterns) {
        const re = new RegExp(`(^|[^a-zçğıöşü0-9])(${w})([^a-zçğıöşü0-9]|$)`, "i");
        const m = re.exec(lowerText);
        if (m) {
          matchedIndex = m.index + (m[1]?.length || 0);
          break;
        }
      }
    }
    if (matchedIndex !== -1) {
      found.push({ id: entry.id, index: matchedIndex });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((item) => item.id);
}

export function resolveComparisonIdentifier(promptText) {
  const lower = String(promptText || "").toLowerCase();
  const objects = findMentionedCelestialObjects(lower);
  if (objects.length >= 2) {
    return `${objects[0]}_vs_${objects[1]}`;
  }
  if (objects.length === 1) {
    const second = objects[0] === "earth" ? "mars" : "earth";
    return `${objects[0]}_vs_${second}`;
  }
  return "earth_vs_mars";
}

function resolveHistoricalMissionId(t) {
  if (t.includes("venera")) return "venera_7";
  if (t.includes("perseverance") || t.includes("persevarence") || t.includes("persaverence")) return "perseverance";
  if (t.includes("jwst") || t.includes("james webb")) return "jwst";
  if (t.includes("hubble")) return "hubble";
  return "apollo_11";
}

export function detectNasaQueryCategory(promptText) {
  const t = String(promptText || "").toLowerCase().replace(/\u0307/g, "");

  if (APOD_KEYWORDS.some((kw) => hasKeyword(t, kw))) {
    return {
      queryType: "apod",
      identifier: "today",
      categoryName: "NASA Astronomy Picture of the Day (APOD)",
    };
  }

  // Afet sorusu "görüntü" kelimesi içerse de EONET'e gider; panel uydu görüntüsünü zaten gösterir
  const eonetIntent = detectEonetIntent(t);
  if (eonetIntent) return eonetIntent;

  if (PHOTO_INTENT_KEYWORDS.some((kw) => hasKeyword(t, kw))) {
    const cfg = resolveNasaImageSearchConfig(promptText);
    return {
      queryType: cfg.isMarsRover ? "mars_photos" : "universal_photo",
      identifier: cfg.key,
      categoryName: `NASA Resmi Görsel Arşivi [EN GÜNCEL: ${cfg.searchQuery.toUpperCase()}]`,
    };
  }

  if (
    MARS_WEATHER_TARGETS.some((kw) => hasKeyword(t, kw)) &&
    MARS_WEATHER_TERMS.some((kw) => hasKeyword(t, kw))
  ) {
    return {
      queryType: "mars_weather",
      identifier: "storm",
      categoryName: "NASA InSight & MEDA Mars Hava Durumu ve Fırtına API",
    };
  }

  if (
    ["patlama", "flare", "güneş fırtına", "güneş leke", "radyasyon", "noaa", "güneşte son durum", "guneste son durum"]
      .some((kw) => hasKeyword(t, kw))
  ) {
    return {
      queryType: "solar",
      identifier: "latest",
      categoryName: "NOAA/NASA Güneş Patlama & Leke İzleme",
    };
  }

  if (/\b[iı]ss\b|uzay\s*[iı]stasyon|[iı]stasyon\s*nerede|space\s*station/.test(t)) {
    return {
      queryType: "iss",
      identifier: "live",
      categoryName: "NASA JPL Horizons Canlı ISS Yörüngesi",
    };
  }

  if (["voyager", "parker", "new horizons", "juno", "horizons"].some((kw) => hasKeyword(t, kw))) {
    const craft = t.includes("parker") ? "parker" : "voyager_1";
    return {
      queryType: "spacecraft",
      identifier: craft,
      categoryName: `NASA Derin Uzay Filosu [${craft.toUpperCase()}]`,
    };
  }

  if (["asteroit", "asteroid", "neo", "çarpm", "göktaşı"].some((kw) => hasKeyword(t, kw))) {
    return {
      queryType: "neo",
      identifier: "hazardous",
      categoryName: "NASA NeoWs Asteroit Kataloğu",
    };
  }

  if (
    ["apollo", "lunar mod", "ay mod", "kartal", "eagle", "venera", "armstrong", "iniş görev", "perseverance", "persevarence", "persaverence", "james webb", "jwst", "hubble"]
      .some((kw) => hasKeyword(t, kw))
  ) {
    const id = resolveHistoricalMissionId(t);
    return {
      queryType: "mission",
      identifier: id,
      categoryName: `NASA Tarihi Görev & Teleskop Telemetrisi [${id.toUpperCase()}]`,
    };
  }

  if (["karşılaştır", "kıyasla", "vs", "hangisi daha büyük", "farkı ne"].some((kw) => hasKeyword(t, kw))) {
    const compId = resolveComparisonIdentifier(promptText);
    return {
      queryType: "comparison",
      identifier: compId,
      categoryName: `NASA Gezegen Karşılaştırma Kataloğu [${compId.toUpperCase()}]`,
    };
  }

  return null;
}

export async function fetchSpaceDataSafe(queryType, identifier, rawPromptText = "", resultIndex = 0) {
  const q = (queryType || "").toLowerCase();
  const id = (identifier || "").toLowerCase();

  if (["universal_photo", "mars_photos", "perseverance_photos", "rover_photos"].includes(q)) {
    return await fetchUniversalNasaPhoto(rawPromptText || id, resultIndex);
  }

  // Taha'nın dataLayer sözleşmesi varsa öncelikli olarak oradan oku
  try {
    const dataLayerPath = path.resolve("src", "api", "dataLayer.js");
    if (fs.existsSync(dataLayerPath)) {
      const dataLayer = await import(pathToFileURL(dataLayerPath).href);
      if (typeof dataLayer.getSpaceData === "function") {
        const result = await dataLayer.getSpaceData(queryType, identifier);
        const hasContent =
          result !== null &&
          result !== undefined &&
          (Array.isArray(result) ? result.length > 0 : Object.keys(result).length > 0);
        if (hasContent) return result;
      }
    }
  } catch (err) {
    console.warn("dataLayer.getSpaceData çağrısında yedek veriye düşüldü:", err.message);
  }

  return getFallbackSpaceData(queryType, identifier);
}
