import { CAMERA_TARGETS, calculateRadFromDeg } from './solarSystemConfig.js';
import { calculateClamp01, calculateEaseInOut, calculateOrthonormalBasis, calculateVecScale } from './flareMath.js';
import { calculateStreamPosition } from './flareGeometry.js';
import { calculateFlareShot, calculateFlareTimeline, calculateWavePulse } from './solarFlareCinematic.js';
import {
  createEmWave,
  createFlareClaws,
  createFlareFlash,
  createFlareParticles,
  createPostFlareArcade,
} from './solarFlareMeshes.js';

const SUN_RADIUS_UNITS = 6.5;

/**
 * Taha'nın veri şemasına göre Seviye 1 (C - Mavi), Seviye 2 (M - Sarı), Seviye 3 (X - Kırmızı) profilleri.
 * Pençe sayısı/boyu, dalga darbesi sayısı/menzili ve kamera titremesi tehlike seviyesiyle büyür.
 */
export const SOLAR_FLARE_PROFILES = {
  C: {
    intensity_level: 1,
    flare_category: 'C',
    radiation_level: 'LOW',
    color_hex: 0x38bdf8,
    core_color_hex: 0xe0f2fe,
    wave_max_radius_units: 6,
    wave_cone_rad: 0.95,
    wave_pulse_count: 2,
    particle_count: 260,
    claw_count: 3,
    claw_height_units: 1.1,
    shake_units: 0,
  },
  M: {
    intensity_level: 2,
    flare_category: 'M',
    radiation_level: 'MODERATE',
    color_hex: 0xfacc15,
    core_color_hex: 0xfef9c3,
    wave_max_radius_units: 9,
    wave_cone_rad: 1.25,
    wave_pulse_count: 3,
    particle_count: 450,
    claw_count: 5,
    claw_height_units: 1.9,
    shake_units: 0.06,
  },
  X: {
    intensity_level: 3,
    flare_category: 'X',
    radiation_level: 'HIGH',
    color_hex: 0xef4444,
    core_color_hex: 0xffedd5,
    wave_max_radius_units: 13,
    wave_cone_rad: 1.6,
    wave_pulse_count: 4,
    particle_count: 700,
    claw_count: 7,
    claw_height_units: 3.0,
    shake_units: 0.14,
  },
};

/**
 * Taha'nın getSpaceData('solar', id) çıktısını ilgili görsel patlama profiline çevirir.
 */
export function getSolarFlareProfile(flareData = {}) {
  const rawClass = String(flareData?.flare_class || '').trim().toUpperCase();
  const rawCategory = String(flareData?.flare_category || '').trim().toUpperCase();
  const rawRadiation = String(flareData?.radiation_level || '').trim().toUpperCase();
  const rawIntensity = String(flareData?.intensity_level ?? '').trim().toLowerCase();

  let selected = SOLAR_FLARE_PROFILES.C;
  if (
    rawClass.startsWith('X') ||
    rawCategory === 'X' ||
    rawRadiation === 'HIGH' ||
    ['3', 'seviye 3', 'high', 'x'].includes(rawIntensity)
  ) {
    selected = SOLAR_FLARE_PROFILES.X;
  } else if (
    rawClass.startsWith('M') ||
    rawCategory === 'M' ||
    rawRadiation === 'MODERATE' ||
    ['2', 'seviye 2', 'moderate', 'm'].includes(rawIntensity)
  ) {
    selected = SOLAR_FLARE_PROFILES.M;
  }

  const coords = flareData?.coordinates || {};
  return {
    ...selected,
    flare_class: rawClass || `${selected.flare_category}1.0`,
    source_region: flareData?.source_region || 'Region 4574',
    latitude_deg: Number.isFinite(coords.latitude_deg) ? coords.latitude_deg : 0,
    longitude_deg: Number.isFinite(coords.longitude_deg) ? coords.longitude_deg : 0,
  };
}

/**
 * Güneş üzerindeki heliografik (latitude_deg, longitude_deg) koordinatını birim yön vektörüne çevirir.
 */
