// Gemini JSON çıktılarını doğrular; HUD, panel ve 3D/2D sahne kontrolcülerini koordine eder.

import { createHudController } from "./hudController.js";
import { closeAllPanels, renderOverlayCard, renderPopup, renderSidePanel } from "./panelController.js";
import { createViewportController } from "./viewportController.js";

export const VALID_ACTION_TYPES = Object.freeze([
  "OPEN_POPUP", "SPLIT_SCREEN", "OPEN_SIDE_PANEL", "CLOSE_PANEL",
  "EXPAND_HUD", "MINIMIZE_HUD", "FOCUS_OBJECT", "PAN_TO",
  "RESET_VIEW", "HIGHLIGHT_OBJECT", "SHOW_COMPARISON", "SHOW_TIMELINE",
  "SHOW_FACT_CARD", "PLAY_ANIMATION", "PAUSE_ANIMATION", "SIMPLIFY_TEXT",
  "ADD_TO_HOMEWORK", "SHOW_HOMEWORK_BASKET", "EXPORT_PDF"
]);

// Ödev aksiyonları sadece sağ paneli günceller; aktif 3D sahneye ve kameraya dokunmaz
const NON_NAVIGATING_ACTIONS = new Set(["ADD_TO_HOMEWORK", "SHOW_HOMEWORK_BASKET", "EXPORT_PDF"]);

export const VALID_TEMPLATE_IDS = Object.freeze([
  "LIGHT_DELAY", "GRAVITY_SIM", "NEO_SWARM", "SOLAR_FLARE", "APOLLO_11", "NONE"
]);

let routerConfig = {
  doc: null,
  create3DMissionScene: null,
  renderProceduralPlanet: null,
  calculateLightDelay: null,
  onHomeworkAdded: null,
  onSidePanelAction: null,
  onExportPdf: null,
  onSpeechText: null,
  onStudentAction: null,
  onStudentModeChange: null
};

let hudController = null;
let viewportController = null;
let cachedElements = null;

function resolveDoc() {
  return routerConfig.doc || (typeof document !== "undefined" ? document : null);
}

function getElements(doc) {
  if (!doc || typeof doc.getElementById !== "function") {
    return null;
  }
  const byId = (id) => doc.getElementById(id);
  return {
    appShell: byId("app-shell"),
    sceneContainer: byId("scene-container"),
    canvasContainer: byId("canvas-container"),
    proceduralCanvas: byId("procedural-canvas"),
    loadingOverlay: byId("loading-overlay"),
    progressBar: byId("loading-progress-bar"),
    progressText: byId("loading-progress-text"),
    hudContainer: byId("hud-container"),
    statusBadge: byId("status-badge"),
    speechPanel: byId("speech-panel"),
    speechText: byId("speech-text"),
    hudSizeToggle: byId("hud-size-toggle"),
    simplifyTextButton: byId("simplify-text-button"),
    playAnimationButton: byId("play-animation-button"),
    pauseAnimationButton: byId("pause-animation-button"),
    overlayCard: byId("overlay-card-container"),
    sidePanel: {
      container: byId("side-panel-container"),
      titleEl: byId("side-panel-title"),
      bodyEl: byId("side-panel-body"),
      actionsEl: byId("side-panel-actions"),
      closeButton: byId("side-panel-close-button")
    },
    popup: {
      container: byId("popup-container"),
      dialog: byId("popup-dialog"),
      titleEl: byId("popup-title"),
      contentEl: byId("popup-content"),
      closeButton: byId("popup-close-button")
    }
  };
}

function buildControllers() {
  cachedElements = getElements(resolveDoc());
  hudController = createHudController(cachedElements || {});
  viewportController = createViewportController({
    appShell: cachedElements?.appShell || null,
    sceneContainer: cachedElements?.sceneContainer || null,
    canvasContainer: cachedElements?.canvasContainer || null,
    proceduralCanvas: cachedElements?.proceduralCanvas || null,
    playAnimationButton: cachedElements?.playAnimationButton || null,
    pauseAnimationButton: cachedElements?.pauseAnimationButton || null,
    create3DMissionScene: routerConfig.create3DMissionScene,
    renderProceduralPlanet: routerConfig.renderProceduralPlanet,
    calculateLightDelay: routerConfig.calculateLightDelay,
    onProgress: (percent, visible) => hudController?.renderLoading(percent, visible)
  });
}

