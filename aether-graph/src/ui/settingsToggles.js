// Ayarlar menüsündeki düğmelerin basit durum yardımcıları: basılı durumu ve HUD boyut döngüsü.

/**
 * Düğmenin açık/kapalı (is-active, aria-pressed) durumunu ayarlar.
 */
export function setPressedState(buttonEl, isActive) {
  if (!buttonEl) return;
  buttonEl.classList.toggle("is-active", isActive);
  buttonEl.setAttribute("aria-pressed", String(isActive));
}

/**
 * Düğmenin açık/kapalı durumunu tersine çevirir.
 */
export function togglePressedState(buttonEl) {
  if (!buttonEl) return;
  setPressedState(buttonEl, !buttonEl.classList.contains("is-active"));
}

/**
 * HUD boyutunu normal → büyük → küçük → normal sırasıyla değiştirir.
 */
export function cycleHudSize(hudEl) {
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
