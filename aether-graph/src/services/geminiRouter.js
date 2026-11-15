// AETHER-GRAPH Gemini Yönlendirici (Bölüm A - Mustafa)
// Sözleşme: getRouteFromGemini(userInput) -> Promise<RouteJSON>

import {
  VALID_ACTION_TYPES,
  VALID_TEMPLATE_IDS,
  DEFAULT_FALLBACK_SPEECH,
  isNonEmptyString,
  isPlainObject,
} from "./geminiConstants.js";
import {
  buildConversationContents,
  clearConversationHistory as clearStoredHistory,
  getConversationHistory,
  recordTurnInHistory,
} from "./geminiHistory.js";
import {
  clearShownPhotoHistory,
  fetchUniversalNasaPhotoCandidates,
  markPhotoAsShown,
  resolveNasaImageSearchConfig,
} from "./nasaPhotoFetcher.js";
import { detectNasaQueryCategory, fetchSpaceDataSafe } from "./intentDetector.js";
import { attachEarthEventsToRoute, createEarthEventContext, resolveEarthEventChoice, selectFocusEvent } from "./earthEventFocus.js";
import eonetTexts from "../config/eonet_texts.json" with { type: "json" };
import {
  createCleanedJsonString,
  createSystemPrompt,
  getFallbackRoute,
  sanitizeGeminiOutput,
} from "./geminiPrompt.js";
import {
  createGeminiRouterConfig,
  getGeminiRouterRuntimeInfo,
  requestGeminiWithFailover,
} from "./geminiClient.js";
import { logRouteTelemetry } from "./geminiTelemetry.js";
import { applyGeneralQuestionRoute, attachSupportingPhoto } from "./generalQuestion.js";
import { applyTemplateIntentGuard } from "./sceneIntentGuard.js";
import { hasKeyword } from "./keywordMatch.js";

export function clearConversationHistory() {
  clearStoredHistory();
  clearShownPhotoHistory();
}

export {
  VALID_TEMPLATE_IDS,
  VALID_ACTION_TYPES,
  isPlainObject,
  isNonEmptyString,
  createGeminiRouterConfig,
  createCleanedJsonString,
  sanitizeGeminiOutput,
  createSystemPrompt,
  detectNasaQueryCategory,
  getConversationHistory,
};

function enrichWithNasaContext(sanitized, spaceDataContext, hasCustomClient, detectedCategory = null) {
  if (detectedCategory?.queryType === "comparison") {
    sanitized.action_type = "SHOW_COMPARISON";
    sanitized.template_id = "NONE";
    const parts = String(detectedCategory.identifier || "").split("_vs_");
    if (parts.length === 2) {
      if (!sanitized.parameters.primary_object) {
        sanitized.parameters.primary_object = parts[0].toUpperCase();
      }
      if (!sanitized.parameters.secondary_object) {
        sanitized.parameters.secondary_object = parts[1].toUpperCase();
      }
    }
  }

  // Asteroit listesi Güneş Sistemi sahnesindeki NEO sürüsüne doğrudan verilir
  if (detectedCategory?.queryType === "neo" && Array.isArray(spaceDataContext)) {
    sanitized.template_id = "NEO_SWARM";
    sanitized.parameters.asteroids = spaceDataContext;
    sanitized.parameters.query_mode = detectedCategory.mode || "replace";
    sanitized.parameters.requested_count = spaceDataContext.length;
  }

  if (detectedCategory?.queryType === "iss") {
    sanitized.parameters.target_object = "ISS";
    sanitized.parameters.target = "ISS";
    if (sanitized.action_type === "OPEN_POPUP" || sanitized.action_type === "RESET_VIEW") {
      sanitized.action_type = "FOCUS_OBJECT";
    }
  }

  if (!spaceDataContext) {
    sanitized.parameters.data_source = "GEMINI";
    return sanitized;
  }

  sanitized.parameters.data_source = "NASA_API";
  if (hasCustomClient && !spaceDataContext.first_image_url) return sanitized;

  const resolvedImg =
    spaceDataContext.image_url ||
    spaceDataContext.hd_image_url ||
    spaceDataContext.hdurl ||
    spaceDataContext.url;

  if (resolvedImg) sanitized.parameters.image_url = resolvedImg;
  if (spaceDataContext.hd_image_url) sanitized.parameters.hd_image_url = spaceDataContext.hd_image_url;
  if (spaceDataContext.nasa_gallery_url) sanitized.parameters.nasa_gallery_url = spaceDataContext.nasa_gallery_url;
  if (spaceDataContext.date_taken_utc) sanitized.parameters.date_taken_utc = spaceDataContext.date_taken_utc;
  if (spaceDataContext.nasa_id) sanitized.parameters.nasa_id = spaceDataContext.nasa_id;
  if (spaceDataContext.camera) sanitized.parameters.camera = spaceDataContext.camera;
  if (spaceDataContext.title) {
    sanitized.parameters.title = spaceDataContext.title;
    sanitized.parameters.photo_title = spaceDataContext.title;
  }
  if (spaceDataContext.first_image_url) {
    Object.assign(sanitized.parameters, {
      first_nasa_id: spaceDataContext.first_nasa_id,
      first_title: spaceDataContext.first_title,
      first_date_taken_utc: spaceDataContext.first_date_taken_utc,
      first_image_url: spaceDataContext.first_image_url,
      first_hd_image_url: spaceDataContext.first_hd_image_url || spaceDataContext.first_image_url,
    });
  }
  // Görsel linkleri sadece parameters içinde kalır; seslendirilen metne link veya dosya adı girmez
  return sanitized;
}

