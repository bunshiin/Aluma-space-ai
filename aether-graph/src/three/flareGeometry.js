// Patlama pençeleri ve kemerleri için yol hesabı ve incelen tüp geometrisi.
// THREE.TubeGeometry sabit yarıçaplı olduğu için pençe ucu sivrilmiyor; tüpü burada kendimiz örüyoruz.
import {
  calculateSeededRandom,
  calculateVecCross,
  calculateVecDot,
  calculateVecNormalize,
  calculateVecScale,
  calculateVecSum,
} from './flareMath.js';

const PATH_SAMPLES = 48;

export function calculateBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return calculateVecSum(
    calculateVecScale(p0, u * u * u),
    calculateVecScale(p1, 3 * u * u * t),
    calculateVecScale(p2, 3 * u * t * t),
    calculateVecScale(p3, t * t * t)
  );
}

function calculateBezierSamples(p0, p1, p2, p3) {
  const points = [];
  for (let i = 0; i <= PATH_SAMPLES; i += 1) {
    points.push(calculateBezierPoint(p0, p1, p2, p3, i / PATH_SAMPLES));
  }
  return points;
}

function calculateSurfacePoint(basis, sun_radius_units, upOffset, rightOffset) {
  const { dir, right, up } = basis;
  const raw = calculateVecSum(
    calculateVecScale(dir, sun_radius_units),
    calculateVecScale(up, upOffset),
    calculateVecScale(right, rightOffset)
  );
  // Ayak noktası yüzeyin biraz içinde başlar ki pençe Güneş'ten "kopmuş" görünmesin
  return calculateVecScale(calculateVecNormalize(raw), sun_radius_units - 0.05);
}

/**
 * Pençe kolları: her kol Güneş yüzeyinden kalkıp tepe yapan, ucu tekrar Güneş'in içine dalan bir
 * kemerdir (koronal halka). Hepsi aynı yöne kıvrılır, böylece tırnak demeti gibi görünür.
 * Ortadaki kol en uzunudur, kenarlar kısalır.
 */
export function calculateClawPaths(profile, basis, sun_radius_units) {
  const count = profile.claw_count;
  // Bütün ölçüler pençe boyundan türer; seviye değişince patlama orantılı küçülür ya da büyür
  const footSpan_units = profile.claw_height_units * 0.8;
  const paths = [];

  for (let i = 0; i < count; i += 1) {
    const k = count === 1 ? 0.5 : i / (count - 1);
    const centered = k - 0.5;
    const rnd = calculateSeededRandom(i * 7.13 + profile.intensity_level * 17.0);
    const height_units =
      profile.claw_height_units * (0.75 + 0.25 * rnd) * (1 - Math.abs(centered) * 0.35);
    const width_units = height_units * (0.55 + 0.3 * rnd);
    const rightOffset_units = (rnd - 0.5) * 0.5;
    const upOffset_units = centered * footSpan_units;

    const footA = calculateSurfacePoint(basis, sun_radius_units, upOffset_units, rightOffset_units);
    const footB = calculateSurfacePoint(basis, sun_radius_units, upOffset_units + width_units, rightOffset_units);
    // Kontrol noktaları her ayağın kendi yüzey normalinden yükselir; uç Güneş'e dik dalar
    const p1 = calculateVecSum(footA, calculateVecScale(calculateVecNormalize(footA), height_units * 1.5));
    const p2 = calculateVecSum(footB, calculateVecScale(calculateVecNormalize(footB), height_units * 0.9));

    const mainPoints = calculateBezierSamples(footA, p1, p2, footB);
    const baseRadius_units = (0.02 + profile.claw_height_units * 0.03) * (1 - Math.abs(centered) * 0.3);
    paths.push({
      points: mainPoints,
      base_radius_units: baseRadius_units,
      tip_radius_units: 0.012,
      is_main: true,
    });
    // Ana kolun etrafına sarılan iki ince iplik: plazma tek boru değil, burulmuş akı demeti gibi görünsün
    [0, Math.PI].forEach((phase_rad) => {
      paths.push({
        points: calculateHelixAround(mainPoints, baseRadius_units * 2.2, 2.5 + rnd * 1.5, phase_rad),
        base_radius_units: baseRadius_units * 0.35,
        tip_radius_units: 0.008,
        is_main: false,
      });
    });
  }
  return paths;
}

/**
 * Yol örnekleri üzerinde 0..1 ilerlemeye karşılık gelen noktayı doğrusal ara değerle verir;
 * parçacıklar bu sayede kemer boyunca akar.
 */
