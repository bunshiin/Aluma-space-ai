// Tek bir gök cisminin yerçekimi bilgisi: cisim kendisiyle kıyaslanmaz, değerler spacePhysics.js sabitlerinden gelir.

import { BODY_RADIUS_KM, PLANET_GRAVITY_MS2, calculateFallTime } from "../physics/spacePhysics.js";

const FALL_HEIGHT_M = 10;

/**
 * Bilinen gök cismi için { body, gravity_ms2, radius_km, fall_10m_s } döner; bilinmeyen cisimde null.
 * Bilinmeyen cisim Dünya değerine düşüp yanlış bilgi üretmesin diye tabloda yoksa hesap yapılmaz.
 */
export function calculateSingleBodyGravity(bodyId) {
  const body = typeof bodyId === "string" ? bodyId.trim().toUpperCase() : "";
  if (!Object.hasOwn(PLANET_GRAVITY_MS2, body)) return null;
  const gravity_ms2 = PLANET_GRAVITY_MS2[body];
  return {
    body,
    gravity_ms2: Number(gravity_ms2.toFixed(2)),
    radius_km: Object.hasOwn(BODY_RADIUS_KM, body) ? Number(BODY_RADIUS_KM[body].toFixed(1)) : null,
    fall_10m_s: Number(calculateFallTime(FALL_HEIGHT_M, gravity_ms2).toFixed(2))
  };
}

/**
 * Hesap sonucunu bilgi kartı satırlarına çevirir. getText(key) etiketleri states.json'dan verir.
 */
export function createSingleBodyFacts(stats, getText) {
  if (!stats) return [];
  const facts = [{ label: getText("fact_gravity"), value: String(stats.gravity_ms2) }];
  if (stats.radius_km !== null) facts.push({ label: getText("fact_radius"), value: String(stats.radius_km) });
  facts.push({ label: getText("fact_fall_10m"), value: String(stats.fall_10m_s) });
  return facts.filter((fact) => fact.label);
}
