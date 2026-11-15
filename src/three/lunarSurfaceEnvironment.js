// Ay yüzey ortamı (Mare Tranquillitatis): düz regolit ovası, küçük kraterler, taşlar, atmosfersiz siyah gök,
// yıldızlar, ufukta Dünya ve alçak açılı sert Güneş ışığı. 1 birim = 1 metre. Dokular DOM'suz üretilir.
import { calculateSeededRandom } from './flareMath.js';

export const LUNAR_SKY_COLOR_HEX = 0x000000;
// Zemin geniş tutulur: yukarıdan bakınca modülün ovaya göre ne kadar küçük olduğu okunsun
export const LUNAR_GROUND_SIZE_M = 6000;
const GROUND_SEGMENTS = 192;
const GROUND_TEXTURE_PX = 256;
const GROUND_TILE_M = 24;
// Modülün çevresi tamamen düz; ayaklar zemine tam basar
export const LUNAR_FLAT_RADIUS_M = 22;
const FLAT_BLEND_RADIUS_M = 40;
const ROCK_COUNT = 420;
const ROCK_CLEAR_RADIUS_M = 9;
const ROCK_FIELD_RADIUS_M = 220;
const STAR_COUNT = 2200;
const SKY_RADIUS_M = 9000;
// Apollo 11 inişinde Güneş doğudan ~10-15° yükseklikteydi: uzun, keskin gölgeler
const SUN_DIR = normalize({ x: 0.92, y: 0.3, z: -0.25 });
const SUN_DISTANCE_M = 60;
const EARTH_DIR = normalize({ x: -0.35, y: 0.55, z: -0.76 });
// Dünya Ay'dan ~2° açısal çapta görünür
const EARTH_RADIUS_M = SKY_RADIUS_M * Math.tan((2 * Math.PI) / 180 / 2);

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// Modülün çevresinde kameradan seçilen küçük kraterler (x/z merkez, yarıçap, derinlik, kenar yükseltisi)
const CRATER_FEATURES = [
  { x_m: -48, z_m: 30, radius_m: 9, depth_m: 1.4, rim_m: 0.35 },
  { x_m: 55, z_m: -36, radius_m: 12, depth_m: 1.9, rim_m: 0.45 },
  { x_m: 26, z_m: 62, radius_m: 7, depth_m: 1.1, rim_m: 0.28 },
  { x_m: -70, z_m: -55, radius_m: 18, depth_m: 2.6, rim_m: 0.6 },
  { x_m: 95, z_m: 40, radius_m: 22, depth_m: 3.0, rim_m: 0.75 },
  { x_m: -20, z_m: -95, radius_m: 14, depth_m: 2.0, rim_m: 0.5 },
  { x_m: -140, z_m: 80, radius_m: 34, depth_m: 4.5, rim_m: 1.1 },
  { x_m: 180, z_m: -150, radius_m: 48, depth_m: 6.0, rim_m: 1.5 },
  { x_m: -260, z_m: -220, radius_m: 70, depth_m: 8.0, rim_m: 2.2 },
  { x_m: 420, z_m: 260, radius_m: 110, depth_m: 12, rim_m: 3.2 },
  { x_m: -650, z_m: 480, radius_m: 160, depth_m: 16, rim_m: 4.5 },
];

/**
 * (x_m, z_m) noktasındaki arazi yüksekliği (metre). Modül alanı düz (0 m), dışarıda hafif dalga ve kraterler.
 */
export function calculateLunarTerrainHeight_m(x_m, z_m) {
  if (!Number.isFinite(x_m) || !Number.isFinite(z_m)) return 0;
  const centerDist_m = Math.hypot(x_m, z_m);
  if (centerDist_m <= LUNAR_FLAT_RADIUS_M) return 0;
  const t = Math.min(1, (centerDist_m - LUNAR_FLAT_RADIUS_M) / (FLAT_BLEND_RADIUS_M - LUNAR_FLAT_RADIUS_M));
  const blend = t * t * (3 - 2 * t);

  // Mare (deniz) ovası: çok yumuşak dalgalanma, Mars'taki gibi tepe yok
  let height_m =
    Math.sin(x_m * 0.012 + 0.4) * Math.cos(z_m * 0.010 - 0.9) * 0.9 +
    Math.sin((x_m + z_m) * 0.031 + 1.7) * 0.22;

  for (let i = 0; i < CRATER_FEATURES.length; i += 1) {
    const c = CRATER_FEATURES[i];
    const q = Math.hypot(x_m - c.x_m, z_m - c.z_m) / c.radius_m;
    if (q < 1) {
      const bowl = 1 - q * q;
      height_m -= c.depth_m * bowl * bowl;
    }
    if (q > 0.85 && q < 1.5) {
      height_m += c.rim_m * Math.sin(((q - 0.85) / 0.65) * Math.PI);
    }
  }
  return height_m * blend;
}