export function calculateStreamPosition(points, progress) {
  const f = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  const k = f - i;
  const a = points[i];
  const b = points[i + 1];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/**
 * Verilen yolun etrafında sarmal bir iplik yolu üretir; sarmal yarıçapı uca doğru daralır.
 */
export function calculateHelixAround(points, radius_units, turns, phase_rad) {
  const n = points.length;
  let normal = null;
  return points.map((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const tangent = calculateVecNormalize(calculateVecSum(next, calculateVecScale(prev, -1)));
    normal = normal
      ? calculateVecNormalize(
          calculateVecSum(normal, calculateVecScale(tangent, -calculateVecDot(normal, tangent)))
        )
      : calculateInitialNormal(tangent);
    const binormal = calculateVecCross(tangent, normal);
    const t = i / (n - 1);
    const angle_rad = phase_rad + t * turns * Math.PI * 2;
    const r = radius_units * (1 - t * 0.85);
    return calculateVecSum(
      point,
      calculateVecScale(normal, Math.cos(angle_rad) * r),
      calculateVecScale(binormal, Math.sin(angle_rad) * r)
    );
  });
}

/**
 * Patlama sonrası kemer dizisi (post-flare arcade): patlama bölgesinin üzerinde küçük, parlak yaylar.
 */
export function calculateArcadePaths(profile, basis, sun_radius_units) {
  const { dir } = basis;
  const count = 4 + profile.intensity_level * 2;
  const span_units = profile.claw_height_units * 0.7;
  const halfWidth_units = profile.claw_height_units * 0.17;
  const apex_units = profile.claw_height_units * 0.25;
  const paths = [];

  for (let i = 0; i < count; i += 1) {
    const upOffset = (i / (count - 1) - 0.5) * span_units;
    const footA = calculateSurfacePoint(basis, sun_radius_units, upOffset, -halfWidth_units);
    const footB = calculateSurfacePoint(basis, sun_radius_units, upOffset, halfWidth_units);
    const lift = calculateVecScale(dir, apex_units * 1.33);
    paths.push({
      points: calculateBezierSamples(footA, calculateVecSum(footA, lift), calculateVecSum(footB, lift), footB),
      base_radius_units: 0.02 + profile.claw_height_units * 0.01,
      tip_radius_units: 0.02 + profile.claw_height_units * 0.01,
    });
  }
  return paths;
}

function calculateInitialNormal(tangent) {
  const axis =
    Math.abs(tangent.x) < 0.6 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return calculateVecNormalize(calculateVecCross(tangent, axis));
}

/**
 * Yol boyunca yarıçapı tabandan uca inceltilen tüp. uv.x = yol boyunca 0..1 (shader büyümeyi
 * buna göre açar), uv.y = çevre 0..1. Çerçeve paralel taşıma ile kurulur ki tüp burulmasın.
 */
export function createTaperedTubeGeometry(threeLib, path, radialSegments = 10) {
  const { points, base_radius_units, tip_radius_units } = path;
  const n = points.length;
  const ringSize = radialSegments + 1;
  const positions = new Float32Array(n * ringSize * 3);
  const normals = new Float32Array(n * ringSize * 3);
  const uvs = new Float32Array(n * ringSize * 2);
  const indices = [];

  let normal = null;
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const tangent = calculateVecNormalize(calculateVecSum(next, calculateVecScale(prev, -1)));
    normal = normal
      ? calculateVecNormalize(
          calculateVecSum(normal, calculateVecScale(tangent, -calculateVecDot(normal, tangent)))
        )
      : calculateInitialNormal(tangent);
    const binormal = calculateVecCross(tangent, normal);

    const t = i / (n - 1);
    const radius_units =
      base_radius_units + (tip_radius_units - base_radius_units) * Math.pow(t, 0.85);

    for (let j = 0; j <= radialSegments; j += 1) {
      const angle_rad = (j / radialSegments) * Math.PI * 2;
      const nx = normal.x * Math.cos(angle_rad) + binormal.x * Math.sin(angle_rad);
      const ny = normal.y * Math.cos(angle_rad) + binormal.y * Math.sin(angle_rad);
      const nz = normal.z * Math.cos(angle_rad) + binormal.z * Math.sin(angle_rad);
      const v = i * ringSize + j;
      positions[v * 3] = points[i].x + nx * radius_units;
      positions[v * 3 + 1] = points[i].y + ny * radius_units;
      positions[v * 3 + 2] = points[i].z + nz * radius_units;
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
      uvs[v * 2] = t;
      uvs[v * 2 + 1] = j / radialSegments;
    }
  }

  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * ringSize + j;
      const b = (i + 1) * ringSize + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new threeLib.BufferGeometry();
  geometry.setAttribute('position', new threeLib.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new threeLib.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new threeLib.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
