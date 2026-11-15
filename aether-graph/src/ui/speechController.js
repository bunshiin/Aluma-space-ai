// Web Speech API ile sesli komut (STT) dinler; mikrofon akışını iş bitince anında serbest bırakır.
// Sesli okuma (TTS) ElevenLabs ile voicePlayer.js'de; tarayıcının sentez sesi kullanılmaz.

const MAX_LISTEN_MS = 8000;
const DEFAULT_STT_ERROR = "Ses tanıma kullanılamıyor — yazılı giriş kullanın";

export const VoiceButtonState = Object.freeze({
  IDLE: "IDLE",
  LISTENING: "LISTENING",
  SPEAKING: "SPEAKING"
});

export const MIC_ICONS = Object.freeze({
  IDLE: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10a7 7 0 0 0 14 0"></path><line x1="12" y1="17" x2="12" y2="22"></line></svg>`,
  LISTENING: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`,
  SPEAKING: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`
});

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
 * Sesli komut dinleme ve 3 durumlu ses/mikrofon buton kontrolcüsünü oluşturur:
 * 1. IDLE: Klasik mikrofon ikonu, dinlemeyi başlatır.
 * 2. LISTENING: Kırmızı kare kutu ve stop ikonu, dinlemeyi durdurur ve IDLE'a döner.
 * 3. SPEAKING: AI konuşurken basılırsa anında AI sesini susturur (audio/speechSynthesis kesilir, ag:ai-voice-stop yayınlanır) ve IDLE'a döner.
 */
