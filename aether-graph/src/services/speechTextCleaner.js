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

const ONES_TR = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS_TR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];

const WORD_TO_NUM_TR = Object.freeze({
  sıfır: 0, sifir: 0, bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4,
  beş: 5, bes: 5, altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kırk: 40, kirk: 40, elli: 50,
  altmış: 60, altmis: 60, yetmiş: 70, yetmis: 70, seksen: 80, doksan: 90,
  yüz: 100, yuz: 100, bin: 1000, milyon: 1_000_000, milyar: 1_000_000_000,
});

function threeDigitsToTurkish(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const t = Math.floor(rem / 10);
  const o = rem % 10;
  if (h > 0) parts.push(h === 1 ? "yüz" : `${ONES_TR[h]} yüz`);
  if (t > 0) parts.push(TENS_TR[t]);
  if (o > 0) parts.push(ONES_TR[o]);
  return parts.join(" ");
}

export function numberToTurkishWords(num) {
  const n = Math.trunc(Number(num));
  if (!Number.isFinite(n) || n < 0) return String(num);
  if (n === 0) return "sıfır";

  const scales = [
    { value: 1_000_000_000, label: "milyar" },
    { value: 1_000_000, label: "milyon" },
    { value: 1000, label: "bin" },
    { value: 1, label: "" },
  ];
  let remaining = n;
  const parts = [];
  for (const { value, label } of scales) {
    if (remaining >= value) {
      const chunk = Math.floor(remaining / value);
      remaining %= value;
      if (value === 1000 && chunk === 1) {
        parts.push("bin");
      } else {
        const words = threeDigitsToTurkish(chunk);
        parts.push(label ? `${words} ${label}` : words);
      }
    }
  }
  return parts.join(" ").trim();
}

function parseTurkishNumberTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const raw of tokens) {
    const key = raw.toLocaleLowerCase("tr-TR");
    const val = WORD_TO_NUM_TR[key];
    if (val === undefined) return null;
    if (val === 100) {
      current = (current === 0 ? 1 : current) * 100;
    } else if (val >= 1000) {
      total += (current === 0 ? 1 : current) * val;
      current = 0;
    } else {
      current += val;
    }
  }
  return total + current;
}

const NUM_WORD_PATTERN = "(?:sıfır|sifir|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|kirk|elli|altmış|altmis|yetmiş|yetmis|seksen|doksan|yüz|yuz|bin|milyon|milyar)";
const TIME_SUFFIX_PATTERN = "(?:te|ta|de|da|ten|tan|den|dan)";
const TR_WORD_START = "(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])";
const TR_WORD_END = "(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])";

function convertSpokenTimeAfterSaat(text) {
  const re = new RegExp(`${TR_WORD_START}(saat)\\s+((?:${NUM_WORD_PATTERN}\\s+){0,4}${NUM_WORD_PATTERN})(${TIME_SUFFIX_PATTERN})?${TR_WORD_END}`, "gi");
  return text.replace(re, (full, saatWord, rawWords, suffix = "") => {
    const tokens = rawWords.trim().split(/\s+/).map((w) => w.toLocaleLowerCase("tr-TR"));
    let hour = null;
    let minTokens = [];
    if ((tokens[0] === "sıfır" || tokens[0] === "sifir") && tokens.length >= 2 && WORD_TO_NUM_TR[tokens[1]] <= 9) {
      hour = WORD_TO_NUM_TR[tokens[1]];
      minTokens = tokens.slice(2);
    } else if ((tokens[0] === "on" || tokens[0] === "yirmi") && tokens.length >= 2) {
      if (WORD_TO_NUM_TR[tokens[1]] >= 1 && WORD_TO_NUM_TR[tokens[1]] <= 9 && tokens.length >= 3) {
        hour = WORD_TO_NUM_TR[tokens[0]] + WORD_TO_NUM_TR[tokens[1]];
        minTokens = tokens.slice(2);
      } else {
        hour = WORD_TO_NUM_TR[tokens[0]];
        minTokens = tokens.slice(1);
      }
    } else if (WORD_TO_NUM_TR[tokens[0]] >= 0 && WORD_TO_NUM_TR[tokens[0]] <= 9 && tokens.length >= 2) {
      hour = WORD_TO_NUM_TR[tokens[0]];
      minTokens = tokens.slice(1);
    }
    if (hour === null || hour > 23) return full;

    let minute = 0;
    if (minTokens.length > 0) {
      if ((minTokens[0] === "sıfır" || minTokens[0] === "sifir") && minTokens.length === 2 && WORD_TO_NUM_TR[minTokens[1]] <= 9) {
        minute = WORD_TO_NUM_TR[minTokens[1]];
      } else {
        const parsedMin = parseTurkishNumberTokens(minTokens);
        if (parsedMin === null || parsedMin > 59) return full;
        minute = parsedMin;
      }
    }
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    return `${saatWord} ${hh}:${mm}${suffix ? `'${suffix.toLocaleLowerCase("tr-TR")}` : ""}`;
  });
}

