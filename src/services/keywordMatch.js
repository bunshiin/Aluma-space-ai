// Türkçe niyet anahtar kelimesi eşleştirme (saf). Niyet algılayıcı ve NASA fotoğraf kuralları ortak kullanır.

// Anahtar kelime kelime başında aranır (Türkçe ekler sonda kalır): "afet" → "afetler" eşleşir,
// "kıyafet" eşleşmez. Metin içinde parça araması "astronot kıyafetleri"ni doğal afet sanıyordu.
const WORD_START_CHARS = "a-zçğıöşü0-9";
export function hasKeyword(text, keyword) {
  const escaped = String(keyword).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^${WORD_START_CHARS}])${escaped}`, "i").test(String(text || ""));
}
