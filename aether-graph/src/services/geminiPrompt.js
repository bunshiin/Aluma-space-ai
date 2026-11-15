// Gemini sistem promptu üretimi, JSON temizleme ve çıktı doğrulama

import {
  DEFAULT_FALLBACK_SPEECH,
  VALID_ACTION_TYPES,
  VALID_TEMPLATE_IDS,
  isNonEmptyString,
  isPlainObject,
} from "./geminiConstants.js";
import { GENERAL_QUESTION_INSTRUCTION, RICH_CONTENT_INSTRUCTION, RICH_CONTENT_PARAM_KEYS, sanitizeRichContentParam } from "./richContent.js";
import { formatDisplaySpeechText, formatTtsSpeechText } from "./speechTextCleaner.js";
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
  const cleanDisplay = isNonEmptyString(speechText) ? formatDisplaySpeechText(speechText) : DEFAULT_FALLBACK_SPEECH;
  const finalDisplay = cleanDisplay || DEFAULT_FALLBACK_SPEECH;
  return {
    action_type: "RESET_VIEW",
    template_id: "NONE",
    parameters: { data_source: "FALLBACK" },
    speech_text: finalDisplay,
    tts_text: formatTtsSpeechText("", finalDisplay),
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

  // 1) Kullanıcının ekranda göreceği metin (speech_text): sayılar ve rakamlarla, linksiz
  // 2) Ses API'sinin okuyarak sese çevireceği metin (tts_text): sayıların ve birimlerin Türkçe okunuşuyla, linksiz
  const displaySpeechText = isNonEmptyString(rawOutput.speech_text)
    ? formatDisplaySpeechText(rawOutput.speech_text)
    : "";
  const finalSpeechText = displaySpeechText || DEFAULT_FALLBACK_SPEECH;
  const rawTtsCandidate = isNonEmptyString(rawOutput.tts_text)
    ? rawOutput.tts_text
    : isNonEmptyString(rawOutput.parameters?.tts_text)
      ? rawOutput.parameters.tts_text
      : "";
  const finalTtsText = formatTtsSpeechText(rawTtsCandidate, finalSpeechText) || finalSpeechText;

  return {
    action_type: rawOutput.action_type,
    template_id: rawOutput.template_id,
    parameters: cleanParams,
    speech_text: finalSpeechText,
    tts_text: finalTtsText,
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
    ? "is_student_mode AKTİF: Karşındaki bir öğrenci. speech_text ve tts_text alanlarını sade, anlaşılır ve merak uyandırıcı şekilde KISA tut (yalnızca 1-2 cümle)."
    : "is_student_mode PASİF (Genel Mod): speech_text ve tts_text alanlarını doğrudan konuya giren, net, bilimsel ve ÖZET bir dille KISA tut (yalnızca 1-2 cümle, gereksiz uzatma yapma).";

  const ttsGrammarInstruction =
    "ÇİFT METİN KURALI — KULLANICI METNİ (speech_text) VE SES API METNİ (tts_text) (ZORUNLU):\n" +
    "Her yanıtta birbirinin karşılığı olan İKİ AYRI METİN üretmelisin:\n" +
    "1. 'speech_text' (KULLANICININ EKRANDA GÖRECEĞİ METİN — RAKAMLARLA): Kullanıcının ekranda, bilgi panelinde ve altyazıda okuyacağı metindir. Tarihleri, saatleri, büyüklükleri, derinlikleri, mesafeleri ve tüm sayıları KESİNLİKLE RAKAMLARLA yaz (ASLA 'On beş Kasım iki bin yirmi altı' veya 'dört nokta dört' gibi yazıyla yazma).\n" +
    "   Örnek speech_text: \"15 Kasım 2026 tarihinde, saat 09:24'te Endonezya'nın Ruteng bölgesinde 4.4 büyüklüğünde ve 10 km derinliğinde bir deprem meydana gelmiştir.\"\n" +
    "2. 'tts_text' (SES API'SİNE VERİLECEK VE SESLENDİRİLECEK METİN — YAZIYLA / OKUNUŞUYLA): Yapay zekanın ses API'sine (TTS) vereceği ve ses API'sinin okuyarak sese çevireceği metindir. 'speech_text' ile aynı anlamı taşır ancak içindeki tüm sayılar, tarihler, saatler, ondalıklar ve kısaltmalar Türkçe okunuşuyla (yazıyla) yazılır ('km' yerine 'kilometre', 'sn' yerine 'saniye', '°C' yerine 'santigrat derece', 'JWST' yerine 'James Webb Uzay Teleskobu', '4.4' yerine 'dört nokta dört', '09:24'te' yerine 'sıfır dokuz yirmi dörtte', '15 Kasım 2026' yerine 'On beş Kasım iki bin yirmi altı').\n" +
    "   Örnek tts_text: \"On beş Kasım iki bin yirmi altı tarihinde, saat sıfır dokuz yirmi dörtte Endonezya'nın Ruteng bölgesinde dört nokta dört büyüklüğünde ve on kilometre derinliğinde bir deprem meydana gelmiştir.\"\n" +
    "3. ORTAK GRAMER VE LİNK YASAĞI:\n" +
    "- Tamamen kurallı, akıcı ve doğal Türkçe cümle yapısı (Özne + Tümleç + Yüklem) kullan; devrik veya İngilizce'den çeviri kokan cümle kurma.\n" +
    "- speech_text ve tts_text içinde KESİNLİKLE link (http, www), alan adı, resim/model dosyası adı (.jpg, .png, .glb), karmaşık dosya/ID kodları (PIA12110 vb.) veya köşeli parantezli etiket yazma. Linkler sadece parameters içinde durur.";

  const dualPhotoNote = spaceDataContext?.first_image_url
    ? "\n3. ÇİFT FOTOĞRAF KURALI (İLK VE SON): Kullanıcı hem ilk hem son fotoğrafı istedi. speech_text (rakamlarla) ve tts_text (okunuşuyla) içinde 2 kısa ve akıcı Türkçe cümleyle ilk ve son fotoğrafı özetle; link ekleme, görseller ekranda gösterilecek."
    : "";

  const dataInstruction = spaceDataContext
    ? `\nNASA VERİTABANI VE TELEMETRİSİ (ÖNCELİKLİ KAYNAK):\n${JSON.stringify(spaceDataContext, null, 2)}\nBİLİMSEL CİDDİYET VE FOTOĞRAF/VERİ KURALI (ZORUNLU):\n1. Resmi NASA verisini speech_text ve tts_text anlatımında temel al ve data_source alanını 'NASA_API' olarak damgala.\n2. Fotoğraf/görsel yanıtlarında kendi yorumunu veya spekülasyonunu EKLEME; NASA verisindeki gerçek başlığı, tarihi, kamerayı/teleskobu ve açıklamayı aktar. Fotoğraf linkini speech_text veya tts_text'e YAZMA; görsel ekranda gösterilecek.${dualPhotoNote}`
    : "\nKURAL: Bu soru canlı API gerektirmeyen genel bir bilimsel sorudur. Doğrudan kendi astronomi ve fizik bilgini kullanarak kesin, net ve bilimsel ciddiyetle yanıtla ve data_source alanını 'GEMINI' olarak damgala.";

  return [
    "Sen Aluma Güneş Sistemi ve Derin Uzay platformunun yapay zeka yönlendiricisisin.",
    `GÜNCEL SİSTEM TARİHİ VE SAATİ (UTC): ${nowIso} (Bugünün tarihi: ${todayDate}). Zaman, yıl, "bugün" veya "en son" ifadelerinde DAİMA bu güncel tarihi esas al; geçmiş yılları (ör. 2017, 2023, 2024) güncel tarihmiş gibi sunma.`,
    "Sadece geçerli bir JSON nesnesi döndür. Şema: { \"action_type\": \"...\", \"template_id\": \"...\", \"parameters\": { ... }, \"speech_text\": \"...\", \"tts_text\": \"...\", \"is_student_mode\": boolean }",
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
    "SCOPE GUARD (MATEMATİK VE UZAY İÇERMEYEN ALAKASIZ SORULAR İÇİN ZORUNLU KURAL): Yemek tarifi (pankek, çorba vb.), spor/futbol/maç skoru (derbi kaç kaç biter vb.), şehirler arası yol tarifi ve dünyevi ulaşım (İstanbul'dan Ankara'ya nasıl gidilir vb.), borsa, siyaset, magazin gibi uzay, fizik ve matematik içermeyen alakasız konularda SORUYU KESİNLİKLE CEVAPLAMA (yol tarifi verme, yemek tarifi verme, tahmin yürütme). Bunun yerine:\n" +
      "- action_type: 'SHOW_FACT_CARD', template_id: 'NONE' seç.\n" +
      "- parameters içinde 'is_off_topic': true ve 'title': 'Kapsam Dışı İstek' gönder.\n" +
      "- parameters içinde KESİNLİKLE image_query, image_url, is_general_question, facts, sections veya hedef cisim (target_object vb.) EKLEME (hiçbir resim koyulmayacak).\n" +
      "- speech_text ve parameters.description alanlarında ALAYCI, İĞNELEYİCİ ve KESİN bir dille, milyarlarca ışık yılı ötedeki galaksileri ve derin uzayı incelemek için tasarlanmış bir uzay sistemine böyle alakasız bir soru sorulmasını tiye al ve bunu KESİNLİKLE YAPAMAYACAĞINI net bir şekilde söyle.\n" +
      "- NOT: Dünya üzerindeki depremler (deprem şiddeti/büyüklüğü, derinliği, sismograf/sismik verileri, merkez üssü, fay hatları), volkan patlamaları, orman yangınları, fırtınalar ve tüm doğal afetler (NASA EONET & USGS) Aluma sisteminin DOĞRUDAN ANA ÖZELLİĞİDİR. Deprem veya sismik veri sorularında KESİNLİKLE 'anlık sismograf verilerini veya deprem şiddetlerini takip edemem ve bu tür dünyevi sorularınızı yanıtlayamam' DEME ve ASLA is_off_topic: true verme; verilen deprem/afet verilerinin tamamını (büyüklük Mw, derinlik km, koordinatlar, tarih/saat, merkez üssü, kaynak) eksiksiz aktar.\n" +
      "- NOT 2: Genel matematik/fizik/okul ödevleri (karekök, formül, araba hız-yol problemi vb.) ve günlük sohbet/kişisel sorular ('naber', 'nasılsın', 'kendinden bahset', 'kişiliğin var mı' vb.) bu yasağa dahil DEĞİLDİR; onları normal ve yardımcı bir dille cevapla. Matematik/fizik sorularında konuyu destekleyen bir diyagram, grafik veya formül görseli uygunsa OPEN_POPUP + is_general_question: true + tam İngilizce kavram başlığıyla image_query kullanabilirsin; günlük sohbet/kişisel sorularda ise KESİNLİKLE resim (image_query / is_general_question) koyma ve SHOW_FACT_CARD kullan.",
  ].join("\n");
}