async function selectVerifiedPhotoWithGemini(promptText, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) {
    markPhotoAsShown(candidates[0].nasa_id);
    return candidates[0];
  }

  const summaryList = candidates.map((c, idx) => ({
    index: idx,
    nasa_id: c.nasa_id,
    title: c.title,
    date_taken_utc: c.date_taken_utc,
    center: c.center,
    description: c.description,
  }));

  const verifyPrompt =
    "Sen bir NASA görsel doğrulayıcısısın. Kullanıcı sorusundaki teleskop/araç/cisim için verilen adayları kontrol et: 'Bunu gerçekten istenen cihaz/teleskop mu çekti?' Sadece { \"selected_index\": number } JSON döndür. En güncel ve uygun olanın indeksini yaz, hiçbiri uymuyorsa 0 yaz.";
  const contents = [
    {
      role: "user",
      parts: [{ text: `İstek: "${promptText}"\nAdaylar:\n${JSON.stringify(summaryList, null, 2)}` }],
    },
  ];

  try {
    const res = await requestGeminiWithFailover(contents, verifyPrompt);
    const parsed = JSON.parse(createCleanedJsonString(res.text));
    const idx = Number.isInteger(parsed?.selected_index) && parsed.selected_index >= 0 && parsed.selected_index < candidates.length
      ? parsed.selected_index
      : 0;
    const chosen = candidates[idx];
    markPhotoAsShown(chosen.nasa_id);
    return chosen;
  } catch (err) {
    console.warn("Görsel doğrulama adımı atlandı, ilk aday seçiliyor:", err.message);
    markPhotoAsShown(candidates[0].nasa_id);
    return candidates[0];
  }
}

function parseUserInput(userInput) {
  if (typeof userInput === "string") {
    return { promptText: userInput.trim(), explicitStudentMode: null };
  }
  if (isPlainObject(userInput)) {
    return {
      promptText: typeof userInput.text === "string" ? userInput.text.trim() : "",
      explicitStudentMode: typeof userInput.is_student_mode === "boolean" ? userInput.is_student_mode : null,
    };
  }
  return { promptText: "", explicitStudentMode: null };
}

// Sadece önceki fotoğrafa dönük açık takip sözleri. "göster/ver/aç" her komutta geçtiği ve parça aramasında
// "uzay aracı"nın içinde bile eşleştiği için ipucu sayılmaz; yoksa yeni konu eski fotoğrafın devamı sanılıyordu.
const FOLLOWUP_PHOTO_HINTS = [
  "başka", "baska", "baka", "diğer", "diger", "farklı", "farkli", "bir tane", "bir sonraki", "sıradaki", "siradaki", "daha güncel",
];

function resolveContextualPrompt(promptText) {
  const current = detectNasaQueryCategory(promptText);
  const lower = promptText.toLowerCase();
  const isFollowupHint = FOLLOWUP_PHOTO_HINTS.some((h) => hasKeyword(lower, h));
  const wantsDifferent = ["başka", "baska", "baka", "diğer", "diger", "farklı", "farkli", "yeni", "sıradaki"].some((w) =>
    hasKeyword(lower, w)
  );

  // Kullanıcı aynı soruda teleskop adını tekrar yazsa bile "başka/farklı" istiyorsa sonraki görsele geç
  if (current && current.identifier !== "default") {
    return { effectivePrompt: promptText, resultIndex: wantsDifferent ? 1 : 0 };
  }
  if (!current && !isFollowupHint) {
    return { effectivePrompt: promptText, resultIndex: 0 };
  }

  const history = getConversationHistory();
  // Önceki yanıtlarda zaten görsel linki verildiyse yazım hatası olsa bile bir sonraki fotoğrafı seç
  let followupOffset = isFollowupHint ? 1 : 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === "user") {
      const prevText = history[i].text;
      const prevCat = detectNasaQueryCategory(prevText);
      const prevPhotoCfg = resolveNasaImageSearchConfig(prevText);
      if ((prevCat && prevCat.identifier !== "default") || prevPhotoCfg.key !== "default") {
        const wasPhotoTurn = ["universal_photo", "mars_photos", "perseverance_photos", "rover_photos", "apod"].includes(prevCat?.queryType);
        const index = wasPhotoTurn || wantsDifferent ? followupOffset : 0;
        return { effectivePrompt: `${prevText} ${promptText}`, resultIndex: index };
      }
      followupOffset += 1;
    }
  }
  return { effectivePrompt: promptText, resultIndex: 0 };
}

