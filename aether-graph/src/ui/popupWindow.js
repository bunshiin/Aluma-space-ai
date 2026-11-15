// Pop-up'ı Windows'taki küçültülmüş uygulama penceresi gibi davranır hale getirir:
// başlık çubuğundan sürüklenir, küçültülür (sadece başlık kalır), ekrandan taşmaz.
// Pencere açıldığında (container'dan is-hidden kalkınca) son konumuna veya varsayılan yere yerleşir.

const EDGE_MARGIN_PX = 16;
const MIN_VISIBLE_PX = 96;
// Üstteki marka/ayarlar şeridinin hemen altı; pencere alttaki sorgu kutusuna uzanmasın
const HEADER_OFFSET_PX = 80;

/**
 * Sürüklenen pencerenin sol/üst konumunu ekranda en az MIN_VISIBLE_PX görünecek şekilde sınırlar (saf).
 */
export function calculateClampedWindowPosition(left_px, top_px, window_w_px, viewport_w_px, viewport_h_px) {
  const minLeft = MIN_VISIBLE_PX - window_w_px;
  const maxLeft = viewport_w_px - MIN_VISIBLE_PX;
  const maxTop = viewport_h_px - 48;
  return {
    left_px: Math.round(Math.min(maxLeft, Math.max(minLeft, left_px))),
    top_px: Math.round(Math.min(maxTop, Math.max(0, top_px))),
  };
}

/**
 * Varsayılan yer: dikey pencere sol tarafta (sağ taraf yanıt paneline ait), geniş pencere yatayda ortada;
 * ikisi de başlık şeridinin altından başlar (küçük ekranda dikeyde ortalanır).
 */
export function calculateDefaultWindowPosition(is_wide, window_w_px, window_h_px, viewport_w_px, viewport_h_px) {
  const top_px = Math.max(EDGE_MARGIN_PX, Math.min(HEADER_OFFSET_PX, (viewport_h_px - window_h_px) / 2));
  const left_px = is_wide ? (viewport_w_px - window_w_px) / 2 : EDGE_MARGIN_PX * 2;
  return calculateClampedWindowPosition(left_px, top_px, window_w_px, viewport_w_px, viewport_h_px);
}

// İşaretçi yakalama sürüklemeyi pencere dışına taşınca da sürdürür; desteklenmezse sürükleme yine çalışır
function trySetPointerCapture(el, pointerId, isCapture) {
  try {
    if (isCapture) el.setPointerCapture?.(pointerId);
    else el.releasePointerCapture?.(pointerId);
  } catch {
    // Etkin olmayan işaretçi kimliği: yakalama olmadan devam edilir
  }
}

export function createPopupWindow({ container, dialog, titlebar, minimizeButton, env = globalThis }) {
  if (!container || !dialog || !titlebar) return { destroy() {} };
  const savedPositions = { narrow: null, wide: null };
  let drag = null;

  const getViewport = () => ({ w: env.innerWidth || 1024, h: env.innerHeight || 768 });
  const getMode = () => (dialog.classList.contains("is-wide") ? "wide" : "narrow");

  function applyPosition(pos) {
    dialog.style.left = `${pos.left_px}px`;
    dialog.style.top = `${pos.top_px}px`;
  }

  function placeWindow() {
    const { w, h } = getViewport();
    // offset* açılış animasyonundaki ölçekten etkilenmez, pencerenin gerçek boyutunu verir
    const width_px = dialog.offsetWidth;
    const height_px = dialog.offsetHeight;
    const saved = savedPositions[getMode()];
    applyPosition(saved
      ? calculateClampedWindowPosition(saved.left_px, saved.top_px, width_px, w, h)
      : calculateDefaultWindowPosition(getMode() === "wide", width_px, height_px, w, h));
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = dialog.getBoundingClientRect();
    drag = { pointerId: event.pointerId, offset_x: event.clientX - rect.left, offset_y: event.clientY - rect.top, width: dialog.offsetWidth };
    trySetPointerCapture(titlebar, event.pointerId, true);
    dialog.classList.add("is-dragging");
  };
  const handlePointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { w, h } = getViewport();
    const pos = calculateClampedWindowPosition(event.clientX - drag.offset_x, event.clientY - drag.offset_y, drag.width, w, h);
    applyPosition(pos);
    savedPositions[getMode()] = pos;
  };
  const handlePointerUp = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    trySetPointerCapture(titlebar, event.pointerId, false);
    dialog.classList.remove("is-dragging");
    drag = null;
  };
  const handleMinimize = () => {
    const isMinimized = dialog.classList.toggle("is-minimized");
    minimizeButton?.setAttribute("aria-pressed", String(isMinimized));
  };
  const handleResize = () => {
    if (!container.classList.contains("is-hidden")) placeWindow();
  };

  // Pencere her açılışta yerleşir; açılış router içinden olduğu için sınıf değişimi izlenir
  const observer = typeof env.MutationObserver === "function"
    ? new env.MutationObserver(() => {
      if (!container.classList.contains("is-hidden")) placeWindow();
    })
    : null;
  observer?.observe(container, { attributes: true, attributeFilter: ["class"] });

  titlebar.addEventListener("pointerdown", handlePointerDown);
  titlebar.addEventListener("pointermove", handlePointerMove);
  titlebar.addEventListener("pointerup", handlePointerUp);
  titlebar.addEventListener("pointercancel", handlePointerUp);
  minimizeButton?.addEventListener("click", handleMinimize);
  env.addEventListener?.("resize", handleResize);

  return {
    placeWindow,
    destroy() {
      observer?.disconnect();
      titlebar.removeEventListener("pointerdown", handlePointerDown);
      titlebar.removeEventListener("pointermove", handlePointerMove);
      titlebar.removeEventListener("pointerup", handlePointerUp);
      titlebar.removeEventListener("pointercancel", handlePointerUp);
      minimizeButton?.removeEventListener("click", handleMinimize);
      env.removeEventListener?.("resize", handleResize);
    },
  };
}
