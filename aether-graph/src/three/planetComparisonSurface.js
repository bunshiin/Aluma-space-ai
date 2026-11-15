// Mod B yüzey sahnesi: iki gezegen zemini, gökyüzü panelleri ve fizik değerleriyle düşen iki astronot
import { calculateFallRemainingHeight } from '../physics/spacePhysics.js';
import { destroySceneResources, handleModelNormalization } from './solarSystemBuilder.js';
import {
  ASTRONAUT_HEIGHT_UNITS,
  ASTRONAUT_MODEL_URL,
  COMPARISON_TIMING,
  calculateStageUnitsFromM,
  getSurfacePalette,
} from './planetComparisonConfig.js';
import { calculateClamp01, calculateSmootherStep } from './planetComparisonEasing.js';
import { createGroundPlatform, PLATFORM_RADIUS_UNITS } from './planetComparisonGround.js';
import { createDropGuide } from './planetComparisonDropGuide.js';
import { buildSurfaceLabelEntries } from './planetComparisonLabels.js';

const STAGE_HALF_SPACING_UNITS = 6;
// İki platformu ve etiketlerini 16:9'dan dar pencerede de sığdıran en yakın kamera mesafesi
const SURFACE_MIN_CAMERA_DISTANCE_UNITS = 33;

// Döngü: tepede bekle → düş → yerde bekle → yumuşakça yukarı çık (ışınlanma yok)
export const HANG_S = 0.9;
const HOLD_S = 1.4;
const RISE_S = 1.3;
// Havadayken astronot hafifçe sallanır; yere değince durur
const SWAY_SPEED = 1.7;
const SWAY_AMPLITUDE_RAD = 0.07;

/**
 * Düşme döngüsünün t anındaki durumunu verir. Kalan yükseklik spacePhysics'ten gelir;
 * yüksek yerçekimli taraf yere önce iner, diğeri inene kadar yerde bekler. Negatif süre başlangıç gecikmesidir.
 */
export function calculateFallCycleState(cycle_elapsed_s, comparison) {
  const height_m = comparison?.height_m > 0 ? comparison.height_m : 0;
  const primaryFall_s = comparison?.primary_fall_time_s || 0;
  const secondaryFall_s = comparison?.secondary_fall_time_s || 0;
  const fall_s = Math.max(primaryFall_s, secondaryFall_s);
  const cycle_s = HANG_S + fall_s + HOLD_S + RISE_S;
  const hang = { phase: 'HANG', cycle_s, primary_height_m: height_m, secondary_height_m: height_m };
  if (cycle_elapsed_s < 0) return hang;

  const t_s = cycle_elapsed_s % cycle_s;
  const fallElapsed_s = t_s - HANG_S;
  if (fallElapsed_s <= 0) return hang;
  if (fallElapsed_s <= fall_s + HOLD_S) {
    // İniş anı calculateFallTime'dan gelir; yuvarlama yüzünden milimetrelik havada kalma olmasın
    const getHeight_m = (landing_s, target) =>
      fallElapsed_s >= landing_s ? 0 : calculateFallRemainingHeight(height_m, fallElapsed_s, target);
    return {
      phase: fallElapsed_s <= fall_s ? 'FALL' : 'HOLD',
      cycle_s,
      primary_height_m: getHeight_m(primaryFall_s, comparison.primary_object),
      secondary_height_m: getHeight_m(secondaryFall_s, comparison.secondary_object),
    };
  }
  const rise = calculateSmootherStep((fallElapsed_s - fall_s - HOLD_S) / RISE_S);
  return { phase: 'RISE', cycle_s, primary_height_m: height_m * rise, secondary_height_m: height_m * rise };
}

function createSkyPanel(THREE, bodyId, x_units, panelHeight_units) {
  const palette = getSurfacePalette(bodyId);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATFORM_RADIUS_UNITS * 2.1, panelHeight_units),
    new THREE.MeshBasicMaterial({ color: palette.sky_hex, transparent: true, opacity: 0.28 })
  );
  panel.position.set(x_units, panelHeight_units / 2 - 0.5, -PLATFORM_RADIUS_UNITS);
  return panel;
}

/**
 * advanced_crew_escape_suit.glb tüm materyallerinde transmission: 1 ile geliyor (dışa aktarım hatası);
 * cam gibi arkadaki koyu uzayı gösterip siyah silüet yapıyor. Kullanıcı (Mami) onayıyla yüklerken kapatılır.
 */
export function handleAstronautMaterialFix(modelRoot) {
  modelRoot.traverse?.((node) => {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      if (mat && typeof mat.transmission === 'number' && mat.transmission > 0) {
        mat.transmission = 0;
        mat.needsUpdate = true;
      }
    });
  });
}

