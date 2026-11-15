// Işık gecikmesi isteğinin doğrulanması ve görsel tempo; saf fonksiyonlar, sahneye dokunmaz.
import { ORBIT_RADIUS_KM } from '../physics/spacePhysics.js';
import { SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';

export const LIGHT_DELAY_PHASES = Object.freeze({
  IDLE: 'IDLE',
  OUTBOUND: 'OUTBOUND',
  RETURN: 'RETURN',
  ARRIVED: 'ARRIVED',
  COMPLETE: 'COMPLETE',
  FOCUSED: 'FOCUSED',
  CLEARED: 'CLEARED',
});

const DEFAULT_REQUEST = Object.freeze({ source: 'EARTH', target: 'MARS', mode: 'one-way', speed_kms: null });
const VALID_MODES = ['one-way', 'round-trip'];
const MIN_VISUAL_S = 3;
const MAX_VISUAL_S = 6;
// Gerçek gecikme saniyeden saatlere yayılır; log ölçek Ay'ı ~3 sn'ye, Neptün'ü 6 sn'ye oturtur
const VISUAL_LOG_GAIN_S = 0.75;

// Fizik tablosunda yörünge yarıçapı olmayan cisimde gecikme 0 çıkar; onları varsayılana düşür
function isSignalBody(bodyId) {
  return (
    typeof bodyId === 'string' &&
    (Object.hasOwn(ORBIT_RADIUS_KM, bodyId) || bodyId === 'MOON') &&
    SOLAR_SYSTEM_BODIES.some((cfg) => cfg.id === bodyId)
  );
}

/**
 * Dışarıdan gelen `{ source, target, mode, speed_kms }` verisini doğrular; hiçbir durumda hata fırlatmaz.
 */
export function getLightDelayRequest(detail) {
  const safe = detail && typeof detail === 'object' ? detail : {};
  if (!isSignalBody(safe.source) || !isSignalBody(safe.target)) {
    console.warn(`Işık gecikmesi: bilinmeyen kaynak/hedef (${safe.source} -> ${safe.target}), EARTH -> MARS kullanıldı.`);
    return { ...DEFAULT_REQUEST };
  }
  let mode = DEFAULT_REQUEST.mode;
  if (VALID_MODES.includes(safe.mode)) {
    mode = safe.mode;
  } else if (safe.mode !== undefined) {
    console.warn(`Işık gecikmesi: bilinmeyen mode (${safe.mode}), one-way kullanıldı.`);
  }
  const has_speed = typeof safe.speed_kms === 'number' && Number.isFinite(safe.speed_kms) && safe.speed_kms > 0;
  // Hız bazlı dalga (CME benzeri) geri yansımaz; tek yön akar
  return {
    source: safe.source,
    target: safe.target,
    mode: has_speed ? 'one-way' : mode,
    speed_kms: has_speed ? safe.speed_kms : null,
  };
}

/**
 * Gerçek süreyi (sn) kullanıcıyı sıkmayan 3-6 sn'lik görsel süreye sıkıştırır.
 */
export function calculateVisualDuration_s(real_s) {
  const safe_s = typeof real_s === 'number' && Number.isFinite(real_s) && real_s > 0 ? real_s : 0;
  const scaled_s = MIN_VISUAL_S + Math.log10(1 + safe_s) * VISUAL_LOG_GAIN_S;
  return Math.min(MAX_VISUAL_S, Math.max(MIN_VISUAL_S, scaled_s));
}