export async function getRouteFromGemini(userInput) {
  const { promptText, explicitStudentMode } = parseUserInput(userInput);
  if (!isNonEmptyString(promptText)) {
    return getFallbackRoute("Lütfen uzay veya Güneş Sistemi hakkında bir komut söyleyin.", Boolean(explicitStudentMode));
  }

  const isStudentMode = explicitStudentMode !== null ? explicitStudentMode : /öğrenci|basit|çocuk|ödev/i.test(promptText);
  const runtimeInfo = getGeminiRouterRuntimeInfo();
  const { effectivePrompt, resultIndex } = resolveContextualPrompt(promptText);
  const detectedCategory = detectNasaQueryCategory(effectivePrompt);

  let spaceDataContext = null;
  let earthEvents = null;
  if (detectedCategory) {
    const isPhoto = ["universal_photo", "mars_photos", "perseverance_photos", "rover_photos"].includes(detectedCategory.queryType);
    spaceDataContext = isPhoto && !runtimeInfo.hasCustomClient
      ? await selectVerifiedPhotoWithGemini(effectivePrompt, await fetchUniversalNasaPhotoCandidates(effectivePrompt, resultIndex, 10))
      : await fetchSpaceDataSafe(detectedCategory.queryType, detectedCategory.identifier, effectivePrompt, resultIndex);
  }

  // EONET listesi Gemini başarısız olsa bile UI'ya gider, küre doğru yere yine odaklanır
  let focusEvent = null;
  if (detectedCategory?.queryType === "eonet" && Array.isArray(spaceDataContext)) {
    earthEvents = spaceDataContext;
    focusEvent = selectFocusEvent(earthEvents, effectivePrompt);
    spaceDataContext = createEarthEventContext(earthEvents, focusEvent);
  }
  // Gemini cevap verdiyse seçimi o yapar ("NONE" = soruya uyan olay yok); vermediyse yerel seçim kullanılır
  const withEarthEvents = (route, geminiFocusId = undefined) => {
    if (!earthEvents) return route;
    const chosen = resolveEarthEventChoice(earthEvents, geminiFocusId, focusEvent);
    return attachEarthEventsToRoute(route, earthEvents, chosen, detectedCategory.identifier, eonetTexts.no_event_text);
  };

  try {
    const contents = buildConversationContents(promptText, isStudentMode);
    const sysPrompt = createSystemPrompt(isStudentMode, spaceDataContext);
    const rawResult = await requestGeminiWithFailover(contents, sysPrompt);
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(createCleanedJsonString(rawResult.text));
    } catch (parseErr) {
      console.warn("Gemini JSON parse hatası, fallback dönülüyor:", parseErr.message);
      return withEarthEvents(getFallbackRoute(DEFAULT_FALLBACK_SPEECH, isStudentMode));
    }

    const sanitized = applyTemplateIntentGuard(sanitizeGeminiOutput(parsedJson, isStudentMode), promptText);
    enrichWithNasaContext(sanitized, spaceDataContext, runtimeInfo.hasCustomClient, detectedCategory);
    withEarthEvents(sanitized, sanitized.parameters.focus_event_id);
    await applyGeneralQuestionRoute(sanitized, promptText);
    await attachSupportingPhoto(sanitized);
    recordTurnInHistory(promptText, sanitized.speech_text);
    logRouteTelemetry({ promptText, detectedCategory, keyIndex: rawResult.keyIndex, routeResult: sanitized, modelName: runtimeInfo.modelName, silent: runtimeInfo.silentTelemetry });
    return sanitized;
  } catch (err) {
    console.warn("getRouteFromGemini hatası, fallback dönülüyor:", err.message);
    const fb = withEarthEvents(getFallbackRoute(DEFAULT_FALLBACK_SPEECH, isStudentMode));
    logRouteTelemetry({ promptText, detectedCategory, keyIndex: -1, routeResult: fb, modelName: runtimeInfo.modelName, silent: runtimeInfo.silentTelemetry });
    return fb;
  }
}
