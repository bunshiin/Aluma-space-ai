// AI konuşma metnini ElevenLabs sesiyle okur: metin sunucudaki POST /api/tts ucuna gider, MP3 geri gelir.
// Tarayıcının kendi sentez sesi bilerek kullanılmaz; ses gelmezse uygulama sessiz devam eder.

import { removeLinksAndFiles } from "../services/speechTextCleaner.js";

const TTS_ENDPOINT = "/api/tts";
const TTS_TIMEOUT_MS = 20000;

/**
 * env: fetch, Audio, URL sağlayan ortam (testte sahte verilir).
 */
export function createVoicePlayer(options = {}) {
  const env = options.env || globalThis;
  let isEnabled = typeof options.is_enabled === "boolean" ? options.is_enabled : true;
  let requestId = 0;
  let activeAudio = null;
  let activeUrl = null;

  function emitAiVoiceEvent(type) {
    const CustomEventCtor = env?.CustomEvent || globalThis?.CustomEvent;
    if (typeof CustomEventCtor !== "function") return;
    const evt = new CustomEventCtor(type);
    const targets = [options.doc, options.eventTarget, env, globalThis];
    const visited = new Set();
    for (const t of targets) {
      if (!t || visited.has(t)) continue;
      visited.add(t);
      if (typeof t?.dispatchEvent === "function") {
        try { t.dispatchEvent(evt); } catch (_) {}
      }
    }
  }

  function stop() {
    const wasPlaying = Boolean(activeAudio);
    requestId += 1;
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause?.();
      activeAudio.src = "";
    }
    if (activeUrl) env.URL?.revokeObjectURL?.(activeUrl);
    activeAudio = null;
    activeUrl = null;
    if (wasPlaying) {
      options.onStop?.();
      options.onEnd?.();
      emitAiVoiceEvent("ag:ai-voice-stop");
    }
  }

  /**
   * Metni seslendirir; yeni çağrı eskisini keser. Ses çalmaya başlarsa true döner.
   */
  async function speak(rawText) {
    stop();
    const text = removeLinksAndFiles(rawText);
    if (!isEnabled || !text || typeof env.fetch !== "function" || typeof env.Audio !== "function") return false;
    const myRequest = requestId;
    try {
      const resp = await env.fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      if (myRequest !== requestId) return false;
      if (!resp.ok || resp.status === 204) {
        // Sunucu sessizliğin nedenini bildirir (örn. quota_exceeded); UI kullanıcıya gösterebilsin
        options.onUnavailable?.(resp.headers?.get?.("X-Tts-Reason") || "unavailable");
        return false;
      }
      const blob = await resp.blob();
      if (myRequest !== requestId || !isEnabled) return false;
      activeUrl = env.URL.createObjectURL(blob);
      activeAudio = new env.Audio(activeUrl);
      activeAudio.onended = () => {
        stop();
      };
      activeAudio.onerror = () => {
        stop();
      };
      await activeAudio.play();
      options.onStart?.();
      emitAiVoiceEvent("ag:ai-voice-start");
      return true;
    } catch (err) {
      console.warn("Seslendirme çalınamadı:", err?.message);
      return false;
    }
  }

  return {
    speak,
    stop,
    setEnabled(enabled) {
      isEnabled = Boolean(enabled);
      if (!isEnabled) stop();
    },
    isEnabled: () => isEnabled,
    isPlaying: () => Boolean(activeAudio),
    destroy: stop,
  };
}
