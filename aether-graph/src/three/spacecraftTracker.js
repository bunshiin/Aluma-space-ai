// Güneş Sistemi'ndeki aktif uzay araçlarının tablosu, gerçekçi yörünge yalpalanması (attitude wobble)
// ve Gemini/router'dan gelen odak isteklerini karşılayan kanca.

const OVERVIEW_ID = 'SOLAR_SYSTEM_OVERVIEW';
const ALIGN_EASE_PER_S = 3.0;
const ALIGN_EPSILON_RAD = 0.002;
const READY_TIMEOUT_S = 5;
const DEG_TO_RAD = Math.PI / 180;

// parent_body_id: kamera bu araçları ebeveyni etrafında döndürerek izler, yoksa kamera gezegenin içine düşer
export const SPACECRAFT_CAMERA_TARGETS = {
  ISS: { id: 'ISS', body_id: 'ISS', camera_distance_units: 0.25, parent_body_id: 'EARTH' },
  HUBBLE: { id: 'HUBBLE', body_id: 'HUBBLE', camera_distance_units: 0.18, parent_body_id: 'EARTH' },
  JWST: { id: 'JWST', body_id: 'JWST', camera_distance_units: 0.6, parent_body_id: 'EARTH' },
  MARS_PHOTO_SAT: { id: 'MARS_PHOTO_SAT', body_id: 'MARS_PHOTO_SAT', camera_distance_units: 0.25, parent_body_id: 'MARS' },
  PARKER: { id: 'PARKER', body_id: 'PARKER', camera_distance_units: 0.75 },
  NEW_HORIZONS: { id: 'NEW_HORIZONS', body_id: 'NEW_HORIZONS', camera_distance_units: 1.6 },
  VOYAGER_1: { id: 'VOYAGER_1', body_id: 'VOYAGER_1', camera_distance_units: 1.8 },
  VOYAGER_2: { id: 'VOYAGER_2', body_id: 'VOYAGER_2', camera_distance_units: 1.8 },
};

export const SPACECRAFT_BODIES = [
  {
    id: 'ISS', model_url: '/public/models/iss.glb', target_radius_units: 0.05,
    orbit_radius_units: 1.226, orbit_speed_deg_s: 42.0, rotation_speed_deg_s: 0,
    axial_tilt_deg: 0, orbit_inclination_deg: 51.6, parent_id: 'EARTH', is_spacecraft: true,
  },
  {
    id: 'HUBBLE', model_url: '/public/models/hubble_space_telescope.glb', target_radius_units: 0.035,
    orbit_radius_units: 1.247, orbit_speed_deg_s: 36.0, rotation_speed_deg_s: 5.5,
    axial_tilt_deg: 0, orbit_inclination_deg: 28.5, parent_id: 'EARTH', is_spacecraft: true,
  },
  {
    id: 'JWST', model_url: '/public/models/james_webb_space_telescope.glb', target_radius_units: 0.12,
    orbit_radius_units: 10.15, orbit_speed_deg_s: 0, rotation_speed_deg_s: 0,
    axial_tilt_deg: 0, orbit_phase_deg: 0, parent_id: 'EARTH', is_spacecraft: true,
  },
  {
    id: 'MARS_PHOTO_SAT', model_url: '/public/models/marsphotosat.glb', target_radius_units: 0.06,
    orbit_radius_units: 1.18, orbit_speed_deg_s: 34.0, rotation_speed_deg_s: 8.5,
    axial_tilt_deg: 0, orbit_inclination_deg: 86.0, parent_id: 'MARS', is_spacecraft: true,
  },
  {
    id: 'PARKER', model_url: '/public/models/parker_solar_probe.glb', target_radius_units: 0.15,
    orbit_radius_units: 7.1, orbit_speed_deg_s: 16.0, rotation_speed_deg_s: 0,
    axial_tilt_deg: 0, orbit_inclination_deg: 3.4, parent_id: 'SUN', is_spacecraft: true,
  },
  {
    id: 'NEW_HORIZONS', model_url: '/public/models/new_horizons.glb', target_radius_units: 0.32,
    orbit_radius_units: 153.3, orbit_speed_deg_s: 0, rotation_speed_deg_s: 8.0,
    axial_tilt_deg: 0, orbit_phase_deg: 291.5, ecliptic_latitude_deg: 2.0, parent_id: 'SUN', is_spacecraft: true,
  },
  {
    id: 'VOYAGER_1', model_url: '/public/models/voyager.glb', target_radius_units: 0.35,
    orbit_radius_units: 276.7, orbit_speed_deg_s: 0, rotation_speed_deg_s: 6.0,
    axial_tilt_deg: 0, orbit_phase_deg: 256.0, ecliptic_latitude_deg: 35.0, parent_id: 'SUN', is_spacecraft: true,
  },
  {
    id: 'VOYAGER_2', model_url: '/public/models/voyager.glb', target_radius_units: 0.35,
    orbit_radius_units: 244.0, orbit_speed_deg_s: 0, rotation_speed_deg_s: 6.0,
    axial_tilt_deg: 0, orbit_phase_deg: 290.0, ecliptic_latitude_deg: -37.0, parent_id: 'SUN', is_spacecraft: true,
  },
];

