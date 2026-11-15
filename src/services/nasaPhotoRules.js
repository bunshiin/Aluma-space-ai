// NASA görsel arama kuralları, gezegen/araç eşleştirmeleri ve yedek fotoğraf sabitleri

import { isRealPhotoItem } from "./nasaImageFilter.js";
import { hasKeyword } from "./keywordMatch.js";

export const UNIVERSAL_PHOTO_FALLBACKS = Object.freeze({
  hubble: {
    subject: "Hubble Space Telescope (HST)",
    instrument: "Hubble Wide Field Camera 3 (WFC3) / ACS",
    nasa_id: "STScI-Hubble-Latest",
    title: "Hubble Deep Space Star-Forming Region & Galaxy Cluster",
    image_url: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001362/GSFC_20171208_Archive_e001362~orig.jpg",
    hd_image_url: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001362/GSFC_20171208_Archive_e001362~orig.jpg",
    nasa_gallery_url: "https://science.nasa.gov/mission/hubble/multimedia/hubble-images/",
    credit: "NASA/ESA/STScI",
  },
  jwst: {
    subject: "James Webb Space Telescope (JWST)",
    instrument: "NIRCam & MIRI (Near/Mid-Infrared)",
    nasa_id: "JWST-NIRCam-Latest",
    title: "James Webb Carina Nebula & Deep Field Infrared View",
    image_url: "https://images-assets.nasa.gov/image/weic2205a/weic2205a~orig.jpg",
    hd_image_url: "https://images-assets.nasa.gov/image/weic2205a/weic2205a~orig.jpg",
    nasa_gallery_url: "https://science.nasa.gov/mission/webb/multimedia/images/",
    credit: "NASA/ESA/CSA/STScI",
  },
  perseverance: {
    subject: "NASA Mars 2020 Perseverance Rover",
    instrument: "Mastcam-Z Left/Right Stereo Camera",
    sol: 1415,
    nasa_id: "PIA26242",
    title: "Jezero Crater Neretva Vallis & Cheyava Falls Rock Sample",
    image_url: "https://images-assets.nasa.gov/image/PIA26242/PIA26242~orig.jpg",
    hd_image_url: "https://images-assets.nasa.gov/image/PIA26242/PIA26242~orig.jpg",
    nasa_gallery_url: "https://science.nasa.gov/mission/mars-2020-perseverance/mars-images/",
    coordinates: { latitude_deg: 18.38, longitude_deg: 77.58 },
    credit: "NASA/JPL-Caltech/MSSS",
  },
  uranus: {
    subject: "Uranus (Voyager 2 & James Webb / Hubble Observations)",
    instrument: "JWST NIRCam & Voyager 2 Imaging Science Subsystem",
    nasa_id: "PIA18182",
    title: "Uranus as Seen by NASA's Voyager 2 & Space Telescopes",
    date_taken_utc: "2023-04-06T00:00:00Z",
    image_url: "https://images-assets.nasa.gov/image/PIA18182/PIA18182~orig.jpg",
    hd_image_url: "https://images-assets.nasa.gov/image/PIA18182/PIA18182~orig.jpg",
    first_nasa_id: "PIA00032",
    first_title: "Uranus Incoming View by Voyager 2 (1986)",
    first_date_taken_utc: "1986-01-25T00:00:00Z",
    first_image_url: "https://images-assets.nasa.gov/image/PIA00032/PIA00032~orig.jpg",
    first_hd_image_url: "https://images-assets.nasa.gov/image/PIA00032/PIA00032~orig.jpg",
    nasa_gallery_url: "https://science.nasa.gov/uranus/",
    credit: "NASA/JPL-Caltech/STScI",
  },
  default: {
    subject: "NASA Deep Space & Solar System",
    instrument: "NASA Space Science Optical/Infrared",
    nasa_id: "NASA-APOD-Latest",
    title: "NASA Astronomy Picture of the Day",
    image_url: "https://apod.nasa.gov/apod/image/2411/M31_HubbleSpitzer_3000.jpg",
    hd_image_url: "https://apod.nasa.gov/apod/image/2411/M31_HubbleSpitzer_3000.jpg",
    nasa_gallery_url: "https://images.nasa.gov/",
    credit: "NASA",
  },
});

