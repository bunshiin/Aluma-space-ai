// Diğer rollerin Bölüm 4 sözleşme modüllerini Ege'nin UI yönlendiricisine güvenli biçimde bağlar.

import { configureActionRouter, handleActionRouter } from "./actionRouter.js";
import { createFallbackSpaceImageDataUri } from "./popupController.js";
import {
  FALLBACK_ASTEROIDS,
  SOLAR_BODY_NAME_REGEX,
  applyComparisonEnrichment,
  isHomeworkIntent,
  resolveFallbackActionType,
  resolveFallbackSceneParams
} from "./routeFallbackParser.js";

export { resolveFallbackActionType, resolveFallbackSceneParams };

const SPACE_DATA_TEMPLATES = new Set(["NEO_SWARM", "SOLAR_FLARE", "APOLLO_11"]);
const PHOTO_TEMPLATES = new Set(["APOD_GALLERY", "MARS_SURFACE_VIEW"]);
const ACTION_ALIAS_MAP = { NAVIGATE_TO: "FOCUS_OBJECT", COMPARE_OBJECTS: "SHOW_COMPARISON", FILTER_DATA: "OPEN_SIDE_PANEL", SHOW_TIME_LAPSE: "PLAY_ANIMATION", TRIGGER_EVENT: "FOCUS_OBJECT" };
const TEMPLATE_ALIAS_MAP = { SOLAR_FLARE_MONITOR: "SOLAR_FLARE", NEO_HAZARD_LIST: "NEO_SWARM", HISTORICAL_LANDING_VIEW: "APOLLO_11", SPACECRAFT_TRACKER: "NONE", PLANET_DETAIL_CARD: "NONE", APOD_GALLERY: "NONE", MARS_SURFACE_VIEW: "NONE", EARTH_EVENT_MAP: "NONE", PLANET_ORBIT_VIEW: "NONE" };
const META_PARAM_KEYS = new Set(["data_source", "query", "title", "photo_title", "description", "model_url", "modelUrl", "camera_target", "image_url", "hd_image_url", "hdurl", "url", "nasa_gallery_url", "next_actions", "images", "items", "metrics", "facts", "asteroids", "light_delay", "target_state", "step_id", "state_id", "query_type", "identifier", "target_object", "image_query", "image_title", "image_source", "image_page_url", "is_general_question", "supporting_photo", "focus_event_id", "event_category", "sections", "date_taken_utc", "camera", "credit"]);

/**
 * Tarayıcı sohbetinden gelen komutu POST /api/route üzerinden sunucudaki AI yönlendiricisine gönderir.
 */
export async function requestRouteFromServer(userInput, isStudentMode = false) {
  if (typeof globalThis.fetch !== "function") return null;
  const text = typeof userInput === "string" ? userInput : String(userInput?.text || "");
  const is_student_mode = typeof userInput === "object" && userInput && typeof userInput.is_student_mode === "boolean"
    ? userInput.is_student_mode : Boolean(isStudentMode);
  try {
    const resp = await globalThis.fetch("/api/route", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, is_student_mode })
    });
    return resp.ok ? await resp.json() : null;
  } catch (err) {
    console.warn("AI rota isteği başarısız, yedek akışa geçiliyor:", err);
    return null;
  }
}

function normalizeGeminiRoute(routeJson, rawQuery = "") {
  const params = routeJson.parameters && typeof routeJson.parameters === "object" ? { ...routeJson.parameters } : {};
  const rawTemplateId = routeJson.template_id || "NONE";
  const template_id = TEMPLATE_ALIAS_MAP[rawTemplateId] || rawTemplateId;
  let action_type = ACTION_ALIAS_MAP[routeJson.action_type] || routeJson.action_type;
  if (params.hd_image_url && !params.image_url) params.image_url = params.hd_image_url;
  const hasPhoto = Boolean(params.image_url || params.hdurl || params.url);
  if (hasPhoto && (PHOTO_TEMPLATES.has(rawTemplateId) || resolveFallbackActionType(rawQuery || params.query || "") === "OPEN_POPUP")) {
    action_type = "OPEN_POPUP";
  }
  if (rawQuery && !params.query) params.query = rawQuery;
  const speech_text = String(routeJson.speech_text || "").replace(/\s*\[Doğrudan NASA Görsel Linki:[^\]]*\]/g, "").trim();
  return { ...routeJson, action_type, template_id, parameters: params, speech_text };
}

