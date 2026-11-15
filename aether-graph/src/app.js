// Uygulama giriş noktası: açılış, ayarlar, öğrenci modu/ödev sepeti paneli, ses/PDF, sorgu kutusu, yanıt paneli ve sözleşme köprüsü.
import texts from "./config/eonet_texts.json" with { type: "json" };
import { handleActionRouter } from "./ui/actionRouter.js";
import { createAnswerPanelController } from "./ui/answerPanelController.js";
import { createContractBridge, loadExternalContracts, requestRouteFromServer, resolveFallbackActionType, resolveFallbackSceneParams } from "./ui/contractBridge.js";
import { bindQueryBox } from "./ui/eonetQueryBox.js";
import { createFallbackSpaceImageDataUri } from "./ui/popupController.js";
import { createPopupWindow } from "./ui/popupWindow.js";
import { setSettingsOpen, showLoadingSequence } from "./ui/bootLoader.js";
import { createMarsPhotoController } from "./ui/marsPhotoController.js";
import { createSpeechController } from "./ui/speechController.js";
import { createVoicePlayer } from "./ui/voicePlayer.js";
import { createSubtitleController } from "./ui/subtitleController.js";
import { createStudentModeController } from "./ui/studentModeController.js";
import { isHomeworkIntent } from "./ui/routeFallbackParser.js";
import { requestTopicImage } from "./ui/topicImageClient.js";

const HOMEWORK_ACTIONS = new Set(["ADD_TO_HOMEWORK", "SHOW_HOMEWORK_BASKET", "EXPORT_PDF"]);

function syncHomeworkVisibility(doc, count) {
  const basketToggleBtn = doc.getElementById("homework-basket-toggle");
  const badgeEl = doc.getElementById("homework-count-badge");
  if (badgeEl) badgeEl.textContent = String(count);
  basketToggleBtn?.classList.toggle("is-hidden", count <= 0);
}

function buildFallbackRoute(trimmed, isStudentMode) {
  const actionType = resolveFallbackActionType(trimmed);
  const sceneParams = actionType === "RESET_VIEW" ? {} : resolveFallbackSceneParams(trimmed);
  const { template_id: fallbackTemplateId = "NONE", ...restSceneParams } = sceneParams;
  // Ödeve eklemede sahne parametresi taşınmaz; konu metinden çözülür
  if (actionType === "ADD_TO_HOMEWORK") return { action_type: actionType, template_id: "NONE", parameters: { query: trimmed }, speech_text: "", is_student_mode: Boolean(isStudentMode) };
  const params = { query: trimmed, title: trimmed, step_id: trimmed, ...restSceneParams };
  if (actionType === "OPEN_POPUP") params.image_url = createFallbackSpaceImageDataUri(trimmed, fallbackTemplateId);
  return { action_type: actionType, template_id: fallbackTemplateId, parameters: params, speech_text: "", is_student_mode: Boolean(isStudentMode) };
}

/**
 * Ses tanıma yokken veya yazılı giriş kullanıldığında komutu senkron olarak router üzerinden çalıştırır.
 */
export function submitTextCommand(doc, rawText) {
  if (!doc || typeof rawText !== "string") return null;
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const isStudentMode = doc.getElementById("student-mode-toggle")?.classList.contains("is-active") ?? false;
  const route = buildFallbackRoute(trimmed, isStudentMode);
  const result = handleActionRouter(route);
  const inputEl = doc.getElementById("command-input");
  if (inputEl) inputEl.value = "";
  return result;
}

function setPressedState(buttonEl, isActive) {
  if (!buttonEl) return;
  buttonEl.classList.toggle("is-active", isActive);
  buttonEl.setAttribute("aria-pressed", String(isActive));
}

function togglePressedState(buttonEl) {
  if (!buttonEl) return;
  setPressedState(buttonEl, !buttonEl.classList.contains("is-active"));
}

function cycleHudSize(hudEl) {
  if (!hudEl) return;
  if (!hudEl.classList.contains("is-expanded") && !hudEl.classList.contains("is-minimized")) {
    hudEl.classList.add("is-expanded");
    return;
  }
  if (hudEl.classList.contains("is-expanded")) {
    hudEl.classList.remove("is-expanded");
    hudEl.classList.add("is-minimized");
    return;
  }
  hudEl.classList.remove("is-minimized");
}

function hasAsyncContracts(c) {
  return Boolean(c?.getRouteFromGemini || c?.getSpaceData || c?.statesData || c?.stateMachine);
}

/**
 * Uygulama kök olaylarını bağlar ve açılış dizisini başlatır.
 */