const SPACECRAFT_ALIASES = {
  JAMES_WEBB: 'JWST',
  HUBBLE_SPACE_TELESCOPE: 'HUBBLE',
  PARKER_SOLAR_PROBE: 'PARKER',
  VOYAGER: 'VOYAGER_1',
  SPACE_STATION: 'ISS',
  MARSPHOTOSAT: 'MARS_PHOTO_SAT',
  MARS_ORBITER: 'MARS_PHOTO_SAT',
  MARS_RECONNAISSANCE_ORBITER: 'MARS_PHOTO_SAT',
  MRO: 'MARS_PHOTO_SAT',
  MARS_SATELLITE: 'MARS_PHOTO_SAT',
};

/**
 * Gerçek yörünge uydularının (özellikle MARS_PHOTO_SAT ve HUBBLE) kaskatı dönmemesi için
 * jiroskop/yerçekimi gradyanı kaynaklı yumuşak 3-eksenli yalpalanma (pitch, yaw, roll) açılarını hesaplar.
 */
export function calculateSpacecraftWobbleRad(cfg, total_s) {
  const t_s = typeof total_s === 'number' && Number.isFinite(total_s) ? total_s : 0;
  const idStr = String(cfg?.id || '');
  let seed = 0;
  for (let i = 0; i < idStr.length; i += 1) seed = (seed * 31 + idStr.charCodeAt(i)) % 997;
  const phase_rad = (seed / 997) * Math.PI * 2;
  const isActiveOrbiter = idStr === 'MARS_PHOTO_SAT' || idStr === 'HUBBLE';
  const amp_rad = isActiveOrbiter ? 0.14 : 0.065;
  const baseSpin_rad = ((cfg?.rotation_speed_deg_s || 0) * DEG_TO_RAD) * t_s * 0.35;
  const baseTilt_rad = (cfg?.axial_tilt_deg || 0) * DEG_TO_RAD;

  return {
    pitch_rad:
      Math.sin(t_s * 1.25 + phase_rad) * amp_rad +
      Math.cos(t_s * 0.52 + phase_rad * 1.4) * (amp_rad * 0.45),
    yaw_rad:
      baseSpin_rad +
      Math.sin(t_s * 0.78 + phase_rad * 0.8) * (amp_rad * 1.35),
    roll_rad:
      baseTilt_rad +
      Math.cos(t_s * 0.96 + phase_rad * 1.7) * amp_rad +
      Math.sin(t_s * 0.41 + phase_rad) * (amp_rad * 0.45),
  };
}

export function resolveSpacecraftAlias(targetName) {
  if (typeof targetName === 'string' && Object.hasOwn(SPACECRAFT_ALIASES, targetName)) {
    return SPACECRAFT_ALIASES[targetName];
  }
  return targetName;
}

export function resolveSpacecraftId(rawId) {
  const id = resolveSpacecraftAlias(rawId);
  if (typeof id === 'string' && Object.hasOwn(SPACECRAFT_CAMERA_TARGETS, id)) {
    return id;
  }
  return OVERVIEW_ID;
}

export function calculateOrbitAngleRad(position_vectors) {
  const vec = Array.isArray(position_vectors) ? position_vectors[0] : position_vectors;
  if (!vec || typeof vec !== 'object') {
    return null;
  }
  const { x_km, y_km } = vec;
  if (!Number.isFinite(x_km) || !Number.isFinite(y_km) || (x_km === 0 && y_km === 0)) {
    return null;
  }
  return Math.atan2(y_km, x_km);
}

function getParentYawRad(orbitRigs, parentId) {
  let yaw_rad = 0;
  let currentId = parentId;
  for (let depth = 0; currentId && depth < 8; depth += 1) {
    const rig = orbitRigs.find(({ cfg }) => cfg.id === currentId);
    if (!rig) break;
    yaw_rad += rig.orbitPivot.rotation.y;
    currentId = rig.cfg.parent_id;
  }
  return yaw_rad;
}

