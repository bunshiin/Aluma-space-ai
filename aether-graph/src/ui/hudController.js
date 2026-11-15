// HUD durumunu, durum rozetini ve yükleme göstergesini izole biçimde yönetir. Sohbet yanıtları answerPanelController'da.

/**
 * HUD durumunu verilen aksiyon türüne göre günceller ve yeni durumu döner.
 */
export function handleHudAction(hudState, actionType, payload = {}) {
  const current = hudState || {
    is_minimized: false,
    is_student_mode: false,
    speech_text: "",
    last_action_type: "RESET_VIEW"
  };

  let nextMinimized = Boolean(current.is_minimized);
  let nextStudentMode =
    typeof payload?.is_student_mode === "boolean"
      ? payload.is_student_mode
      : Boolean(current.is_student_mode);

  if (actionType === "EXPAND_HUD") {
    nextMinimized = false;
  } else if (actionType === "MINIMIZE_HUD") {
    nextMinimized = true;
  } else if (actionType === "RESET_VIEW") {
    nextMinimized = false;
  } else if (actionType === "SIMPLIFY_TEXT" && typeof payload?.is_student_mode !== "boolean") {
    nextStudentMode = !nextStudentMode;
  }

  return {
    is_minimized: nextMinimized,
    is_student_mode: nextStudentMode,
    speech_text: typeof payload?.speech_text === "string" ? payload.speech_text : current.speech_text,
    last_action_type: typeof actionType === "string" && actionType ? actionType : current.last_action_type
  };
}

/**
 * Durum rozetini ve AI konuşma bandını yalnızca verilen elementler içinde günceller.
 */
export function renderHudStatus(elements, actionType, speechText) {
  if (!elements) return;
  if (elements.statusBadge) elements.statusBadge.textContent = typeof actionType === "string" && actionType ? actionType : "READY";
  const normalizedSpeech = typeof speechText === "string" ? speechText.trim() : "";
  if (elements.speechText) elements.speechText.textContent = normalizedSpeech;
  elements.speechPanel?.classList?.toggle("is-hidden", !normalizedSpeech);
}

/**
 * Sahne veya sistem yükleme ilerlemesini (0-100) DOM'a yansıtır.
 */
export function renderLoadingProgress(loadingElements, percent, visible) {
  if (!loadingElements) return;
  const numeric = Number(percent);
  const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;

  if (loadingElements.loadingOverlay?.classList) {
    loadingElements.loadingOverlay.classList.toggle("is-hidden", !visible);
    loadingElements.loadingOverlay.setAttribute?.("aria-hidden", visible ? "false" : "true");
  }
  if (!visible) {
    loadingElements.hudContainer?.classList?.remove("is-hidden");
  }
  if (loadingElements.progressBar) {
    if (loadingElements.progressBar.style) loadingElements.progressBar.style.width = `${clamped}%`;
    loadingElements.progressBar.setAttribute?.("aria-valuenow", String(clamped));
  }
  if (loadingElements.progressText) loadingElements.progressText.textContent = `%${clamped}`;
}

function syncHudClasses(elements, state) {
  const hudClassList = elements?.hudContainer?.classList;
  if (hudClassList) {
    hudClassList.toggle("is-minimized", state.is_minimized);
    hudClassList.toggle("is-student-mode", state.is_student_mode);
  }
  elements?.hudSizeToggle?.setAttribute?.("aria-expanded", String(!state.is_minimized));
  elements?.simplifyTextButton?.setAttribute?.("aria-pressed", String(state.is_student_mode));
}

/**
 * HUD kapsayıcısı için izole kontrolcü oluşturur.
 */
export function createHudController(elements = {}) {
  let state = handleHudAction(null, "RESET_VIEW", {});

  const loadingElements = {
    loadingOverlay: elements.loadingOverlay || null,
    progressBar: elements.progressBar || null,
    progressText: elements.progressText || null,
    hudContainer: elements.hudContainer || null
  };

  function handleAction(actionType, payload = {}) {
    state = handleHudAction(state, actionType, payload);
    syncHudClasses(elements, state);
    if (typeof payload?.speech_text === "string" || typeof actionType === "string") {
      renderHudStatus(elements, state.last_action_type, state.speech_text);
    }
    return { ...state };
  }

  function renderStatus(actionType, speechText) { renderHudStatus(elements, actionType, speechText); }
  function renderLoading(percent, visible) { renderLoadingProgress(loadingElements, percent, visible); }
  function getState() { return { ...state }; }

  function reset() {
    state = handleHudAction(null, "RESET_VIEW", {});
    syncHudClasses(elements, state);
    renderHudStatus(elements, "RESET_VIEW", "");
    renderLoadingProgress(loadingElements, 0, false);
    return { ...state };
  }

  return { getState, handleAction, renderStatus, renderLoading, reset };
}
