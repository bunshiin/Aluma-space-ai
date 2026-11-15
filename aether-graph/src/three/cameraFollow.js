// Kameranın hareket eden gövdeyi izlemesi için saf vektör hesapları (Three.js nesnesi beklemez, {x,y,z} yeter).

function getLength(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function getDiff(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * v vektörünü, a yönünü b yönüne çeviren en kısa dönüşle döndürür (Rodrigues formülü).
 * Çember yörüngede bu dönüş aracın ebeveyn etrafındaki yörünge dönüşüyle aynıdır.
 */
function calculateRotatedVector(v, a, b) {
  const lenA = getLength(a);
  const lenB = getLength(b);
  if (lenA === 0 || lenB === 0) {
    return { ...v };
  }
  const ua = { x: a.x / lenA, y: a.y / lenA, z: a.z / lenA };
  const ub = { x: b.x / lenB, y: b.y / lenB, z: b.z / lenB };
  const cross = {
    x: ua.y * ub.z - ua.z * ub.y,
    y: ua.z * ub.x - ua.x * ub.z,
    z: ua.x * ub.y - ua.y * ub.x,
  };
  const sin = getLength(cross);
  const cos = ua.x * ub.x + ua.y * ub.y + ua.z * ub.z;
  if (sin < 1e-12) {
    return { ...v };
  }
  const k = { x: cross.x / sin, y: cross.y / sin, z: cross.z / sin };
  const kDotV = k.x * v.x + k.y * v.y + k.z * v.z;
  const kCrossV = { x: k.y * v.z - k.z * v.y, y: k.z * v.x - k.x * v.z, z: k.x * v.y - k.y * v.x };
  return {
    x: v.x * cos + kCrossV.x * sin + k.x * kDotV * (1 - cos),
    y: v.y * cos + kCrossV.y * sin + k.y * kDotV * (1 - cos),
    z: v.z * cos + kCrossV.z * sin + k.z * kDotV * (1 - cos),
  };
}

/**
 * Gövde prevBody'den body'ye gittiğinde izleyen noktanın (kamera veya hedef) yeni konumu.
 * Ebeveyn yoksa sadece taşınır; varsa ebeveyn etrafında araçla birlikte döner,
 * böylece alçak yörüngedeki aracın kamerası birkaç tur sonra gezegenin içine kaymaz.
 */
export function calculateFollowedPoint(point, prevBody, body, prevParent, parent) {
  if (!prevParent || !parent) {
    return { x: point.x + body.x - prevBody.x, y: point.y + body.y - prevBody.y, z: point.z + body.z - prevBody.z };
  }
  const rotated = calculateRotatedVector(getDiff(point, prevParent), getDiff(prevBody, prevParent), getDiff(body, parent));
  return { x: parent.x + rotated.x, y: parent.y + rotated.y, z: parent.z + rotated.z };
}

/**
 * Ebeveyni olan aracın kamera konumu: ebeveynden dışarı doğru ve biraz yukarıda, asla gezegenin içinde değil.
 */
export function calculateSatelliteCameraPos(body, parent, dist_units) {
  const radial = getDiff(body, parent);
  const len = getLength(radial) || 1;
  return {
    x: body.x + (radial.x / len) * dist_units,
    y: body.y + (radial.y / len) * dist_units + dist_units * 0.45,
    z: body.z + (radial.z / len) * dist_units,
  };
}
