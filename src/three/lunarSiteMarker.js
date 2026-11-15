// Ay küresi üzerinde Apollo 11 iniş noktası (Mare Tranquillitatis): yörüngeden görünen taktik alarm işareti
// ve kameraya göre hizalanan (Sprite) detaylı iniş kartı. Mars krater kartlarıyla aynı görsel mimariye sahiptir.
import { calculateMarsSurfaceFrame, calculateMarsSurfacePoint } from './marsCoordinates.js';
import { calculateCraterHorizonVisibility } from './marsCraterBeacons.js';

export const DEFAULT_LUNAR_ALARM_COLOR_HEX = 0x38bdf8;
export const DEFAULT_LUNAR_PULSE_FREQUENCY_HZ = 1.3;

export const LUNAR_BEACON_PARAMS = Object.freeze({
  TRANQUILITY_BASE: Object.freeze({
    site_id: 'TRANQUILITY_BASE',
    site_name: 'Mare Tranquillitatis',
    base_name: 'Tranquility Base (Sükûnet Üssü)',
    crater_name: 'Mare Tranquillitatis',
    rover_id: 'APOLLO_LUNAR_MODULE',
    module_id: 'APOLLO_LUNAR_MODULE',
    rover_label: 'Apollo 11 Ay Modülü (Eagle)',
    coordinates_label: '0.67°N, 23.47°E',
    latitude_deg: 0.67408,
    longitude_deg: 23.47297,
    landing_utc: '1969-07-20T20:17:40Z',
    landing_date: '20 Temmuz 1969',
    diameter_km: 873,
    crew_label: 'Neil Armstrong & Buzz Aldrin',
    alarm_color_hex: DEFAULT_LUNAR_ALARM_COLOR_HEX,
    pulse_frequency_hz: DEFAULT_LUNAR_PULSE_FREQUENCY_HZ,
    features: ['Sükûnet Denizi', 'İlk İnsanlı Ay İnişi', 'Apollo 11 Eagle'],
  }),
});

export const LUNAR_SITES = LUNAR_BEACON_PARAMS;

export function getLunarSite(siteId = 'TRANQUILITY_BASE') {
  return LUNAR_BEACON_PARAMS[siteId] || LUNAR_BEACON_PARAMS.TRANQUILITY_BASE;
}

/**
 * Ay yüzey noktası ve normali.
 */
export function calculateLunarSiteFrame(site, radius_units) {
  const { position } = calculateMarsSurfacePoint(site.latitude_deg, site.longitude_deg, radius_units);
  const frame = calculateMarsSurfaceFrame(site.latitude_deg, site.longitude_deg);
  return { position, ...frame };
}

/**
 * Çift çakmalı taktik alarm darbesi, şok halkaları ve kristal rotasyonu (Mars ile uyumlu).
 */
export function calculateLunarAlarmPulse(time_s, pulse_frequency_hz = DEFAULT_LUNAR_PULSE_FREQUENCY_HZ) {
  const safe_t = typeof time_s === 'number' && Number.isFinite(time_s) ? Math.max(0, time_s) : 0;
  const freq = typeof pulse_frequency_hz === 'number' && pulse_frequency_hz > 0 ? pulse_frequency_hz : DEFAULT_LUNAR_PULSE_FREQUENCY_HZ;
  const phase = safe_t * freq;
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
    reticle_rotation_rad: -safe_t * 1.15,
    crystal_rotation_rad: safe_t * 2.6,
    crystal_bob_ratio: 0.024 + 0.007 * Math.sin(phase * Math.PI * 2),
    is_alarm_lit: blink_opacity >= 0.6,
  };
}

/**
 * Apollo 11 Mare Tranquillitatis için kameraya dönük (Sprite) taktik kart dokusu üretir.
 */
function createLunarLabelTexture(threeLib, beaconParams) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !threeLib?.CanvasTexture) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return null;

  // Arka plan: Derin uzay rengi + Apollo siyan taktik çerçeve
  ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
  ctx.fillRect(12, 12, 1000, 296);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.98)';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 1000, 296);

  // Üst bant: Siyan vurgusu + parlayan gösterge noktası
  ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
  ctx.fillRect(15, 15, 994, 52);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(48, 41, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(`TARİHİ AY İNİŞİ  •  ${beaconParams.coordinates_label}  •  ${beaconParams.landing_date}`, 76, 50);

  // Başlık: MARE TRANQUILLITATIS
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
  const title = beaconParams.crater_name.toUpperCase();
  ctx.strokeText(title, 36, 138);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, 36, 138);

  // Araç: APOLLO 11 AY MODÜLÜ (EAGLE)
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText(`ARAÇ: ${beaconParams.rover_label.toUpperCase()}`, 36, 198);

  // Alt bilgi: SÜKÛNET ÜSSÜ (TRANQUILITY BASE)
  ctx.font = '600 28px monospace';
  ctx.fillStyle = '#e0f2fe';
  ctx.fillText(`SÜKÛNET ÜSSÜ  |  MÜRETTEBAT: ${beaconParams.crew_label.toUpperCase()}  |  ${beaconParams.features.slice(0, 2).join(' • ')}`, 36, 258);

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

/**
 * Ay'ın tiltPivot'una eklenen iniş noktası işareti ve bilgi kartı grubu.
 * Mars rover işaretleriyle birebir aynı optik mimariye sahiptir; ufkun arkasında söner ve kameraya göre screen-aligned kalır.
 */
