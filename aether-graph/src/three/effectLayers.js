// Afet efektlerinin yapı taşları: yüzey başlığı (cap), GPU parçacık katmanı, işaret ışını

import { GLOBE_RADIUS } from "./geoMath.js";
import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from "./particleShaders.js";
import { BEAM_FRAGMENT, BEAM_VERTEX, CAP_VERTEX } from "./surfaceShaders.js";

function toVector3(THREE, rgb) {
  return new THREE.Vector3(rgb[0], rgb[1], rgb[2]);
}

// Düz düzlem küre üzerinde kenarlardan gömülür; bu yüzden yüzeyi saran küresel başlık kullanılır
export function createSurfaceCap(THREE, shared, options) {
  const angularRadius = options.angular_radius;
  const radius = GLOBE_RADIUS * (options.altitude || 1.008);
  const geometry = new THREE.SphereGeometry(radius, 96, 24, 0, Math.PI * 2, 0, angularRadius);
  const material = new THREE.ShaderMaterial({
    vertexShader: CAP_VERTEX,
    fragmentShader: options.fragment,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uCapRadius: { value: radius * Math.sin(angularRadius) },
      uColor: { value: toVector3(THREE, options.color) },
      uColorAlt: { value: toVector3(THREE, options.color_alt || options.color) },
      uIntensity: { value: options.intensity ?? 1 },
      uSpin: { value: options.spin ?? 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = options.render_order ?? 2;
  return mesh;
}

function createSeedAttribute(THREE, count) {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  return new THREE.BufferAttribute(seeds, 4);
}

export function createParticleLayer(THREE, shared, options) {
  const geometry = new THREE.BufferGeometry();
  // Konum shader'da hesaplanır; position sadece çizim sayısı ve sınır kutusu içindir
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(options.count * 3), 3));
  geometry.setAttribute("aSeed", createSeedAttribute(THREE, options.count));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), options.height * 2 + options.spread * 2);

  const defines = { [`MODE_${options.mode}`]: "" };
  if (options.puffy) defines.PUFFY = "";
  // Saydam (normal karışımlı) duman Güneş'e göre aydınlanır; ışık saçan alev/kıvılcım aydınlanmaz
  if (!options.additive) defines.SUN_LIT = "";
  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    defines,
    uniforms: {
      uTime: shared.uTime,
      uPixelRatio: shared.uPixelRatio,
      uViewScale: shared.uViewScale,
      uSunDir: shared.uSunDir,
      uLife: { value: options.life },
      uSize: { value: options.size },
      uHeight: { value: options.height },
      uSpread: { value: options.spread },
      uWind: { value: new THREE.Vector2(...(options.wind || [0, 0])) },
      uColorStart: { value: toVector3(THREE, options.colors[0]) },
      uColorMid: { value: toVector3(THREE, options.colors[1]) },
      uColorEnd: { value: toVector3(THREE, options.colors[2]) },
      uOpacity: { value: options.opacity ?? 1 },
      uIntensity: { value: options.intensity ?? 1 },
      uFadeIn: { value: options.fade_in ?? 0.08 },
    },
    transparent: true,
    depthWrite: false,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.position.y = GLOBE_RADIUS + (options.base_height || 0);
  points.renderOrder = options.render_order ?? 3;
  return points;
}

export function createBeacon(THREE, shared, colorRgb) {
  const height = 0.3;
  const geometry = new THREE.CylinderGeometry(0.0035, 0.011, height, 32, 1, true);
  const material = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: toVector3(THREE, colorRgb) },
      uIntensity: { value: 1.1 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(geometry, material);
  beam.position.y = GLOBE_RADIUS + height / 2;
  beam.renderOrder = 4;
  return beam;
}

export function disposeObjectTree(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((m) => m?.dispose?.());
  });
}
