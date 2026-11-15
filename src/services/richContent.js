// Pop-up ve bilgi kartlarını niyete göre dolduran zengin içerik alanları: Gemini'ye kural metni ve gelen değerin doğrulaması.

export const RICH_CONTENT_PARAM_KEYS = new Set(["description", "facts", "sections", "image_query", "is_general_question", "is_off_topic"]);

const MAX_DESCRIPTION_CHARS = 1400;
const MAX_FACTS = 10;
const MAX_SECTIONS = 4;
const MAX_IMAGE_QUERY_CHARS = 80;

export const RICH_CONTENT_INSTRUCTION =
  "4. ZENGİN İÇERİK: Ekrandaki pop-up ve bilgi kartı parameters'tan dolar, kısa kalmasın. Kullanıcının TAM olarak ne sorduğuna (niyetine) göre doldur:\n" +
  "- title: konunun kısa başlığı.\n" +
  "- description: soruya doğrudan cevap veren 3-5 cümlelik, somut sayı ve bilgiler içeren açıklama.\n" +
  '- facts: niyete uygun 4-8 satır [{"label": "...", "value": "..."}]. Gezegen için çap, kütle, yerçekimi, gün ve yıl uzunluğu, uydu sayısı, sıcaklık; görev veya araç için fırlatma tarihi, ajans, hedef, durum; olay için tarih, konum, büyüklük; matematik/fizik sorusu için verilenler, formül ve sonuç gibi.\n' +
  '- sections: 1-3 bölüm [{"heading": "...", "body": "2-3 cümle"}] (ör. Nasıl oluşur?, Çözüm adımları, Neden önemli?, İlginç bilgi).\n' +
  '- image_query: Uzay, gök cisimleri, astronomi, uzay araçları VEYA görselle/diyagramla desteklenebilecek matematik/geometri/fizik konularında konunun görselini bulmak için tam İNGİLİZCE Wikipedia madde başlığı (ör. "black hole", "Jupiter Great Red Spot", "Pythagorean theorem", "Navier-Stokes equations", "Square root", "Derivative"). DİKKAT: "complex math blackboard" gibi uydurma/süsleme kelimeler YAZMA, doğrudan kavramın/teoremin ansiklopedik İngilizce adını yaz. Günlük sohbet/kişisel sorularda, henüz konusu belli olmayan genel ödev cümlelerinde ("matematik ödevime yardım et" gibi) ve alakasız konularda image_query KESİNLİKLE EKLEME.\n' +
  "speech_text ise bunların 1-3 cümlelik sesli özetidir; description'ı aynen tekrar etme.";

export const GENERAL_QUESTION_INSTRUCTION =
  "5. GENEL SORU, MATEMATİK VE SOHBET AYRIMI:\n" +
  "- UZAY/ASTRONOMİ GENEL SORUSU: Soru belirli bir gök cismine/araca bağlı değil ama doğrudan uzay, astronomi veya astrofizik kavramı/kişisi hakkındaysa (kara delik nedir, ışık yılı nedir, Isaac Newton kimdir, süpernova nasıl oluşur): action_type 'OPEN_POPUP', template_id 'NONE', parameters.is_general_question true ve image_query doldur.\n" +
  "- BELİRLİ GÖK CİSMİ/ARAÇ SORUSU: Soru belirli bir cisim/araç/yerle doğrudan ilgiliyse (Aya ilk ayak basan insan kim, Mars'ta su var mı, Voyager ne zaman fırlatıldı, Jüpiter'in en büyük uydusu): is_general_question ekleme, target_object ile o cismi ver, action_type 'FOCUS_OBJECT' kullan ve image_query doldur.\n" +
  "- DOĞAL AFET VE DEPREM SORULARI (NASA EONET & USGS): Deprem, deprem şiddeti/büyüklüğü, derinliği, sismograf/sismik aktivite, merkez üssü, volkan, yangın, fırtına ve sel soruları sistemin doğrudan parçasıdır; ASLA 'sismograf verilerini veya deprem şiddetlerini takip edemem' diyerek reddetme. Aday olayların tüm verilerini (büyüklük/şiddet Mw, derinlik km, enlem ve boylam koordinatları, tarih/saat, merkez üssü/bölge, durum ve kaynak) speech_text, description ve facts içinde eksiksiz sun.\n" +
  "- MATEMATİK / GEOMETRİ / FİZİK ÖDEV VE SORULARI: Matematik, geometri ve fizik sorularını (karekök, teoremler, en zor formüller, hız-yol-zaman problemleri vb.) doğrudan, adım adım ve anlaşılır şekilde CEVAPLA. Eğer sorulan matematik/fizik konusu bir diyagram, grafik, geometrik şekil veya ünlü denklem/teorem görseliyle desteklenmeye uygunsa (ör. karekök diyagramı, Pisagor teoremi, Navier-Stokes denklemleri, türev/integral grafiği, hız-zaman grafiği) action_type 'OPEN_POPUP', parameters.is_general_question true seç ve image_query alanına o matematiksel kavramın TAM İNGİLİZCE Wikipedia başlığını (ör. 'Square root', 'Pythagorean theorem', 'Navier-Stokes equations', 'Velocity') yaz. Görsel gerektirmeyen soyut/genel ifadelerde ('matematik ödevime yardım eder misin' gibi) ise action_type 'SHOW_FACT_CARD' seç ve image_query ekleme.\n" +
  "- GÜNLÜK SOHBET VE KİŞİSEL/SİSTEM SORULARI (CEVAPLA AMA RESİM KOYMA): 'naber', 'nasılsın', 'hayat nasıl gidiyor', 'bana kendinden bahset', 'kişilik özelliklerin var mı', 'her zaman doğruyu söylüyor musun' gibi soruları doğrudan cevapla; ancak bunlarda HER ZAMAN action_type 'SHOW_FACT_CARD', template_id 'NONE' seç ve parameters içine is_general_question veya image_query KESİNLİKLE EKLEME.";

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
  if (key === "is_off_topic") return value === true ? true : null;
  return null;
}
