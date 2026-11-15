// Güneş'in gökyüzündeki konumu (EONET küresinin gece/gündüz çizgisi). Sabitler spacePhysics.js'te tek yerde.
import { J2000_JULIAN_DAY, MS_PER_DAY, UNIX_EPOCH_JULIAN_DAY } from './spacePhysics.js';

const DEG_TO_RAD = Math.PI / 180;

function normalizeLongitudeDeg(angle_deg) {
  return ((((angle_deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Güneş'in tam tepede olduğu nokta (NOAA düşük hassasiyetli formül, hata < 0.1°).
 * EONET küresindeki gece/gündüz çizgisi buna göre çizilir.
 */
export function calculateSubsolarPoint(date = new Date()) {
  const time_ms = date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
  const daysSinceJ2000 = time_ms / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY - J2000_JULIAN_DAY;

  const meanLongitude_deg = 280.46 + 0.9856474 * daysSinceJ2000;
  const meanAnomaly_rad = (357.528 + 0.9856003 * daysSinceJ2000) * DEG_TO_RAD;
  const eclipticLongitude_rad =
    (meanLongitude_deg + 1.915 * Math.sin(meanAnomaly_rad) + 0.02 * Math.sin(2 * meanAnomaly_rad)) * DEG_TO_RAD;
  const obliquity_rad = (23.439 - 0.0000004 * daysSinceJ2000) * DEG_TO_RAD;

  const declination_rad = Math.asin(Math.sin(obliquity_rad) * Math.sin(eclipticLongitude_rad));
  const rightAscension_deg =
    Math.atan2(Math.cos(obliquity_rad) * Math.sin(eclipticLongitude_rad), Math.cos(eclipticLongitude_rad)) / DEG_TO_RAD;
  const greenwichSidereal_deg = 280.46061837 + 360.98564736629 * daysSinceJ2000;

  return {
    latitude_deg: declination_rad / DEG_TO_RAD,
    longitude_deg: normalizeLongitudeDeg(rightAscension_deg - greenwichSidereal_deg),
  };
}
