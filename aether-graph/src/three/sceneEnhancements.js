// Görüntü kalitesi: renk yönetimi ve ton eşleme, yıldız alanı, Güneş koronası.
// Modelin mesh/materyaline dokunmaz; sadece renderer ayarı ve sahneye ek nesne koyar.
import { calculateSeededRandom } from './flareMath.js';
import { createAdditiveShaderMaterial } from './solarFlareMeshes.js';
import {
  BILLBOARD_VERTEX_SHADER,
  CORONA_FRAGMENT_SHADER,
  STAR_FRAGMENT_SHADER,
  STAR_VERTEX_SHADER,
} from './solarFlareShaders.js';

const STAR_COUNT = 6000;
const STAR_SPHERE_RADIUS_UNITS = 1200;
const CORONA_SIZE_MULTIPLIER = 7;

// Yıldız renkleri tayf sınıfı karışımına yakın: çoğu beyaz-sarımsı, azı mavi ve turuncu
const STAR_TINTS = [
  [0.75, 0.82, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.95, 0.85],
  [1.0, 0.85, 0.65],
];

export function handleRendererQuality(threeLib, renderer) {
  renderer.outputColorSpace = threeLib.SRGBColorSpace;
  renderer.toneMapping = threeLib.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

/**
 * Tohumlu yıldız alanı: her açılışta aynı gökyüzü, kamera hareketinde paralaks yok (çok uzak).
 */
export function createStarfield(threeLib, pixelRatio) {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = calculateSeededRandom(i * 3.1 + 0.5);
    const v = calculateSeededRandom(i * 5.7 + 1.9);
    const theta_rad = u * Math.PI * 2;
    const cosPhi = 2 * v - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    positions[i * 3] = STAR_SPHERE_RADIUS_UNITS * sinPhi * Math.cos(theta_rad);
    positions[i * 3 + 1] = STAR_SPHERE_RADIUS_UNITS * cosPhi;
    positions[i * 3 + 2] = STAR_SPHERE_RADIUS_UNITS * sinPhi * Math.sin(theta_rad);

    const brightness = calculateSeededRandom(i * 9.3 + 4.2);
    const tint = STAR_TINTS[Math.floor(calculateSeededRandom(i * 2.3 + 7.1) * STAR_TINTS.length)];
    // Parlak yıldız az olsun: üstel dağılım
    const level = 0.25 + Math.pow(brightness, 6) * 0.75;
    colors[i * 3] = tint[0] * level;
    colors[i * 3 + 1] = tint[1] * level;
    colors[i * 3 + 2] = tint[2] * level;
    sizes[i] = 1.2 + Math.pow(brightness, 8) * 3.2;
  }

  const geometry = new threeLib.BufferGeometry();
  geometry.setAttribute('position', new threeLib.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new threeLib.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new threeLib.BufferAttribute(sizes, 1));
  const material = createAdditiveShaderMaterial(
    threeLib,
    { uPixelRatio: { value: pixelRatio } },
    STAR_VERTEX_SHADER,
    STAR_FRAGMENT_SHADER
  );
  const stars = new threeLib.Points(geometry, material);
  stars.name = 'STARFIELD';
  stars.frustumCulled = false;
  return stars;
}

/**
 * Güneş'in arkasında kameraya dönük korona parıltısı; disk kısmını Güneş modeli derinlikle örter.
 */
export function createSunCorona(threeLib, sun_radius_units) {
  const size_units = sun_radius_units * CORONA_SIZE_MULTIPLIER;
  const uniforms = {
    uTime: { value: 0 },
    uDiskRatio: { value: (sun_radius_units * 2) / size_units },
    uIntensity: { value: 0.5 },
    uSize: { value: size_units },
  };
  const material = createAdditiveShaderMaterial(threeLib, uniforms, BILLBOARD_VERTEX_SHADER, CORONA_FRAGMENT_SHADER);
  const mesh = new threeLib.Mesh(new threeLib.PlaneGeometry(1, 1), material);
  mesh.name = 'SUN_CORONA';
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/**
 * Bütün kalite eklerini kurar ve her karede çağrılacak güncelleme fonksiyonunu döner.
 */
export function createSceneEnhancements(threeLib, scene, renderer, sun_radius_units) {
  handleRendererQuality(threeLib, renderer);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  scene.add(createStarfield(threeLib, pixelRatio));
  const corona = createSunCorona(threeLib, sun_radius_units);
  scene.add(corona.mesh);

  return {
    handleEnhancementsFrame(elapsed_s) {
      corona.uniforms.uTime.value = elapsed_s;
    },
  };
}
