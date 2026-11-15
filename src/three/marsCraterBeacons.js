// Mars yörüngesinden kraterlerdeki araç konumlarını gösteren çok katmanlı geometrik kırmızı alarm
// işaretleri ve kameraya göre asla eğilmeyen (screen-aligned Sprite) net krater bilgi kartları.
import { calculateMarsSurfacePoint, getMarsSite, MARS_ROVER_SITE_IDS, MARS_SITES } from './marsCoordinates.js';

export const DEFAULT_ALARM_COLOR_HEX = 0xff2a2a;
export const DEFAULT_PULSE_FREQUENCY_HZ = 1.5;

export const MARS_CRATER_BEACON_PARAMS = {
  JEZERO: {
    site_id: 'JEZERO', crater_name: 'Jezero Crater', rover_id: 'PERSEVERANCE',
    rover_label: 'Perseverance & Ingenuity', coordinates_label: '18.38°N, 77.58°E',
    latitude_deg: 18.38, longitude_deg: 77.58, diameter_km: 45,
    alarm_color_hex: DEFAULT_ALARM_COLOR_HEX, pulse_frequency_hz: DEFAULT_PULSE_FREQUENCY_HZ,
    phase_offset_rad: 0, features: ['Antik Göl Deltası', 'Kil Mineralleri', 'Numune Önbelleği'],
  },
  GALE: {
    site_id: 'GALE', crater_name: 'Gale Crater', rover_id: 'CURIOSITY',
    rover_label: 'Curiosity (MSL)', coordinates_label: '4.59°S, 137.44°E',
    latitude_deg: -4.5895, longitude_deg: 137.4417, diameter_km: 154,
    alarm_color_hex: DEFAULT_ALARM_COLOR_HEX, pulse_frequency_hz: DEFAULT_PULSE_FREQUENCY_HZ,
    phase_offset_rad: 2.09, features: ['Aeolis Mons (Mount Sharp)', 'Sülfat ve Kil Katmanları'],
  },
  ARES_VALLIS: {
    site_id: 'ARES_VALLIS', crater_name: 'Ares Vallis', rover_id: 'PATHFINDER',
    rover_label: 'Pathfinder & Sojourner', coordinates_label: '19.13°N, 33.22°W',
    latitude_deg: 19.13, longitude_deg: -33.22, diameter_km: 1700,
    alarm_color_hex: DEFAULT_ALARM_COLOR_HEX, pulse_frequency_hz: DEFAULT_PULSE_FREQUENCY_HZ,
    phase_offset_rad: 4.18, features: ['Antik Taşkın Vadisi', 'Carl Sagan İstasyonu', 'İkiz Tepeler'],
  },
};

export function getMarsCraterBeaconParams(siteOrRoverId) {
  const site = getMarsSite(siteOrRoverId);
  const base = MARS_CRATER_BEACON_PARAMS[site.id] || MARS_CRATER_BEACON_PARAMS.JEZERO;
  return { ...base, features: [...base.features] };
}

/**
 * Çift çakmalı (double-strobe) taktik alarm darbesi, ardışık iki şok halkası,
 * altıgen nişangah dönüşü ve elmas kristal salınımını hesaplar.
 */
export function calculateCraterAlarmPulse(time_s, pulse_frequency_hz = DEFAULT_PULSE_FREQUENCY_HZ, phase_offset_rad = 0) {
  const safe_t_s = typeof time_s === 'number' && Number.isFinite(time_s) ? Math.max(0, time_s) : 0;
  const freq_hz = typeof pulse_frequency_hz === 'number' && Number.isFinite(pulse_frequency_hz) && pulse_frequency_hz > 0
    ? pulse_frequency_hz
    : DEFAULT_PULSE_FREQUENCY_HZ;
  const phase = safe_t_s * freq_hz + (Number.isFinite(phase_offset_rad) ? phase_offset_rad / (Math.PI * 2) : 0);
  const cycle_u = ((phase % 1) + 1) % 1;
  const outer_u = (((phase + 0.5) % 1) + 1) % 1;

  const strobeA = Math.exp(-Math.pow((cycle_u - 0.14) / 0.08, 2));
  const strobeB = 0.85 * Math.exp(-Math.pow((cycle_u - 0.34) / 0.09, 2));
  const baseWave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const strobePeak = Math.min(1, Math.max(strobeA, strobeB, Math.pow(baseWave, 2.4)));
  const blink_opacity = 0.2 + 0.8 * strobePeak;

  const ring_ease = 1 - Math.pow(1 - cycle_u, 2.2);
  const outer_ease = 1 - Math.pow(1 - outer_u, 2.2);
  return {
    blink_opacity,
    ring_scale: 0.55 + ring_ease * 2.15,
    ring_opacity: Math.sin(cycle_u * Math.PI) * (1 - cycle_u * 0.65) * 0.92,
    outer_ring_scale: 0.55 + outer_ease * 2.15,
    outer_ring_opacity: Math.sin(outer_u * Math.PI) * (1 - outer_u * 0.65) * 0.75,
    reticle_rotation_rad: -safe_t_s * 1.15,
    crystal_rotation_rad: safe_t_s * 2.6,
    crystal_bob_ratio: 0.024 + 0.007 * Math.sin(phase * Math.PI * 2),
    is_alarm_lit: blink_opacity >= 0.6,
  };
}