function buildLocalChatFallbackRoute(trimmed, isStudentMode) {
  const fallbackScene = resolveFallbackSceneParams(trimmed);
  const actionType = resolveFallbackActionType(trimmed);
  const templateId = fallbackScene.template_id || (fallbackScene.flare_class ? "SOLAR_FLARE" : "NONE");
  const { template_id: _ignored, ...sceneParams } = fallbackScene;
  const parameters = { query: trimmed, title: trimmed, ...sceneParams };
  if (templateId === "NEO_SWARM") {
    parameters.query_type = "neo";
    parameters.identifier = /tehlike|hazard/i.test(trimmed) ? "hazardous" : "latest:3";
    if (!/apophis|bennu/i.test(trimmed)) delete parameters.asteroids;
  } else if (/apod|günün.*(foto|görsel|resim|görüntü)/i.test(trimmed)) {
    parameters.query_type = "apod"; parameters.identifier = "today";
  } else if (/mars.*(foto|görsel|resim|görüntü)|perseverance/i.test(trimmed)) {
    parameters.query_type = "mars_photos"; parameters.identifier = "latest";
  }
  const speechText = templateId === "NEO_SWARM"
    ? "Dünya çevresindeki güncel asteroit yörüngeleri Güneş Sistemi sahnesinde gösteriliyor."
    : sceneParams.model_url === "PLANET_COMPARISON"
      ? `${sceneParams.primary_object} ve ${sceneParams.secondary_object} ${sceneParams.is_gravity_test ? "yerçekimi testi" : "karşılaştırma"} sahnesi açılıyor.`
      : templateId === "SOLAR_FLARE"
        ? "Güneş patlaması simülasyonu ve radyasyon verileri sahneye aktarıldı."
        : sceneParams.camera_target ? `${sceneParams.camera_target} hedefi sahnede odaklandı.` : `"${trimmed}" komutu yerel uzay veri katmanıyla işlendi.`;
  return { action_type: actionType, template_id: templateId, parameters, speech_text: speechText, is_student_mode: Boolean(isStudentMode) };
}

function findStepInMap(stepMap, stepKey) {
  if (!stepMap || typeof stepMap !== "object" || !stepKey) return null;
  return (stepMap[stepKey] && typeof stepMap[stepKey] === "object" && stepMap[stepKey]) || stepMap.states?.[stepKey] || stepMap.steps?.[stepKey] || null;
}

function resolveStateStep(contracts, templateId, parameters) {
  const stepKey = parameters?.target_state || parameters?.step_id || parameters?.state_id || null;
  const machine = contracts?.stateMachine;
  if (machine) {
    if (stepKey && typeof machine.getStep === "function") return machine.getStep(stepKey);
    if (typeof machine.getCurrentStep === "function") return machine.getCurrentStep();
  }
  const statesData = contracts?.statesData;
  if (!statesData || typeof statesData !== "object") return null;
  const block = statesData.missions?.[templateId] || statesData.templates?.[templateId] || statesData[templateId];
  if (stepKey) return findStepInMap(block, stepKey) || findStepInMap(statesData, stepKey);
  if (!block || typeof block !== "object") return null;
  if (block.initial_state) return findStepInMap(block, block.initial_state) || findStepInMap(statesData, block.initial_state);
  return block.title || block.description || block.next_actions ? block : null;
}

async function attachSpaceData(mergedParams, templateId, getSpaceData) {
  if (typeof getSpaceData !== "function") return;
  const alreadyPopulated = mergedParams.data_source === "NASA_API" || Boolean(mergedParams.image_url || mergedParams.hd_image_url) || (Array.isArray(mergedParams.asteroids) && !mergedParams.query_type);
  if (alreadyPopulated || (!mergedParams.query_type && !SPACE_DATA_TEMPLATES.has(templateId))) return;
  const queryType = mergedParams.query_type || templateId;
  const identifier = mergedParams.identifier || mergedParams.target || mergedParams.mission_id || templateId;
  try {
    const res = await getSpaceData(queryType, identifier);
    if (mergedParams.items) return;
    if (Array.isArray(res) && res.length > 0) mergedParams.items = res;
    else if (res && typeof res === "object" && !Array.isArray(res)) {
      if (Array.isArray(res.items)) mergedParams.items = res.items;
      else if (Object.keys(res).length > 0) mergedParams.items = [res];
    }
  } catch (err) {
    console.warn("Uzay verisi alınamadı:", err);
  }
}