export function calculateHeliographicDirection(threeLib, latitude_deg, longitude_deg) {
  const lat_rad = calculateRadFromDeg(latitude_deg);
  const lon_rad = calculateRadFromDeg(longitude_deg);
  const cosLat = Math.cos(lat_rad);
  return new threeLib.Vector3(cosLat * Math.sin(lon_rad), Math.sin(lat_rad), cosLat * Math.cos(lon_rad));
}

/**
 * Güneş'in o anki dönüşünü yerel patlama eksenlerine uygular; kamera patlamayı dünya
 * eksenlerinde izlediği için Güneş döndükçe kamera da patlamayla birlikte döner.
 */
function calculateWorldBasis(threeLib, parent, basis) {
  if (typeof parent.getWorldQuaternion !== 'function' || !threeLib.Quaternion) {
    return basis;
  }
  const q = parent.getWorldQuaternion(new threeLib.Quaternion());
  const rotate = (v) => {
    const r = new threeLib.Vector3(v.x, v.y, v.z).applyQuaternion(q);
    return { x: r.x, y: r.y, z: r.z };
  };
  return { dir: rotate(basis.dir), right: rotate(basis.right), up: rotate(basis.up) };
}

function handleSurfaceFrame(flare, t) {
  const { profile, timeline, claws, arcade, flash } = flare;
  const eruptLocal_s = t - timeline.erupt_start_s;

  claws.uniforms.uTime.value = t;
  arcade.uniforms.uTime.value = t;
  flash.uniforms.uTime.value = t;

  claws.uniforms.uGrow.value = calculateEaseInOut(eruptLocal_s / timeline.claw_grow_s);
  claws.uniforms.uHeat.value = 1.3 - 0.5 * calculateClamp01(eruptLocal_s / 3);
  arcade.uniforms.uOpacity.value = 0.9 * calculateEaseInOut((eruptLocal_s - 1.0) / 1.5);

  // Patlama öncesi aktif bölge ısınır, patlama anında beyaz flaş çıkar, sonra kalıcı bir parıltıya oturur
  let intensity;
  if (eruptLocal_s < 0) {
    const warm = calculateClamp01(t / timeline.approach_end_s);
    intensity = 0.28 * warm * (0.85 + 0.15 * Math.sin(t * 23));
  } else {
    const peak = 0.6 + profile.intensity_level * 0.15;
    const rise = calculateClamp01(eruptLocal_s / 0.25);
    const settled = 0.2 + 0.04 * Math.sin(t * 2.1);
    intensity = settled + (peak - settled) * rise * Math.exp(-Math.max(0, eruptLocal_s - 0.25) * 1.1);
  }
  flash.uniforms.uIntensity.value = intensity;
}

// Dalga her darbede patlama noktasından yavaşça açılır; darbeler bitince kabuklar görünmez kalır
function handleWaveFrame(flare, t) {
  const { profile, timeline, wave } = flare;
  // Bloom kenar parlamasını zaten büyüttüğü için kabuk kendi başına sönük tutulur
  const baseOpacity = 0.2 + profile.intensity_level * 0.06;

  wave.shells.forEach(({ mesh, uniforms }, k) => {
    const pulse = calculateWavePulse(profile, timeline, k, t);
    mesh.visible = pulse.is_active;
    if (!pulse.is_active) return;
    mesh.scale.set(pulse.radius_units, pulse.radius_units, pulse.radius_units);
    uniforms.uTime.value = t;
    uniforms.uOpacity.value =
      baseOpacity * calculateClamp01(pulse.progress / 0.08) * Math.pow(1 - pulse.progress, 1.2);
  });
}

// Parçacıklar pençe kemerleri boyunca akar ve başa sarar; patlama sürdüğü sürece devam eder
function handleParticleFrame(flare, t, delta_s) {
  const { timeline, claws, particles } = flare;
  const eruptLocal_s = t - timeline.erupt_start_s;
  if (eruptLocal_s < 0) return;

  // Henüz büyümemiş kısma parçacık girmesin: yol, kolların açılan oranına sıkıştırılır
  const grow = claws.uniforms.uGrow.value;
  const { positions, streams, paths } = particles;
  streams.forEach((stream, i) => {
    stream.progress = (stream.progress + stream.speed_s * delta_s) % 1;
    const p = calculateStreamPosition(paths[stream.path_index].points, stream.progress * grow);
    positions[i * 3] = p.x + stream.jitter.x;
    positions[i * 3 + 1] = p.y + stream.jitter.y;
    positions[i * 3 + 2] = p.z + stream.jitter.z;
  });
  particles.mesh.geometry.attributes.position.needsUpdate = true;
  particles.uniforms.uOpacity.value = 0.9 * calculateClamp01(eruptLocal_s / 0.8);
}