/**
 * Kraterin kameraya dönük yarıkürede olup olmadığını [0, 1] aralığında hesaplar.
 * Gezegenin arka yüzünde kalan krater kartları uydu takibinde kenardan taşmasın diye gizlenir.
 */
export function calculateCraterHorizonVisibility(craterPos, marsCenterPos, cameraPos) {
  if (!craterPos || !marsCenterPos || !cameraPos) return 1;
  const nx = craterPos.x - marsCenterPos.x;
  const ny = craterPos.y - marsCenterPos.y;
  const nz = craterPos.z - marsCenterPos.z;
  const vx = cameraPos.x - craterPos.x;
  const vy = cameraPos.y - craterPos.y;
  const vz = cameraPos.z - craterPos.z;
  const nLen = Math.hypot(nx, ny, nz);
  const vLen = Math.hypot(vx, vy, vz);
  if (nLen < 1e-6 || vLen < 1e-6) return 1;
  const facingDot = (nx * vx + ny * vy + nz * vz) / (nLen * vLen);
  const t = Math.max(0, Math.min(1, (facingDot - 0.04) / 0.22));
  return t * t * (3 - 2 * t);
}

function createCraterLabelTexture(threeLib, beaconParams) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !threeLib.CanvasTexture) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return null;

  ctx.fillStyle = 'rgba(8, 10, 18, 0.94)';
  ctx.fillRect(12, 12, 1000, 296);
  ctx.strokeStyle = 'rgba(255, 45, 45, 0.98)';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 1000, 296);

  ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
  ctx.fillRect(15, 15, 994, 52);
  ctx.fillStyle = '#ff2a2a';
  ctx.beginPath();
  ctx.arc(48, 41, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#fecaca';
  ctx.fillText(`AKTİF YÜZEY ALARMI  •  ${beaconParams.coordinates_label}`, 76, 50);

  ctx.font = '800 58px system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
  const title = beaconParams.crater_name.toUpperCase();
  ctx.strokeText(title, 36, 138);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, 36, 138);

  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(`ARAÇ: ${beaconParams.rover_label.toUpperCase()}`, 36, 198);

  ctx.font = '600 28px monospace';
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText(`ÇAP: ${beaconParams.diameter_km} KM  |  ${beaconParams.features.slice(0, 2).join(' • ')}`, 36, 258);

  const texture = new threeLib.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  if (threeLib.LinearFilter) {
    texture.minFilter = threeLib.LinearFilter;
    texture.magFilter = threeLib.LinearFilter;
  }
  if (threeLib.SRGBColorSpace) texture.colorSpace = threeLib.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSingleCraterBeaconNode(threeLib, site, radius_units) {
  const beaconParams = getMarsCraterBeaconParams(site.id);
  const { position, normal } = calculateMarsSurfacePoint(site.latitude_deg, site.longitude_deg, radius_units);
  const anchor = new threeLib.Group();
  anchor.name = `MARS_SITE_${site.id}`;
  anchor.position.set(position.x, position.y, position.z);

  const surfaceLift_units = radius_units * 0.006;
  const beaconGroup = new threeLib.Group();
  beaconGroup.name = `MARS_BEACON_${site.id}`;
  beaconGroup.position.set(normal.x * surfaceLift_units, normal.y * surfaceLift_units, normal.z * surfaceLift_units);
  // Yerel +Z eksenini doğrudan krater yüzey normaline hizala (dünya orijinine bakmasını önler)
  beaconGroup.quaternion.setFromUnitVectors(
    new threeLib.Vector3(0, 0, 1),
    new threeLib.Vector3(normal.x, normal.y, normal.z).normalize()
  );

  const makeAddMat = (color, opacity) =>
    new threeLib.MeshBasicMaterial({
      color, side: threeLib.DoubleSide, transparent: true, opacity,
      blending: threeLib.AdditiveBlending, depthWrite: false,
    });

  const coreMat = new threeLib.MeshBasicMaterial({
    color: beaconParams.alarm_color_hex, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const coreMesh = new threeLib.Mesh(new threeLib.SphereGeometry(radius_units * 0.013, 16, 12), coreMat);
  coreMesh.name = `MARS_BEACON_CORE_${site.id}`;

  const CrystalGeom = threeLib.OctahedronGeometry || threeLib.DodecahedronGeometry || threeLib.SphereGeometry;
  const crystalMat = makeAddMat(0xff6b6b, 0.95);
  const crystalMesh = new threeLib.Mesh(new CrystalGeom(radius_units * 0.015, 0), crystalMat);
  crystalMesh.name = `MARS_BEACON_CRYSTAL_${site.id}`;
  crystalMesh.position.set(0, 0, radius_units * 0.025);

  const reticleMat = makeAddMat(0xff4d4d, 0.88);
  const reticleMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.028, radius_units * 0.035, 6), reticleMat);
  reticleMesh.name = `MARS_BEACON_RETICLE_${site.id}`;

  const ringMat = makeAddMat(beaconParams.alarm_color_hex, 0.88);
  const ringMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.019, radius_units * 0.03, 8), ringMat);
  ringMesh.name = `MARS_BEACON_RING_${site.id}`;

  const outerRingMat = makeAddMat(beaconParams.alarm_color_hex, 0.72);
  const outerRingMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.019, radius_units * 0.028, 16), outerRingMat);
  outerRingMesh.name = `MARS_BEACON_RING_OUTER_${site.id}`;

  const StemGeom = threeLib.CylinderGeometry || threeLib.SphereGeometry;
  const stemMat = makeAddMat(0xff3b3b, 0.65);
  const stemMesh = new threeLib.Mesh(
    new StemGeom(radius_units * 0.0022, radius_units * 0.0022, radius_units * 0.085, 8),
    stemMat
  );
  stemMesh.name = `MARS_BEACON_STEM_${site.id}`;
  stemMesh.rotation.x = Math.PI / 2;
  stemMesh.position.set(0, 0, radius_units * 0.048);

  // Sprite kullanımı sayesinde uydu takip edilirken bilgi kartı asla yan yatmaz veya ters dönmez
  const labelTexture = createCraterLabelTexture(threeLib, beaconParams);
  const LabelMatCtor = threeLib.SpriteMaterial || threeLib.MeshBasicMaterial;
  const labelMat = new LabelMatCtor({
    color: labelTexture ? 0xffffff : 0xff4d4d,
    ...(labelTexture ? { map: labelTexture } : {}),
    transparent: true, opacity: 0.96, depthWrite: false,
  });
  const labelMesh = threeLib.Sprite
    ? new threeLib.Sprite(labelMat)
    : new threeLib.Mesh(new threeLib.PlaneGeometry(1, 1), labelMat);
  labelMesh.name = `MARS_BEACON_LABEL_${site.id}`;
  labelMesh.scale.set(radius_units * 0.42, radius_units * 0.132, 1);
  labelMesh.position.set(0, 0, radius_units * 0.118);
  labelMesh.userData = {
    crater_name: beaconParams.crater_name, rover_label: beaconParams.rover_label,
    coordinates_label: beaconParams.coordinates_label, features: beaconParams.features,
  };

  beaconGroup.add(coreMesh, crystalMesh, reticleMesh, ringMesh, outerRingMesh, stemMesh, labelMesh);
  anchor.add(beaconGroup);

  const craterWorldVec = new threeLib.Vector3();
  const marsCenterVec = new threeLib.Vector3();
  let show_label_flag = true;

  function handleBeaconPulseStep(time_s, horizon_vis = 1) {
    const pulse = calculateCraterAlarmPulse(time_s, beaconParams.pulse_frequency_hz, beaconParams.phase_offset_rad);
    coreMat.opacity = pulse.blink_opacity * horizon_vis;
    const coreScale = 0.85 + 0.35 * pulse.blink_opacity;
    coreMesh.scale.set(coreScale, coreScale, coreScale);

    crystalMat.opacity = (0.45 + 0.55 * pulse.blink_opacity) * horizon_vis;
    crystalMesh.position.z = radius_units * pulse.crystal_bob_ratio;
    crystalMesh.rotation.z = pulse.crystal_rotation_rad;

    reticleMat.opacity = (0.4 + 0.5 * pulse.blink_opacity) * horizon_vis;
    reticleMesh.rotation.z = pulse.reticle_rotation_rad;

    ringMat.opacity = pulse.ring_opacity * horizon_vis;
    ringMesh.scale.set(pulse.ring_scale, pulse.ring_scale, 1);
    outerRingMat.opacity = pulse.outer_ring_opacity * horizon_vis;
    outerRingMesh.scale.set(pulse.outer_ring_scale, pulse.outer_ring_scale, 1);

    stemMat.opacity = 0.65 * horizon_vis;
    labelMat.opacity = 0.96 * horizon_vis;
    labelMesh.visible = show_label_flag && horizon_vis > 0.05;
    return pulse;
  }

  coreMesh.onBeforeRender = (_renderer, _scene, camera) => {
    const now_s = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    let horizon_vis = 1;
    if (camera?.position && anchor.parent) {
      anchor.getWorldPosition(craterWorldVec);
      anchor.parent.getWorldPosition(marsCenterVec);
      horizon_vis = calculateCraterHorizonVisibility(craterWorldVec, marsCenterVec, camera.position);
    }
    handleBeaconPulseStep(now_s, horizon_vis);
  };

  anchor.userData = {
    site_id: site.id, crater_name: site.crater_name, rover_id: site.rover_id,
    model_url: site.model_url, latitude_deg: site.latitude_deg, longitude_deg: site.longitude_deg,
    normal, beacon_params: beaconParams, handleBeaconPulseStep,
  };

  return {
    anchor, beaconGroup, coreMesh, crystalMesh, reticleMesh, ringMesh, outerRingMesh, labelMesh, beaconParams,
    handleBeaconPulseStep,
    handleSetShowLabel: (visible) => { show_label_flag = Boolean(visible); labelMesh.visible = show_label_flag; },
  };
}