/**
 * Rota JSON çıktısını state akışı (states.json) ve veri katmanı (getSpaceData) ile zenginleştirir.
 */
export async function enrichRoutePayload(routeJson, contracts = {}, rawQuery = "") {
  if (!routeJson || typeof routeJson !== "object") {
    return { action_type: "RESET_VIEW", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: false };
  }
  const normalized = normalizeGeminiRoute(routeJson, rawQuery);
  // Ödeve ekleme sahne açmaz: karşılaştırma/odak/veri zenginleştirmesi yapılmadan sadece konu metni taşınır
  if (normalized.action_type === "ADD_TO_HOMEWORK") {
    const query = String(rawQuery || normalized.parameters.query || normalized.parameters.title || "").trim();
    return { ...normalized, template_id: "NONE", parameters: query ? { query } : {} };
  }
  // Genel soru: Güneş Sistemi'nde odak/sahne seçimi yapılmaz, sadece geniş bilgi penceresi açılır
  if (normalized.parameters.is_general_question === true && !Array.isArray(normalized.parameters.events)) {
    const { model_url: _m, modelUrl: _u, camera_target: _c, ...infoParams } = normalized.parameters;
    return { ...normalized, action_type: "OPEN_POPUP", template_id: "NONE", parameters: infoParams };
  }
  let templateId = normalized.template_id || "NONE";
  const mergedParams = { ...normalized.parameters };

  const stepData = resolveStateStep(contracts, templateId, mergedParams);
  if (stepData && typeof stepData === "object") {
    for (const k of ["title", "description", "camera_target"]) if (!mergedParams[k] && stepData[k]) mergedParams[k] = stepData[k];
    if (!mergedParams.next_actions && Array.isArray(stepData.next_actions)) mergedParams.next_actions = stepData.next_actions;
  }
  if (typeof mergedParams.camera_target === "string" && SOLAR_BODY_NAME_REGEX.test(mergedParams.camera_target.trim())) {
    mergedParams.camera_target = mergedParams.camera_target.trim().toUpperCase();
  } else if (typeof mergedParams.camera_target === "string" && /^[a-z][a-z0-9 _-]*$/i.test(mergedParams.camera_target.trim())) {
    // Gemini "Voyager 1"/"james webb" gibi yazabilir; hedef tablosu UPPER_SNAKE. Rakamla başlayan asteroit adları olduğu gibi kalır
    mergedParams.camera_target = mergedParams.camera_target.trim().toUpperCase().replace(/[\s-]+/g, "_");
  }
  const hasPhoto = Boolean(mergedParams.image_url || mergedParams.hd_image_url || mergedParams.hdurl || mergedParams.url);
  const queryText = rawQuery || mergedParams.query || "";
  const sceneHint = hasPhoto
    ? queryText
    : [mergedParams.camera_target, mergedParams.target_object, mergedParams.primary_object, mergedParams.target_body, mergedParams.target, mergedParams.planet, mergedParams.object, mergedParams.mission_id, mergedParams.query, mergedParams.title].filter((v) => typeof v === "string" && v.trim()).join(" ");
  const nextAction = applyComparisonEnrichment(normalized, mergedParams, sceneHint, templateId);
  if (nextAction === "SHOW_COMPARISON" && mergedParams.is_gravity_test && templateId === "NONE") templateId = "GRAVITY_SIM";
  // Gemini'nin seçtiği hedef önce tek başına çözülür; soru metnindeki başka cisim ("Güneş'te") onu ezmesin
  // Ama kullanıcı tekil bir 3D modeli açıkça adlandırdıysa ("astronot kıyafetini göster") o model açılır
  const queryScene = !hasPhoto && queryText ? resolveFallbackSceneParams(queryText) : {};
  const isNamedModel = typeof queryScene.model_url === "string" && queryScene.model_url.endsWith(".glb");
  const targetScene = typeof mergedParams.target_object === "string" ? resolveFallbackSceneParams(mergedParams.target_object) : {};
  const fallbackScene = mergedParams.model_url ? {} : isNamedModel ? queryScene : targetScene.camera_target || targetScene.model_url ? targetScene : resolveFallbackSceneParams(sceneHint);
  if (hasPhoto && !fallbackScene.camera_target) {
    delete mergedParams.camera_target;
  }
  if (!mergedParams.model_url && !mergedParams.modelUrl && fallbackScene.model_url) mergedParams.model_url = fallbackScene.model_url;
  if (!mergedParams.camera_target && fallbackScene.camera_target) mergedParams.camera_target = fallbackScene.camera_target;
  if (!mergedParams.flare_class && fallbackScene.flare_class) mergedParams.flare_class = fallbackScene.flare_class;
  if (templateId === "SOLAR_FLARE") mergedParams.model_url = "SOLAR_FLARE";
  await attachSpaceData(mergedParams, templateId, contracts?.getSpaceData);
  if (templateId === "NEO_SWARM") {
    mergedParams.model_url = "SOLAR_SYSTEM";
    if (!Array.isArray(mergedParams.asteroids)) {
      const hasAst = Array.isArray(mergedParams.items) && mergedParams.items.some((e) => e && ("distance_km" in e || "name" in e));
      mergedParams.asteroids = hasAst ? mergedParams.items : FALLBACK_ASTEROIDS.map((item) => ({ ...item }));
    }
    if (!mergedParams.items && mergedParams.asteroids.length > 0) mergedParams.items = mergedParams.asteroids;
  }
  // Gemini facts/sections doldurduysa ham parametre satırları (target_object gibi yönlendirme alanları) kartta gösterilmez
  const hasRichContent = Array.isArray(mergedParams.facts) || Array.isArray(mergedParams.sections);
  if (!hasRichContent && (mergedParams.data_source === "GEMINI" || mergedParams.data_source === "NASA_API") && !mergedParams.items) {
    const rows = Object.entries(mergedParams).filter(([k, v]) => !META_PARAM_KEYS.has(k) && v !== null && typeof v !== "object").map(([k, v]) => ({ label: k, value: String(v) }));
    if (rows.length > 0) { mergedParams.items = rows; if (!mergedParams.metrics) mergedParams.metrics = rows; }
  }
  const imgItems = Array.isArray(mergedParams.items) ? mergedParams.items.filter((e) => e && typeof e === "object" && (e.image_url || e.hd_image_url || e.hdurl || e.url)) : [];
  if (imgItems.length > 0) {
    if (!Array.isArray(mergedParams.images)) mergedParams.images = imgItems;
    if (!mergedParams.image_url) mergedParams.image_url = imgItems[0].image_url || imgItems[0].hd_image_url || imgItems[0].hdurl || imgItems[0].url;
    if (!mergedParams.description && (imgItems[0].explanation || imgItems[0].description)) mergedParams.description = imgItems[0].explanation || imgItems[0].description;
    if (!mergedParams.title && imgItems[0].title) mergedParams.title = imgItems[0].title;
  }

  const hasImage = Boolean(mergedParams.image_url || mergedParams.hd_image_url || mergedParams.hdurl || mergedParams.url) || (Array.isArray(mergedParams.images) && mergedParams.images.length > 0);
  if (nextAction === "OPEN_POPUP" && !hasImage) mergedParams.image_url = createFallbackSpaceImageDataUri(mergedParams.title || mergedParams.query || "Aluma", templateId);
  return { ...normalized, action_type: nextAction, template_id: templateId, parameters: mergedParams };
}