async function handleAstronautLoad(THREE, gltfLoader, pivot, isStale, onLoaded) {
  try {
    const gltf = await gltfLoader.loadAsync(ASTRONAUT_MODEL_URL);
    const modelRoot = gltf?.scene || gltf?.scenes?.[0];
    if (!modelRoot) return;
    if (isStale()) {
      destroySceneResources(modelRoot);
      return;
    }
    handleAstronautMaterialFix(modelRoot);
    // Kök düğümdeki 90° X dönüşüyle model zaten dik gelir (dünya kutusu 0.89 × 2.00 × 0.55); ek dönüş gerekmez
    handleModelNormalization(THREE, modelRoot, ASTRONAUT_HEIGHT_UNITS / 2);
    // Model sırtı kameraya dönük geliyor; normalizasyondan sonra ayrı bir grupla 180° çevrilir ki yüzü bize baksın
    const facingGroup = new THREE.Group();
    facingGroup.name = 'ASTRONAUT_FACING';
    facingGroup.rotation.y = Math.PI;
    facingGroup.add(modelRoot);
    pivot.add(facingGroup);
  } catch (err) {
    console.warn('Astronot modeli yüklenemedi:', err);
  } finally {
    onLoaded();
  }
}

/**
 * Yüzey sahnesini gruba kurar ve iki astronot kopyasını yükler.
 * Dönüş: { load, handleSurfaceFrame(delta_s), handleFallReset(), handleGroundTextures(map), getLabelEntries(state), camera_* }
 */
export function createSurfaceStage(THREE, gltfLoader, parentGroup, comparison, isStale, onLoaded) {
  const drop_units = calculateStageUnitsFromM(comparison.height_m, comparison.height_m);
  const sides = [
    { body_id: comparison.primary_object, x_units: -STAGE_HALF_SPACING_UNITS, key: 'PRIMARY', height_key: 'primary_height_m', sway_phase: 0 },
    { body_id: comparison.secondary_object, x_units: STAGE_HALF_SPACING_UNITS, key: 'SECONDARY', height_key: 'secondary_height_m', sway_phase: 2.1 },
  ];

  sides.forEach((side) => {
    side.ground = createGroundPlatform(THREE, side.body_id, side.x_units);
    parentGroup.add(side.ground.mesh);
    parentGroup.add(createSkyPanel(THREE, side.body_id, side.x_units, drop_units + ASTRONAUT_HEIGHT_UNITS + 4));
    side.guide = createDropGuide(THREE, parentGroup, side.x_units, comparison.height_m);
    side.pivot = new THREE.Group();
    side.pivot.name = `${side.key}_ASTRONAUT`;
    parentGroup.add(side.pivot);
  });

  let cycleElapsed_s = 0;
  let total_s = 0;
  function handleSurfaceFrame(delta_s) {
    cycleElapsed_s += delta_s;
    total_s += delta_s;
    const state = calculateFallCycleState(cycleElapsed_s, comparison);
    sides.forEach((side) => {
      const height_units = calculateStageUnitsFromM(state[side.height_key], comparison.height_m);
      side.pivot.position.set(side.x_units, height_units + ASTRONAUT_HEIGHT_UNITS / 2, 0);
      side.guide.handleDropGuideUpdate(height_units);
      const airborne = calculateClamp01(height_units / 0.5);
      side.pivot.rotation.z = Math.sin(total_s * SWAY_SPEED + side.sway_phase) * SWAY_AMPLITUDE_RAD * airborne;
    });
    return state;
  }
  function handleFallReset() {
    cycleElapsed_s = -COMPARISON_TIMING.surface_start_delay_s;
    handleSurfaceFrame(0);
  }
  handleFallReset();

  function handleGroundTextures(groundTextures) {
    sides.forEach((side) => side.ground.handleGroundTexture(groundTextures?.get(side.body_id)));
  }
  function getLabelEntries(state) {
    return buildSurfaceLabelEntries(sides, comparison, state);
  }

  const load = Promise.all(sides.map((side) => handleAstronautLoad(THREE, gltfLoader, side.pivot, isStale, onLoaded)));
  const centerY_units = (drop_units + ASTRONAUT_HEIGHT_UNITS) / 2;
  return {
    load,
    handleSurfaceFrame,
    handleFallReset,
    handleGroundTextures,
    getLabelEntries,
    // Hedef biraz aşağıda: platformların öne taşan kenarı ve altındaki etiketler kadraja girsin
    camera_target_units: [0, centerY_units - 3.2, 0],
    camera_position_units: [0, centerY_units + 1.5, Math.max(SURFACE_MIN_CAMERA_DISTANCE_UNITS, drop_units * 2.4)],
  };
}