function enrichLightDelay(templateId, parameters) {
  if (templateId !== "LIGHT_DELAY" || parameters.light_delay || typeof routerConfig.calculateLightDelay !== "function") {
    return parameters;
  }
  try {
    const mode = parameters.mode === "round-trip" ? "round-trip" : "one-way";
    return {
      ...parameters,
      light_delay: routerConfig.calculateLightDelay(parameters.source || "Earth", parameters.target || "Mars", mode)
    };
  } catch (err) {
    console.warn("Işık gecikmesi hesaplanamadı:", err);
    return parameters;
  }
}

function closeOpenPanels() {
  if (!cachedElements) {
    return;
  }
  closeAllPanels([
    cachedElements.sidePanel?.container,
    cachedElements.overlayCard,
    cachedElements.popup?.container
  ]);
}

/**
 * Router için DOM referanslarını ve modül sözleşme bağımlılıklarını ayarlar.
 */
export function configureActionRouter(options = {}) {
  viewportController?.destroy();
  routerConfig = {
    doc: options.doc ?? null,
    create3DMissionScene: options.create3DMissionScene ?? null,
    renderProceduralPlanet: options.renderProceduralPlanet ?? null,
    calculateLightDelay: options.calculateLightDelay ?? null,
    onHomeworkAdded: options.onHomeworkAdded ?? null,
    onSidePanelAction: options.onSidePanelAction ?? null,
    onExportPdf: options.onExportPdf ?? null,
    onSpeechText: options.onSpeechText ?? null,
    onStudentAction: options.onStudentAction ?? null,
    onStudentModeChange: options.onStudentModeChange ?? null
  };
  buildControllers();
}

/**
 * Aktif 3D sahneyi temizler ve UI yönlendirici durumunu sıfırlar.
 */
export function resetActionRouterState() {
  viewportController?.destroy();
  viewportController?.applyAction("RESET_VIEW");
  hudController?.reset();
  closeOpenPanels();
}

/**
 * Bölüm 4 sözleşmesine uygun JSON aksiyonunu senkron olarak UI'ya uygular.
 */