function calculateRegolithTexels(size_px) {
  const data = new Uint8Array(size_px * size_px * 4);
  for (let y = 0; y < size_px; y += 1) {
    for (let x = 0; x < size_px; x += 1) {
      // Tohumlu ince tane + seyrek açık/koyu benekler (regolit tozu)
      const n = calculateSeededRandom(x * 12.9898 + y * 78.233);
      const speck = calculateSeededRandom(x * 3.17 + y * 91.7);
      let tone = 0.9 + (n - 0.5) * 0.16;
      if (speck > 0.985) tone += 0.18;
      else if (speck < 0.012) tone -= 0.2;
      const p = (y * size_px + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(150 * tone)));
      data[p] = g;
      data[p + 1] = Math.max(0, Math.min(255, Math.round(147 * tone)));
      data[p + 2] = Math.max(0, Math.min(255, Math.round(142 * tone)));
      data[p + 3] = 255;
    }
  }
  return data;
}

function calculateEdgeAlphaTexels(size_px) {
  const data = new Uint8Array(size_px * size_px * 4);
  const half = size_px / 2;
  for (let y = 0; y < size_px; y += 1) {
    for (let x = 0; x < size_px; x += 1) {
      const d = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const a = d < 0.7 ? 1 : Math.max(0, 1 - (d - 0.7) / 0.28);
      const p = (y * size_px + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = Math.round(a * 255);
      data[p + 3] = 255;
    }
  }
  return data;
}

function createDataTexture(THREE, data, size_px) {
  const texture = new THREE.DataTexture(data, size_px, size_px, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function createGround(THREE) {
  const map = createDataTexture(THREE, calculateRegolithTexels(GROUND_TEXTURE_PX), GROUND_TEXTURE_PX);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const repeat = LUNAR_GROUND_SIZE_M / GROUND_TILE_M;
  map.repeat.set(repeat, repeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  const alphaMap = createDataTexture(THREE, calculateEdgeAlphaTexels(128), 128);
  alphaMap.magFilter = THREE.LinearFilter;

  const geometry = new THREE.PlaneGeometry(LUNAR_GROUND_SIZE_M, LUNAR_GROUND_SIZE_M, GROUND_SEGMENTS, GROUND_SEGMENTS);
  const positions = geometry.attributes?.position;
  if (positions && typeof positions.getX === 'function') {
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i += 1) {
      const x_m = positions.getX(i);
      const z_m = -positions.getY(i);
      const h_m = calculateLunarTerrainHeight_m(x_m, z_m);
      positions.setZ(i, h_m);
      const wave = Math.sin(x_m * 0.004 + 0.8) * Math.cos(z_m * 0.0035) * 0.06;
      const tone = Math.max(0.7, Math.min(1.12, 0.97 + wave + Math.max(-0.15, Math.min(0.1, h_m * 0.03))));
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = tone;
    }
    positions.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (typeof geometry.computeVertexNormals === 'function') geometry.computeVertexNormals();
  }
  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map, alphaMap, vertexColors: Boolean(positions), transparent: true, roughness: 1, metalness: 0 })
  );
  ground.name = 'LUNAR_GROUND';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function createRockField(THREE) {
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8f8c87, roughness: 0.95, metalness: 0 }),
    ROCK_COUNT
  );
  rocks.name = 'LUNAR_ROCKS';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let k = 0; k < ROCK_COUNT; k += 1) {
    const r = (n) => calculateSeededRandom((k + 1) * 7.77 + n);
    const radius_m = ROCK_CLEAR_RADIUS_M + Math.sqrt(r(1)) * (ROCK_FIELD_RADIUS_M - ROCK_CLEAR_RADIUS_M);
    const angle_rad = r(2) * Math.PI * 2;
    const x_m = Math.cos(angle_rad) * radius_m;
    const z_m = Math.sin(angle_rad) * radius_m;
    const isBoulder = k % 11 === 0 && radius_m > 30;
    const size_m = isBoulder ? 0.5 + r(3) * 0.9 : Math.pow(r(3), 2.4) * 0.3 + 0.04;
    p.set(x_m, calculateLunarTerrainHeight_m(x_m, z_m) + size_m * 0.15, z_m);
    q.setFromEuler(e.set(r(4) * 3, r(5) * 3, r(6) * 3));
    s.set(size_m * (0.8 + r(7) * 0.6), size_m * (0.45 + r(8) * 0.4), size_m * (0.8 + r(9) * 0.6));
    rocks.setMatrixAt(k, m.compose(p, q, s));
  }
  rocks.castShadow = false;
  rocks.receiveShadow = true;
  return rocks;
}