async function safeImport(importer, modulePath) {
  try { return await importer(modulePath); } catch { return null; }
}

/**
 * Diğer ekip üyelerinin modülleri varsa dinamik yükler; eksik modüllerde hata fırlatmaz.
 */
export async function loadExternalContracts(importer = (specifier) => import(specifier)) {
  const [geminiMod, threeMod, dataMod, physicsMod, canvasMod, stateMod] = await Promise.all([
    safeImport(importer, "../services/geminiRouter.js"), safeImport(importer, "../three/threeSceneFactory.js"),
    safeImport(importer, "../api/dataLayer.js"), safeImport(importer, "../physics/spacePhysics.js"),
    safeImport(importer, "../canvas/proceduralCanvas.js"), safeImport(importer, "../logic/stateMachine.js")
  ]);
  return {
    getRouteFromGemini: geminiMod?.getRouteFromGemini ?? null, create3DMissionScene: threeMod?.create3DMissionScene ?? null,
    getSpaceData: dataMod?.getSpaceData ?? null, calculateLightDelay: physicsMod?.calculateLightDelay ?? null,
    renderProceduralPlanet: canvasMod?.renderProceduralPlanet ?? null, MissionStateMachine: stateMod?.MissionStateMachine ?? null, statesData: stateMod?.statesData ?? null
  };
}

