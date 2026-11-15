// Açılış astrometri yükleme katmanı ve ayarlar panelinin aç/kapa durumu.

const BOOT_DURATION_MS = 3200;

function updateLoadingProgress(barEl, textEl, percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (barEl) barEl.style.width = `${clamped}%`;
  if (textEl) textEl.textContent = `%${clamped}`;
}

export function setSettingsOpen(panelEl, toggleBtn, isOpen) {
  panelEl?.classList.toggle("is-hidden", !isOpen);
  if (toggleBtn) {
    toggleBtn.classList.toggle("is-active", isOpen);
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  }
}

/**
 * Astrometri yükleme katmanını oynatır ve bitince HUD'u görünür kılar.
 */
export function showLoadingSequence(doc, durationMs = BOOT_DURATION_MS) {
  const overlayEl = doc.getElementById("loading-overlay");
  const hudEl = doc.getElementById("hud-container");
  const barEl = doc.getElementById("loading-progress-bar");
  const textEl = doc.getElementById("loading-progress-text");
  if (!overlayEl) return () => {};

  overlayEl.classList.remove("is-hidden");
  hudEl?.classList.add("is-hidden");
  hudEl?.classList.remove("is-ui-entering");
  setSettingsOpen(doc.getElementById("settings-panel"), doc.getElementById("settings-toggle-button"), false);
  updateLoadingProgress(barEl, textEl, 0);

  let frameId = 0;
  let cancelled = false;
  const startMs = performance.now();

  const step = (nowMs) => {
    if (cancelled) return;
    const ratio = durationMs > 0 ? Math.min(1, (nowMs - startMs) / durationMs) : 1;
    updateLoadingProgress(barEl, textEl, ratio * 100);
    if (ratio < 1) {
      frameId = requestAnimationFrame(step);
      return;
    }
    overlayEl.classList.add("is-hidden");
    if (hudEl) {
      hudEl.classList.remove("is-hidden");
      void hudEl.offsetWidth;
      hudEl.classList.add("is-ui-entering");
    }
  };

  frameId = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frameId);
  };
}
