// actionRouter'ın kullandığı sayfa öğelerini id ile toplar; öğe yoksa ilgili alan null kalır (hata fırlatmaz).

/**
 * Router'ın HUD, sahne, yan panel ve pop-up öğelerini verilen doc içinden bulur. doc geçersizse null döner.
 */
export function getRouterElements(doc) {
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
