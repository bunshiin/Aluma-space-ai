// Genel soru niyeti: Güneş Sistemi'nde odak yapılmaz, geniş bilgi penceresi (OPEN_POPUP) açılır ve konunun görseli eklenir.

import { fetchGeneralTopicImage } from "./generalImageFetcher.js";

// Sahne/kamera seçtirebilecek hedef alanları genel soruda rotadan çıkarılır
const SCENE_TARGET_KEYS = ["primary_object", "secondary_object", "target_object", "source", "target", "mode"];

const OFF_TOPIC_STRIP_KEYS = [
  ...SCENE_TARGET_KEYS,
  "is_general_question",
  "image_query",
  "image_url",
  "hd_image_url",
  "first_image_url",
  "first_hd_image_url",
  "first_nasa_id",
  "first_title",
  "first_date_taken_utc",
  "nasa_id",
  "nasa_gallery_url",
  "photo_title",
  "camera",
  "center",
  "date_taken_utc",
  "credit",
  "supporting_photo",
  "image_title",
  "image_source",
  "image_page_url",
  "facts",
  "sections",
];

/**
 * Alakasız (kapsam dışı) sorularda tüm görsel, genel soru ve hedef alanlarını temizler;
 * pop-up açılmasını engeller ve yalnızca metin kartı (SHOW_FACT_CARD) gösterilmesini garanti eder.
 */
export function enforceOffTopicRoute(route) {
  const params = route?.parameters;
  if (!params || Array.isArray(params.events)) return false;

  const combinedText = `${params.title || ""} ${params.description || ""} ${route.speech_text || ""}`;
  const looksLikeRefusal = /uzay alanı dışı|kapsam dışı|uzay ve astronomi sınırları|bunu kesinlikle yapamam|alakasız/i.test(combinedText);
  if (!params.is_off_topic && !looksLikeRefusal) return false;

  route.action_type = "SHOW_FACT_CARD";
  route.template_id = "NONE";
  params.is_off_topic = true;
  params.data_source = "GEMINI";
  for (const key of OFF_TOPIC_STRIP_KEYS) delete params[key];
  if (!params.title) params.title = "Kapsam Dışı İstek";
  if (!params.description && route.speech_text) params.description = route.speech_text;
  return true;
}

/**
 * Rota genel soru ise yerinde günceller: hedefleri siler, OPEN_POPUP + NONE yapar, görsel yoksa arar.
 * Afet listesi (EONET) veya kapsam dışı (is_off_topic) rotalara dokunmaz.
 */
export async function applyGeneralQuestionRoute(route, promptText = "", fetchFn = globalThis.fetch) {
  const params = route?.parameters;
  if (!params || enforceOffTopicRoute(route)) return route;
  if (route.action_type === "SHOW_FACT_CARD") {
    if (params.is_general_question) {
      for (const key of SCENE_TARGET_KEYS) delete params[key];
    }
    delete params.is_general_question;
    delete params.image_query;
    return route;
  }
  if (!params.is_general_question || Array.isArray(params.events)) return route;

  route.action_type = "OPEN_POPUP";
  route.template_id = "NONE";
  for (const key of SCENE_TARGET_KEYS) delete params[key];
  if (!params.title) params.title = promptText;

  if (!params.image_url) {
    const image = await fetchGeneralTopicImage(params.image_query, params.title, fetchFn);
    if (image) Object.assign(params, image);
  }
  return route;
}

// Görsel eklenmeyecek aksiyonlar: karşılaştırma kendi sahnesini çizer, bilgi kartı/sıfırlama/panel kapatma görsel istemez
// Kendi özel sahnesini çizen şablonlar fotoğraf penceresi istemez (APOLLO_11 gibi konu şablonları ister)
const SCENE_TEMPLATES = new Set(["SOLAR_FLARE", "NEO_SWARM", "LIGHT_DELAY", "GRAVITY_SIM"]);
const NO_PHOTO_ACTIONS = new Set(["SHOW_FACT_CARD", "SHOW_COMPARISON", "RESET_VIEW", "CLOSE_PANEL", "SHOW_TIMELINE", "ADD_TO_HOMEWORK", "SHOW_HOMEWORK_BASKET", "EXPORT_PDF"]);

/**
 * Odaklanılan/anlatılan konunun görseli de gelsin: Gemini image_query verdiyse fotoğraf aranır ve rota
 * `supporting_photo` ile işaretlenir; UI sahnede odağı korurken fotoğrafı pop-up penceresinde de gösterir.
 * Afet listesi, NASA fotoğraf rotası (zaten image_url var), genel soru ve özel sahne şablonlarına dokunmaz.
 */
export async function attachSupportingPhoto(route, fetchFn = globalThis.fetch) {
  const params = route?.parameters;
  if (!params || params.is_off_topic || params.is_general_question || Array.isArray(params.events) || params.image_url) return route;
  if (NO_PHOTO_ACTIONS.has(route.action_type) || SCENE_TEMPLATES.has(route.template_id)) return route;
  if (typeof params.image_query !== "string" || !params.image_query.trim()) return route;

  const image = await fetchGeneralTopicImage(params.image_query, params.title || "", fetchFn);
  if (image) Object.assign(params, image, { supporting_photo: true });
  return route;
}
