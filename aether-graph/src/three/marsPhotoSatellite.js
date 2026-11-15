// Mars yörünge fotoğraf uydusu (marsphotosat.glb) sahne ve veri mimarisi.
// Mars atmosferinden/yüzeyinden istenen her fotoğraf için uydunun sahnesini çağırır,
// "uyduya bağlanıldı" durumunu ve fotoğraf sorgusunu ag:mars-photo-ready ile yayınlar.
// Fotoğrafı UI getSpaceData("mars_orbital_photos") ile çeker; 3D katmanı veri katmanını doğrudan çağırmaz.
import { getMarsSite } from './marsCoordinates.js';
import { resolveSpacecraftId } from './spacecraftTracker.js';

export const MARS_PHOTO_SATELLITE_ID = 'MARS_PHOTO_SAT';
export const MARS_PHOTO_SATELLITE_MODEL_URL = '/public/models/marsphotosat.glb';
export const SATELLITE_CONNECTED_MESSAGE = 'Mars yörünge fotoğraf uydusuna (marsphotosat) bağlanıldı.';

/**
 * Fotoğraf isteği parametrelerini doğrular ve veri katmanı/API birleştirmesi için standart sorgu şeması üretir.
 * Bozuk veya eksik girdilerde hata fırlatmaz, varsayılan krater koordinatlarına düşer.
 */
export function calculateMarsPhotoQuery(request = {}) {
  const safeReq = request && typeof request === 'object' ? request : {};
  const rawSite = safeReq.site_id || safeReq.rover_id || safeReq.crater_name || safeReq.target || 'JEZERO';
  const site = getMarsSite(rawSite);
  const latitude_deg =
    typeof safeReq.latitude_deg === 'number' && Number.isFinite(safeReq.latitude_deg)
      ? Math.max(-90, Math.min(90, safeReq.latitude_deg))
      : site.latitude_deg;
  const longitude_deg =
    typeof safeReq.longitude_deg === 'number' && Number.isFinite(safeReq.longitude_deg)
      ? safeReq.longitude_deg
      : site.longitude_deg;
  const camera_instrument =
    typeof safeReq.camera_instrument === 'string' && safeReq.camera_instrument.trim()
      ? safeReq.camera_instrument.trim().toUpperCase()
      : 'HIRISE';

  return {
    satellite_id: MARS_PHOTO_SATELLITE_ID,
    model_url: MARS_PHOTO_SATELLITE_MODEL_URL,
    site_id: site.id,
    crater_name: site.crater_name,
    rover_id: site.rover_id,
    latitude_deg,
    longitude_deg,
    camera_instrument,
  };
}

/**
 * Uydu bağlantı durumunu ve UI'nın veri katmanına soracağı fotoğraf sorgusunu kurar. Hata fırlatmaz.
 */
export function createMarsPhotoConnection(request = {}) {
  return {
    satellite_id: MARS_PHOTO_SATELLITE_ID,
    model_url: MARS_PHOTO_SATELLITE_MODEL_URL,
    status: 'CONNECTED',
    connection_message: SATELLITE_CONNECTED_MESSAGE,
    query: calculateMarsPhotoQuery(request),
  };
}

/**
 * Mars atmosferinden istenen fotoğraflarda marsphotosat uydusunun sahnesini çağırır ve bağlantı durumunu yayınlar.
 */
export function createMarsPhotoSatelliteController(ctx = {}) {
  const { marsSurface, spacecraftTracker } = ctx;
  const eventTarget = ctx.eventTarget === undefined ? globalThis : ctx.eventTarget;
  let is_destroyed = false;
  let connection_state = {
    satellite_id: MARS_PHOTO_SATELLITE_ID,
    model_url: MARS_PHOTO_SATELLITE_MODEL_URL,
    status: 'STANDBY',
    connection_message: '',
    query: calculateMarsPhotoQuery({}),
  };

  function handleEmit(type, detail) {
    if (typeof eventTarget?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
    }
  }

  async function handleMarsPhotoRequest(request = {}) {
    if (is_destroyed) return connection_state;
    const safeReq = request && typeof request === 'object' ? request : {};
    const activeSiteId = marsSurface?.getActiveSite?.()?.id || 'JEZERO';
    const data = createMarsPhotoConnection({ site_id: activeSiteId, ...safeReq });
    connection_state = data;

    // Yüzeyde veya dalıştaysa önce Mars atmosferinden yörüngedeki uyduya çıkış başlatılır
    if (marsSurface?.isCameraLocked?.()) {
      marsSurface.handleExitRequest(MARS_PHOTO_SATELLITE_ID);
    }
    if (typeof spacecraftTracker?.handleSpacecraftFocus === 'function') {
      spacecraftTracker.handleSpacecraftFocus({
        id: MARS_PHOTO_SATELLITE_ID,
        action_type: typeof safeReq.action_type === 'string' ? safeReq.action_type : 'OPEN_SIDE_PANEL',
        parameters: {
          ...data.query,
          status: data.status,
          connection_message: data.connection_message,
        },
      });
    }

    handleEmit('ag:satellite-connected', connection_state);
    handleEmit('ag:mars-photo-ready', connection_state);
    return connection_state;
  }

  const handlePhotoRequestEvent = (event) => {
    handleMarsPhotoRequest(event?.detail || {});
  };

  const handleSpacecraftReadyEvent = (event) => {
    if (is_destroyed) return;
    const readyId = resolveSpacecraftId(event?.detail?.id);
    if (readyId === MARS_PHOTO_SATELLITE_ID) {
      if (connection_state.status !== 'CONNECTED') {
        connection_state = {
          ...connection_state,
          status: 'CONNECTED',
          connection_message: SATELLITE_CONNECTED_MESSAGE,
        };
      }
      handleEmit('ag:satellite-connected', connection_state);
    }
  };

  if (typeof eventTarget?.addEventListener === 'function') {
    eventTarget.addEventListener('ag:mars-photo-request', handlePhotoRequestEvent);
    eventTarget.addEventListener('ag:spacecraft-ready', handleSpacecraftReadyEvent);
  }

  function destroyMarsPhotoSatelliteController() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (typeof eventTarget?.removeEventListener === 'function') {
      eventTarget.removeEventListener('ag:mars-photo-request', handlePhotoRequestEvent);
      eventTarget.removeEventListener('ag:spacecraft-ready', handleSpacecraftReadyEvent);
    }
  }

  return {
    handleMarsPhotoRequest,
    getConnectionState: () => connection_state,
    destroyMarsPhotoSatelliteController,
  };
}