/**
 * Güneş patlaması kontrolcüsü: Güneş'e geri dalan pençe kemerleri, patlama flaşı, kemer dizisi,
 * tehlike seviyesine göre yerinde yayılan elektromanyetik dalga darbeleri ve patlama noktasında
 * kalan sinematik kamera. Pençeler ve parçacıklar sahne kapanana (veya yeni tetiklemeye) kadar sürer.
 */
export function createSolarFlareController(threeLib, scene, cameraController, getAttachNode = () => null) {
  let active_flare = null;
  const overview = CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW;
  const defaultStartShot = {
    position: { x: overview.position_units[0], y: overview.position_units[1], z: overview.position_units[2] },
    target: { x: overview.look_at_units[0], y: overview.look_at_units[1], z: overview.look_at_units[2] },
  };

  function destroyActiveFlareMeshes() {
    if (!active_flare) return;
    const { group, parent } = active_flare;
    parent.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    active_flare = null;
  }

  function handleTriggerSolarFlare(flareData = {}) {
    destroyActiveFlareMeshes();
    const profile = getSolarFlareProfile(flareData);
    const dirVec = calculateHeliographicDirection(threeLib, profile.latitude_deg, profile.longitude_deg);
    const basis = calculateOrthonormalBasis(dirVec);
    const surfaceOrigin = calculateVecScale(basis.dir, SUN_RADIUS_UNITS);

    const group = new threeLib.Group();
    group.name = 'SOLAR_FLARE_EFFECT';
    const claws = createFlareClaws(threeLib, profile, basis, SUN_RADIUS_UNITS);
    const arcade = createPostFlareArcade(threeLib, profile, basis, SUN_RADIUS_UNITS);
    const flash = createFlareFlash(threeLib, profile, calculateVecScale(basis.dir, SUN_RADIUS_UNITS + 0.5));
    const particles = createFlareParticles(threeLib, profile, claws.paths);
    const wave = createEmWave(threeLib, profile, basis, surfaceOrigin);
    [claws.group, arcade.group, flash.mesh, particles.mesh, wave.group].forEach((obj) => group.add(obj));
    // Güneş gövdesi (eğik ve dönen) yoksa sahneye düşer; varsa patlama onunla birlikte döner
    const parent = getAttachNode() || scene;
    parent.add(group);

    const startShot = cameraController ? cameraController.handleBeginCinematic() : defaultStartShot;
    active_flare = {
      profile,
      basis,
      group,
      parent,
      claws,
      arcade,
      flash,
      particles,
      wave,
      startShot,
      timeline: calculateFlareTimeline(profile),
      elapsed_s: 0,
    };
    return profile;
  }

  function handleSolarFlareFrameUpdate(delta_s) {
    if (!active_flare) return;
    active_flare.elapsed_s += delta_s;
    const t = active_flare.elapsed_s;

    handleSurfaceFrame(active_flare, t);
    handleWaveFrame(active_flare, t);
    handleParticleFrame(active_flare, t, delta_s);

    if (cameraController) {
      const { profile, basis, timeline, startShot, parent } = active_flare;
      const worldBasis = calculateWorldBasis(threeLib, parent, basis);
      const shot = calculateFlareShot(profile, worldBasis, timeline, t, startShot, SUN_RADIUS_UNITS);
      cameraController.handleCinematicShot(shot.position, shot.target);
    }
  }

  function destroySolarFlareController() {
    if (active_flare && cameraController) cameraController.handleEndCinematic();
    destroyActiveFlareMeshes();
  }

  return {
    handleTriggerSolarFlare,
    handleSolarFlareFrameUpdate,
    destroySolarFlareController,
    getActiveFlare: () => active_flare,
  };
}
