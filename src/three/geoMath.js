// Enlem/boylam (derece) → sahne koordinatı. Derece→radyan dönüşümü sadece burada yapılır

export const GLOBE_RADIUS = 1;
const DEG_TO_RAD = Math.PI / 180;

// three.js SphereGeometry eşdikdörtgen doku eşlemesiyle uyumlu: u=0 boylam -180°, kutup +Y
export function calculateScenePosition(latitude_deg, longitude_deg, radius = GLOBE_RADIUS) {
  const lat = Number.isFinite(latitude_deg) ? Math.max(-90, Math.min(90, latitude_deg)) : 0;
  const lon = Number.isFinite(longitude_deg) ? longitude_deg : 0;
  const polarRad = (90 - lat) * DEG_TO_RAD;
  const azimuthRad = (lon + 180) * DEG_TO_RAD;
  return {
    x: -radius * Math.sin(polarRad) * Math.cos(azimuthRad),
    y: radius * Math.cos(polarRad),
    z: radius * Math.sin(polarRad) * Math.sin(azimuthRad),
  };
}

export function calculateSurfaceNormal(latitude_deg, longitude_deg) {
  return calculateScenePosition(latitude_deg, longitude_deg, 1);
}
