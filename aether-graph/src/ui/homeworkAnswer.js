// Gemini'nin bir soruya verdiği cevabı (rota JSON'u) ödev kartına çevirir: başlık, cevap metni, veriler ve
// soruyla birlikte gelen fotoğraf (soldaki pencerede gösterilenle aynı görsel).

const MAX_SECTIONS = 3;
// Bu kaynaklardan gelen rota Gemini'nin gerçek cevabıdır; sadece sesli özet taşısa da karta yazılır
const ANSWER_SOURCES = new Set(["GEMINI", "NASA_API"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRouteImage(parameters) {
  const url = [parameters.image_url, parameters.hd_image_url, parameters.images?.[0]?.image_url]
    .find((candidate) => typeof candidate === "string" && candidate.startsWith("https://"));
  if (!url) return null;
  return {
    image_url: url,
    image_title: cleanText(parameters.image_title) || cleanText(parameters.photo_title) || cleanText(parameters.title),
    image_source: cleanText(parameters.image_source) || cleanText(parameters.credit)
  };
}

/**
 * Rota ödev kartı yapılacak kadar gerçek bir cevap taşıyorsa true döner. Gemini'ye ulaşılamayınca üretilen yerel
 * yedek rota sadece "komut işlendi" türü bir speech_text taşır ve data_source içermez; o karta yazılmaz.
 */
export function hasUsableAnswer(route) {
  const params = route?.parameters && typeof route.parameters === "object" ? route.parameters : {};
  if (params.data_source === "FALLBACK") return false;
  if (cleanText(params.description) || (Array.isArray(params.sections) && params.sections.length > 0)) return true;
  return ANSWER_SOURCES.has(params.data_source) && Boolean(cleanText(route?.speech_text));
}

function toTargetKey(value) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
}

/**
 * Cevap metnini kurar. Öğrenci modunda önce sesli özet (sade 1-2 cümle) gelir, ardından açıklama ve bölümler.
 */
export function getAnswerText(route, isStudentMode) {
  const params = route?.parameters || {};
  const speech = cleanText(route?.speech_text);
  const description = cleanText(params.description);
  const sections = Array.isArray(params.sections)
    ? params.sections.slice(0, MAX_SECTIONS)
      .map((s) => [cleanText(s?.heading), cleanText(s?.body)].filter(Boolean).join(": "))
      .filter(Boolean)
    : [];
  // ADD_TO_HOMEWORK rotasının sesli metni "ödevine eklendi" bildirimidir, cevabın parçası değildir
  const usableSpeech = route?.action_type === "ADD_TO_HOMEWORK" && (description || sections.length > 0) ? "" : speech;
  const lead = isStudentMode ? [usableSpeech, description] : [description || usableSpeech];
  return [...new Set([...lead, ...sections].filter(Boolean))].join("\n\n");
}

/**
 * Soru ve cevaptan ödev öğesi kurar; cevap kullanılamazsa null. getText: states.json metinleri,
 * getImageQuery(hedef): Gemini image_query vermediğinde hedef cismin (target_object) fotoğraf arama terimi.
 */
export function createAnswerHomeworkItem(question, route, { isStudentMode = false, getText = () => "", getImageQuery = () => "" } = {}) {
  const safeQuestion = cleanText(question);
  if (!safeQuestion || !hasUsableAnswer(route)) return null;
  const params = route.parameters || {};
  const routeFacts = Array.isArray(params.facts) ? params.facts.filter((f) => f && typeof f === "object") : [];
  const questionLabel = getText("answer_question_label");
  return {
    id: `ANSWER|${safeQuestion.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`,
    title: cleanText(params.title) || safeQuestion,
    description: getAnswerText(route, false),
    student_description: getAnswerText(route, true),
    text: getAnswerText(route, isStudentMode),
    facts: [...(questionLabel ? [{ label: questionLabel, value: safeQuestion }] : []), ...routeFacts],
    image_query: cleanText(params.image_query) || cleanText(getImageQuery(toTargetKey(params.target_object || params.camera_target)))
      || cleanText(params.title) || safeQuestion,
    photo: getRouteImage(params)
  };
}
