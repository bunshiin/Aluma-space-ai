// Mars yüzey ortamı: tepeler, krater çukurları, tohumlu zemin dokusu, taş/kaya alanı ve ışıklar.
// Dokular DOM'suz (DataTexture) üretilir; aynı tohum her girişte aynı zemini verir.
import { calculateSeededRandom } from './flareMath.js';

export const MARS_SKY_COLOR_HEX = 0xb8764e;
const GROUND_SIZE_M = 240;
const GROUND_TEXTURE_PX = 256;
const GROUND_REPEAT = 16;
const GROUND_SEGMENTS = 96;
const ROCK_COUNT = 240;
const ROCK_CLEAR_RADIUS_M = 4.2;
const ROCK_FIELD_RADIUS_M = 78;
const FLAT_CENTER_RADIUS_M = 8.0;
const FLAT_BLEND_RADIUS_M = 13.5;
const SUN_OFFSET_M = [6, 10, 4];
const FOG_BASE_NEAR_M = 58;
const FOG_BASE_FAR_M = 130;

// Rover çevresinde kameradan net seçilen krater çukurları (merkez x/z, yarıçap, derinlik, kenar yükseltisi)
const CRATER_FEATURES = [
  { x_m: -13, z_m: 11, radius_m: 5.8, depth_m: 1.35, rim_m: 0.32 },
  { x_m: 15, z_m: -10, radius_m: 6.5, depth_m: 1.55, rim_m: 0.36 },
  { x_m: -8, z_m: -15, radius_m: 4.8, depth_m: 1.15, rim_m: 0.26 },
  { x_m: 19, z_m: 16, radius_m: 8.2, depth_m: 1.85, rim_m: 0.42 },
  { x_m: -25, z_m: -6, radius_m: 9.5, depth_m: 2.15, rim_m: 0.48 },
  { x_m: 5, z_m: 24, radius_m: 7.2, depth_m: 1.65, rim_m: 0.35 },
  { x_m: -22, z_m: 26, radius_m: 11.0, depth_m: 2.35, rim_m: 0.52 },
  { x_m: 31, z_m: -24, radius_m: 12.5, depth_m: 2.55, rim_m: 0.58 },
];

// Orta ve uzak çevredeki Mars tepeleri ve sırtları (merkez x/z, yarıçap, yükseklik)
const HILL_FEATURES = [
  { x_m: -28, z_m: 19, radius_m: 20, height_m: 4.6 },
  { x_m: 32, z_m: 12, radius_m: 24, height_m: 5.8 },
  { x_m: 16, z_m: -30, radius_m: 22, height_m: 4.8 },
  { x_m: -34, z_m: -28, radius_m: 26, height_m: 6.5 },
  { x_m: -2, z_m: 42, radius_m: 28, height_m: 6.2 },
  { x_m: -46, z_m: 3, radius_m: 25, height_m: 5.6 },
  { x_m: 48, z_m: -15, radius_m: 27, height_m: 6.4 },
  { x_m: 36, z_m: 38, radius_m: 30, height_m: 7.2 },
];

/**
 * Verilen (x_m, z_m) yüzey noktasındaki arazi yüksekliğini (metre) hesaplar.
 * Merkezdeki rover sürüş/matkap alanı düz (0 m) tutulur; dışarıda tepeler ve çukurlar yer alır.
 */
export function calculateTerrainHeight_m(x_m, z_m) {
  if (!Number.isFinite(x_m) || !Number.isFinite(z_m)) return 0;
  const centerDist_m = Math.hypot(x_m, z_m);
  if (centerDist_m <= FLAT_CENTER_RADIUS_M) return 0;

  const t = Math.min(1, Math.max(0, (centerDist_m - FLAT_CENTER_RADIUS_M) / (FLAT_BLEND_RADIUS_M - FLAT_CENTER_RADIUS_M)));
  const blend = t * t * (3 - 2 * t);

  let height_m =
    Math.sin(x_m * 0.065 + 0.7) * Math.cos(z_m * 0.058 - 0.4) * 0.75 +
    Math.sin((x_m - z_m) * 0.11 + 1.4) * 0.32;

  for (let i = 0; i < HILL_FEATURES.length; i += 1) {
    const hill = HILL_FEATURES[i];
    const d_m = Math.hypot(x_m - hill.x_m, z_m - hill.z_m);
    if (d_m < hill.radius_m) {
      const q = 1 - (d_m / hill.radius_m) ** 2;
      height_m += hill.height_m * q * q;
    }
  }

  for (let i = 0; i < CRATER_FEATURES.length; i += 1) {
    const crater = CRATER_FEATURES[i];
    const d_m = Math.hypot(x_m - crater.x_m, z_m - crater.z_m);
    const q = d_m / crater.radius_m;
    if (q < 1.0) {
      const bowl = 1 - q * q;
      height_m -= crater.depth_m * bowl * bowl;
    }
    if (q > 0.82 && q < 1.42) {
      const rimPhase = ((q - 0.82) / 0.6) * Math.PI;
      height_m += crater.rim_m * Math.sin(rimPhase);
    }
  }

  return height_m * blend;
}

