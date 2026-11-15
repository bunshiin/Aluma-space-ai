// Komut metinlerinden 3D model, gezegen karşılaştırması, yerçekimi testi ve aksiyon yedeklerini çözer.

import { MissionStateMachine } from "../logic/stateMachine.js";
import { calculateSingleBodyGravity, createSingleBodyFacts } from "./bodyFacts.js";

export const SOLAR_BODY_NAME_REGEX = /^(sun|mercury|venus|earth|moon|mars|ceres|jupiter|io|europa|ganymede|callisto|saturn|titan|uranus|neptune|triton|pluto|haumea|makemake|eris)$/i;

const COMPARE_HINT_RE = /kar[şs][ıi]la[şs]t[ıi]r|k[ıi]yasla|\bvs\b|b[üu]y[üu]kl[üu]k\s*fark|boyut\s*fark/i;
export const GRAVITY_WORD_RE = /yer[çc]ekimi|gravity|a[ğg][ıi]rl[ıi][ğg]?[ıi]?/i;
const GRAVITY_ACTION_RE = /serbest\s*d[üu][şs]|d[üu][şs]me|astronot.*test|yer[çc]ekimi\s*test|gravity\s*(?:sim|test)|ka[çc]\s*(?:kg|kilo)/i;
export const LIGHT_DELAY_HINT_RE = /[ıi][şs][ıi]k\s*gecik|light\s*delay|sinyal\w*\s.*(s[üu]r|gid|ula[şs]|gecik)|haberle[şs]me\s*gecik/i;

// "… ödevime ekle", "ödevime <konu> ekle", "ödev sepetine ekle", "ödevlerime kaydet", "ödevime ekler misin",
// "add to homework". Konu fiilden önce de gelebilir; ortadaki konu yakalanıp soruya geri konur.
const HOMEWORK_ADD_INTENT_RE = /[öo]dev\p{L}*\s+(?:sepet\p{L}*\s+)?(?:olarak\s+)?(?:(.{1,160}?)\s+)?(?:ekle|kaydet|koy)\p{L}*(?:\s+m[ıiuü]s[ıiuü]n(?:\s+l[üu]tfen)?)?|add\s+(?:this\s+)?to\s+(?:my\s+)?homework/iu;

/**
 * Komutta "ödeve ekle" niyeti varsa true döner; bu niyette sahne değişmez, sadece ödev kartı hazırlanır.
 */
export function isHomeworkIntent(text) {
  return HOMEWORK_ADD_INTENT_RE.test(String(text || ""));
}

// "ödevime X ekle" → " X ", "X ödevime ekle" → "X  ": niyet kalkar, konu yerinde kalır
function replaceHomeworkIntent(text) {
  return String(text || "").replace(HOMEWORK_ADD_INTENT_RE, (match, middle) => ` ${middle || ""} `);
}

/**
 * Komuttan sadece "ödevime ekle" ifadesini atar; kalan metin Gemini'ye sorulacak sorunun kendisidir.
 */
export function removeHomeworkIntent(text) {
  return replaceHomeworkIntent(text).replace(/\s+/g, " ").replace(/^[\s,.;:!-]+|[\s,;:-]+$/g, "").trim();
}

/**
 * Komuttan "ödevime ekle" ifadesini ve dolgu kelimeleri atıp kalan konu metnini döner.
 */