/**
 * Kullanıcının ekranda göreceği metin (speech_text):
 * Yazıyla yazılmış sayı, saat ve ondalıkları rakamlara çevirir ("On beş Kasım iki bin yirmi altı" → "15 Kasım 2026", "dört nokta dört" → "4.4").
 */
export function formatDisplaySpeechText(rawText) {
  let text = removeLinksAndFiles(rawText);
  if (!text) return "";

  // ISO tarih + saat varsa okunur rakamlı formata çevir
  text = text.replace(
    /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?Z?\b/g,
    (_, y, m, d, hm) => `${parseInt(d, 10)} ${TURKISH_MONTHS[Math.max(0, Math.min(11, parseInt(m, 10) - 1))]} ${y} saat ${hm}`
  );
  text = convertIsoDatesToTurkish(text);
  text = convertSpokenTimeAfterSaat(text);

  // Ondalık sayı okunuşları: "dört nokta dört" / "on iki virgül beş" → "4.4" / "12.5"
  const decRe = new RegExp(`${TR_WORD_START}((?:${NUM_WORD_PATTERN}\\s+)*${NUM_WORD_PATTERN})\\s+(?:nokta|virgül|virgul)\\s+((?:${NUM_WORD_PATTERN}\\s+)*${NUM_WORD_PATTERN})${TR_WORD_END}`, "gi");
  text = text.replace(decRe, (full, leftStr, rightStr) => {
    const leftVal = parseTurkishNumberTokens(leftStr.trim().split(/\s+/));
    const rightTokens = rightStr.trim().split(/\s+/);
    if (leftVal === null) return full;
    if ((rightTokens[0]?.toLocaleLowerCase("tr-TR") === "sıfır" || rightTokens[0]?.toLocaleLowerCase("tr-TR") === "sifir") && rightTokens.length === 2) {
      const unit = parseTurkishNumberTokens([rightTokens[1]]);
      if (unit !== null) return `${leftVal}.0${unit}`;
    }
    const rightVal = parseTurkishNumberTokens(rightTokens);
    if (rightVal === null) return full;
    return `${leftVal}.${rightVal}`;
  });

  // Tam sayı okunuşları: tek başına "bir" belgisiz sıfat olduğu için ("bir deprem") korunur
  const intRe = new RegExp(`${TR_WORD_START}((?:${NUM_WORD_PATTERN}\\s+)*${NUM_WORD_PATTERN})${TR_WORD_END}`, "gi");
  text = text.replace(intRe, (full) => {
    const tokens = full.trim().split(/\s+/);
    if (tokens.length === 1 && tokens[0].toLocaleLowerCase("tr-TR") === "bir") return full;
    const val = parseTurkishNumberTokens(tokens);
    return val !== null ? String(val) : full;
  });

  return text.replace(/\s+/g, " ").trim();
}

function capitalizeSentenceStarts(text) {
  return text.replace(/(^\s*|[.!?]\s+)([a-zçğıöşü])/g, (_, prefix, ch) => prefix + ch.toLocaleUpperCase("tr-TR"));
}

