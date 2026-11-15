// Mars yörünge uydusu sahnesi ag:mars-photo-ready yayınlayınca fotoğrafı veri katmanından (getSpaceData)
// çeker ve popup olarak gösterir. 3D katmanı veriye dokunmaz; köprü bu modüldür.

const MARS_PHOTO_READY_EVENT = "ag:mars-photo-ready";

/**
 * Uydu sorgusunu getSpaceData kimliğine çevirir: "<krater adı>|<kamera>" (örn. "gale crater|ctx").
 */
export function createOrbitalPhotoIdentifier(query) {
  const place = typeof query?.crater_name === "string" && query.crater_name.trim() ? query.crater_name.trim() : "Jezero Crater";
  const instrument = typeof query?.camera_instrument === "string" && query.camera_instrument.trim() ? query.camera_instrument.trim() : "HIRISE";
  return `${place}|${instrument}`.toLowerCase();
}

/**
 * Popup için sözleşmeye uygun OPEN_POPUP rotası kurar; fotoğraf yoksa null döner.
 */
export function createOrbitalPhotoRoute(photos, connection) {
  const list = Array.isArray(photos) ? photos.filter((p) => p && typeof p.image_url === "string" && p.image_url) : [];
  if (list.length === 0) return null;
  const [first] = list;
  return {
    action_type: "OPEN_POPUP",
    template_id: "NONE",
    parameters: {
      image_url: first.image_url,
      title: first.title,
      photo_title: first.title,
      description: first.description,
      date_taken_utc: first.date_taken_utc,
      camera: first.camera_instrument,
      images: list,
      data_source: "NASA_API",
    },
    speech_text: typeof connection?.connection_message === "string" ? connection.connection_message : "",
    is_student_mode: false,
  };
}

/**
 * getSpaceData: sözleşme fonksiyonu (sonradan yüklenebilir, bu yüzden getter verilir).
 * onRoute(route): rotayı handleActionRouter'a ileten callback.
 */
export function createMarsPhotoController({ getSpaceDataFn, onRoute }) {
  let requestId = 0;

  async function handleMarsPhotoReady(event) {
    const connection = event?.detail;
    const getSpaceData = getSpaceDataFn?.();
    if (!connection?.query || typeof getSpaceData !== "function") return;
    const myRequest = ++requestId;
    try {
      const photos = await getSpaceData("mars_orbital_photos", createOrbitalPhotoIdentifier(connection.query));
      // Arada yeni istek geldiyse eski yanıt ekranı ezmesin
      if (myRequest !== requestId) return;
      const route = createOrbitalPhotoRoute(photos, connection);
      if (route) onRoute?.(route);
    } catch (err) {
      console.warn("Mars yörünge fotoğrafı gösterilemedi:", err);
    }
  }

  globalThis.addEventListener?.(MARS_PHOTO_READY_EVENT, handleMarsPhotoReady);
  return {
    handleMarsPhotoReady,
    destroy() {
      requestId += 1;
      globalThis.removeEventListener?.(MARS_PHOTO_READY_EVENT, handleMarsPhotoReady);
    },
  };
}
