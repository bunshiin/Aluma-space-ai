// Sağ yanıt paneli (EONET bilgi paneli): her komutun AI yanıtını gösterir; afet listesi gelirse
// olay kartını açar ve Dünya küresiyle ag:earth-* olayları üzerinden konuşur.

import { createInfoPanel } from "./eonetInfoPanel.js";

const EARTH_EVENTS_EVENT = "ag:earth-events";
const EARTH_VIEW_SHIFT_EVENT = "ag:earth-view-shift";
const EARTH_RESET_EVENT = "ag:earth-reset";
const EARTH_EVENT_PICKED_EVENT = "ag:earth-event-picked";

function dispatchWindowEvent(eventName, detail) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function getRouteEvents(route) {
  const events = route?.parameters?.events;
  if (!Array.isArray(events)) return [];
  return events.filter((e) =>
    e && typeof e === "object" && Number.isFinite(e.coordinates?.latitude_deg) && Number.isFinite(e.coordinates?.longitude_deg)
  );
}

/**
 * Yanıt panelini container içinde kurar. texts: config/eonet_texts.json
 */
export function createAnswerPanelController(container, texts) {
  if (!container || typeof document === "undefined") {
    return { showRoute: () => false, close() {}, destroy() {} };
  }
  let lastEvents = [];

  // Panel açıkken küre görünür alanın ortasına kaydırılır, olay panelin altında kalmaz.
  // Masaüstünde panel sağda (yatay kaydırma), mobilde altta (dikey kaydırma)
  function syncViewShift() {
    const rect = panel.getOpenRect();
    if (!rect) return dispatchWindowEvent(EARTH_VIEW_SHIFT_EVENT, { x_px: 0, y_px: 0 });
    const isBottomSheet = rect.left < container.clientWidth * 0.25;
    if (isBottomSheet) return dispatchWindowEvent(EARTH_VIEW_SHIFT_EVENT, { x_px: 0, y_px: (container.clientHeight - rect.top) / 2 });
    return dispatchWindowEvent(EARTH_VIEW_SHIFT_EVENT, { x_px: (container.clientWidth - rect.left) / 2, y_px: 0 });
  }

  function closeLeftPanels() {
    const doc = container?.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc?.getElementById) return;
    const ids = ["side-panel-container", "popup-container", "overlay-card-container"];
    for (const id of ids) {
      const el = doc.getElementById(id);
      if (el) {
        el.classList.add("is-hidden");
        el.setAttribute?.("aria-hidden", "true");
      }
    }
  }

  function focusEvent(events, event, speechText, dataSource) {
    closeLeftPanels();
    lastEvents = events;
    panel.showEvent({ events, focus_event: event, speech_text: speechText, data_source: dataSource });
    dispatchWindowEvent(EARTH_EVENTS_EVENT, { events, focus_event_id: event?.id ?? null });
    requestAnimationFrame(syncViewShift);
  }

  const panel = createInfoPanel(container, texts, {
    onClose() {
      panel.close();
      dispatchWindowEvent(EARTH_RESET_EVENT, {});
      syncViewShift();
    },
    onSelectEvent(event) {
      focusEvent(lastEvents, event, "", "");
    },
  });

  const handlePicked = (domEvent) => {
    const picked = domEvent?.detail?.event;
    if (picked) focusEvent(lastEvents.includes(picked) ? lastEvents : [picked, ...lastEvents], picked, "", "");
  };
  const handleResize = () => syncViewShift();
  globalThis.addEventListener?.(EARTH_EVENT_PICKED_EVENT, handlePicked);
  globalThis.addEventListener?.("resize", handleResize);

  return {
    // Afet listesi varsa olay kartı açılır ve true döner. Yoksa açık olay paneli kapanır ve false döner;
    // konuşma metni o zaman şeffaf altyazıyla gösterilir (subtitleController).
    showRoute(route) {
      const events = getRouteEvents(route);
      const speechText = typeof route?.speech_text === "string" ? route.speech_text : "";
      if (events.length > 0) {
        closeLeftPanels();
        const focus = events.find((e) => e.id === route.parameters.focus_event_id) || events[0];
        lastEvents = events;
        panel.showEvent({ events, focus_event: focus, speech_text: speechText, data_source: route.parameters.data_source });
        requestAnimationFrame(syncViewShift);
        return true;
      }
      panel.close();
      syncViewShift();
      return false;
    },
    close() {
      panel.close();
      syncViewShift();
    },
    destroy() {
      globalThis.removeEventListener?.(EARTH_EVENT_PICKED_EVENT, handlePicked);
      globalThis.removeEventListener?.("resize", handleResize);
      panel.destroy();
    },
  };
}