/**
 * Ses API'sine (ElevenLabs TTS) gönderilecek metin (tts_text):
 * Rakamları, saatleri, tarihleri, ondalıkları ve birimleri tamamen Türkçe okunuşuna (yazıya) çevirir.
 */
export function formatTtsSpeechText(rawTtsText, fallbackDisplayText = "") {
  const source = typeof rawTtsText === "string" && rawTtsText.trim() ? rawTtsText : fallbackDisplayText;
  let text = removeLinksAndFiles(source).replace(/\*\*|__|[*`#]/g, "");
  if (!text) return "";

  // ISO tarih + saat ("2026-11-15T09:24:00Z") → "15 Kasım 2026 tarihinde, saat 09:24"
  text = text.replace(
    /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?Z?\b/g,
    (_, y, m, d, hm) => `${parseInt(d, 10)} ${TURKISH_MONTHS[Math.max(0, Math.min(11, parseInt(m, 10) - 1))]} ${y} saat ${hm}`
  );
  text = convertIsoDatesToTurkish(text);

  // Saat ifadeleri: "09:24'te" / "09:24" → "sıfır dokuz yirmi dörtte"
  text = text.replace(/\b(\d{1,2}):(\d{2})(?:'([a-zA-ZçğıöşüÇĞİÖŞÜ]+))?\b/g, (_, hStr, mStr, suffix = "") => {
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const hWords = hStr.startsWith("0") && h > 0 && h < 10 ? `sıfır ${numberToTurkishWords(h)}` : numberToTurkishWords(h);
    let mWords = "";
    if (m > 0) {
      mWords = mStr.startsWith("0") && m < 10 ? `sıfır ${numberToTurkishWords(m)}` : numberToTurkishWords(m);
    }
    const combined = mWords ? `${hWords} ${mWords}` : hWords;
    return suffix ? `${combined}${suffix.toLocaleLowerCase("tr-TR")}` : combined;
  });

  // Ondalık sayılar: "4.4" veya "4,4" → "dört nokta dört"
  text = text.replace(/(\d+)[.,](\d+)/g, (_, intPart, fracPart) => {
    const left = numberToTurkishWords(parseInt(intPart, 10));
    const right = fracPart.startsWith("0") && fracPart.length > 1
      ? fracPart.split("").map((d) => numberToTurkishWords(parseInt(d, 10))).join(" ")
      : numberToTurkishWords(parseInt(fracPart, 10));
    return `${left} nokta ${right}`;
  });

  // Tam sayılar ve kesme işaretli ekleri: "15" → "on beş", "2026'da" → "iki bin yirmi altıda"
  text = text.replace(/\b(\d+)(?:'([a-zA-ZçğıöşüÇĞİÖŞÜ]+))?\b/g, (_, numStr, suffix = "") => {
    const words = numberToTurkishWords(parseInt(numStr, 10));
    return suffix ? `${words}${suffix.toLocaleLowerCase("tr-TR")}` : words;
  });

  text = text
    .replace(/\bkm\/sa\b|\bkm\/h\b/gi, "kilometre bölü saat")
    .replace(/\bkm\/s\b/gi, "kilometre bölü saniye")
    .replace(/\bm\/s(?:²|2|\^2)/gi, "metre bölü saniye kare")
    .replace(/\bkm\b/gi, "kilometre")
    .replace(/\bsn\b/gi, "saniye")
    .replace(/\bMw\b/g, "")
    .replace(/°\s*C\b/g, " santigrat derece")
    .replace(/°/g, " derece ")
    .replace(/\bJWST\b/g, "Ceyms Veb Uzay Teleskobu")
    .replace(/\bHubble\b/gi, "Habıl")
    .replace(/\bPerseverance\b/gi, "Pörsiviyrıns")
    .replace(/\bCuriosity\b/gi, "Küriyositi")
    .replace(/\bVoyager\b/gi, "Voyacır")
    .replace(/\bCassini\b/gi, "Kassini")
    .replace(/\bJuno\b/gi, "Cuno")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return capitalizeSentenceStarts(text);
}
