// Dünya katmanları: 4K gündüz/gece dokulu yüzey, bulutlar, atmosfer halesi, yıldız alanı

import { GLOBE_RADIUS } from "./geoMath.js";
import {
  ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX, CLOUD_FRAGMENT, EARTH_FRAGMENT,
  EARTH_VERTEX, STAR_FRAGMENT, STAR_VERTEX,
} from "./globeShaders.js";

const TEXTURE_BASE = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/planets";
const EARTH_TEXTURES = {
  day: `${TEXTURE_BASE}/earth_day_4096.jpg`,
  night: `${TEXTURE_BASE}/earth_night_4096.jpg`,
  surface: `${TEXTURE_BASE}/earth_bump_roughness_clouds_4096.jpg`,
};
const STAR_COUNT = 5000;

function loadTexture(THREE, loader, url, isColor, maxAnisotropy) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = maxAnisotropy;
        // Bulut katmanı yatayda kayar; tekrar olmazsa 180° boylamında kenar pikselleri çizgi gibi uzar
        texture.wrapS = THREE.RepeatWrapping;
        resolve(texture);
      },
      undefined,
      () => {
        console.warn("Dünya dokusu yüklenemedi, düz renk kullanılıyor:", url);
        resolve(null);
      }
    );
  });
}

function createFlatTexture(THREE, rgb) {
  const texture = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export async function loadEarthTextures(THREE, maxAnisotropy, onProgress) {
  const loader = new THREE.TextureLoader();
  let loaded = 0;
  const track = (promise) => promise.then((tex) => {
    loaded += 1;
    onProgress?.(Math.round((loaded / 3) * 100));
    return tex;
  });
  const [day, night, surface] = await Promise.all([
    track(loadTexture(THREE, loader, EARTH_TEXTURES.day, true, maxAnisotropy)),
    track(loadTexture(THREE, loader, EARTH_TEXTURES.night, true, maxAnisotropy)),
    track(loadTexture(THREE, loader, EARTH_TEXTURES.surface, false, maxAnisotropy)),
  ]);
  return {
    day: day || createFlatTexture(THREE, [30, 70, 130]),
    night: night || createFlatTexture(THREE, [0, 0, 0]),
    surface: surface || createFlatTexture(THREE, [0, 40, 0]),
  };
}

export function createEarthMeshes(THREE, textures, shared) {
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(GLOBE_RADIUS, 192, 96);

  const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
    uniforms: { uDayMap: { value: textures.day }, uNightMap: { value: textures.night }, uSurfaceMap: { value: textures.surface }, uSunDir: shared.uSunDir },
  }));
  group.add(earth);

  const clouds = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
    vertexShader: EARTH_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    uniforms: { uSurfaceMap: { value: textures.surface }, uSunDir: shared.uSunDir, uTime: shared.uTime },
    transparent: true,
    depthWrite: false,
  }));
  clouds.scale.setScalar(1.006);
  clouds.renderOrder = 1;
  group.add(clouds);

  const atmosphere = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    uniforms: { uSunDir: shared.uSunDir },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  atmosphere.scale.setScalar(1.12);
  group.add(atmosphere);

  return { group, earth };
}

export function createStarField(THREE, shared) {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const seeds = new Float32Array(STAR_COUNT);
  const palette = [[0.75, 0.82, 1.0], [1.0, 0.97, 0.92], [1.0, 0.85, 0.7]];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - u * u);
    positions.set([ring * Math.cos(theta) * 80, u * 80, ring * Math.sin(theta) * 80], i * 3);
    colors.set(palette[i % palette.length], i * 3);
    sizes[i] = 0.6 + Math.pow(Math.random(), 6) * 3.2;
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uTime: shared.uTime, uPixelRatio: shared.uPixelRatio },
    transparent: true,
    depthWrite: false,
  }));
}