// "Mars uydusundan/yörüngeden çekilmiş" fotoğraf: yüzeydeki rover değil, Mars Reconnaissance Orbiter (HiRISE/CTX)
const MARS_WORDS = ["mars", "kızıl gezegen", "kizil gezegen"];
const ORBITER_WORDS = ["uydu", "yörünge", "yorunge", "orbiter", "hirise", "mro", "reconnaissance", "uzaydan", "yukarıdan", "yukaridan"];
const MARS_ORBITER_CONFIG = Object.freeze({
  key: "mars_orbiter",
  searchQuery: "HiRISE Mars Reconnaissance Orbiter",
  center: "JPL",
  galleryUrl: "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/",
  instrumentDefault: "MRO HiRISE / CTX",
  isMarsRover: false,
});

export function isMarsOrbiterPhotoIntent(lowerText) {
  return MARS_WORDS.some((kw) => hasKeyword(lowerText, kw)) && ORBITER_WORDS.some((kw) => hasKeyword(lowerText, kw));
}

const PHOTO_SEARCH_RULES = [
  {
    keywords: ["hubble", "huble", "habble"],
    key: "hubble",
    searchQuery: "hubble",
    center: "STScI",
    galleryUrl: "https://science.nasa.gov/mission/hubble/multimedia/hubble-images/",
    instrumentDefault: "Hubble Wide Field Camera 3 (WFC3)",
  },
  {
    keywords: ["webb", "jwst"],
    key: "jwst",
    searchQuery: "webb",
    center: "STScI",
    galleryUrl: "https://science.nasa.gov/mission/webb/multimedia/images/",
    instrumentDefault: "JWST NIRCam / MIRI",
  },
  {
    keywords: ["curiosity"],
    key: "curiosity",
    searchQuery: "curiosity rover mars gale crater",
    galleryUrl: "https://science.nasa.gov/mission/msl-curiosity/mars-images/",
    instrumentDefault: "Curiosity Mastcam / MAHLI",
  },
  {
    keywords: ["perseverance", "persev", "persav", "percev", "jezero", "rover", "mars"],
    key: "perseverance",
    searchQuery: "perseverance rover mars jezero",
    galleryUrl: "https://science.nasa.gov/mission/mars-2020-perseverance/mars-images/",
    instrumentDefault: "Perseverance Mastcam-Z / Navcam",
    isMarsRover: true,
  },
  {
    keywords: ["uranüs", "uranus"],
    key: "uranus",
    searchQuery: "uranus planet voyager hubble webb",
    galleryUrl: "https://science.nasa.gov/uranus/",
    instrumentDefault: "Voyager 2 ISS / Hubble WFC3 / JWST NIRCam",
  },
  {
    keywords: ["neptün", "neptun", "neptune"],
    key: "neptune",
    searchQuery: "neptune planet voyager hubble webb",
    galleryUrl: "https://science.nasa.gov/neptune/",
    instrumentDefault: "Voyager 2 ISS / Hubble WFC3 / JWST NIRCam",
  },
  {
    keywords: ["venüs", "venus"],
    key: "venus",
    searchQuery: "venus planet magellan mariner",
    galleryUrl: "https://science.nasa.gov/venus/",
    instrumentDefault: "Magellan SAR / Mariner 10",
  },
  {
    keywords: ["merkür", "merkur", "mercury"],
    key: "mercury",
    searchQuery: "mercury planet messenger mariner",
    galleryUrl: "https://science.nasa.gov/mercury/",
    instrumentDefault: "MESSENGER MDIS",
  },
  {
    keywords: ["plüton", "pluton", "pluto", "new horizons"],
    key: "pluto",
    searchQuery: "pluto new horizons",
    galleryUrl: "https://science.nasa.gov/dwarf-planets/pluto/",
    instrumentDefault: "New Horizons LORRI / Ralph",
  },
  {
    keywords: ["satürn", "saturn", "cassini"],
    key: "cassini",
    searchQuery: "saturn rings cassini",
    galleryUrl: "https://science.nasa.gov/saturn/multimedia/",
    instrumentDefault: "Cassini ISS / Hubble WFC3",
  },
  {
    keywords: ["jüpiter", "jupiter", "juno"],
    key: "juno",
    searchQuery: "jupiter juno",
    galleryUrl: "https://www.missionjuno.swri.edu/junocam/",
    instrumentDefault: "JunoCam Optical",
  },
  {
    keywords: ["güneş", "gunes", "solar"],
    key: "solar",
    searchQuery: "sun solar flare sdo",
    galleryUrl: "https://sdo.gsfc.nasa.gov/data/",
    instrumentDefault: "NASA Solar Dynamics Observatory (AIA)",
  },
  {
    keywords: ["moon", "apollo"],
    wordKeywords: ["ay"],
    key: "moon",
    searchQuery: "apollo moon surface lunar reconnaissance",
    galleryUrl: "https://science.nasa.gov/moon/",
    instrumentDefault: "LRO Narrow Angle Camera / Apollo Hasselblad",
  },
  {
    keywords: ["iss", "ıss", "uzay istasyon", "uzay ıstasyon"],
    key: "iss",
    searchQuery: "international space station earth orbit",
    galleryUrl: "https://www.nasa.gov/international-space-station/",
    instrumentDefault: "ISS External High-Definition Camera",
  },
  {
    keywords: ["voyager"],
    key: "voyager",
    searchQuery: "voyager pale blue dot outer planets",
    galleryUrl: "https://science.nasa.gov/mission/voyager/",
    instrumentDefault: "Voyager Imaging Science Subsystem",
  },
  {
    keywords: ["kara delik", "black hole"],
    key: "black_hole",
    searchQuery: "black hole event horizon chandra",
    galleryUrl: "https://science.nasa.gov/universe/black-holes/",
    instrumentDefault: "Event Horizon Telescope / Chandra X-Ray",
  },
  {
    keywords: ["nebula", "bulutsu", "galaksi", "gökada", "andromeda"],
    key: "hubble",
    searchQuery: "nebula galaxy hubble james webb",
    galleryUrl: "https://science.nasa.gov/mission/hubble/multimedia/hubble-images/",
    instrumentDefault: "Hubble & JWST Deep Field Optical/IR",
  },
];

