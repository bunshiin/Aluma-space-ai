// Karşılaştırma sahnesinin sabit kurulum parçaları: yıldız alanı, renderer ve model yükleyiciler
import { DRACO_DECODER_PATH } from './threeDependencies.js';

const STAR_COUNT = 1400;
const STAR_SPHERE_UNITS = 600;

export function createStarfield(THREE) {
  // Sabit tohumlu üreteç: her açılışta aynı yıldız dizilimi
  let seed = 1337;
  const nextRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const theta_rad = nextRandom() * Math.PI * 2;
    const cosPhi = nextRandom() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    positions[i * 3] = STAR_SPHERE_UNITS * sinPhi * Math.cos(theta_rad);
    positions[i * 3 + 1] = STAR_SPHERE_UNITS * cosPhi;
    positions[i * 3 + 2] = STAR_SPHERE_UNITS * sinPhi * Math.sin(theta_rad);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
}

export function createComparisonRenderer(THREE, container, width_px, height_px) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width_px, height_px);
  if (typeof renderer.setPixelRatio === 'function' && globalThis.devicePixelRatio) {
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  }
  if (renderer.domElement && typeof container.appendChild === 'function') {
    container.appendChild(renderer.domElement);
  }
  return renderer;
}

export function createComparisonLoaders(GLTFLoader, DRACOLoader) {
  const dracoLoader = DRACOLoader ? new DRACOLoader() : null;
  if (dracoLoader && typeof dracoLoader.setDecoderPath === 'function') {
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  }
  const gltfLoader = new GLTFLoader();
  if (dracoLoader && typeof gltfLoader.setDRACOLoader === 'function') {
    gltfLoader.setDRACOLoader(dracoLoader);
  }
  return { dracoLoader, gltfLoader };
}