export function handleActionRouter(json) {
  if (!hudController || !viewportController) {
    buildControllers();
  }
  const doc = resolveDoc();

  if (!json || typeof json !== "object") {
    console.warn("Geçersiz router JSON verisi:", json);
    return {
      handled: false,
      action_type: null,
      template_id: "NONE",
      is_student_mode: hudController?.getState().is_student_mode ?? false,
      scene_promise: null
    };
  }

  const rawAction = json.action_type;
  const resolvedTemplateId = VALID_TEMPLATE_IDS.includes(json.template_id) ? json.template_id : "NONE";

  if (!VALID_ACTION_TYPES.includes(rawAction)) {
    console.warn("Bilinmeyen action_type:", rawAction);
    return {
      handled: false,
      action_type: rawAction ?? null,
      template_id: resolvedTemplateId,
      is_student_mode: hudController?.getState().is_student_mode ?? false,
      scene_promise: null
    };
  }

  const baseParams = json.parameters && typeof json.parameters === "object" ? { ...json.parameters } : {};
  const parameters = enrichLightDelay(resolvedTemplateId, baseParams);
  const speechText = typeof json.speech_text === "string" ? json.speech_text : "";

  const hudState = hudController.handleAction(rawAction, {
    is_student_mode: json.is_student_mode,
    speech_text: speechText
  });
  // İç rotalar (varsayılan sahne, sıfırlama) is_student_mode: false taşır; modu sadece SIMPLIFY_TEXT kapatabilir
  if (rawAction === "SIMPLIFY_TEXT" || json.is_student_mode === true) {
    routerConfig.onStudentModeChange?.(hudState.is_student_mode);
  }
  // Öğrenci modunda kartlar sade metni (student_description) gösterir
  if (hudState.is_student_mode && typeof parameters.student_description === "string" && parameters.student_description.trim()) {
    parameters.description = parameters.student_description;
  }
  hudController.renderStatus(rawAction, speechText);
  if (speechText) {
    routerConfig.onSpeechText?.(speechText);
  }

  const routePayload = {
    action_type: rawAction,
    template_id: resolvedTemplateId,
    parameters,
    speech_text: speechText,
    is_student_mode: hudState.is_student_mode
  };
  const isNavigating = !NON_NAVIGATING_ACTIONS.has(rawAction);
  const viewportResult = isNavigating
    ? viewportController.applyAction(rawAction, resolvedTemplateId, parameters, routePayload)
    : { scene_promise: null, light_delay: null, has_active_scene: null };

  switch (rawAction) {
    case "OPEN_POPUP":
      closeAllPanels([cachedElements?.sidePanel?.container, cachedElements?.overlayCard]);
      renderPopup(cachedElements?.popup, parameters, resolvedTemplateId, doc);
      break;
    case "SPLIT_SCREEN":
      closeOpenPanels();
      if (viewportResult.light_delay && !parameters.light_delay) {
        parameters.light_delay = viewportResult.light_delay;
      }
      break;
    case "OPEN_SIDE_PANEL":
      // Öğrenci modu / ödev sepeti görünümleri sağdaki Küçük Kaşif panelinde açılır
      if (typeof parameters.panel_view === "string" && routerConfig.onStudentAction?.(rawAction, parameters) === true) break;
      closeAllPanels([cachedElements?.popup?.container, cachedElements?.overlayCard]);
      renderSidePanel(
        cachedElements?.sidePanel,
        { ...parameters, template_id: resolvedTemplateId },
        (actionItem) => routerConfig.onSidePanelAction?.(actionItem),
        doc
      );
      break;
    case "CLOSE_PANEL":
    case "RESET_VIEW":
      closeOpenPanels();
      routerConfig.onStudentAction?.(rawAction, parameters);
      break;
    case "SHOW_COMPARISON":
      closeAllPanels([cachedElements?.sidePanel?.container, cachedElements?.popup?.container]);
      if (parameters?.model_url === "PLANET_COMPARISON" || (!parameters?.model_url && Boolean(parameters?.primary_object || parameters?.secondary_object))) {
        closeOpenPanels();
        break;
      }
      renderOverlayCard(cachedElements?.overlayCard, rawAction, resolvedTemplateId, parameters, doc);
      break;
    case "SHOW_TIMELINE":
    case "SHOW_FACT_CARD":
      closeAllPanels([cachedElements?.sidePanel?.container, cachedElements?.popup?.container]);
      // Fotoğraflı pop-up aynı bilgiyi zaten gösterir; karttan tekrar çizilmez
      if (parameters.supporting_photo === true && parameters.image_url) break;
      renderOverlayCard(cachedElements?.overlayCard, rawAction, resolvedTemplateId, parameters, doc);
      break;
    case "ADD_TO_HOMEWORK":
      routerConfig.onHomeworkAdded?.({ ...parameters, template_id: resolvedTemplateId });
      break;
    case "SHOW_HOMEWORK_BASKET":
      routerConfig.onStudentAction?.(rawAction, parameters);
      break;
    case "EXPORT_PDF":
      routerConfig.onExportPdf?.(parameters);
      break;
    case "EXPAND_HUD":
    case "MINIMIZE_HUD":
    case "SIMPLIFY_TEXT":
      break;
    case "FOCUS_OBJECT":
    case "PAN_TO":
    case "HIGHLIGHT_OBJECT":
      closeOpenPanels();
      break;
    case "PLAY_ANIMATION":
    case "PAUSE_ANIMATION":
      break;
    default:
      break;
  }
  // Odak/kart aksiyonlarında konunun fotoğrafı da gelir (sunucu supporting_photo ile işaretler); sahne odağı korunur
  if (isNavigating && rawAction !== "OPEN_POPUP" && parameters.supporting_photo === true && parameters.image_url) {
    renderPopup(cachedElements?.popup, parameters, resolvedTemplateId, doc);
  }

  return {
    handled: true,
    action_type: rawAction,
    template_id: resolvedTemplateId,
    is_student_mode: hudState.is_student_mode,
    scene_promise: viewportResult.scene_promise,
    has_active_scene: viewportResult.has_active_scene
  };
}
