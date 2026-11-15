// Kamera 3D hedefe ulaştığında (gezegen, uydu, uzay aracı veya yüzey inişi) bekleyen pop-up/kart açılışını tetikler.

const MARS_SURFACE_TARGETS = new Set(["PERSEVERANCE", "CURIOSITY", "INGENUITY", "JEZERO", "GALE", "MARS_SURFACE"]);
const LUNAR_SURFACE_TARGETS = new Set(["APOLLO_LUNAR_MODULE", "TRANQUILITY_BASE", "LUNAR_SURFACE"]);
const SPACECRAFT_TARGETS = new Set(["ISS", "JWST", "HUBBLE", "VOYAGER_1", "VOYAGER_2", "PARKER", "NEW_HORIZONS", "MARS_PHOTO_SAT"]);

let activeCleanup = null;

/**
 * Bekleyen kamera varış dinleyicisini ve zamanlayıcısını iptal eder.
 */
export function cancelCameraArrival() {
  if (typeof activeCleanup !== "function") return;
  const cleanup = activeCleanup;
  activeCleanup = null;
  cleanup();
}

function getExpectedEvents(targetId) {
  const upper = typeof targetId === "string" ? targetId.trim().toUpperCase() : "";
  if (MARS_SURFACE_TARGETS.has(upper)) {
    return [["ag:surface-state", (detail) => detail?.surface_state === "SURFACE"]];
  }
  if (LUNAR_SURFACE_TARGETS.has(upper)) {
    return [["ag:lunar-surface-state", (detail) => detail?.surface_state === "SURFACE"]];
  }
  if (SPACECRAFT_TARGETS.has(upper)) {
    return [
      ["ag:spacecraft-ready", (detail) => !detail?.id || String(detail.id).toUpperCase() === upper],
      ["ag:focus-arrived", (detail) => !detail?.target || String(detail.target).toUpperCase() === upper]
    ];
  }
  const raw = typeof targetId === "string" ? targetId.trim() : "";
  return [[
    "ag:focus-arrived",
    (detail) => !detail?.target || !upper || upper === "DEFAULT" || String(detail.target).toUpperCase() === upper || detail.target === raw
  ]];
}

/**
 * Verilen targetId hedefine 3D kamera vardığında onArrive geri çağrısını bir kez çalıştırır.
 */
export function scheduleOnCameraArrival(targetId, onArrive, timeoutMs = 9000) {
  cancelCameraArrival();
  if (typeof onArrive !== "function") return;
  if (typeof globalThis.addEventListener !== "function") {
    onArrive();
    return;
  }

  const upper = typeof targetId === "string" ? targetId.trim().toUpperCase() : "";
  const isSurface = MARS_SURFACE_TARGETS.has(upper) || LUNAR_SURFACE_TARGETS.has(upper);
  const safeTimeout_ms = isSurface && timeoutMs === 9000 ? 18000 : timeoutMs;
  const listeners = [];
  let finished = false;
  let timer = null;

  const cleanup = () => {
    if (timer !== null) {
      globalThis.clearTimeout?.(timer);
      timer = null;
    }
    for (const [eventName, handler] of listeners) {
      globalThis.removeEventListener?.(eventName, handler);
    }
    listeners.length = 0;
  };

  const complete = () => {
    if (finished) return;
    finished = true;
    activeCleanup = null;
    cleanup();
    onArrive();
  };

  for (const [eventName, predicate] of getExpectedEvents(targetId)) {
    const handler = (event) => {
      if (predicate(event?.detail)) complete();
    };
    listeners.push([eventName, handler]);
    globalThis.addEventListener(eventName, handler);
  }

  if (typeof globalThis.setTimeout === "function") {
    timer = globalThis.setTimeout(complete, Math.max(0, Number(safeTimeout_ms) || 0));
    timer?.unref?.();
  }
  activeCleanup = () => {
    finished = true;
    cleanup();
  };
}