export function createSpacecraftTrackerController(cameraController, getOrbitRigs, eventTarget = globalThis) {
  let pending = null;

  function handleSpacecraftFocus(detail) {
    const safeDetail = detail && typeof detail === 'object' ? detail : {};
    const id = resolveSpacecraftId(safeDetail.id ?? safeDetail.target);
    if (typeof cameraController?.handleFocusTarget === 'function') {
      cameraController.handleFocusTarget(id);
    }
    pending = {
      id,
      action_type: typeof safeDetail.action_type === 'string' ? safeDetail.action_type : null,
      parameters: safeDetail.parameters && typeof safeDetail.parameters === 'object' ? safeDetail.parameters : {},
      target_angle_rad: id === OVERVIEW_ID ? null : calculateOrbitAngleRad(safeDetail.position_vectors),
      remaining_rad: null,
      elapsed_s: 0,
    };
    return id;
  }

  function handleOrbitAlignment(delta_s) {
    if (pending.target_angle_rad === null) return true;
    const orbitRigs = typeof getOrbitRigs === 'function' ? getOrbitRigs() || [] : [];
    const rig = orbitRigs.find(({ cfg }) => cfg.id === pending.id);
    if (!rig) return false;
    if (pending.remaining_rad === null) {
      const current_rad = rig.orbitPivot.rotation.y + getParentYawRad(orbitRigs, rig.cfg.parent_id);
      const diff_rad = pending.target_angle_rad - current_rad;
      pending.remaining_rad = Math.atan2(Math.sin(diff_rad), Math.cos(diff_rad));
    }
    const step_rad = pending.remaining_rad * Math.min(1, delta_s * ALIGN_EASE_PER_S);
    rig.orbitPivot.rotation.y += step_rad;
    pending.remaining_rad -= step_rad;
    if (Math.abs(pending.remaining_rad) < ALIGN_EPSILON_RAD) {
      rig.orbitPivot.rotation.y += pending.remaining_rad;
      pending.remaining_rad = 0;
      return true;
    }
    return false;
  }

  function handleEmitReady() {
    const detail = { id: pending.id, action_type: pending.action_type, parameters: pending.parameters };
    pending = null;
    if (typeof eventTarget?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent('ag:spacecraft-ready', { detail }));
    }
  }

  function handleSpacecraftFrameUpdate(delta_s) {
    if (!pending) return;
    const safeDelta_s = Number.isFinite(delta_s) && delta_s > 0 ? delta_s : 0;
    const activeFocus = cameraController?.getActiveFocus?.();
    if (activeFocus && activeFocus.id !== pending.id) {
      pending = null;
      return;
    }
    // Kamera kilitliyken (Mars yüzeyinden çıkış sürüyor) bekleme süresi işlemez; yoksa panel kamera varmadan açılır
    if (cameraController?.isInputEnabled?.() === false) return;
    pending.elapsed_s += safeDelta_s;
    const is_aligned = handleOrbitAlignment(safeDelta_s);
    const is_camera_settled = !cameraController?.isZoomingToTarget?.();
    if ((is_aligned && is_camera_settled) || pending.elapsed_s >= READY_TIMEOUT_S) {
      handleEmitReady();
    }
  }

  const handleSpacecraftFocusEvent = (event) => {
    handleSpacecraftFocus(event?.detail);
  };
  const handleFocusTargetEvent = (event) => {
    const rawId = event?.detail?.id ?? event?.detail?.target;
    if (resolveSpacecraftId(rawId) !== OVERVIEW_ID) {
      handleSpacecraftFocus({ ...event.detail, id: rawId });
    }
  };

  if (typeof eventTarget?.addEventListener === 'function') {
    eventTarget.addEventListener('ag:spacecraft-focus', handleSpacecraftFocusEvent);
    eventTarget.addEventListener('ag:focus-target', handleFocusTargetEvent);
  }

  function destroySpacecraftTracker() {
    pending = null;
    if (typeof eventTarget?.removeEventListener === 'function') {
      eventTarget.removeEventListener('ag:spacecraft-focus', handleSpacecraftFocusEvent);
      eventTarget.removeEventListener('ag:focus-target', handleFocusTargetEvent);
    }
  }

  return { handleSpacecraftFocus, handleSpacecraftFrameUpdate, destroySpacecraftTracker };
}
