// EONET Dünya küresi sahnesi: create3DMissionScene(container, "EARTH_EVENTS") kolu.
// UI ile sözleşme imzasını genişletmeden ag:earth-* olaylarıyla konuşur (bkz. AGENTS.md Bölüm 6).
import texts from '../config/eonet_texts.json' with { type: 'json' };
import { createEarthEventGlobe } from './earthGlobe.js';
import { getCategoryColorHex } from './disasterStyles.js';

export const EARTH_EVENTS_EVENT = 'ag:earth-events';
export const EARTH_VIEW_SHIFT_EVENT = 'ag:earth-view-shift';
export const EARTH_RESET_EVENT = 'ag:earth-reset';
export const EARTH_EVENT_PICKED_EVENT = 'ag:earth-event-picked';

const LABEL_SIDE_PX = 84;

function getCategoryName(category) {
  return texts.categories?.[category] || category || texts.field_unknown;
}

// Odaklanılan afetin üstünde küreyle birlikte hareket eden isim etiketi (küre katmanının parçası)
function createEventLabel(labelsEl, globe) {
  const label = document.createElement('div');
  label.className = 'eonet-label';
  const category = document.createElement('span');
  category.className = 'eonet-label-category';
  const title = document.createElement('span');
  title.className = 'eonet-label-title';
  label.append(category, title);
  labelsEl.append(label);

  let event = null;
  const stopFrame = globe.onFrame(() => {
    if (!event) return;
    const pos = globe.projectEvent(event);
    label.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    label.classList.toggle('eonet-label-hidden', !pos.visible);
    // Sağ kenara yakın olayda etiket sola açılır ki ekrandan taşmasın
    label.classList.toggle('eonet-label-flip', pos.x + LABEL_SIDE_PX + title.offsetWidth > labelsEl.clientWidth);
  });

  return {
    show(nextEvent) {
      event = nextEvent;
      label.style.setProperty('--eonet-label-color', getCategoryColorHex(nextEvent.category));
      category.textContent = getCategoryName(nextEvent.category);
      title.textContent = nextEvent.title;
      label.classList.add('eonet-label-visible');
    },
    hide() {
      event = null;
      label.classList.remove('eonet-label-visible');
    },
    destroy() {
      stopFrame();
      label.remove();
    },
  };
}

function isValidEvent(e) {
  return Boolean(e && typeof e === 'object' && Number.isFinite(e.coordinates?.latitude_deg) && Number.isFinite(e.coordinates?.longitude_deg));
}

/**
 * Dünya küresini kurar; afet listesi ag:earth-events olayıyla gelir, seçim ag:earth-event-picked ile döner.
 */
export async function createEarthEventScene(container, onProgress) {
  if (typeof document === 'undefined' || typeof globalThis.addEventListener !== 'function') {
    return { destroy() {} };
  }
  const stage = document.createElement('div');
  stage.className = 'eonet-stage';
  const labelsEl = document.createElement('div');
  labelsEl.className = 'eonet-labels';
  container.append(stage, labelsEl);

  let globe;
  try {
    globe = await createEarthEventGlobe(stage, (percent) => onProgress?.(percent));
  } catch (err) {
    console.warn('createEarthEventScene: Dünya küresi kurulamadı:', err);
    stage.remove();
    labelsEl.remove();
    return { destroy() {} };
  }
  onProgress?.(100);
  const label = createEventLabel(labelsEl, globe);

  const handleEvents = (domEvent) => {
    const events = Array.isArray(domEvent?.detail?.events) ? domEvent.detail.events.filter(isValidEvent) : [];
    const focus = events.find((e) => e.id === domEvent?.detail?.focus_event_id) || events[0] || null;
    globe.showEvents(events, focus);
    if (focus) label.show(focus);
    else label.hide();
  };
  const handleViewShift = (domEvent) => globe.setViewShift(domEvent?.detail?.x_px, domEvent?.detail?.y_px);
  const handleReset = () => {
    label.hide();
    globe.resetView();
  };
  const handleStageClick = (domEvent) => {
    const picked = globe.pickEvent(domEvent.clientX, domEvent.clientY);
    if (picked) globalThis.dispatchEvent(new CustomEvent(EARTH_EVENT_PICKED_EVENT, { detail: { event: picked } }));
  };

  globalThis.addEventListener(EARTH_EVENTS_EVENT, handleEvents);
  globalThis.addEventListener(EARTH_VIEW_SHIFT_EVENT, handleViewShift);
  globalThis.addEventListener(EARTH_RESET_EVENT, handleReset);
  stage.addEventListener('click', handleStageClick);

  let is_destroyed = false;
  return {
    destroy() {
      if (is_destroyed) return;
      is_destroyed = true;
      globalThis.removeEventListener(EARTH_EVENTS_EVENT, handleEvents);
      globalThis.removeEventListener(EARTH_VIEW_SHIFT_EVENT, handleViewShift);
      globalThis.removeEventListener(EARTH_RESET_EVENT, handleReset);
      stage.removeEventListener('click', handleStageClick);
      label.destroy();
      globe.destroy();
      stage.remove();
      labelsEl.remove();
    },
  };
}