/**
 * Sözleşmeleri actionRouter'a bağlayan ve yan panel/komut akışını yöneten köprüyü kurar.
 */
export function createContractBridge(options = {}) {
  let activeContracts = { ...(options.contracts || {}) };
  let lastTemplateId = "NONE";
  let currentStudentMode = false;

  async function handleSidePanelAction(actionItem) {
    if (!actionItem || typeof actionItem !== "object") return null;
    if (actionItem.action === "ADD_TO_NOTEBOOK" || actionItem.action === "ADD_TO_HOMEWORK") {
      return handleActionRouter({ action_type: "ADD_TO_HOMEWORK", template_id: lastTemplateId, speech_text: "", is_student_mode: currentStudentMode, parameters: { id: actionItem.id || actionItem.step_id || actionItem.title || actionItem.label, title: actionItem.title || actionItem.label || actionItem.step_id } });
    }
    if (!actionItem.target_state) return null;
    const enriched = await enrichRoutePayload({ action_type: "OPEN_SIDE_PANEL", template_id: lastTemplateId, speech_text: "", is_student_mode: currentStudentMode, parameters: { target_state: actionItem.target_state, step_id: actionItem.target_state } }, activeContracts);
    const panelResult = handleActionRouter(enriched);
    if (enriched.parameters?.camera_target) {
      handleActionRouter({ action_type: "FOCUS_OBJECT", template_id: enriched.template_id, parameters: { camera_target: enriched.parameters.camera_target }, speech_text: "", is_student_mode: currentStudentMode });
    }
    return panelResult;
  }

  function syncRouter() {
    configureActionRouter({
      doc: options.doc ?? null, create3DMissionScene: activeContracts.create3DMissionScene ?? null,
      renderProceduralPlanet: activeContracts.renderProceduralPlanet ?? null, calculateLightDelay: activeContracts.calculateLightDelay ?? null,
      onHomeworkAdded: options.onHomeworkAdded ?? null, onExportPdf: options.onExportPdf ?? null,
      onSpeechText: options.onSpeechText ?? null, onSidePanelAction: (item) => handleSidePanelAction(item),
      onStudentAction: options.onStudentAction ?? null, onStudentModeChange: options.onStudentModeChange ?? null
    });
  }

  const setContracts = (nextContracts = {}) => { activeContracts = { ...activeContracts, ...nextContracts }; syncRouter(); };

  async function resolveUserCommand(rawText, isStudentMode = false) {
    const trimmed = String(rawText || "").trim();
    if (!trimmed) return null;
    currentStudentMode = Boolean(isStudentMode);
    if (isHomeworkIntent(trimmed)) {
      // "Ay yerçekimini ödevime ekle": Gemini sahne seçmesin diye niyet yerelde yakalanır, aktif sahne korunur
      return { action_type: "ADD_TO_HOMEWORK", template_id: "NONE", parameters: { query: trimmed }, speech_text: "", is_student_mode: currentStudentMode };
    }
    let routeJson = null;
    if (typeof activeContracts.getRouteFromGemini === "function") {
      try { routeJson = await activeContracts.getRouteFromGemini(trimmed, currentStudentMode); } catch (err) { console.warn("Gemini yönlendirici hatası:", err); }
    }
    const isGeminiFallback = routeJson?.parameters?.data_source === "FALLBACK";
    if (!routeJson || typeof routeJson !== "object" || (isGeminiFallback && resolveFallbackActionType(trimmed) !== "RESET_VIEW")) {
      routeJson = buildLocalChatFallbackRoute(trimmed, currentStudentMode);
    }
    const modeFlag = typeof routeJson.is_student_mode === "boolean" ? routeJson.is_student_mode : currentStudentMode;
    const enriched = await enrichRoutePayload({ ...routeJson, is_student_mode: modeFlag }, activeContracts, trimmed);
    lastTemplateId = enriched.template_id || "NONE";
    return enriched;
  }

  async function dispatchUserCommand(rawText, isStudentMode = false) {
    const enriched = await resolveUserCommand(rawText, isStudentMode);
    return enriched ? handleActionRouter(enriched) : null;
  }

  syncRouter();
  return { setContracts, getContracts: () => ({ ...activeContracts }), resolveUserCommand, dispatchUserCommand, handleSidePanelAction };
}