function calculateGroundTexels(size_px) {
  const data = new Uint8Array(size_px * size_px * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < size_px; y += 1) {
    const v = (y / size_px) * tau;
    for (let x = 0; x < size_px; x += 1) {
      const u = (x / size_px) * tau;
      const dune =
        Math.sin(u * 2 + Math.cos(v) * 0.8) * 0.032 +
        Math.cos(v * 3 - Math.sin(u * 2) * 0.6) * 0.024 +
        Math.sin((u + v) * 4 + 1.1) * 0.015;
      const tone = 0.98 + dune;
      const p = (y * size_px + x) * 4;
      data[p] = Math.min(255, Math.round(156 * tone));
      data[p + 1] = Math.min(255, Math.round(88 * tone));
      data[p + 2] = Math.min(255, Math.round(54 * tone));
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
      const a = d < 0.65 ? 1 : Math.max(0, 1 - (d - 0.65) / 0.33);
      const p = (y * size_px + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = Math.round(a * 255);
      data[p + 3] = 255;
    }
  }
  return data;
}

/**
 * Zeminin topografik yüksekliğine göre köşe renklerini ve vertex yüksekliklerini uygular.
 * Çukurların tabanı daha koyu kızıl-kahve, tepelerin sırtı daha sıcak/açık kum tonu alır.
 */
function applyTerrainReliefAndTint(positions) {
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const x_m = positions.getX(i);
    const planeY_m = positions.getY(i);
    const z_m = -planeY_m;
    const height_m = calculateTerrainHeight_m(x_m, z_m);
    if (typeof positions.setZ === 'function') {
      positions.setZ(i, height_m);
    } else if (positions.array) {
      positions.array[i * 3 + 2] = height_m;
    }
    const wave =
      Math.sin(x_m * 0.045 + 1.3) * Math.cos(planeY_m * 0.038 + 0.4) * 0.04 +
      Math.sin((x_m + planeY_m) * 0.09 + 2.1) * 0.025;
    const heightShade = Math.max(-0.18, Math.min(0.14, height_m * 0.045));
    const tone = Math.max(0.72, Math.min(1.12, 0.96 + wave + heightShade));
    colors[i * 3] = tone;
    colors[i * 3 + 1] = tone * (height_m < -0.15 ? 0.92 : 0.98);
    colors[i * 3 + 2] = tone * (height_m < -0.15 ? 0.88 : 0.95);
  }
  positions.needsUpdate = true;
  return colors;
}