function createStarField(THREE) {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = calculateSeededRandom(i * 1.618 + 3.3);
    const v = calculateSeededRandom(i * 2.718 + 9.1);
    const theta = u * Math.PI * 2;
    // Sadece ufkun üstü; ufkun altındaki yıldızlar zeminin altında kalırdı
    const y = 0.02 + v * 0.98;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * SKY_RADIUS_M;
    positions[i * 3 + 1] = y * SKY_RADIUS_M;
    positions[i * 3 + 2] = Math.sin(theta) * r * SKY_RADIUS_M;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, depthWrite: false, fog: false })
  );
  stars.name = 'LUNAR_STARS';
  return stars;
}

function createEarthInSky(THREE) {
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_M, 48, 24),
    new THREE.MeshStandardMaterial({ color: 0x3f7fd8, emissive: 0x0b1f3d, roughness: 0.7, metalness: 0 })
  );
  earth.name = 'LUNAR_SKY_EARTH';
  earth.position.set(EARTH_DIR.x * SKY_RADIUS_M * 0.95, EARTH_DIR.y * SKY_RADIUS_M * 0.95, EARTH_DIR.z * SKY_RADIUS_M * 0.95);
  return earth;
}

function createSunLight(THREE) {
  const sun = new THREE.DirectionalLight(0xfffaf0, 3.4);
  sun.name = 'LUNAR_SURFACE_SUN';
  sun.position.set(SUN_DIR.x * SUN_DISTANCE_M, SUN_DIR.y * SUN_DISTANCE_M, SUN_DIR.z * SUN_DISTANCE_M);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  return sun;
}

// Modülün altın folyosu yansıyacak bir şey görsün diye gri regolit / siyah gök ortam haritası
function createSkyEnvironment(THREE, renderer) {
  if (typeof THREE.PMREMGenerator !== 'function' || !renderer?.capabilities) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(0x1a1a22, 0x8a8782, 1.0));
  const target = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return target;
}

export function createLunarSurfaceEnvironment(THREE, scene, renderer) {
  scene.background = new THREE.Color(LUNAR_SKY_COLOR_HEX);
  scene.fog = null;
  const envTarget = createSkyEnvironment(THREE, renderer);
  if (envTarget) scene.environment = envTarget.texture;

  // Atmosfer yok: gölgeler neredeyse siyah, sadece zemin yansıması ve Dünya ışığı kadar dolgu
  scene.add(new THREE.HemisphereLight(0x2a3346, 0x55524d, 0.32));
  const sun = createSunLight(THREE);
  scene.add(sun, sun.target);
  scene.add(createGround(THREE), createRockField(THREE), createStarField(THREE), createEarthInSky(THREE));

  return {
    sun,
    handleEnvironmentFrame(focusPosition) {
      sun.position.set(
        focusPosition.x + SUN_DIR.x * SUN_DISTANCE_M,
        SUN_DIR.y * SUN_DISTANCE_M,
        focusPosition.z + SUN_DIR.z * SUN_DISTANCE_M
      );
      sun.target.position.set(focusPosition.x, 0, focusPosition.z);
    },
    destroyLunarSurfaceEnvironment() {
      if (sun.shadow && typeof sun.shadow.dispose === 'function') sun.shadow.dispose();
      if (envTarget) envTarget.dispose();
      scene.environment = null;
    },
  };
}