export function createSpeechController(options = {}) {
  const {
    env = globalThis,
    lang = "tr-TR",
    micButton = null,
    commandInput = null,
    statusBadge = null,
    voicePlayer = null,
    doc = options.doc || env?.document || globalThis?.document || null,
    eventTarget = null,
    onTranscript = null,
    onError = null,
    onVoiceStop = null
  } = options;

  let activeVoicePlayer = voicePlayer;
  const defaultPlaceholder = commandInput?.placeholder || "Komut yaz...";
  let recognition = null;
  let listenTimer = null;
  let isListening = false;
  let hadError = false;
  let serviceUnavailable = false;
  let unavailableReason = null;
  let pendingTranscript = "";
  let currentState = VoiceButtonState.IDLE;

  function syncVoiceButtonUi(nextState) {
    currentState = nextState;
    isListening = currentState === VoiceButtonState.LISTENING;

    if (!micButton) return;

    micButton.classList?.toggle?.("is-listening", currentState === VoiceButtonState.LISTENING);
    micButton.classList?.toggle?.("is-speaking", currentState === VoiceButtonState.SPEAKING);
    micButton.classList?.toggle?.("is-idle", currentState === VoiceButtonState.IDLE);

    const isPressed = currentState !== VoiceButtonState.IDLE;
    micButton.setAttribute?.("aria-pressed", String(isPressed));
    micButton.setAttribute?.("data-state", currentState);

    let ariaLabel = "Sesli komut";
    if (currentState === VoiceButtonState.LISTENING) {
      ariaLabel = "Dinlemeyi durdur";
    } else if (currentState === VoiceButtonState.SPEAKING) {
      ariaLabel = "AI sesini durdur";
    }
    micButton.setAttribute?.("aria-label", ariaLabel);

    if (micButton && "innerHTML" in micButton && MIC_ICONS[currentState]) {
      micButton.innerHTML = MIC_ICONS[currentState];
    }
  }

  function dispatchVoiceEvent(eventName, detail = {}) {
    const CustomEventCtor = env?.CustomEvent || globalThis?.CustomEvent;
    const evt = typeof CustomEventCtor === "function"
      ? new CustomEventCtor(eventName, { detail, bubbles: true })
      : { type: eventName, detail };

    const targets = [eventTarget, doc, micButton?.ownerDocument, env, globalThis];
    const visited = new Set();
    for (const target of targets) {
      if (!target || visited.has(target)) continue;
      visited.add(target);
      if (typeof target.dispatchEvent === "function") {
        try {
          target.dispatchEvent(evt);
        } catch (_) {}
      }
    }
  }

  function stopSpeaking() {
    // 1. Aktif ses oynatıcısını kes
    if (activeVoicePlayer && typeof activeVoicePlayer.stop === "function") {
      activeVoicePlayer.stop();
    }
    if (options.audio && typeof options.audio.pause === "function") {
      try {
        options.audio.pause();
        options.audio.src = "";
      } catch (_) {}
    }

    // 2. speechSynthesis'i kes
    try {
      if (typeof env?.speechSynthesis?.cancel === "function") {
        env.speechSynthesis.cancel();
      } else if (typeof globalThis?.speechSynthesis?.cancel === "function") {
        globalThis.speechSynthesis.cancel();
      }
    } catch (err) {
      console.warn("speechSynthesis cancel hatası:", err);
    }

    // 3. ag:ai-voice-stop olayını yayınla
    dispatchVoiceEvent("ag:ai-voice-stop");
    onVoiceStop?.();

    // 4. IDLE durumuna geç
    syncVoiceButtonUi(VoiceButtonState.IDLE);
  }

  function setSpeaking(active) {
    if (active) {
      if (isListening) {
        releaseRecognition();
        isListening = false;
        if (commandInput && !hadError) commandInput.placeholder = defaultPlaceholder;
      }
      syncVoiceButtonUi(VoiceButtonState.SPEAKING);
    } else {
      if (currentState === VoiceButtonState.SPEAKING) {
        syncVoiceButtonUi(VoiceButtonState.IDLE);
      }
    }
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
    syncVoiceButtonUi(VoiceButtonState.IDLE);
    if (commandInput && !hadError) commandInput.placeholder = defaultPlaceholder;
  }

  function startListening() {
    if (currentState === VoiceButtonState.SPEAKING) {
      stopSpeaking();
    }
    hadError = false;
    pendingTranscript = "";
    if (serviceUnavailable) {
      hadError = true;
      syncVoiceButtonUi(VoiceButtonState.IDLE);
      return failSttStart(commandInput, statusBadge, onError, unavailableReason || "network");
    }
    if (!isSttSupported(env)) {
      hadError = true;
      syncVoiceButtonUi(VoiceButtonState.IDLE);
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
          syncVoiceButtonUi(VoiceButtonState.IDLE);
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
        syncVoiceButtonUi(VoiceButtonState.IDLE);
        failSttStart(commandInput, statusBadge, onError, errorCode);
      };

      recognition.onend = () => {
        const buffered = pendingTranscript;
        pendingTranscript = "";
        releaseRecognition();
        syncVoiceButtonUi(VoiceButtonState.IDLE);
        if (hadError) return;
        if (commandInput) commandInput.placeholder = defaultPlaceholder;
        if (buffered) {
          if (commandInput) commandInput.value = buffered;
          onTranscript?.(buffered);
        }
      };

      syncVoiceButtonUi(VoiceButtonState.LISTENING);
      listenTimer = setTimeout(() => { if (isListening) stopListening(); }, MAX_LISTEN_MS);
      listenTimer?.unref?.();
      recognition.start();
      return true;
    } catch (err) {
      console.warn("Ses tanıma başlatılamadı:", err);
      hadError = true;
      pendingTranscript = "";
      releaseRecognition();
      syncVoiceButtonUi(VoiceButtonState.IDLE);
      return failSttStart(commandInput, statusBadge, onError, "STT_START_ERROR");
    }
  }

  function handleMicButtonClick(event) {
    event?.preventDefault?.();
    if (currentState === VoiceButtonState.SPEAKING) {
      stopSpeaking();
    } else if (currentState === VoiceButtonState.LISTENING) {
      stopListening();
    } else {
      startListening();
    }
  }

  function toggleListening() {
    if (currentState === VoiceButtonState.SPEAKING) {
      stopSpeaking();
      return false;
    }
    return isListening ? (stopListening(), false) : startListening();
  }

  function getState() {
    return {
      state: currentState,
      is_listening: isListening,
      is_speaking: currentState === VoiceButtonState.SPEAKING,
      stt_supported: isSttSupported(env),
      service_unavailable: serviceUnavailable,
      lang
    };
  }

  const handleVoiceStart = () => setSpeaking(true);
  const handleVoiceStop = () => {
    if (currentState === VoiceButtonState.SPEAKING) {
      syncVoiceButtonUi(VoiceButtonState.IDLE);
    }
  };

  const listenerTargets = [eventTarget, doc, micButton?.ownerDocument, env, globalThis];
  const registeredTargets = new Set();
  for (const target of listenerTargets) {
    if (!target || registeredTargets.has(target)) continue;
    registeredTargets.add(target);
    if (typeof target.addEventListener === "function") {
      try {
        target.addEventListener("ag:ai-voice-start", handleVoiceStart);
        target.addEventListener("ag:ai-voice-stop", handleVoiceStop);
      } catch (_) {}
    }
  }

  if (micButton && typeof micButton.addEventListener === "function") {
    micButton.addEventListener("click", handleMicButtonClick);
  }

  // Başlangıç durumunu IDLE olarak senkronize et
  syncVoiceButtonUi(VoiceButtonState.IDLE);

  function destroy() {
    stopListening();
    if (currentState === VoiceButtonState.SPEAKING) {
      stopSpeaking();
    }
    if (micButton && typeof micButton.removeEventListener === "function") {
      micButton.removeEventListener("click", handleMicButtonClick);
    }
    for (const target of registeredTargets) {
      if (typeof target.removeEventListener === "function") {
        try {
          target.removeEventListener("ag:ai-voice-start", handleVoiceStart);
          target.removeEventListener("ag:ai-voice-stop", handleVoiceStop);
        } catch (_) {}
      }
    }
    registeredTargets.clear();
  }

  return {
    startListening,
    stopListening,
    toggleListening,
    setSpeaking,
    stopSpeaking,
    handleMicButtonClick,
    getState,
    getVoiceButtonState: () => currentState,
    setVoicePlayer: (vp) => { activeVoicePlayer = vp; },
    destroy
  };
}
