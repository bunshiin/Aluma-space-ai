// Sahne fabrikasının kurulum parçaları: renderer, yörünge kontrolü ve model yükleyicileri.
// Fabrika 300 satır sınırında kalsın ve Mars yüzeyi aynı yükleyiciyi paylaşsın diye ayrıldı.

import { DRACO_DECODER_PATH } from './threeDependencies.js';

// Büyük ekranlarda 4x MSAA + HalfFloat + Bloom bant genişliği darboğazı yapmasın diye piksel bütçesi
const MAX_RENDER_PIXELS = 1920 * 1080;

/**
 * Ekran boyutuna göre uyarlamalı piksel oranı hesaplar; büyük ekranda FPS düşüşünü önler.
 */
export function calculateAdaptivePixelRatio(width_px, height_px, devicePixelRatio = 1) {
  const safeDpr = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, 2)
    : 1;
  const w_px = typeof width_px === 'number' && width_px > 0 ? width_px : 800;
  const h_px = typeof height_px === 'number' && height_px > 0 ? height_px : 600;
  const area_px = w_px * h_px;
  if (area_px <= 1280 * 720) {
    return safeDpr;
  }
  const budgetRatio = Math.sqrt(MAX_RENDER_PIXELS / area_px);
  return Math.max(1, Math.min(safeDpr, Number(budgetRatio.toFixed(2))));
}

export function createSceneRenderer(threeLib, container, width_px, height_px) {
  const renderer = new threeLib.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (typeof renderer.setPixelRatio === 'function' && globalThis.devicePixelRatio) {
    renderer.setPixelRatio(calculateAdaptivePixelRatio(width_px, height_px, globalThis.devicePixelRatio));
  }
  renderer.setSize(width_px, height_px);
  if (renderer.domElement && typeof container.appendChild === 'function') {
    container.appendChild(renderer.domElement);
  }
  return renderer;
}

export function createSceneControls(OrbitControls, camera, domElement) {
  if (!OrbitControls) {
    return null;
  }
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.1;
  controls.maxDistance = 600;
  return controls;
}

export function createModelLoaders(GLTFLoader, DRACOLoader) {
  const dracoLoader = DRACOLoader ? new DRACOLoader() : null;
  if (dracoLoader && typeof dracoLoader.setDecoderPath === 'function') {
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  }
  const gltfLoader = new GLTFLoader();
  if (dracoLoader && typeof gltfLoader.setDRACOLoader === 'function') {
    gltfLoader.setDRACOLoader(dracoLoader);
  }
  return { gltfLoader, dracoLoader };
}
