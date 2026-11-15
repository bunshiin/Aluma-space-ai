// Güneş patlamasının zaman çizelgesi ve sinematik kamera yolu. Saf hesap: her an için kamera
// konumu ve bakış noktası döner, ani sıçrama olmaması için bütün geçişler yumuşatılır.
// Kamera patlama noktasında kalır; dalga uzaya kadar takip edilmez.
import {
  calculateClamp01,
  calculateEaseInOut,
  calculateVec,
  calculateVecMix,
  calculateVecScale,
  calculateVecSum,
} from './flareMath.js';

const APPROACH_S = 2.2;
const CLAW_GROW_S = 2.0;
// Pençeler büyürken ilk dalga beklenir, dalga kolların yükseldiğini gördükten sonra çıkar
const ERUPT_TO_WAVE_S = 1.2;
const WAVE_PULSE_PERIOD_S = 2.6;
const WAVE_PULSE_DURATION_S = 4.5;
const WAVE_START_RADIUS_UNITS = 0.6;

/**
 * Patlama evreleri (saniye): yaklaşma → patlama → dalga darbeleri. Pençeler ve parçacıklar
 * darbelerden sonra da sahne kapanana kadar sürer, bu yüzden bir bitiş zamanı yoktur.
 */
export function calculateFlareTimeline(profile) {
  const erupt_start_s = APPROACH_S;
  const wave_launch_s = erupt_start_s + ERUPT_TO_WAVE_S;
  return {
    approach_end_s: APPROACH_S,
    erupt_start_s,
    claw_grow_s: CLAW_GROW_S,
    wave_launch_s,
    wave_pulse_period_s: WAVE_PULSE_PERIOD_S,
    wave_pulse_duration_s: WAVE_PULSE_DURATION_S,
    wave_end_s: wave_launch_s + (profile.wave_pulse_count - 1) * WAVE_PULSE_PERIOD_S + WAVE_PULSE_DURATION_S,
  };
}

/**
 * k. dalga darbesinin o anki durumu: yavaşça açılan bir kubbe, bitince etkin değil.
 */
export function calculateWavePulse(profile, timeline, pulse_index, elapsed_s) {
  const age_s = elapsed_s - timeline.wave_launch_s - pulse_index * timeline.wave_pulse_period_s;
  if (age_s < 0 || age_s > timeline.wave_pulse_duration_s) {
    return { is_active: false, radius_units: 0, progress: 0 };
  }
  const progress = age_s / timeline.wave_pulse_duration_s;
  // Başta hızlı, sonra yavaşlayan yayılma: enerji dağıldıkça dalga yavaşlar
  const eased = 1 - Math.pow(1 - progress, 1.6);
  return {
    is_active: true,
    radius_units: WAVE_START_RADIUS_UNITS + (profile.wave_max_radius_units - WAVE_START_RADIUS_UNITS) * eased,
    progress,
  };
}

function calculateOrbitPoint(basis, lookPoint, phi_rad, dist_units) {
  return calculateVecSum(
    lookPoint,
    calculateVecScale(basis.right, Math.cos(phi_rad) * dist_units),
    calculateVecScale(basis.up, Math.sin(phi_rad) * dist_units),
    calculateVecScale(basis.dir, 1.5)
  );
}

// Patlama anında kısa, sönümlenen kamera titremesi; şiddet tehlike seviyesiyle artar
function calculateShakeOffset(profile, timeline, elapsed_s) {
  const local_s = elapsed_s - timeline.erupt_start_s;
  if (local_s < 0 || local_s > 1.4 || !profile.shake_units) {
    return calculateVec(0, 0, 0);
  }
  const amp = profile.shake_units * Math.exp(-local_s * 2.6);
  return calculateVec(
    Math.sin(local_s * 47.0) * amp,
    Math.sin(local_s * 61.0 + 1.3) * amp,
    Math.sin(local_s * 53.0 + 2.1) * amp
  );
}

/**
 * Verilen andaki kamera konumu ve bakış noktası. startShot: tetikleme anındaki kamera
 * { position, target }. Yaklaştıktan sonra kamera patlama noktasında kalıp çok yavaş süzülür.
 */
export function calculateFlareShot(profile, basis, timeline, elapsed_s, startShot, sun_radius_units) {
  const t = elapsed_s;
  const clawHeight_units = profile.claw_height_units;
  const waveMax_units = profile.wave_max_radius_units;
  // Dalga kubbesi de kadraja sığsın diye kamera pençe boyuna ve dalga yarıçapına göre uzaklaşır
  const dist_units = 7 + clawHeight_units * 2.4 + waveMax_units * 0.3;

  const look = calculateVecScale(basis.dir, sun_radius_units + clawHeight_units * 0.45 + waveMax_units * 0.2);
  const dolly = calculateEaseInOut(t / 14);
  const phi_rad = 0.22 + dolly * 0.2 + Math.sin(t * 0.17) * 0.06;
  let cam = calculateOrbitPoint(basis, look, phi_rad, dist_units * (1 - 0.1 * dolly));
  let target = look;

  if (t < timeline.approach_end_s) {
    const k = calculateEaseInOut(calculateClamp01(t / timeline.approach_end_s));
    cam = calculateVecMix(startShot.position, cam, k);
    target = calculateVecMix(startShot.target, look, k);
  }

  return {
    position: calculateVecSum(cam, calculateShakeOffset(profile, timeline, t)),
    target,
  };
}
