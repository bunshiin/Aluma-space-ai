// Sözleşme kapısı: model_url'e göre doğru 3D sahneyi kurar. Her kol aynı { destroy() } biçimini döner.
import { createSolarSystemScene } from './solarSystemScene.js';
import { createPlanetComparisonScene } from './planetComparisonScene.js';
import { createEarthEventScene } from './earthEventScene.js';

// Karşılaştırma isteği UI'dan container niteliğiyle gelir ki sözleşme imzası değişmesin
function parseComparisonRequestAttr(container) {
  const raw = container?.getAttribute?.('data-comparison-request');
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 3D görev, Güneş Sistemi, gezegen karşılaştırma ya da EONET Dünya küresi sahnesini kurar.
 * Sözleşme: create3DMissionScene(container, modelUrl, onProgress) -> { destroy() }
 */
export async function create3DMissionScene(container, modelUrl, onProgress, deps = null) {
  if (!container || typeof container !== 'object') {
    console.warn('create3DMissionScene: geçersiz container, yedek boş sahne dönüldü.');
    return { destroy() {} };
  }
  if (modelUrl === 'PLANET_COMPARISON') {
    return createPlanetComparisonScene(container, parseComparisonRequestAttr(container), onProgress, deps);
  }
  if (modelUrl === 'EARTH_EVENTS') {
    return createEarthEventScene(container, onProgress, deps);
  }
  return createSolarSystemScene(container, modelUrl, onProgress, deps);
}
