// Gemini sistem promptu üretimi, JSON temizleme ve çıktı doğrulama

import {
  DEFAULT_FALLBACK_SPEECH,
  VALID_ACTION_TYPES,
  VALID_TEMPLATE_IDS,
  isNonEmptyString,
  isPlainObject,
} from "./geminiConstants.js";
import { GENERAL_QUESTION_INSTRUCTION, RICH_CONTENT_INSTRUCTION, RICH_CONTENT_PARAM_KEYS, sanitizeRichContentParam } from "./richContent.js";
import { removeLinksAndFiles } from "./speechTextCleaner.js";
import { SCENE_TARGET_INSTRUCTION } from "./sceneIntentGuard.js";

const ALLOWED_FIXED_PARAM_KEYS = new Set([
  "primary_object",
  "secondary_object",
  "target_object",
  "source",
  "target",
  "mode",
  "mass_kg",
  "height_m",
  "speed_kms",
  "data_source",
  "nasa_id",
  "title",
  "photo_title",
  "subject",
  "camera",
  "center",
  "date_taken_utc",
  "image_url",
  "hd_image_url",
  "first_nasa_id",
  "first_title",
  "first_date_taken_utc",
  "first_image_url",
  "first_hd_image_url",
  "nasa_gallery_url",
  "credit",
  "sol",
  "coordinates",
  "flare_class",
  "focus_event_id",
  "query",
]);

const OBJECT_ID_PARAM_KEYS = new Set([
  "primary_object",
  "secondary_object",
  "target_object",
  "source",
  "target",
]);