export function initApp(doc = typeof document !== "undefined" ? document : null, options = {}) {
  if (!doc) return null;

  const byId = (id) => doc.getElementById(id);
  const hudEl = byId("hud-container");
  const settingsPanelEl = byId("settings-panel");
  const settingsToggleBtn = byId("settings-toggle-button");
  const studentToggleBtn = byId("student-mode-toggle");
  const ttsToggleBtn = byId("tts-toggle-button");
  const sidePanelEl = byId("side-panel-container");
  const popupElements = { container: byId("popup-container"), titleEl: byId("popup-title"), contentEl: byId("popup-content") };
  const commandInputEl = byId("command-input");
  const micButtonEl = byId("mic-button");
  const statusBadgeEl = byId("status-badge");
  const answerPanel = createAnswerPanelController(byId("app-shell"), texts);
  const subtitle = createSubtitleController(byId("subtitle-bar"));
  const studentMode = createStudentModeController({
    container: byId("student-panel-root"),
    getTopicImage: (query, title) => requestTopicImage(query, title),
    onBasketChange: (count) => syncHomeworkVisibility(doc, count),
    getSpaceData: () => bridge?.getContracts().getSpaceData,
    onAskQuestion: (question) => runCommand(question),
    onStudentModeChange: (isStudentMode, source) => {
      setPressedState(studentToggleBtn, isStudentMode);
      // Panelden gelen seçim HUD'a da router üzerinden iletilir; router kaynaklıysa HUD zaten güncel
      if (source !== "router") {
        handleActionRouter({ action_type: "SIMPLIFY_TEXT", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: isStudentMode });
      }
    }
  });
  const isStudentModeActive = () => studentMode.getState().is_student_mode;

  let destroyed = false;
  let bridge = null;
  let cancelLoading = () => {};

  const openDefaultSolarSystem = (cameraTarget = "SOLAR_SYSTEM_OVERVIEW") => {
    if (destroyed || !bridge?.getContracts().create3DMissionScene) return;
    handleActionRouter({
      action_type: "FOCUS_OBJECT", template_id: "NONE",
      parameters: { model_url: "SOLAR_SYSTEM", camera_target: cameraTarget },
      speech_text: "", is_student_mode: isStudentModeActive()
    });
  };

  const applyResolvedRoute = (route) => {
    const result = handleActionRouter(route);
    // Ödev aksiyonları açık afet panelini ve altyazıyı olduğu gibi bırakır (kullanıcı baktığı yerden ayrılmaz)
    if (HOMEWORK_ACTIONS.has(route?.action_type)) return result;
    if (route?.action_type === "RESET_VIEW") {
      answerPanel.close();
      subtitle.hide();
    } else if (answerPanel.showRoute(route)) subtitle.hide();
    else subtitle.show(route?.speech_text);
    if (result?.action_type === "RESET_VIEW" && !result?.has_active_scene) openDefaultSolarSystem("SUN");
    return result;
  };

  const runCommand = (rawText) => {
    const trimmed = String(rawText || "").trim();
    if (!trimmed) return null;
    const isStudentMode = studentToggleBtn?.classList.contains("is-active") ?? false;
    // "Ay yerçekimini ödevime ekle": Gemini'ye gitmeden ve sahne değiştirmeden doğrudan ödev paneline yazılır
    if (isHomeworkIntent(trimmed)) {
      if (commandInputEl) commandInputEl.value = "";
      return applyResolvedRoute({ action_type: "ADD_TO_HOMEWORK", template_id: "NONE", parameters: { query: trimmed }, speech_text: "", is_student_mode: isStudentMode });
    }
    if (commandInputEl) commandInputEl.value = "";
    subtitle.hide();
    if (!hasAsyncContracts(bridge.getContracts())) {
      return applyResolvedRoute(buildFallbackRoute(trimmed, isStudentMode));
    }
    if (statusBadgeEl) statusBadgeEl.textContent = "AI_ROUTING";
    return bridge.resolveUserCommand(trimmed, isStudentMode)
      .then((resolved) => applyResolvedRoute(resolved || buildFallbackRoute(trimmed, isStudentMode)))
      .catch((err) => {
        console.warn("Komut yönlendirme hatası:", err);
        return applyResolvedRoute(buildFallbackRoute(trimmed, isStudentMode));
      });
  };

  let speechCtrl = null;
  const voice = createVoicePlayer({
    is_enabled: ttsToggleBtn?.classList.contains("is-active") ?? true,
    doc,
    onStart: () => speechCtrl?.setSpeaking(true),
    onEnd: () => speechCtrl?.setSpeaking(false),
    onStop: () => speechCtrl?.setSpeaking(false),
    onUnavailable: (reason) => {
      if (statusBadgeEl) statusBadgeEl.textContent = reason === "quota_exceeded" ? "SES_KOTASI_DOLDU" : "SES_KAPALI";
    }
  });
  speechCtrl = createSpeechController({
    micButton: micButtonEl,
    commandInput: commandInputEl,
    statusBadge: statusBadgeEl,
    voicePlayer: voice,
    doc,
    onTranscript: (text) => runCommand(text)
  });

  bridge = createContractBridge({
    doc, contracts: options.contracts || {},
    onHomeworkAdded: (item) => studentMode.handleAction("ADD_TO_HOMEWORK", item),
    onExportPdf: () => studentMode.exportPdf(),
    onStudentAction: (actionType, parameters) => studentMode.handleAction(actionType, parameters),
    onStudentModeChange: (isStudentMode) => studentMode.setStudentMode(isStudentMode, "router"),
    onSpeechText: (speechText) => voice.speak(speechText)
  });

  syncHomeworkVisibility(doc, 0);
  cancelLoading = options.skipBootLoading ? () => {} : showLoadingSequence(doc);
  if (!options.contracts && !options.skipBootLoading && typeof globalThis.window !== "undefined" && doc === globalThis.document) {
    loadExternalContracts((spec) => {
      if (spec.includes("threeSceneFactory")) return import("./three/threeSceneFactory.js");
      if (spec.includes("dataLayer")) return import("./api/dataLayer.js");
      if (spec.includes("spacePhysics")) return import("./physics/spacePhysics.js");
      if (spec.includes("proceduralCanvas")) return import("./canvas/proceduralCanvas.js");
      return null;
    }).then((loaded) => {
      if (destroyed) return;
      bridge.setContracts({ ...loaded, getRouteFromGemini: loaded.getRouteFromGemini || requestRouteFromServer });
      if (loaded.create3DMissionScene) {
        cancelLoading();
        openDefaultSolarSystem();
      }
    });
  }

  settingsToggleBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    setSettingsOpen(settingsPanelEl, settingsToggleBtn, Boolean(settingsPanelEl?.classList.contains("is-hidden")));
  });
  doc.addEventListener("click", (event) => {
    if (!settingsPanelEl || settingsPanelEl.classList.contains("is-hidden")) return;
    const t = event.target;
    if (typeof Node !== "undefined" && t instanceof Node && !settingsPanelEl.contains(t) && !settingsToggleBtn?.contains(t)) {
      setSettingsOpen(settingsPanelEl, settingsToggleBtn, false);
    }
  });
  byId("settings-close-button")?.addEventListener("click", () => setSettingsOpen(settingsPanelEl, settingsToggleBtn, false));
  studentToggleBtn?.addEventListener("click", () => {
    setSettingsOpen(settingsPanelEl, settingsToggleBtn, false);
    studentMode.handleAction("OPEN_SIDE_PANEL", { panel_view: "STUDENT_MODE" });
  });
  ttsToggleBtn?.addEventListener("click", () => {
    togglePressedState(ttsToggleBtn);
    voice.setEnabled(ttsToggleBtn.classList.contains("is-active"));
  });
  byId("hud-size-toggle")?.addEventListener("click", () => cycleHudSize(hudEl));
  byId("homework-basket-toggle")?.addEventListener("click", () => studentMode.handleAction("SHOW_HOMEWORK_BASKET"));
  byId("side-panel-close-button")?.addEventListener("click", () => sidePanelEl?.classList.add("is-hidden"));
  byId("popup-close-button")?.addEventListener("click", () => {
    popupElements.container?.classList.add("is-hidden");
    popupElements.container?.setAttribute?.("aria-hidden", "true");
  });
  byId("reset-view-button")?.addEventListener("click", () => {
    answerPanel.close();
    const result = handleActionRouter({ action_type: "RESET_VIEW", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: isStudentModeActive() });
    setSettingsOpen(settingsPanelEl, settingsToggleBtn, false);
    cancelLoading();
    if (bridge.getContracts().create3DMissionScene) {
      if (!result?.has_active_scene) openDefaultSolarSystem("SUN");
    } else cancelLoading = showLoadingSequence(doc);
  });
  const queryBox = bindQueryBox(byId("command-form"), byId("query-status"), texts, (text) => runCommand(text));
  const popupWindow = createPopupWindow({ container: popupElements.container, dialog: byId("popup-dialog"), titlebar: byId("popup-titlebar"), minimizeButton: byId("popup-minimize-button") });
  const marsPhotos = createMarsPhotoController({ getSpaceDataFn: () => bridge.getContracts().getSpaceData, onRoute: (route) => applyResolvedRoute(route) });

  return {
    addHomework: (item) => studentMode.addItem(item),
    submitCommand: (text) => runCommand(text),
    setContracts: (contracts) => bridge.setContracts(contracts),
    replayLoading: () => { cancelLoading(); cancelLoading = showLoadingSequence(doc); },
    destroy: () => { destroyed = true; cancelLoading(); speechCtrl.destroy(); voice.destroy(); queryBox.destroy(); answerPanel.destroy(); marsPhotos.destroy(); popupWindow.destroy(); subtitle.destroy(); studentMode.destroy(); }
  };
}

if (typeof globalThis !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initApp(document), { once: true });
  else initApp(document);
}
