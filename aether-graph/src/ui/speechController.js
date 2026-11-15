// Web Speech API ile sesli komut (STT) dinler; mikrofon akışını iş bitince anında serbest bırakır.
// Sesli okuma (TTS) ElevenLabs ile voicePlayer.js'de; tarayıcının sentez sesi kullanılmaz.

const MAX_LISTEN_MS = 8000;
const DEFAULT_STT_ERROR = "Ses tanıma kullanılamıyor — yazılı giriş kullanın";

const ERROR_MESSAGES = Object.freeze({
  "not-allowed": "Mikrofon izni kapalı (Chrome'da açın veya yazın)",
  "service-not-allowed": "Mikrofon izni kapalı (Chrome'da açın veya yazın)",
  network: "Dahili tarayıcıda ses servisi kısıtlı — Chrome'da açın veya yazın",
  "no-speech": "Ses algılanamadı — tekrar deneyin veya yazın",
  "audio-capture": "Mikrofon bulunamadı — yazılı giriş kullanın",
  STT_UNSUPPORTED: "Ses tanıma desteklenmiyor — Chrome kullanın veya yazın"
});

/**
 * Ortamda sesli komut tanıma (STT) desteğinin bulunup bulunmadığını döner.
 */
export function isSttSupported(env = globalThis) {
  return typeof (env?.webkitSpeechRecognition || env?.SpeechRecognition) === "function";
}

function collectTranscript(results) {
  let interimText = "";
  let finalText = "";
  const list = results || [];
  for (let i = 0; i < list.length; i += 1) {
    const segment = list[i];
    const piece = String(segment?.[0]?.transcript || "").trim();
    if (!piece) continue;
    if (segment?.isFinal === false) interimText = interimText ? `${interimText} ${piece}` : piece;
    else finalText = finalText ? `${finalText} ${piece}` : piece;
  }
  return { interimText, finalText };
}

function failSttStart(commandInput, statusBadge, onError, errorCode) {
  if (commandInput) commandInput.placeholder = ERROR_MESSAGES[errorCode] || DEFAULT_STT_ERROR;
  if (statusBadge) statusBadge.textContent = "STT_FALLBACK";
  commandInput?.focus?.();
  onError?.(errorCode);
  return false;
}

/**
 * Sesli komut dinleme ve Türkçe sesli okuma kontrolcüsünü oluşturur.
 */
export function createSpeechController(options = {}) {
  const { env = globalThis, lang = "tr-TR", micButton = null, commandInput = null,
    statusBadge = null, onTranscript = null, onError = null } = options;

  const defaultPlaceholder = commandInput?.placeholder || "Komut yaz...";
  let recognition = null;
  let listenTimer = null;
  let isListening = false;
  let hadError = false;
  let serviceUnavailable = false;
  let unavailableReason = null;
  let pendingTranscript = "";
  function syncListeningUi(active) {
    isListening = Boolean(active);
    micButton?.classList?.toggle?.("is-listening", isListening);
    micButton?.setAttribute?.("aria-pressed", String(isListening));
  }

  function releaseRecognition() {
    if (listenTimer !== null) {
      clearTimeout(listenTimer);
      listenTimer = null;
    }
    if (!recognition) return;
    const current = recognition;
    recognition = null;
    current.onresult = current.onerror = current.onend = null;
    try {
      // Bluetooth HFP/SCO ses düşüşünü önlemek için mikrofon donanımını anında serbest bırakır.
      if (typeof current.abort === "function") current.abort();
      else if (typeof current.stop === "function") current.stop();
    } catch (err) {
      console.warn("Mikrofon akışı serbest bırakılamadı:", err);
    }
  }

  function stopListening() {
    releaseRecognition();
    syncListeningUi(false);
    if (commandInput && !hadError) commandInput.placeholder = defaultPlaceholder;
  }

  function startListening() {
    hadError = false;
    pendingTranscript = "";
    if (serviceUnavailable) {
      hadError = true;
      return failSttStart(commandInput, statusBadge, onError, unavailableReason || "network");
    }
    if (!isSttSupported(env)) {
      hadError = true;
      return failSttStart(commandInput, statusBadge, onError, "STT_UNSUPPORTED");
    }
    if (isListening && recognition) return true;

    const RecognitionCtor = env.webkitSpeechRecognition || env.SpeechRecognition;
    try {
      recognition = new RecognitionCtor();
      Object.assign(recognition, { lang, continuous: false, interimResults: true, maxAlternatives: 1 });
      if (commandInput) commandInput.placeholder = `Dinleniyor (${lang})... Konuşun`;
      if (statusBadge) statusBadge.textContent = "LISTENING";

      recognition.onresult = (event) => {
        const { interimText, finalText } = collectTranscript(event?.results);
        if (finalText) {
          pendingTranscript = "";
          if (commandInput) {
            commandInput.value = finalText;
            commandInput.placeholder = defaultPlaceholder;
          }
          syncListeningUi(false);
          releaseRecognition();
          onTranscript?.(finalText);
          return;
        }
        if (interimText) {
          pendingTranscript = interimText;
          if (commandInput) commandInput.value = interimText;
        }
      };

      recognition.onerror = (event) => {
        const errorCode = event?.error || "STT_ERROR";
        hadError = true;
        pendingTranscript = "";
        if (errorCode === "network" || errorCode === "service-not-allowed") {
          serviceUnavailable = true;
          unavailableReason = errorCode;
        }
        console.warn("Ses tanıma hatası:", errorCode);
        releaseRecognition();
        syncListeningUi(false);
        failSttStart(commandInput, statusBadge, onError, errorCode);
      };

      recognition.onend = () => {
        const buffered = pendingTranscript;
        pendingTranscript = "";
        releaseRecognition();
        syncListeningUi(false);
        if (hadError) return;
        if (commandInput) commandInput.placeholder = defaultPlaceholder;
        if (buffered) {
          if (commandInput) commandInput.value = buffered;
          onTranscript?.(buffered);
        }
      };

      syncListeningUi(true);
      listenTimer = setTimeout(() => { if (isListening) stopListening(); }, MAX_LISTEN_MS);
      listenTimer?.unref?.();
      recognition.start();
      return true;
    } catch (err) {
      console.warn("Ses tanıma başlatılamadı:", err);
      hadError = true;
      pendingTranscript = "";
      releaseRecognition();
      syncListeningUi(false);
      return failSttStart(commandInput, statusBadge, onError, "STT_START_ERROR");
    }
  }

  function toggleListening() {
    return isListening ? (stopListening(), false) : startListening();
  }

  function getState() {
    return {
      is_listening: isListening,
      stt_supported: isSttSupported(env),
      service_unavailable: serviceUnavailable,
      lang
    };
  }

  function destroy() {
    stopListening();
  }

  return { startListening, stopListening, toggleListening, getState, destroy };
}
