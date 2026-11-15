// Uygulama giriş noktası: açılış, ayarlar, ödev sepeti, ses/PDF, sorgu kutusu, yanıt paneli ve sözleşme köprüsü.
import texts from "./config/eonet_texts.json" with { type: "json" };
import { handleActionRouter } from "./ui/actionRouter.js";
import { createAnswerPanelController } from "./ui/answerPanelController.js";
import { createContractBridge, loadExternalContracts, requestRouteFromServer, resolveFallbackActionType, resolveFallbackSceneParams } from "./ui/contractBridge.js";
import { bindQueryBox } from "./ui/eonetQueryBox.js";
import { exportHomeworkPdf } from "./ui/pdfExporter.js";
import { createFallbackSpaceImageDataUri } from "./ui/popupController.js";
import { createPopupWindow } from "./ui/popupWindow.js";
import { setSettingsOpen, showLoadingSequence } from "./ui/bootLoader.js";
import { createMarsPhotoController } from "./ui/marsPhotoController.js";
import { createSpeechController } from "./ui/speechController.js";
import { createVoicePlayer } from "./ui/voicePlayer.js";
import { createSubtitleController } from "./ui/subtitleController.js";

function syncHomeworkVisibility(doc, count) {
  const basketToggleBtn = doc.getElementById("homework-basket-toggle");
  const badgeEl = doc.getElementById("homework-count-badge");
  if (badgeEl) badgeEl.textContent = String(count);
  basketToggleBtn?.classList.toggle("is-hidden", count <= 0);
}

/**
 * Ödev sepetine benzersiz öğe ekler ve yalnızca en az 1 ödev varken sepet düğmesini gösterir.
 */
export function addHomeworkItem(doc, item, homeworkKeys = new Set()) {
  const listEl = doc.getElementById("homework-list");
  if (!listEl) return homeworkKeys.size;

  const key = String(item?.id || item?.title || "").trim();
  if (!key || homeworkKeys.has(key)) {
    syncHomeworkVisibility(doc, homeworkKeys.size);
    return homeworkKeys.size;
  }

  homeworkKeys.add(key);
  const li = doc.createElement("li");
  li.className = "ag-homework-item";
  li.textContent = String(item?.title || key);
  listEl.appendChild(li);
  syncHomeworkVisibility(doc, homeworkKeys.size);
  return homeworkKeys.size;
}

