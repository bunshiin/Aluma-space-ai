// 3D sahne yaşam döngüsünü (destroy/onProgress), 2D canvas bölünmüş görünümünü ve kamera durumunu yönetir.

import { renderFallbackProceduralPlanet } from "./fallbackPlanetCanvas.js";

const EARTH_MODEL = "EARTH_EVENTS";

function dispatchViewportEvent(target, eventName, detail) {
  if (!target || typeof target.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  target.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail }));
}

function dispatchWindowEvent(eventName, detail) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function dispatchWindowResize() {
  if (typeof globalThis.dispatchEvent !== "function" || typeof Event !== "function") return;
  globalThis.dispatchEvent(new Event("resize"));
}

function buildComparisonDetail(parameters = {}, templateId = "NONE") {
  const toUpperBody = (val) => (typeof val === "string" && val.trim() ? val.trim().toUpperCase() : undefined);
  const detail = {
    primary_object: toUpperBody(parameters?.primary_object || parameters?.target_1 || parameters?.source),
    secondary_object: toUpperBody(parameters?.secondary_object || parameters?.target_2 || parameters?.target),
    is_gravity_test: typeof parameters?.is_gravity_test === "boolean" ? parameters.is_gravity_test : templateId === "GRAVITY_SIM"
  };
  for (const key of ["mass_kg", "height_m", "age_years"]) {
    if (typeof parameters?.[key] === "number" && Number.isFinite(parameters[key]) && parameters[key] > 0) detail[key] = parameters[key];
  }
  return detail;
}

// Işık gecikmesi sahnesi (lightDelaySimulation) için kaynak/hedef: Gemini UPPER_SNAKE kimlik verir, eksikse Dünya → Mars
function buildLightDelayDetail(parameters = {}) {
  const toBodyId = (val) => (typeof val === "string" && val.trim() ? val.trim().toUpperCase().replace(/[s-]+/g, "_") : undefined);
  const detail = {
    source: toBodyId(parameters?.source) || "EARTH",
    target: toBodyId(parameters?.target || parameters?.target_object || parameters?.secondary_object || parameters?.camera_target) || "MARS",
    mode: parameters?.mode === "round-trip" ? "round-trip" : "one-way",
  };
  if (typeof parameters?.speed_kms === "number" && Number.isFinite(parameters.speed_kms) && parameters.speed_kms > 0) detail.speed_kms = parameters.speed_kms;
  return detail;
}

function updateAnimationButtons(playBtn, pauseBtn, isPlaying) {
  playBtn?.setAttribute?.("aria-pressed", String(Boolean(isPlaying)));
  pauseBtn?.setAttribute?.("aria-pressed", String(!isPlaying));
}

/**
 * 3D/2D sahne alanı için izole görünüm kontrolcüsü oluşturur.
 */
