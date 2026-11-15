// ElevenLabs seslendirmesi (Mustafa'nın modülünden): sunucuda çalışır, anahtar .env'den okunur ve tarayıcıya gitmez.
// Tarayıcı POST /api/tts ile metni gönderir, MP3 sesi geri alır.

import { cleanSpeechTextForTts } from "./speechTextCleaner.js";

const FREE_TIER_FEMALE_VOICES = [
  "Xb7hH8MSUJpSbSDYk0k2", // Alice: net eğitim/bilim anlatıcısı
  "EXAVITQu4vr4xnSDxMaL", // Sarah
  "XrExE9yKIg1WjnnlVkGX", // Matilda
  "cgSgspJ2msm6clMCkdW9", // Jessica
  "FGY2WhTYpPnrIDTdsKH5", // Laura
];
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_TTS_CHARS = 600;
const AUDIO_CACHE_LIMIT = 40;
// Kota bitince her cümlede boşuna istek atılmasın; bu süre boyunca ElevenLabs'e hiç gidilmez
const QUOTA_RETRY_MS = 10 * 60 * 1000;
export const TTS_FAILURE = Object.freeze({ QUOTA: "quota_exceeded", UNAUTHORIZED: "unauthorized", NETWORK: "network", REJECTED: "rejected" });

let lastFailure = null;
let quotaBlockedUntil_ms = 0;

// Aynı cümleyi tekrar seslendirmek kotayı harcamasın diye son sesler bellekte tutulur
const audioCache = new Map();

const PLACEHOLDER_KEY = "your_elevenlabs_api_key";

// ELEVENLABS_API_KEYS (virgüllü liste) öncelikli; eski tek anahtar ELEVENLABS_API_KEY da listeye eklenir
function readApiKeys(env) {
  const candidates = [...String(env.ELEVENLABS_API_KEYS || "").split(","), String(env.ELEVENLABS_API_KEY || "")];
  const keys = candidates.map((k) => k.trim()).filter((k) => k && k !== PLACEHOLDER_KEY);
  return [...new Set(keys)];
}

function readTtsConfig(env) {
  return {
    apiKeys: readApiKeys(env),
    voiceId: String(env.ELEVENLABS_VOICE_ID || FREE_TIER_FEMALE_VOICES[0]).trim(),
    modelId: String(env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID).trim(),
  };
}

/**
 * Son seslendirme isteğinin neden başarısız olduğu (TTS_FAILURE değerlerinden biri) ya da null.
 */
export function getElevenLabsFailure() {
  return lastFailure;
}

// ElevenLabs kota dolunca da 401 döner; asıl neden gövdedeki "code" alanındadır
async function readFailureReason(res) {
  const body = typeof res.json === "function" ? await res.json().catch(() => null) : null;
  const code = String(body?.detail?.code || body?.detail?.status || "");
  if (code === "quota_exceeded") return TTS_FAILURE.QUOTA;
  return res.status === 401 ? TTS_FAILURE.UNAUTHORIZED : TTS_FAILURE.REJECTED;
}

export function isElevenLabsConfigured(env = process.env) {
  return readApiKeys(env).length > 0;
}

function requestTtsAudio(fetchFn, apiKey, voiceId, modelId, text) {
  const payload = { text, model_id: modelId, voice_settings: { stability: 0.55, similarity_boost: 0.8 } };
  if (modelId.includes("v2_5")) payload.language_code = "tr";
  return fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function rememberAudio(key, buffer) {
  audioCache.set(key, buffer);
  if (audioCache.size > AUDIO_CACHE_LIMIT) audioCache.delete(audioCache.keys().next().value);
}

// Tek bir anahtarla sesleri dener. Kota/yetki hatasında { nextKey: true } döner, böylece sıradaki anahtar denenir.
async function synthesizeWithKey(fetchFn, apiKey, voices, modelId, text) {
  for (const candidate of voices) {
    const res = await requestTtsAudio(fetchFn, apiKey, candidate, modelId, text);
    if (res.ok) return { buffer: Buffer.from(await res.arrayBuffer()) };
    const reason = await readFailureReason(res);
    if (reason === TTS_FAILURE.QUOTA || reason === TTS_FAILURE.UNAUTHORIZED) return { reason, nextKey: true };
    if (![400, 402, 404].includes(res.status)) {
      console.warn(`[ElevenLabs TTS] Ses üretilemedi (HTTP ${res.status}, ${reason}).`);
      return { reason, nextKey: false };
    }
  }
  return { reason: TTS_FAILURE.REJECTED, nextKey: false };
}

/**
 * Metni temizleyip ElevenLabs'tan MP3 üretir. Başarısızlıkta null döner, hata fırlatmaz.
 * Anahtar kotaya/yetkiye takılırsa sıradaki anahtara geçilir; ses kotaya/izne takılırsa (400/402/404) sıradaki ücretsiz sese geçilir.
 */
export async function createElevenLabsAudio(rawText, { env = process.env, fetchFn = globalThis.fetch } = {}) {
  const { apiKeys, voiceId, modelId } = readTtsConfig(env);
  const text = cleanSpeechTextForTts(rawText).slice(0, MAX_TTS_CHARS);
  if (apiKeys.length === 0 || !text || typeof fetchFn !== "function") return null;

  const cacheKey = `${voiceId}|${modelId}|${text}`;
  if (audioCache.has(cacheKey)) {
    lastFailure = null;
    return audioCache.get(cacheKey);
  }
  if (Date.now() < quotaBlockedUntil_ms) {
    lastFailure = TTS_FAILURE.QUOTA;
    return null;
  }

  const voices = [voiceId, ...FREE_TIER_FEMALE_VOICES.filter((v) => v !== voiceId)];
  try {
    let lastReason = TTS_FAILURE.REJECTED;
    for (const apiKey of apiKeys) {
      const outcome = await synthesizeWithKey(fetchFn, apiKey, voices, modelId, text);
      if (outcome.buffer) {
        rememberAudio(cacheKey, outcome.buffer);
        lastFailure = null;
        return outcome.buffer;
      }
      lastReason = outcome.reason;
      if (!outcome.nextKey) break;
    }
    lastFailure = lastReason;
    if (lastReason === TTS_FAILURE.QUOTA) {
      // Tüm anahtarlar kotada; tek net uyarı yazılır ve bir süre denenmez
      quotaBlockedUntil_ms = Date.now() + QUOTA_RETRY_MS;
      console.warn("[ElevenLabs TTS] Kredi kotası doldu: seslendirme kapalı. Yeni anahtar/plan gerekir ya da kota yenilenmesi beklenir.");
    } else {
      console.warn("[ElevenLabs TTS] Hiçbir ses/anahtar kullanılamadı (kota veya izin).");
    }
  } catch (err) {
    lastFailure = TTS_FAILURE.NETWORK;
    console.warn("[ElevenLabs TTS] Bağlantı hatası:", err?.message);
  }
  return null;
}

export function clearElevenLabsCache() {
  audioCache.clear();
  lastFailure = null;
  quotaBlockedUntil_ms = 0;
}