function createDataTexture(threeLib, data, size_px) {
  const texture = new threeLib.DataTexture(data, size_px, size_px, threeLib.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function createGround(threeLib) {
  const map = createDataTexture(threeLib, calculateGroundTexels(GROUND_TEXTURE_PX), GROUND_TEXTURE_PX);
  map.wrapS = threeLib.RepeatWrapping;
  map.wrapT = threeLib.RepeatWrapping;
  map.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
  map.colorSpace = threeLib.SRGBColorSpace;
  map.magFilter = threeLib.LinearFilter;
  map.minFilter = threeLib.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  const alphaMap = createDataTexture(threeLib, calculateEdgeAlphaTexels(128), 128);
  alphaMap.magFilter = threeLib.LinearFilter;
  const geometry = new threeLib.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M, GROUND_SEGMENTS, GROUND_SEGMENTS);
  const positions = geometry.attributes?.position;
  if (positions && typeof positions.getX === 'function') {
    geometry.setAttribute('color', new threeLib.BufferAttribute(applyTerrainReliefAndTint(positions), 3));
    if (typeof geometry.computeVertexNormals === 'function') {
      geometry.computeVertexNormals();
    }
  }
  const ground = new threeLib.Mesh(
    geometry,
    new threeLib.MeshStandardMaterial({ map, alphaMap, vertexColors: Boolean(positions), transparent: true, roughness: 0.96, metalness: 0 })
  );
  ground.name = 'MARS_GROUND';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function createRockField(threeLib) {
  const rocks = new threeLib.InstancedMesh(
    new threeLib.DodecahedronGeometry(1, 1),
    new threeLib.MeshStandardMaterial({ color: 0x9b5634, roughness: 0.92, metalness: 0 }),
    ROCK_COUNT
  );
  rocks.name = 'MARS_ROCKS';
  const m = new threeLib.Matrix4();
  const q = new threeLib.Quaternion();
  const s = new threeLib.Vector3();
  const p = new threeLib.Vector3();
  const e = new threeLib.Euler();
  for (let k = 0; k < ROCK_COUNT; k += 1) {
    const r = (n) => calculateSeededRandom((k + 1) * 13.37 + n);
    const radius_m = ROCK_CLEAR_RADIUS_M + Math.sqrt(r(1)) * (ROCK_FIELD_RADIUS_M - ROCK_CLEAR_RADIUS_M);
    const angle_rad = r(2) * Math.PI * 2;
    const x_m = Math.cos(angle_rad) * radius_m;
    const z_m = Math.sin(angle_rad) * radius_m;
    // Bazı taşlar iri kaya (boulder), çoğunluğu orta/küçük yüzey taşı olacak şekilde dağılır
    const isBoulder = k % 9 === 0 && radius_m > 9;
    const size_m = isBoulder ? 0.35 + r(3) * 0.55 : Math.pow(r(3), 2.2) * 0.34 + 0.05;
    const groundY_m = calculateTerrainHeight_m(x_m, z_m);
    p.set(x_m, groundY_m + size_m * 0.16, z_m);
    q.setFromEuler(e.set(r(4) * 3, r(5) * 3, r(6) * 3));
    s.set(size_m * (0.85 + r(7) * 0.55), size_m * (0.48 + r(8) * 0.42), size_m * (0.85 + r(9) * 0.55));
    rocks.setMatrixAt(k, m.compose(p, q, s));
  }
  // 240 taşın her karede gölge haritasına çizilmemesi büyük ekranda ciddi FPS kazandırır
  rocks.castShadow = false;
  rocks.receiveShadow = true;
  return rocks;
}

function createSunLight(threeLib) {
  const sun = new threeLib.DirectionalLight(0xffead2, 2.15);
  sun.name = 'MARS_SURFACE_SUN';
  sun.position.set(...SUN_OFFSET_M);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 35 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  return sun;
}

function createSkyEnvironment(threeLib, renderer) {
  if (typeof threeLib.PMREMGenerator !== 'function' || !renderer?.capabilities) {
    return null;
  }
  const pmrem = new threeLib.PMREMGenerator(renderer);
  const envScene = new threeLib.Scene();
  envScene.add(new threeLib.HemisphereLight(0xf0c296, 0x5a2e18, 1.0));
  const dome = new threeLib.Mesh(
    new threeLib.SphereGeometry(10, 24, 12),
    new threeLib.MeshBasicMaterial({ color: MARS_SKY_COLOR_HEX, side: threeLib.BackSide })
  );
  envScene.add(dome);
  const target = pmrem.fromScene(envScene, 0.04);
  dome.geometry.dispose();
  dome.material.dispose();
  pmrem.dispose();
  return target;
}

export function createMarsSurfaceEnvironment(threeLib, scene, renderer) {
  scene.background = new threeLib.Color(MARS_SKY_COLOR_HEX);
  scene.fog = new threeLib.Fog(MARS_SKY_COLOR_HEX, FOG_BASE_NEAR_M, FOG_BASE_FAR_M);
  const envTarget = createSkyEnvironment(threeLib, renderer);
  if (envTarget) scene.environment = envTarget.texture;

  scene.add(new threeLib.HemisphereLight(0xe8b48a, 0x4a2412, 0.68));
  const sun = createSunLight(threeLib);
  scene.add(sun, sun.target);
  scene.add(createGround(threeLib), createRockField(threeLib));

  return {
    sun,
    handleEnvironmentFrame(roverPosition, cameraHeight_m) {
      sun.position.set(roverPosition.x + SUN_OFFSET_M[0], SUN_OFFSET_M[1], roverPosition.z + SUN_OFFSET_M[2]);
      sun.target.position.set(roverPosition.x, 0, roverPosition.z);
      const extra_m = Math.max(0, cameraHeight_m - 8);
      scene.fog.near = FOG_BASE_NEAR_M + extra_m * 3.5;
      scene.fog.far = FOG_BASE_FAR_M + extra_m * 18;
    },
    destroyMarsSurfaceEnvironment() {
      if (sun.shadow && typeof sun.shadow.dispose === 'function') sun.shadow.dispose();
      if (envTarget) envTarget.dispose();
      scene.environment = null;
    },
  };
}