export function createMarsCraterBeaconsGroup(threeLib, radius_units, options = {}) {
  const group = new threeLib.Group();
  group.name = 'MARS_ROVER_SITES';
  const entries = new Map();

  MARS_ROVER_SITE_IDS.forEach((siteId) => {
    const site = MARS_SITES[siteId];
    if (!site) return;
    const entry = createSingleCraterBeaconNode(threeLib, site, radius_units);
    entries.set(site.id, entry);
    group.add(entry.anchor);
  });

  const triggerState = {
    enabled: options.enabled !== undefined ? Boolean(options.enabled) : true,
    active_site_id: 'ALL',
    show_labels: options.show_labels !== undefined ? Boolean(options.show_labels) : true,
    pulse_frequency_hz: DEFAULT_PULSE_FREQUENCY_HZ,
  };

  function handleTriggerCraterBeacons(params = {}) {
    if (typeof params.enabled === 'boolean') triggerState.enabled = params.enabled;
    if (typeof params.show_labels === 'boolean') triggerState.show_labels = params.show_labels;
    if (typeof params.pulse_frequency_hz === 'number' && params.pulse_frequency_hz > 0) {
      triggerState.pulse_frequency_hz = params.pulse_frequency_hz;
    }
    if (typeof params.site_id === 'string' && params.site_id.trim()) {
      const raw = params.site_id.trim().toUpperCase();
      triggerState.active_site_id = raw === 'ALL' ? 'ALL' : getMarsSite(raw).id;
    }
    entries.forEach((entry, siteId) => {
      entry.beaconParams.pulse_frequency_hz = triggerState.pulse_frequency_hz;
      const isTarget = triggerState.active_site_id === 'ALL' || triggerState.active_site_id === siteId;
      entry.beaconGroup.visible = triggerState.enabled && isTarget;
      entry.handleSetShowLabel(triggerState.show_labels);
    });
    return {
      ...triggerState,
      beacons: Array.from(entries.values()).map((e) => ({ ...e.beaconParams })),
    };
  }

  function handleCraterBeaconsFrame(time_s) {
    entries.forEach((entry) => {
      if (entry.beaconGroup.visible) entry.handleBeaconPulseStep(time_s);
    });
  }

  handleTriggerCraterBeacons(options);

  const eventTarget = options.eventTarget === undefined ? globalThis : options.eventTarget;
  const handleTriggerEvent = (event) => {
    const state = handleTriggerCraterBeacons(event?.detail || {});
    if (typeof eventTarget?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent('ag:mars-crater-beacons-state', { detail: state }));
    }
  };
  if (typeof eventTarget?.addEventListener === 'function') {
    eventTarget.addEventListener('ag:mars-crater-beacons', handleTriggerEvent);
  }

  group.userData = {
    trigger_state: triggerState, beacon_params: MARS_CRATER_BEACON_PARAMS,
    handleTriggerCraterBeacons, handleCraterBeaconsFrame,
    destroyCraterBeaconsListener() {
      if (typeof eventTarget?.removeEventListener === 'function') {
        eventTarget.removeEventListener('ag:mars-crater-beacons', handleTriggerEvent);
      }
    },
  };

  return group;
}