function matchesWordKeyword(lowerText, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zçğıöşü0-9])${escaped}([^a-zçğıöşü0-9]|$)`, "i").test(lowerText);
}

export function resolveNasaImageSearchConfig(promptText) {
  const lower = String(promptText || "").toLowerCase().replace(/\u0307/g, "");
  if (isMarsOrbiterPhotoIntent(lower)) return { ...MARS_ORBITER_CONFIG };
  for (const rule of PHOTO_SEARCH_RULES) {
    // Kelime başında aranır: "mars" → "Mars'ın" eşleşir, başka bir kelimenin içi eşleşmez
    const hasSubstring = rule.keywords.some((kw) => hasKeyword(lower, kw));
    const hasWord = Array.isArray(rule.wordKeywords)
      ? rule.wordKeywords.some((wk) => matchesWordKeyword(lower, wk))
      : false;
    if (hasSubstring || hasWord) {
      return {
        key: rule.key,
        searchQuery: rule.searchQuery,
        center: rule.center || null,
        galleryUrl: rule.galleryUrl,
        instrumentDefault: rule.instrumentDefault,
        isMarsRover: Boolean(rule.isMarsRover),
      };
    }
  }
  return {
    key: "default",
    searchQuery: "nebula galaxy deep space",
    center: null,
    galleryUrl: "https://images.nasa.gov/",
    instrumentDefault: "NASA Space Telescope",
    isMarsRover: false,
  };
}

const NON_SPACE_EVENT_WORDS = [
  "launch", "liftoff", "falcon", "ariane", "kennedy space center", "rollout",
  "panel discussion", "audience", "headquarters", "conference", "auditorium",
  "press briefing", "ceremony", "award", "administrator", "speaking",
  "portrait", "workshop", "symposium", "meeting", "cleanroom", "illustration",
  "artist's concept", "artist concept",
];

export function isSpaceObservationItem(item) {
  const meta = item?.data?.[0];
  if (!meta) return false;
  if (meta.center === "HQ") return false;
  const text = `${meta.title || ""} ${meta.description || ""}`.toLowerCase();
  return !NON_SPACE_EVENT_WORDS.some((w) => text.includes(w)) && isRealPhotoItem(item);
}

export function hasFirstAndLatestIntent(promptText) {
  const lower = String(promptText || "").toLowerCase();
  const hasFirst = ["ilk", "eski", "first", "oldest", "earliest"].some((w) => matchesWordKeyword(lower, w) || lower.includes("ilk çek"));
  const hasLatest = ["son", "yeni", "güncel", "guncel", "latest", "newest", "recent"].some((w) => matchesWordKeyword(lower, w) || lower.includes("son çek"));
  return Boolean(hasFirst && hasLatest);
}

const LATEST_INTENT_KEYWORDS = [
  "en güncel", "en guncel", "en son", "son çek", "son cek",
  "güncel", "guncel", "en yeni", "yeni çek", "yeni cek",
  "latest", "newest", "recent", "bugün", "bugun",
];

export function hasLatestIntent(promptText) {
  if (hasFirstAndLatestIntent(promptText)) return false;
  const lower = String(promptText || "").toLowerCase();
  return LATEST_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}
