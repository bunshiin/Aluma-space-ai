// Prosedürel volkan dağı: kraterli stratovolkan geometrisi (gerçek 3B ağ), olay kimliğine göre farklı şekil
// Ölçek abartılıdır (Dünya yarıçapı 1): dağ, küre üstünde okunur bir işaret olsun diye büyük çizilir

import { GLOBE_RADIUS } from "./geoMath.js";
import { VOLCANO_FRAGMENT, VOLCANO_VERTEX } from "./volcanoShaders.js";

export const VOLCANO_BASE_RADIUS = 0.085;
export const VOLCANO_HEIGHT = 0.03;
// Duman ve kıvılcım kraterden çıkar; parçacık katmanları bu yüksekliği başlangıç alır
export const VOLCANO_CRATER_HEIGHT = VOLCANO_HEIGHT * 0.93;

const RADIAL_RINGS = 64;
const ANGULAR_SEGMENTS = 144;
const CRATER_RATIO = 0.1;
const GRADIENT_EPS = 0.0015;

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text || "volcano")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function hash3(x, y, z, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 91.3) * 43758.5453;
  return s - Math.floor(s);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smoothstep(0, 1, x - xi), v = smoothstep(0, 1, y - yi), w = smoothstep(0, 1, z - zi);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

// Açı etrafında kesintisiz (dikiş yok): gürültü daire üzerindeki (cos, sin) noktasından örneklenir
function createHeightFunction(seed) {
  return function heightAt(x, z) {
    const r = Math.hypot(x, z);
    const t = r / VOLCANO_BASE_RADIUS;
    if (t >= 1) return 0;
    const angle = Math.atan2(z, x);
    const cx = Math.cos(angle), sy = Math.sin(angle);

    // Konkav yamaç: tepede dik, eteklerde yayılan klasik stratovolkan profili
    const flank = Math.pow((1 - Math.max(t, CRATER_RATIO)) / (1 - CRATER_RATIO), 1.45);
    let h = VOLCANO_HEIGHT * flank;

    // Radyal erozyon olukları (ridged gürültü) ve yamaç pürüzü
    const gully = Math.abs(valueNoise(cx * 4.2, sy * 4.2, t * 2.2, seed) * 2 - 1);
    const rough = valueNoise(cx * 9 + t * 5, sy * 9, t * 14, seed + 3) - 0.5;
    const slopeMask = smoothstep(0.08, 0.35, t) * (1 - smoothstep(0.7, 1, t));
    h -= VOLCANO_HEIGHT * 0.2 * gully * slopeMask;
    h += VOLCANO_HEIGHT * 0.07 * rough * slopeMask;

    // Krater çanağı ve hafif düzensiz kenar
    if (t < CRATER_RATIO) {
      const bowl = 1 - (t / CRATER_RATIO) ** 2;
      h -= VOLCANO_HEIGHT * 0.2 * bowl;
    }
    const rimNoise = valueNoise(cx * 6, sy * 6, 9, seed + 7) - 0.5;
    h += VOLCANO_HEIGHT * 0.05 * rimNoise * (1 - smoothstep(CRATER_RATIO, 0.3, t)) * (t > 0.02 ? 1 : 0);

    // Taban küre eğriliğini izler: düz taban kenarlarda havada asılı kalmasın
    return h - (r * r) / (2 * GLOBE_RADIUS);
  };
}

function createVolcanoGeometry(THREE, heightAt, seed) {
  const vertexCount = (RADIAL_RINGS + 1) * (ANGULAR_SEGMENTS + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const params = new Float32Array(vertexCount * 3);
  const indices = [];
  const normal = new THREE.Vector3();
  let v = 0;

  for (let ring = 0; ring <= RADIAL_RINGS; ring += 1) {
    // Merkezde sık halka: krater detayı için, etekte seyrek
    const t = Math.pow(ring / RADIAL_RINGS, 0.8);
    for (let seg = 0; seg <= ANGULAR_SEGMENTS; seg += 1) {
      const angle = (seg / ANGULAR_SEGMENTS) * Math.PI * 2;
      const x = Math.cos(angle) * t * VOLCANO_BASE_RADIUS;
      const z = Math.sin(angle) * t * VOLCANO_BASE_RADIUS;
      const y = heightAt(x, z);
      positions.set([x, y, z], v * 3);
      // Normal sonlu farkla hesaplanır; indeksli ağ dikişinde ışık kopmaz
      normal.set(
        heightAt(x - GRADIENT_EPS, z) - heightAt(x + GRADIENT_EPS, z),
        2 * GRADIENT_EPS,
        heightAt(x, z - GRADIENT_EPS) - heightAt(x, z + GRADIENT_EPS)
      ).normalize();
      normals.set([normal.x, normal.y, normal.z], v * 3);
      params.set([t, angle, y / VOLCANO_HEIGHT], v * 3);
      v += 1;
    }
  }
  for (let ring = 0; ring < RADIAL_RINGS; ring += 1) {
    for (let seg = 0; seg < ANGULAR_SEGMENTS; seg += 1) {
      const a = ring * (ANGULAR_SEGMENTS + 1) + seg;
      const b = a + ANGULAR_SEGMENTS + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("aParams", new THREE.BufferAttribute(params, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createVolcanoMountain(THREE, shared, eventId) {
  const seed = hashSeed(eventId) * 50;
  const geometry = createVolcanoGeometry(THREE, createHeightFunction(seed), seed);
  const material = new THREE.ShaderMaterial({
    vertexShader: VOLCANO_VERTEX,
    fragmentShader: VOLCANO_FRAGMENT,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSeed: { value: seed },
      uRise: { value: 0 },
      uBaseRadius: { value: VOLCANO_BASE_RADIUS },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = GLOBE_RADIUS - 0.0004;
  mesh.renderOrder = 2;
  return mesh;
}