function toUpperSnakeIdentifier(val) {
  return String(val || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function getFallbackRoute(speechText = DEFAULT_FALLBACK_SPEECH, isStudentMode = false) {
  return {
    action_type: "RESET_VIEW",
    template_id: "NONE",
    parameters: { data_source: "FALLBACK" },
    speech_text: isNonEmptyString(speechText) ? speechText.trim() : DEFAULT_FALLBACK_SPEECH,
    is_student_mode: Boolean(isStudentMode),
  };
}

export function createCleanedJsonString(rawText) {
  if (!isNonEmptyString(rawText)) return "";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
    cleaned = cleaned.replace(/```$/, "");
    cleaned = cleaned.trim();
  }
  return cleaned;
}

export function sanitizeGeminiOutput(rawOutput, fallbackStudentMode = false) {
  if (!isPlainObject(rawOutput)) {
    return getFallbackRoute(DEFAULT_FALLBACK_SPEECH, fallbackStudentMode);
  }
  if (!VALID_ACTION_TYPES.includes(rawOutput.action_type) || !VALID_TEMPLATE_IDS.includes(rawOutput.template_id)) {
    return getFallbackRoute(
      isNonEmptyString(rawOutput.speech_text) ? rawOutput.speech_text : DEFAULT_FALLBACK_SPEECH,
      typeof rawOutput.is_student_mode === "boolean" ? rawOutput.is_student_mode : fallbackStudentMode
    );
  }

  const cleanParams = {};
  if (isPlainObject(rawOutput.parameters)) {
    for (const [k, v] of Object.entries(rawOutput.parameters)) {
      if (v === null || v === undefined || v === "") continue;
      if (RICH_CONTENT_PARAM_KEYS.has(k)) {
        const clean = sanitizeRichContentParam(k, v);
        if (clean !== null) cleanParams[k] = clean;
        continue;
      }
      if (!ALLOWED_FIXED_PARAM_KEYS.has(k)) continue;
      cleanParams[k] = OBJECT_ID_PARAM_KEYS.has(k) && typeof v === "string" ? toUpperSnakeIdentifier(v) : v;
    }
  }
  if (!isNonEmptyString(cleanParams.data_source)) {
    cleanParams.data_source = "GEMINI";
  }

  // Seslendirilecek metne link, görsel/model dosyası veya arşiv kimliği asla girmez
  const speechText = isNonEmptyString(rawOutput.speech_text) ? removeLinksAndFiles(rawOutput.speech_text) : "";
  return {
    action_type: rawOutput.action_type,
    template_id: rawOutput.template_id,
    parameters: cleanParams,
    speech_text: speechText || DEFAULT_FALLBACK_SPEECH,
    is_student_mode:
      typeof rawOutput.is_student_mode === "boolean"
        ? rawOutput.is_student_mode
        : Boolean(fallbackStudentMode),
  };
}

export function createSystemPrompt(isStudentMode = false, spaceDataContext = null, nowDate = new Date()) {
  const nowIso = nowDate.toISOString();
  const todayDate = nowIso.split("T")[0];

  const modeInstruction = isStudentMode
    ? "is_student_mode AKTİF: Karşındaki bir öğrenci. speech_text alanını sade, anlaşılır ve merak uyandırıcı şekilde KISA tut (yalnızca 1-2 cümle). parameters.description ve sections metinlerini de ortaokul öğrencisinin anlayacağı yumuşak, sade bir dille yaz (zor terimleri kısaca açıkla); cevap öğrencinin ödevine eklenebilir."
    : "is_student_mode PASİF (Genel Mod): speech_text alanını doğrudan konuya giren, net, bilimsel ve ÖZET bir dille KISA tut (yalnızca 1-2 cümle, gereksiz uzatma yapma).";

  const ttsGrammarInstruction =
    "SESLENDİRME (TTS) VE TÜRKÇE GRAMER KURALI (ZORUNLU): speech_text doğrudan Türkçe sesli okuma motoru tarafından okunacaktır. Bu yüzden:\n" +
    "- Tamamen kurallı, akıcı ve doğal Türkçe cümle yapısı (Özne + Tümleç + Yüklem) kullan; devrik veya İngilizce'den çeviri kokan cümle kurma.\n" +
    "- Tarihleri cümle içinde ASLA '1996-01-15T18:46:16Z' gibi ham ISO koduyla yazma; '15 Ocak 1996 tarihinde' şeklinde Türkçe okunuşuyla yaz.\n" +
    "- Kısaltmaları ve sembolleri okunuşuyla yaz ('km' yerine 'kilometre', 'sn' yerine 'saniye', '°C' yerine 'santigrat derece', 'JWST' yerine 'James Webb Uzay Teleskobu').\n" +
    "- Cümle içinde parantez içi İngilizce terimler veya karmaşık dosya/ID kodları (PIA12110 vb.) kullanma; seslendirmenin tane tane ve doğal duraksamalarla okunması için uygun yerlerde virgül kullan.\n" +
    "- speech_text içinde KESİNLİKLE link (http, www), alan adı, resim/model dosyası adı (.jpg, .png, .glb) veya köşeli parantezli etiket yazma. Linkler sadece parameters içinde durur.";

  const dualPhotoNote = spaceDataContext?.first_image_url
    ? "\n3. ÇİFT FOTOĞRAF KURALI (İLK VE SON): Kullanıcı hem ilk hem son fotoğrafı istedi. speech_text içinde 2 kısa ve akıcı Türkçe cümleyle ilk ve son fotoğrafı özetle; link ekleme, görseller ekranda gösterilecek."
    : "";

  const dataInstruction = spaceDataContext
    ? `\nNASA VERİTABANI VE TELEMETRİSİ (ÖNCELİKLİ KAYNAK):\n${JSON.stringify(spaceDataContext, null, 2)}\nBİLİMSEL CİDDİYET VE FOTOĞRAF/VERİ KURALI (ZORUNLU):\n1. Resmi NASA verisini speech_text anlatımında temel al ve data_source alanını 'NASA_API' olarak damgala.\n2. Fotoğraf/görsel yanıtlarında kendi yorumunu veya spekülasyonunu EKLEME; NASA verisindeki gerçek başlığı, tarihi, kamerayı/teleskobu ve açıklamayı aktar. Fotoğraf linkini speech_text'e YAZMA; görsel ekranda gösterilecek.${dualPhotoNote}`
    : "\nKURAL: Bu soru canlı API gerektirmeyen genel bir bilimsel sorudur. Doğrudan kendi astronomi ve fizik bilgini kullanarak kesin, net ve bilimsel ciddiyetle yanıtla ve data_source alanını 'GEMINI' olarak damgala.";

  return [
    "Sen AETHER-GRAPH Güneş Sistemi ve Derin Uzay platformunun yapay zeka yönlendiricisisin.",
    `GÜNCEL SİSTEM TARİHİ VE SAATİ (UTC): ${nowIso} (Bugünün tarihi: ${todayDate}). Zaman, yıl, "bugün" veya "en son" ifadelerinde DAİMA bu güncel tarihi esas al; geçmiş yılları (ör. 2017, 2023, 2024) güncel tarihmiş gibi sunma.`,
    "Sadece geçerli bir JSON nesnesi döndür. Şema: { \"action_type\": \"...\", \"template_id\": \"...\", \"parameters\": { ... }, \"speech_text\": \"...\", \"is_student_mode\": boolean }",
    `İzin verilen template_id değerleri (BUNLARIN DIŞINDA DEĞER ÜRETME): ${VALID_TEMPLATE_IDS.join(", ")}`,
    `İzin verilen action_type değerleri (BUNLARIN DIŞINDA DEĞER ÜRETME): ${VALID_ACTION_TYPES.join(", ")}`,
    "SABİT PARAMETERS VE ŞABLON KURALLARI (ZORUNLU):",
    "1. Sabit parameters Anahtarları: Gezegene göre değişen key (jupiter_radius_km, moon_gravity_ms2 vb.) ASLA üretme. Sadece sabit alan adları ('primary_object', 'secondary_object', 'target_object') ve UPPER_SNAKE hedef isimleri ('JUPITER', 'MOON', 'MARS', 'EARTH' vb.) dön. Varsa sadece kullanıcıdan gelen değişkenleri ekle: 'mode', 'mass_kg', 'height_m', 'speed_kms'.",
    "2. Sayısal Sabitleri parameters İçine Yazma: Yarıçap, yerçekimi, kütle gibi sabitler spacePhysics.js ve dataLayer.js'ten gelecek; parameters içinde sadece niyet ve hedef ID'sini çıkar.",
    "3. Sözleşme Eşleşmeleri: Karşılaştırma sorularında template_id: 'NONE' + action_type: 'SHOW_COMPARISON' dön. Yerçekimi/ağırlık/düşme sorularında template_id: 'GRAVITY_SIM' dön. Işık gecikmesi sorularında template_id: 'LIGHT_DELAY' dön. Fotoğraf/galeri gösteriminde template_id: 'NONE' + action_type: 'OPEN_POPUP' (veya 'SHOW_FACT_CARD') dön.",
    RICH_CONTENT_INSTRUCTION,
    GENERAL_QUESTION_INSTRUCTION,
    SCENE_TARGET_INSTRUCTION,
    "DİYALOG GEÇMİŞİ VE BAĞLAM HATIRLAMA:",
    "Kullanıcının önceki mesajlarda bahsettiği cisimleri hatırla ve zamirler kullanıldığında bağlamı eksiksiz tamamla.",
    dataInstruction,
    modeInstruction,
    ttsGrammarInstruction,
    "SCOPE GUARD (YALNIZCA ALAKASIZ SORULAR İÇİN): SADECE uzay, astronomi, gezegenler, doğal olaylar ve fizikle HİÇBİR ALAKASI OLMAYAN konularda (maç sonucu, yemek tarifi, borsa gibi) template_id 'NONE', action_type 'SHOW_FACT_CARD' seç ve konumuzun uzay olduğunu esprili bir dille hatırlat.",
  ].join("\n");
}
