// Seslendirilecek ve ekranda okunacak konuşma metnini temizler (Mustafa'nın ElevenLabs okunuş kurallarıyla).
// Kural: metinde kesinlikle link, resim/model dosyası adı veya "[... Linki: ...]" etiketi kalmaz.
// Saf fonksiyonlar; hem sunucu (TTS) hem yönlendirici (speech_text) kullanır.

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const MEDIA_FILE_RE = /\b[\w~./-]+\.(?:jpe?g|png|gif|webp|svg|tiff?|bmp|glb|gltf|mp4|mov|webm|mp3|wav|pdf)\b/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const DOMAIN_RE = /\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|gov|edu|io)(?:\/\S*)?/gi;
const LINK_LABEL_RE = /\[[^\]]*(?:link|bağlant|görsel|fotoğraf|http|www\.)[^\]]*\]/gi;
const NASA_ASSET_ID_RE = /\b(?:PIA\d{4,6}|[A-Z]{2,}[-_]\d{4,}[\w-]*)\b/g;

/**
 * Link, dosya adı ve NASA arşiv kimliği gibi okunamayan parçaları siler; düz metin döner.
 */
export function removeLinksAndFiles(rawText) {
  if (typeof rawText !== "string") return "";
  return rawText
    .replace(LINK_LABEL_RE, " ")
    .replace(URL_RE, " ")
    .replace(DOMAIN_RE, " ")
    .replace(MEDIA_FILE_RE, " ")
    .replace(NASA_ASSET_ID_RE, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function convertIsoDatesToTurkish(text) {
  return text.replace(
    /\b(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?\b/g,
    (_, year, month, day) => `${parseInt(day, 10)} ${TURKISH_MONTHS[Math.max(0, Math.min(11, parseInt(month, 10) - 1))]} ${year}`
  );
}

/**
 * ElevenLabs'a gidecek metin: link/dosya temizliği + Türkçe okunuş (tarih, ondalık, birim, özel isim).
 */
export function cleanSpeechTextForTts(rawSpeechText) {
  let text = removeLinksAndFiles(rawSpeechText).replace(/\*\*|__|[*`#]/g, "");
  text = convertIsoDatesToTurkish(text);
  // Ondalık sayılar Türkçe okunur: "1.28" → "1 virgül 28"
  text = text.replace(/(\d+)\.(\d+)/g, "$1 virgül $2");
  return text
    .replace(/\bkm\/sa\b|\bkm\/h\b/gi, "kilometre bölü saat")
    .replace(/\bkm\/s\b/gi, "kilometre bölü saniye")
    .replace(/\bm\/s(?:²|2|\^2)/gi, "metre bölü saniye kare")
    .replace(/\bkm\b/gi, "kilometre")
    .replace(/\bsn\b/gi, "saniye")
    .replace(/°\s*C\b/g, " santigrat derece")
    .replace(/°/g, " derece ")
    .replace(/\bJWST\b/g, "Ceyms Veb Uzay Teleskobu")
    .replace(/\bHubble\b/gi, "Habıl")
    .replace(/\bPerseverance\b/gi, "Pörsiviyrıns")
    .replace(/\bCuriosity\b/gi, "Küriyositi")
    .replace(/\bVoyager\b/gi, "Voyacır")
    .replace(/\bCassini\b/gi, "Kassini")
    .replace(/\bJuno\b/gi, "Cuno")
    .replace(/\s+/g, " ")
    .trim();
}