export function createViewportController(config = {}) {
  let activeScene = null;
  let pendingScenePromise = null;
  let sceneRequestId = 0;
  let isSceneLoading = false;
  let state = {
    is_split_screen: false,
    is_playing: false,
    camera_target: "DEFAULT",
    highlighted_object: null,
    model_url: null,
    light_delay: null
  };

  const isSolarFamily = (url) => url === "SOLAR_SYSTEM" || url === "SOLAR_FLARE";

  function destroy() {
    sceneRequestId += 1;
    isSceneLoading = false;
    pendingScenePromise = null;
    if (activeScene && typeof activeScene.destroy === "function") {
      try { activeScene.destroy(); } catch (err) { console.warn("3D sahne temizlenirken hata oluştu:", err); }
    }
    activeScene = null;
    state.model_url = null;
    state.is_playing = false;
  }

  function openScene(modelUrl) {
    // Yeni sahne başlamadan önce eski sahneyi senkron temizlemek zorunludur.
    destroy();
    if (!modelUrl || typeof config.create3DMissionScene !== "function") return Promise.resolve(null);

    const requestId = sceneRequestId;
    isSceneLoading = true;
    state.model_url = modelUrl;
    config.onProgress?.(0, true);

    let scenePromise;
    try {
      scenePromise = Promise.resolve(config.create3DMissionScene(config.sceneContainer, modelUrl, (percent) => {
        if (requestId === sceneRequestId) config.onProgress?.(percent, isSceneLoading || percent < 100);
      }));
    } catch (err) {
      console.warn("3D sahne başlatılamadı:", err);
      isSceneLoading = false;
      config.onProgress?.(0, false);
      return Promise.resolve(null);
    }

    const trackedPromise = scenePromise
      .then((sceneInstance) => {
        if (requestId !== sceneRequestId) {
          // Eski istek geç döndüyse bellek sızıntısını önlemek için hemen temizle.
          sceneInstance?.destroy?.();
          return null;
        }
        isSceneLoading = false;
        pendingScenePromise = null;
        activeScene = sceneInstance || null;
        config.onProgress?.(100, false);
        dispatchViewportEvent(config.sceneContainer || config.appShell, "ag:scene-ready", { model_url: modelUrl });
        return activeScene;
      })
      .catch((err) => {
        console.warn("3D sahne yüklemesi başarısız:", err);
        if (requestId === sceneRequestId) {
          isSceneLoading = false;
          pendingScenePromise = null;
          config.onProgress?.(0, false);
        }
        return null;
      });
    pendingScenePromise = trackedPromise;
    return trackedPromise;
  }

  function applySplitScreen(templateId, parameters = {}) {
    state.is_split_screen = true;
    config.appShell?.classList?.add("is-split-screen");
    config.canvasContainer?.classList?.remove("is-hidden");
    config.canvasContainer?.setAttribute?.("aria-hidden", "false");

    if (templateId === "LIGHT_DELAY" && typeof config.calculateLightDelay === "function") {
      try {
        const mode = parameters?.mode === "round-trip" ? "round-trip" : "one-way";
        state.light_delay = config.calculateLightDelay(parameters?.source || "Earth", parameters?.target || "Mars", mode);
      } catch (err) {
        console.warn("Işık gecikmesi hesaplanamadı:", err);
        state.light_delay = null;
      }
    }

    const canvasId = config.proceduralCanvas?.id || "procedural-canvas";
    const planetName = parameters?.planet || parameters?.camera_target || parameters?.target || "mars";
    if (typeof config.renderProceduralPlanet === "function") {
      try {
        config.renderProceduralPlanet(canvasId, planetName);
      } catch (err) {
        console.warn("2D gezegen çizimi başarısız:", err);
      }
    } else {
      renderFallbackProceduralPlanet(config.proceduralCanvas, planetName, state.light_delay);
    }
    dispatchWindowResize();
  }

  function resetView() {
    // Tekil görev modeli açıksa temizle; SOLAR_SYSTEM zaten açıksa sahneyi koruyup asteroitleri boşalt.
    if (state.model_url && !isSolarFamily(state.model_url)) {
      destroy();
    }
    state.is_split_screen = false;
    state.camera_target = "SUN";
    state.highlighted_object = null;
    state.light_delay = null;

    config.appShell?.classList?.remove("is-split-screen");
    config.canvasContainer?.classList?.add("is-hidden");
    config.canvasContainer?.setAttribute?.("aria-hidden", "true");
    config.sceneContainer?.classList?.remove("is-playing");
    config.sceneContainer?.setAttribute?.("data-camera-target", "SUN");
    config.sceneContainer?.removeAttribute?.("data-highlight-object");
    config.sceneContainer?.removeAttribute?.("data-comparison-request");
    updateAnimationButtons(config.playAnimationButton, config.pauseAnimationButton, false);
    config.onProgress?.(0, false);
    dispatchWindowResize();
    dispatchWindowEvent("ag:neo-data", { parameters: { asteroids: [] } });
    dispatchWindowEvent("ag:light-delay-clear", {});
    dispatchWindowEvent("ag:focus-target", { target: "SUN" });
  }

  function applyAction(actionType, templateId = "NONE", parameters = {}, routePayload = null) {
    let scenePromise = null;
    const isAsteroidRoute = actionType !== "RESET_VIEW" && (templateId === "NEO_SWARM" || Array.isArray(parameters?.asteroids));
    const rawRequestedModel = parameters?.model_url || parameters?.modelUrl;
    // EONET afet listesi gelirse sahne her zaman Dünya küresidir (veri öncelikli)
    const earthEvents = Array.isArray(parameters?.events) ? parameters.events : [];
    const isEarthRoute = actionType !== "RESET_VIEW" && (earthEvents.length > 0 || rawRequestedModel === EARTH_MODEL);
    // Işık gecikmesi Güneş Sistemi içinde ışın/sinyal paketi olarak çizilir; ayrı sahne açılmaz
    const isLightDelayRoute = actionType !== "RESET_VIEW" && templateId === "LIGHT_DELAY" && !isEarthRoute;
    const isComparisonRoute = actionType !== "RESET_VIEW" && !isLightDelayRoute && (
      rawRequestedModel === "PLANET_COMPARISON" ||
      (actionType === "SHOW_COMPARISON" && !rawRequestedModel && Boolean(parameters?.primary_object || parameters?.secondary_object))
    );
    const requestedModel = isEarthRoute
      ? EARTH_MODEL
      : isComparisonRoute
      ? "PLANET_COMPARISON"
      : (isAsteroidRoute || isLightDelayRoute || rawRequestedModel === "NEO_SWARM" ? "SOLAR_SYSTEM" : rawRequestedModel);
    const isSolarReusable =
      Boolean(requestedModel) && isSolarFamily(requestedModel) && isSolarFamily(state.model_url) && (Boolean(activeScene) || isSceneLoading);
    const isComparisonReusable =
      isComparisonRoute && state.model_url === "PLANET_COMPARISON" && (Boolean(activeScene) || isSceneLoading);
    const isEarthReusable = isEarthRoute && state.model_url === EARTH_MODEL && (Boolean(activeScene) || isSceneLoading);
    const isDuplicateLoading = Boolean(requestedModel) && state.model_url === requestedModel && isSceneLoading;
    const comparisonDetail = isComparisonRoute ? buildComparisonDetail(parameters, templateId) : null;

    if (isComparisonRoute && !isComparisonReusable) {
      config.sceneContainer?.setAttribute?.("data-comparison-request", JSON.stringify(comparisonDetail));
    } else if (requestedModel && requestedModel !== "PLANET_COMPARISON") {
      config.sceneContainer?.removeAttribute?.("data-comparison-request");
    }

    if (requestedModel && actionType !== "RESET_VIEW" && !isSolarReusable && !isComparisonReusable && !isEarthReusable && !isDuplicateLoading) {
      scenePromise = openScene(requestedModel);
    }

    const waitForScene = scenePromise || ((isSolarReusable || isComparisonReusable || isEarthReusable) && isSceneLoading ? pendingScenePromise : null);
    const dispatchWithScene = (fn) => (waitForScene ? waitForScene.then((scene) => { if (scene) fn(); }) : fn());
    if (isComparisonReusable) dispatchWithScene(() => dispatchWindowEvent("ag:planet-comparison", comparisonDetail));
    if (isEarthRoute) {
      const earthDetail = { events: earthEvents, focus_event_id: parameters?.focus_event_id ?? null };
      dispatchWithScene(() => dispatchWindowEvent("ag:earth-events", earthDetail));
    }
    if (isLightDelayRoute) {
      const lightDetail = buildLightDelayDetail(parameters);
      dispatchWithScene(() => dispatchWindowEvent("ag:light-delay", lightDetail));
    }

    const isFlareTrigger = actionType !== "RESET_VIEW" && (templateId === "SOLAR_FLARE" || rawRequestedModel === "SOLAR_FLARE" || Boolean(parameters?.flare_class));
    const isFocusAction = actionType === "FOCUS_OBJECT" || actionType === "PAN_TO";
    // Işık gecikmesinde kamerayı simülasyonun kendi sinematik çekimi yönetir
    const cameraTarget = isComparisonRoute || isEarthRoute || isLightDelayRoute
      ? null
      : isAsteroidRoute
        ? parameters?.camera_target || parameters?.target || "EARTH"
        : parameters?.camera_target || (isFocusAction ? parameters?.target || "DEFAULT" : null);

    if (isAsteroidRoute) {
      const neoDetail = routePayload || { action_type: actionType, template_id: templateId, parameters };
      state.camera_target = cameraTarget;
      config.sceneContainer?.setAttribute?.("data-camera-target", cameraTarget);
      dispatchWithScene(() => {
        dispatchWindowEvent("ag:neo-data", neoDetail);
        dispatchWindowEvent("ag:focus-target", { target: cameraTarget });
      });
    } else if (cameraTarget && actionType !== "RESET_VIEW") {
      const isSameActiveTarget = !scenePromise && isSolarReusable && state.camera_target === cameraTarget;
      state.camera_target = cameraTarget;
      config.sceneContainer?.setAttribute?.("data-camera-target", cameraTarget);
      if (!isFlareTrigger && !isSameActiveTarget) {
        dispatchWithScene(() => dispatchWindowEvent("ag:focus-target", { target: cameraTarget }));
      }
    }

    if (isFlareTrigger && (rawRequestedModel !== "SOLAR_FLARE" || Boolean(parameters?.flare_class) || !scenePromise)) {
      dispatchWithScene(() => dispatchWindowEvent("ag:solar-flare", parameters));
    }

    switch (actionType) {
      case "SPLIT_SCREEN":
        applySplitScreen(templateId, parameters);
        break;
      case "HIGHLIGHT_OBJECT":
        state.highlighted_object = parameters?.object_id || parameters?.target || "NONE";
        config.sceneContainer?.setAttribute?.("data-highlight-object", state.highlighted_object);
        break;
      case "PLAY_ANIMATION":
        state.is_playing = true;
        config.sceneContainer?.classList?.add("is-playing");
        updateAnimationButtons(config.playAnimationButton, config.pauseAnimationButton, true);
        break;
      case "PAUSE_ANIMATION":
        state.is_playing = false;
        config.sceneContainer?.classList?.remove("is-playing");
        updateAnimationButtons(config.playAnimationButton, config.pauseAnimationButton, false);
        break;
      case "RESET_VIEW":
        resetView();
        break;
      default:
        break;
    }

    return { scene_promise: scenePromise, light_delay: state.light_delay, has_active_scene: Boolean(activeScene) || isSceneLoading };
  }

  return { openScene, applyAction, getState: () => ({ ...state }), destroy };
}