function buildFallbackRoute(trimmed, isStudentMode) {
  const actionType = resolveFallbackActionType(trimmed);
  const sceneParams = actionType === "RESET_VIEW" ? {} : resolveFallbackSceneParams(trimmed);
  const { template_id: fallbackTemplateId = "NONE", ...restSceneParams } = sceneParams;
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

function togglePressedState(buttonEl) {
  if (!buttonEl) return;
  const nextActive = !buttonEl.classList.contains("is-active");
  buttonEl.classList.toggle("is-active", nextActive);
  buttonEl.setAttribute("aria-pressed", String(nextActive));
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

  const homeworkKeys = new Set();
  const byId = (id) => doc.getElementById(id);
  const hudEl = byId("hud-container");
  const settingsPanelEl = byId("settings-panel");
  const settingsToggleBtn = byId("settings-toggle-button");
  const studentToggleBtn = byId("student-mode-toggle");
  const ttsToggleBtn = byId("tts-toggle-button");
  const basketContainerEl = byId("homework-basket-container");
  const sidePanelEl = byId("side-panel-container");
  const popupElements = { container: byId("popup-container"), titleEl: byId("popup-title"), contentEl: byId("popup-content") };
  const commandInputEl = byId("command-input");
  const micButtonEl = byId("mic-button");
  const statusBadgeEl = byId("status-badge");
  const answerPanel = createAnswerPanelController(byId("app-shell"), texts);
  const subtitle = createSubtitleController(byId("subtitle-bar"));

  let destroyed = false;
  let bridge = null;
  let cancelLoading = () => {};

  const openDefaultSolarSystem = (cameraTarget = "SOLAR_SYSTEM_OVERVIEW") => {
    if (destroyed || !bridge?.getContracts().create3DMissionScene) return;
    handleActionRouter({
      action_type: "FOCUS_OBJECT", template_id: "NONE",
      parameters: { model_url: "SOLAR_SYSTEM", camera_target: cameraTarget },
      speech_text: "", is_student_mode: false
    });
  };

  const applyResolvedRoute = (route) => {
    const result = handleActionRouter(route);
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

  const speechCtrl = createSpeechController({
    micButton: micButtonEl, commandInput: commandInputEl, statusBadge: statusBadgeEl, onTranscript: (text) => runCommand(text)
  });
  const voice = createVoicePlayer({
    is_enabled: ttsToggleBtn?.classList.contains("is-active") ?? true,
    onUnavailable: (reason) => {
      if (statusBadgeEl) statusBadgeEl.textContent = reason === "quota_exceeded" ? "SES_KOTASI_DOLDU" : "SES_KAPALI";
    }
  });

  bridge = createContractBridge({
    doc, contracts: options.contracts || {},
    onHomeworkAdded: (item) => addHomeworkItem(doc, item, homeworkKeys),
    onExportPdf: () => exportHomeworkPdf(byId("homework-printable-area")),
    onSpeechText: (speechText) => voice.speak(speechText)
  });

  syncHomeworkVisibility(doc, homeworkKeys.size);
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
  studentToggleBtn?.addEventListener("click", () => togglePressedState(studentToggleBtn));
  ttsToggleBtn?.addEventListener("click", () => {
    togglePressedState(ttsToggleBtn);
    voice.setEnabled(ttsToggleBtn.classList.contains("is-active"));
  });
  byId("hud-size-toggle")?.addEventListener("click", () => cycleHudSize(hudEl));
  byId("homework-basket-toggle")?.addEventListener("click", () => basketContainerEl?.classList.remove("is-hidden"));
  byId("close-basket-button")?.addEventListener("click", () => basketContainerEl?.classList.add("is-hidden"));
  byId("side-panel-close-button")?.addEventListener("click", () => sidePanelEl?.classList.add("is-hidden"));
  byId("popup-close-button")?.addEventListener("click", () => {
    popupElements.container?.classList.add("is-hidden");
    popupElements.container?.setAttribute?.("aria-hidden", "true");
  });
  byId("export-pdf-button")?.addEventListener("click", () => handleActionRouter({ action_type: "EXPORT_PDF", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: false }));
  byId("demo-add-homework-button")?.addEventListener("click", () => {
    const nextIndex = homeworkKeys.size + 1;
    addHomeworkItem(doc, { id: `task-${nextIndex}`, title: `Görev Notu #${nextIndex}` }, homeworkKeys);
  });
  doc.addEventListener("ag:homework-added", (event) => {
    const detail = event && "detail" in event ? event.detail : null;
    if (detail) addHomeworkItem(doc, detail, homeworkKeys);
  });
  byId("reset-view-button")?.addEventListener("click", () => {
    answerPanel.close();
    const result = handleActionRouter({ action_type: "RESET_VIEW", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: false });
    setSettingsOpen(settingsPanelEl, settingsToggleBtn, false);
    cancelLoading();
    if (bridge.getContracts().create3DMissionScene) {
      if (!result?.has_active_scene) openDefaultSolarSystem("SUN");
    } else cancelLoading = showLoadingSequence(doc);
  });
  micButtonEl?.addEventListener("click", () => speechCtrl.toggleListening());
  const queryBox = bindQueryBox(byId("command-form"), byId("query-status"), texts, (text) => runCommand(text));
  const popupWindow = createPopupWindow({ container: popupElements.container, dialog: byId("popup-dialog"), titlebar: byId("popup-titlebar"), minimizeButton: byId("popup-minimize-button") });
  const marsPhotos = createMarsPhotoController({ getSpaceDataFn: () => bridge.getContracts().getSpaceData, onRoute: (route) => applyResolvedRoute(route) });

  return {
    addHomework: (item) => addHomeworkItem(doc, item, homeworkKeys),
    submitCommand: (text) => runCommand(text),
    setContracts: (contracts) => bridge.setContracts(contracts),
    replayLoading: () => { cancelLoading(); cancelLoading = showLoadingSequence(doc); },
    destroy: () => { destroyed = true; cancelLoading(); speechCtrl.destroy(); voice.destroy(); queryBox.destroy(); answerPanel.destroy(); marsPhotos.destroy(); popupWindow.destroy(); subtitle.destroy(); }
  };
}

if (typeof globalThis !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initApp(document), { once: true });
  else initApp(document);
}
