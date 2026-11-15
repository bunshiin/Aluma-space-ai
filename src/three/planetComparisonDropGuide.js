// Astronotun altındaki kesik çizgi: ayaktan zemine kalan düşme mesafesini gösterir, astronot indikçe kısalır
import { calculateStageUnitsFromM } from './planetComparisonConfig.js';

const GUIDE_COLOR_HEX = 0x7dd3fc;
const DASH_WIDTH_UNITS = 0.07;
const DASH_FILL_RATIO = 0.6;
const MAX_DASHES = 16;
// Çizgi aralığı "okunur" metre değerlerinden seçilir: 1 m, 2 m, 5 m, 10 m...
const STEP_CANDIDATES_M = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const TARGET_MAX_DASHES = 12;

/**
 * Düşme yüksekliğine göre çizgi aralığını (m) seçer; ekranda en fazla ~12 çizgi olur.
 */
export function calculateDropGuideStep_m(height_m) {
  if (typeof height_m !== 'number' || !Number.isFinite(height_m) || height_m <= 0) return 1;
  const step = STEP_CANDIDATES_M.find((candidate) => height_m / candidate <= TARGET_MAX_DASHES);
  return step || height_m / TARGET_MAX_DASHES;
}

/**
 * Bir astronotun altına kesik çizgi kurar. handleDropGuideUpdate(feet_units) zeminden ayağa kadar olan
 * kısmı çizer; ayağın altında kalan çizgiler görünür, üstündekiler gizlenir.
 */
export function createDropGuide(THREE, parentGroup, x_units, height_m) {
  const step_m = calculateDropGuideStep_m(height_m);
  const step_units = calculateStageUnitsFromM(step_m, height_m);
  const dash_units = step_units * DASH_FILL_RATIO;
  const count = Math.min(MAX_DASHES, Math.ceil(height_m / step_m));

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: GUIDE_COLOR_HEX, transparent: true, opacity: 0.9 });
  const dashes = Array.from({ length: count }, (_, index) => {
    const dash = new THREE.Mesh(geometry, material);
    dash.name = 'COMPARISON_DROP_DASH';
    dash.visible = false;
    parentGroup.add(dash);
    return { mesh: dash, bottom_units: index * step_units };
  });

  function handleDropGuideUpdate(feet_units) {
    dashes.forEach(({ mesh, bottom_units }) => {
      const visibleLength_units = Math.min(dash_units, feet_units - bottom_units);
      if (visibleLength_units <= 0.02) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.scale.set(DASH_WIDTH_UNITS, visibleLength_units, DASH_WIDTH_UNITS);
      mesh.position.set(x_units, bottom_units + visibleLength_units / 2, 0);
    });
  }

  return { handleDropGuideUpdate, step_m, dash_count: count };
}
