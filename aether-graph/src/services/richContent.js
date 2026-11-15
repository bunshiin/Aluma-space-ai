// Pop-up ve bilgi kartlarını niyete göre dolduran zengin içerik alanları: Gemini'ye kural metni ve gelen değerin doğrulaması.

export const RICH_CONTENT_PARAM_KEYS = new Set(["description", "facts", "sections", "image_query", "is_general_question"]);

const MAX_DESCRIPTION_CHARS = 1400;
const MAX_FACTS = 10;
const MAX_SECTIONS = 4;
const MAX_IMAGE_QUERY_CHARS = 80;

export const RICH_CONTENT_INSTRUCTION =
  "4. ZENGİN İÇERİK (HER YANITTA ZORUNLU): Ekrandaki pop-up ve bilgi kartı parameters'tan dolar, kısa kalmasın. Kullanıcının TAM olarak ne sorduğuna (niyetine) göre doldur:\n" +
  "- title: konunun kısa başlığı.\n" +
  "- description: soruya doğrudan cevap veren 3-5 cümlelik, somut sayı ve bilgiler içeren açıklama.\n" +
  '- facts: niyete uygun 4-8 satır [{"label": "...", "value": "..."}]. Gezegen için çap, kütle, yerçekimi, gün ve yıl uzunluğu, uydu sayısı, sıcaklık; görev veya araç için fırlatma tarihi, ajans, hedef, durum; olay için tarih, konum, büyüklük gibi.\n' +
  '- sections: 1-3 bölüm [{"heading": "...", "body": "2-3 cümle"}] (ör. Nasıl oluşur?, Neden önemli?, İlginç bilgi).\n' +
  '- image_query: konunun görselini bulmak için kısa İNGİLİZCE arama terimi (ör. "black hole", "Jupiter Great Red Spot").\n' +
  "speech_text ise bunların 1-3 cümlelik sesli özetidir; description'ı aynen tekrar etme.";

export const GENERAL_QUESTION_INSTRUCTION =
  "5. GENEL SORU NİYETİ: Soru belirli bir gök cismine, uzay aracına veya yere BAĞLI DEĞİL, bağımsız bir kavram/olay/kişi hakkındaysa (kara delik nedir, ışık yılı nedir, Isaac Newton kimdir, süpernova nasıl oluşur): action_type 'OPEN_POPUP', template_id 'NONE', parameters.is_general_question true dön. Bu durumda target, primary_object gibi hedef alanlarını EKLEME; Güneş Sistemi'nde odak yapılmayacak, geniş bir bilgi penceresi açılacak.\n" +
  "Soru belirli bir cisim/araç/yerle doğrudan ilgiliyse (Aya ilk ayak basan insan kim, Mars'ta su var mı, Voyager ne zaman fırlatıldı, Jüpiter'in en büyük uydusu) genel soru DEĞİLDİR: is_general_question ekleme, target_object ile o cismi ver ve action_type 'FOCUS_OBJECT' kullan; image_query'yi yine mutlaka doldur (konunun fotoğrafı sahnede odakla birlikte ayrı pencerede gösterilir).";

function cleanString(value, maxChars) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function sanitizeFacts(value) {
  if (!Array.isArray(value)) return null;
  const facts = value
    .map((entry) => (entry && typeof entry === "object" ? { label: cleanString(entry.label, 48), value: cleanString(entry.value, 160) } : null))
    .filter((entry) => entry && entry.label && entry.value)
    .slice(0, MAX_FACTS);
  return facts.length > 0 ? facts : null;
}

function sanitizeSections(value) {
  if (!Array.isArray(value)) return null;
  const sections = value
    .map((entry) => (entry && typeof entry === "object" ? { heading: cleanString(entry.heading, 80), body: cleanString(entry.body, 700) } : null))
    .filter((entry) => entry && entry.body)
    .slice(0, MAX_SECTIONS);
  return sections.length > 0 ? sections : null;
}

/**
 * Zengin içerik alanını doğrular; geçersizse null döner (alan eklenmez). Hata fırlatmaz.
 */
export function sanitizeRichContentParam(key, value) {
  if (key === "description") return cleanString(value, MAX_DESCRIPTION_CHARS) || null;
  if (key === "facts") return sanitizeFacts(value);
  if (key === "sections") return sanitizeSections(value);
  if (key === "image_query") return cleanString(value, MAX_IMAGE_QUERY_CHARS) || null;
  if (key === "is_general_question") return value === true ? true : null;
  return null;
}
