// Sahne şablonu bekçisi ve sahne hedefi kuralları.
// Gemini bir cismin adını görünce o cismin özel sahnesini açabiliyor ("Güneş'te uzay aracı var mı?" → patlama).
// Şablon ancak kullanıcı o olayı gerçekten istediyse açılır; değilse NONE olur ve odak hedefe gider.

import { hasKeyword } from "./keywordMatch.js";

// Şablon → kullanıcının söylemesi gereken kelimelerden en az biri
const TEMPLATE_INTENT_WORDS = Object.freeze({
  SOLAR_FLARE: ["patlama", "parlama", "flare", "fırtına", "firtina", "cme", "koronal", "püskürme", "puskurme", "güneş rüzgar", "gunes ruzgar", "radyasyon"],
  NEO_SWARM: ["asteroit", "asteroid", "göktaşı", "goktasi", "neo", "meteor", "çarpma", "carpma", "apophis", "bennu"],
  LIGHT_DELAY: ["ışık", "isik", "gecikme", "sinyal", "haberleşme", "haberlesme", "iletişim", "iletisim", "light"],
});

// Şablona bağlı, şablon iptal edilince anlamsız kalan parametreler
const TEMPLATE_ONLY_PARAMS = Object.freeze({
  SOLAR_FLARE: ["flare_class"],
  NEO_SWARM: ["asteroids", "query_mode", "requested_count"],
  LIGHT_DELAY: [],
});

/**
 * Kullanıcının sözleri şablonu desteklemiyorsa şablonu NONE yapar (rota yerinde güncellenir).
 */
export function applyTemplateIntentGuard(route, promptText) {
  const templateId = route?.template_id;
  const words = TEMPLATE_INTENT_WORDS[templateId];
  if (!words || words.some((word) => hasKeyword(String(promptText || "").toLocaleLowerCase("tr-TR"), word))) return route;
  route.template_id = "NONE";
  for (const key of TEMPLATE_ONLY_PARAMS[templateId]) delete route.parameters?.[key];
  return route;
}

export const SCENE_TARGET_INSTRUCTION =
  "6. SAHNE HEDEFİ (ODAK): Cevabın konusu belirli bir cisim veya uzay aracıysa onu parameters.target_object olarak yaz ve action_type 'FOCUS_OBJECT' kullan (bilgi istense de). Geçerli hedefler:\n" +
  "- Gezegen/uydu/cüce gezegen: SUN, MERCURY, VENUS, EARTH, MOON, MARS, JUPITER, IO, EUROPA, GANYMEDE, CALLISTO, SATURN, TITAN, URANUS, NEPTUNE, TRITON, CERES, PLUTO, HAUMEA, MAKEMAKE, ERIS.\n" +
  "- Uzay araçları: ISS, HUBBLE, JWST, PARKER (Parker Güneş Sondası), NEW_HORIZONS, VOYAGER_1, VOYAGER_2, MARS_PHOTO_SAT (Mars yörünge fotoğraf uydusu).\n" +
  "- Mars yüzeyi: PERSEVERANCE, CURIOSITY, INGENUITY, PATHFINDER.\n" +
  "- Ay yüzeyi: APOLLO_LUNAR_MODULE (Apollo 11 Ay Modülü / Lunar Module / Eagle — Ay yüzeyinde durur).\n" +
  "- Tekil 3D model sahnesi (Güneş Sistemi'nde yeri yok): ASTRONAUT_SUIT (astronot kıyafeti), SATURN_V (roket). Kullanıcı bunları görmek isterse bu kimliği yaz.\n" +
  "Soru bir cismin YAKININDAKİ aracı soruyorsa hedef cisim değil araçtır (ör. 'Güneş'te/Güneş'e yakın uzay aracı var mı?' → target_object 'PARKER').\n" +
  "template_id 'SOLAR_FLARE' YALNIZCA kullanıcı Güneş patlaması/parlaması/fırtınası/CME istediğinde, 'NEO_SWARM' YALNIZCA asteroit/göktaşı sorulduğunda, 'LIGHT_DELAY' YALNIZCA ışık/sinyal gecikmesi sorulduğunda seçilir; bir cismin adı geçti diye seçme.";