export function createLunarSiteMarker(threeLib, radius_units, siteOrParams = getLunarSite()) {
  const beaconParams = { ...getLunarSite(siteOrParams.site_id || siteOrParams.id), ...(typeof siteOrParams === 'object' ? siteOrParams : {}) };
  const { position, normal } = calculateLunarSiteFrame(beaconParams, radius_units);

  const anchor = new threeLib.Group();
  anchor.name = `LUNAR_SITE_${beaconParams.site_id}`;
  anchor.position.set(position.x, position.y, position.z);

  const surfaceLift_units = radius_units * 0.008;
  const beaconGroup = new threeLib.Group();
  beaconGroup.name = 'LUNAR_SITE_MARKER';
  beaconGroup.position.set(normal.x * surfaceLift_units, normal.y * surfaceLift_units, normal.z * surfaceLift_units);
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
  const coreMesh = new threeLib.Mesh(new threeLib.SphereGeometry(radius_units * 0.016, 16, 12), coreMat);
  coreMesh.name = 'LUNAR_SITE_CORE';

  const CrystalGeom = threeLib.OctahedronGeometry || threeLib.DodecahedronGeometry || threeLib.SphereGeometry;
  const crystalMat = makeAddMat(0x7dd3fc, 0.95);
  const crystalMesh = new threeLib.Mesh(new CrystalGeom(radius_units * 0.018, 0), crystalMat);
  crystalMesh.name = 'LUNAR_SITE_CRYSTAL';
  crystalMesh.position.set(0, 0, radius_units * 0.03);

  const reticleMat = makeAddMat(0x38bdf8, 0.88);
  const reticleMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.035, radius_units * 0.044, 6), reticleMat);
  reticleMesh.name = 'LUNAR_SITE_RETICLE';

  const ringMat = makeAddMat(beaconParams.alarm_color_hex, 0.88);
  const ringMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.024, radius_units * 0.038, 8), ringMat);
  ringMesh.name = 'LUNAR_SITE_RING';

  const outerRingMat = makeAddMat(beaconParams.alarm_color_hex, 0.72);
  const outerRingMesh = new threeLib.Mesh(new threeLib.RingGeometry(radius_units * 0.024, radius_units * 0.035, 16), outerRingMat);
  outerRingMesh.name = 'LUNAR_SITE_RING_OUTER';

  const StemGeom = threeLib.CylinderGeometry || threeLib.SphereGeometry;
  const stemMat = makeAddMat(0x0284c7, 0.65);
  const stemMesh = new threeLib.Mesh(
    new StemGeom(radius_units * 0.0028, radius_units * 0.0028, radius_units * 0.11, 8),
    stemMat
  );
  stemMesh.name = 'LUNAR_SITE_STEM';
  stemMesh.rotation.x = Math.PI / 2;
  stemMesh.position.set(0, 0, radius_units * 0.06);

  // Bilgi kartı Sprite
  const labelTexture = createLunarLabelTexture(threeLib, beaconParams);
  const LabelMatCtor = threeLib.SpriteMaterial || threeLib.MeshBasicMaterial;
  const labelMat = new LabelMatCtor({
    color: labelTexture ? 0xffffff : 0x38bdf8,
    ...(labelTexture ? { map: labelTexture } : {}),
    transparent: true, opacity: 0.96, depthWrite: false,
  });
  const labelMesh = threeLib.Sprite
    ? new threeLib.Sprite(labelMat)
    : new threeLib.Mesh(new threeLib.PlaneGeometry(1, 1), labelMat);
  labelMesh.name = 'LUNAR_SITE_LABEL';
  labelMesh.scale.set(radius_units * 0.58, radius_units * 0.18, 1);
  labelMesh.position.set(0, 0, radius_units * 0.155);
  labelMesh.userData = {
    crater_name: beaconParams.crater_name,
    rover_label: beaconParams.rover_label,
    coordinates_label: beaconParams.coordinates_label,
    features: beaconParams.features,
  };

  beaconGroup.add(coreMesh, crystalMesh, reticleMesh, ringMesh, outerRingMesh, stemMesh, labelMesh);
  anchor.add(beaconGroup);

  const siteWorldVec = new threeLib.Vector3();
  const moonCenterVec = new threeLib.Vector3();
  let show_label_flag = true;

  function handleBeaconPulseStep(time_s, horizon_vis = 1) {
    const pulse = calculateLunarAlarmPulse(time_s, beaconParams.pulse_frequency_hz);
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
      anchor.getWorldPosition(siteWorldVec);
      anchor.parent.getWorldPosition(moonCenterVec);
      horizon_vis = calculateCraterHorizonVisibility(siteWorldVec, moonCenterVec, camera.position);
    }
    handleBeaconPulseStep(now_s, horizon_vis);
  };

  anchor.userData = {
    site_id: beaconParams.site_id,
    crater_name: beaconParams.crater_name,
    rover_id: beaconParams.rover_id,
    module_id: beaconParams.module_id,
    beacon_params: beaconParams,
    normal,
    handleBeaconPulseStep,
    handleSetShowLabel: (visible) => {
      show_label_flag = Boolean(visible);
      labelMesh.visible = show_label_flag;
    },
  };

  return anchor;
}