export function stripHomeworkIntent(text) {
  return replaceHomeworkIntent(text)
    .replace(/[.,!?;:]+/g, " ")
    .replace(/(^|\s)(bunu|şunu|sunu|bu|şu|su|konuyu|lütfen|lutfen|da|de)(?=\s|$)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const FALLBACK_ASTEROIDS = Object.freeze([
  { name: "99942 Apophis", close_approach_utc: "2029-04-13T21:46:00Z", distance_km: 31600, velocity_kmh: 107000, is_hazardous: true },
  { name: "2024 BX1", close_approach_utc: "2026-11-14T09:15:00Z", distance_km: 450000, velocity_kmh: 54000, is_hazardous: false },
  { name: "101955 Bennu", close_approach_utc: "2026-11-14T22:10:00Z", distance_km: 2200000, velocity_kmh: 100800, is_hazardous: true },
  { name: "2023 DZ2", close_approach_utc: "2026-11-15T04:30:00Z", distance_km: 18500000, velocity_kmh: 28000, is_hazardous: false }
]);

// Güneş Sistemi içinde yaşayan hedefler: rover/krater adları Mars yüzeyine dalış, araçlar yörüngede takip açar
export const SOLAR_TARGET_RULES = [
  [/perseverance|persevarence|jezero|rover/, "PERSEVERANCE"], [/curiosity|gale/, "CURIOSITY"],
  [/pathfinder|sojourner|ares\s*vallis/, "PATHFINDER"], [/ingenuity|helikopter|helicopter/, "INGENUITY"],
  [/mars.*(uydu|orbiter|y[öo]r[üu]nge)|\bmro\b|mars\s*photo\s*sat/, "MARS_PHOTO_SAT"], [/\biss\b|uzay\s*istasyon|istasyon\s*nerede|space\s*station/, "ISS"],
  [/hubble/, "HUBBLE"], [/james\s*webb|jwst|webb/, "JWST"], [/parker|solar\s*probe/, "PARKER"],
  [/new\s*horizons/, "NEW_HORIZONS"], [/voyager\s*(2|ii)\b/, "VOYAGER_2"], [/voyager/, "VOYAGER_1"],
  [/apollo|lunar\s*module|ay\s*mod[üu]l[üu]|kartal|eagle/, "APOLLO_LUNAR_MODULE"]
];

// Güneş Sisteminde yeri olmayan modeller tekil görev sahnesinde açılır
export const SPACECRAFT_RULES = [
  [/sat[üu]rn\s*(?:v|5)\b|roket/, "saturn_v"],
  [/astronot|suit|k[ıi]yafet|elbise/, "advanced_crew_escape_suit"]
];

export const BODY_RULES = [
  [/merk[üu]r|mercury/, "MERCURY"], [/ven[üu]s|venus/, "VENUS"], [/d[üu]nya|earth/, "EARTH"], [/\bay(?:'?(?:da|daki|ın|in|a))?\b|moon/, "MOON"],
  [/mars/, "MARS"], [/ceres/, "CERES"], [/j[üu]piter|jupiter/, "JUPITER"], [/\bio\b/, "IO"], [/europa/, "EUROPA"], [/ganymede/, "GANYMEDE"],
  [/callisto/, "CALLISTO"], [/sat[üu]rn|saturn/, "SATURN"], [/titan/, "TITAN"], [/uran[üu]s|uranus/, "URANUS"], [/nept[üu]n|neptune/, "NEPTUNE"],
  [/triton/, "TRITON"], [/pl[üu]ton|pluto/, "PLUTO"], [/haumea/, "HAUMEA"], [/makemake/, "MAKEMAKE"], [/\beris\b/, "ERIS"],
  [/g[üu]ne[şs]\s*sistemi|solar\s*system/, "SOLAR_SYSTEM_OVERVIEW"], [/g[üu]ne[şs]|\bsun\b/, "SUN"]
];

/**
 * Metin içinde geçen gök cismi kimliklerini yazıldığı sıraya göre çıkarır.
 */
export function extractBodiesFromText(text) {
  const cleaned = String(text || "").toLocaleLowerCase("tr-TR").replace(/\u0307/g, "").replace(/ı/g, "i").replace(/g[üu]ne[şs]\s*sistemi|solar\s*system/g, " ")
    .replace(/sat[üu]rn\s*(?:v|5)\b/g, " ");
  const hits = BODY_RULES.filter(([, id]) => id !== "SOLAR_SYSTEM_OVERVIEW")
    .map(([re, id]) => ({ id, match: cleaned.match(re) }))
    .filter((entry) => entry.match)
    .sort((a, b) => a.match.index - b.match.index);
  return [...new Set(hits.map((entry) => entry.id))];
}

/**
 * Gök cismi adını (Türkçe veya İngilizce) canonical UPPER_SNAKE kimliğine çevirir.
 */
export function normalizeComparisonBody(val) {
  if (typeof val !== "string" || !val.trim()) return null;
  const trimmed = val.trim();
  return SOLAR_BODY_NAME_REGEX.test(trimmed) ? trimmed.toUpperCase() : extractBodiesFromText(trimmed)[0] || null;
}

/**
 * İki gezegen karşılaştırması veya yerçekimi/düşme testi komutundan sahne parametrelerini çıkarır.
 */
export function extractComparisonParams(text) {
  const raw = String(text || "");
  if (!raw.trim() || LIGHT_DELAY_HINT_RE.test(raw)) return null;
  const bodies = extractBodiesFromText(raw);
  const parseNum = (re) => {
    const match = raw.match(re);
    return match ? Number.parseFloat(match[1].replace(",", ".")) : 0;
  };
  const mass = parseNum(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilogram|kilo)\b/i);
  const height = parseNum(/(\d+(?:[.,]\d+)?)\s*(?:m\b|metre)/i);
  const age = parseNum(/(\d+(?:[.,]\d+)?)\s*ya[şs](?:[ıi]nda)?\b/i);
  const hasCompare = COMPARE_HINT_RE.test(raw);
  const hasGravityTest = mass > 0 || height > 0 || age > 0 || GRAVITY_ACTION_RE.test(raw) || (GRAVITY_WORD_RE.test(raw) && bodies.length >= 2);
  if (!hasCompare && !hasGravityTest) return null;

  const is_gravity_test = hasGravityTest || GRAVITY_WORD_RE.test(raw);
  const params = {
    template_id: is_gravity_test ? "GRAVITY_SIM" : "NONE",
    model_url: "PLANET_COMPARISON",
    primary_object: bodies.length >= 2 ? bodies[0] : "EARTH",
    secondary_object: bodies.length >= 2 ? bodies[1] : (bodies[0] && bodies[0] !== "EARTH" ? bodies[0] : "MARS"),
    is_gravity_test
  };
  if (mass > 0) params.mass_kg = mass;
  if (height > 0) params.height_m = height;
  if (age > 0) params.age_years = age;
  return params;
}

/**
 * Gemini veya yerel rotadaki karşılaştırma parametrelerini 3D PLANET_COMPARISON sözleşmesine tamamlar.
 */
// Cisim kendisiyle kıyaslanmaz (MOON vs MOON): karşılaştırma yerine o cismin tek başına yerçekimi kartı açılır
function applySingleBodyCard(mergedParams, body) {
  const stats = calculateSingleBodyGravity(body);
  for (const key of ["primary_object", "secondary_object", "target_1", "target_2", "is_gravity_test"]) delete mergedParams[key];
  mergedParams.model_url = "SOLAR_SYSTEM";
  mergedParams.camera_target = body;
  if (!stats) return "FOCUS_OBJECT";
  const machine = new MissionStateMachine();
  const name = machine.getBodyName(body);
  const vars = { body: name, gravity: stats.gravity_ms2, fall_s: stats.fall_10m_s };
  mergedParams.title = machine.getUiText("topic_gravity_title", vars);
  mergedParams.description = machine.getUiText("topic_gravity_description", vars);
  mergedParams.student_description = machine.getUiText("topic_gravity_student_description", vars);
  mergedParams.facts = createSingleBodyFacts(stats, (key) => machine.getUiText(key));
  return "SHOW_FACT_CARD";
}

export function applyComparisonEnrichment(normalized, mergedParams, sceneHint, templateId) {
  const rawPrimary = mergedParams.primary_object || mergedParams.target_1 || mergedParams.source;
  const rawSecondary = mergedParams.secondary_object || mergedParams.target_2 || mergedParams.target;
  if (rawPrimary) mergedParams.primary_object = normalizeComparisonBody(rawPrimary) || rawPrimary;
  if (rawSecondary) mergedParams.secondary_object = normalizeComparisonBody(rawSecondary) || rawSecondary;
  const fallbackComp = extractComparisonParams(sceneHint);
  const isCompare =
    normalized.action_type === "SHOW_COMPARISON" ||
    templateId === "GRAVITY_SIM" ||
    (Boolean(fallbackComp) && normalized.action_type !== "OPEN_POPUP" && normalized.action_type !== "RESET_VIEW");
  if (!isCompare) return normalized.action_type;
  if (mergedParams.primary_object && mergedParams.primary_object === mergedParams.secondary_object) {
    return applySingleBodyCard(mergedParams, mergedParams.primary_object);
  }

  const hasExplicitModel = Boolean(mergedParams.model_url || mergedParams.modelUrl);
  const hasRowsTable = Array.isArray(mergedParams.rows) && !mergedParams.primary_object && !mergedParams.secondary_object;
  if (hasExplicitModel || hasRowsTable) return normalized.action_type;

  const bodies = extractBodiesFromText(sceneHint);
  mergedParams.primary_object = mergedParams.primary_object || fallbackComp?.primary_object || bodies[0] || "EARTH";
  mergedParams.secondary_object =
    mergedParams.secondary_object || fallbackComp?.secondary_object || bodies[1] || (bodies[0] && bodies[0] !== "EARTH" ? bodies[0] : "MARS");
  if (mergedParams.primary_object === mergedParams.secondary_object) return applySingleBodyCard(mergedParams, mergedParams.primary_object);
  if (typeof mergedParams.is_gravity_test !== "boolean") {
    mergedParams.is_gravity_test = templateId === "GRAVITY_SIM" || Boolean(fallbackComp?.is_gravity_test);
  }
  for (const key of ["mass_kg", "height_m", "age_years"]) {
    if (mergedParams[key] === undefined && fallbackComp?.[key] > 0) mergedParams[key] = fallbackComp[key];
  }
  mergedParams.model_url = "PLANET_COMPARISON";
  return "SHOW_COMPARISON";
}

/**
 * Türkçe/İngilizce komut metninden 3D model, kamera hedefi, karşılaştırma, asteroit ve Güneş patlaması parametrelerini çıkarır.
 */
export function resolveFallbackSceneParams(text) {
  // Gemini hedef kimlikleri UPPER_SNAKE gelir ("NEW_HORIZONS"); kurallar boşluklu adla yazıldığı için alt çizgi boşluk olur
  const value = String(text || "").toLocaleLowerCase("tr-TR").replace(/\u0307/g, "").replace(/ı/g, "i").replace(/_/g, " ");
  if (!value.trim()) return {};
  // Işık/sinyal gecikmesi: iki cisim varsa ilki kaynak, tek cisim varsa kaynak Dünya
  if (LIGHT_DELAY_HINT_RE.test(value)) {
    const bodies = extractBodiesFromText(value);
    const [source, target] = bodies.length >= 2 ? bodies : ["EARTH", bodies[0] && bodies[0] !== "EARTH" ? bodies[0] : "MARS"];
    return { template_id: "LIGHT_DELAY", model_url: "SOLAR_SYSTEM", source, target };
  }
  const comparison = extractComparisonParams(value);
  if (comparison) return comparison;
  for (const [pattern, cameraTarget] of SOLAR_TARGET_RULES) if (pattern.test(value)) return { model_url: "SOLAR_SYSTEM", camera_target: cameraTarget };
  for (const [pattern, slug] of SPACECRAFT_RULES) if (pattern.test(value)) return { model_url: `/public/models/${slug}.glb` };
  if (/g[üu]ne[şs]\s*patlama|solar\s*flare|patlama/.test(value)) return { model_url: "SOLAR_FLARE", camera_target: "SUN", flare_class: "X2.8" };
  if (/astero[iı]t|asteroid|\bneo\b|apophis|bennu|itokawa|g[öo]kta[şs]/.test(value)) {
    const cameraTarget = /apophis/.test(value) ? "99942 Apophis" : (/bennu/.test(value) ? "101955 Bennu" : "EARTH");
    return { template_id: "NEO_SWARM", model_url: "SOLAR_SYSTEM", camera_target: cameraTarget, asteroids: FALLBACK_ASTEROIDS.map((item) => ({ ...item })) };
  }
  for (const [pattern, cameraTarget] of BODY_RULES) if (pattern.test(value)) return { model_url: "SOLAR_SYSTEM", camera_target: cameraTarget };
  return {};
}

/**
 * Gemini yönlendiricisi henüz bağlı değilken girdiden yedek action_type çıkarır.
 */
export function resolveFallbackActionType(text) {
  const value = String(text || "");
  if (isHomeworkIntent(value)) return "ADD_TO_HOMEWORK";
  if (/sıfırla|sifirla|reset/i.test(value)) return "RESET_VIEW";
  if (/split|ikiye/i.test(value)) return "SPLIT_SCREEN";
  if (/popup|pencere|görsel|gorsel|resim|foto|görüntü|goruntu|ne çekti|çektiği|cektigi|apod/i.test(value)) return "OPEN_POPUP";
  if (/pdf|indir/i.test(value)) return "EXPORT_PDF";
  if (/sepet/i.test(value)) return "SHOW_HOMEWORK_BASKET";
  // Ekleme fiili olmadan geçen "ödev" sepeti açar; ekleme niyeti yukarıda isHomeworkIntent ile yakalanır
  if (/ödev|odev/i.test(value)) return "SHOW_HOMEWORK_BASKET";
  if (/kapat|close/i.test(value)) return "CLOSE_PANEL";
  if (extractComparisonParams(value) || /karşılaştır|karsilastir|kıyasla|kiyasla/i.test(value)) return "SHOW_COMPARISON";
  if (/zaman|timeline/i.test(value)) return "SHOW_TIMELINE";
  if (/kart|bilgi|mesafe|ışık\s*gecikmesi|isik\s*gecikmesi/i.test(value)) return "SHOW_FACT_CARD";
  return "OPEN_SIDE_PANEL";
}
