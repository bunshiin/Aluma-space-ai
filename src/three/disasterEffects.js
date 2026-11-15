// Seçilen afet için katmanlı efekt kurar: yüzey başlığı + GPU parçacıklar + işaret ışını + hedef halkası
// Renkler HDR (>1) verilir ki bloom sadece efektleri parlatsın, Dünya dokusu parlamasın

import { calculateSurfaceNormal } from "./geoMath.js";
import { getDisasterStyle } from "./disasterStyles.js";
import { addVolcano } from "./volcanoEffect.js";
import { createBeacon, createParticleLayer, createSurfaceCap, disposeObjectTree } from "./effectLayers.js";
import {
  FROST_FRAGMENT, HAZE_FRAGMENT, HEAT_FRAGMENT, RIPPLE_FRAGMENT,
  SHOCKWAVE_FRAGMENT, TARGET_RING_FRAGMENT, VORTEX_FRAGMENT,
} from "./surfaceShaders.js";

function createHexRgb(hex, gain = 1) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255 * gain, ((value >> 8) & 255) / 255 * gain, (value & 255) / 255 * gain];
}

const SMOKE_COLORS = [[0.3, 0.26, 0.23], [0.2, 0.19, 0.19], [0.11, 0.11, 0.12]];
const FIRE_COLORS = [[3.2, 2.5, 1.3], [2.8, 0.95, 0.18], [0.55, 0.07, 0.02]];

function addWildfire(THREE, shared, group) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: HEAT_FRAGMENT, angular_radius: 0.05, color: [1.5, 0.45, 0.07], color_alt: [0.25, 0.02, 0.0],
    intensity: 0.75, additive: true,
  }));
  group.add(createParticleLayer(THREE, shared, {
    mode: "SMOKE", count: 340, life: 5.5, size: 0.03, height: 0.15, spread: 0.035, wind: [0.04, 0.02],
    colors: SMOKE_COLORS, opacity: 0.42, puffy: true, fade_in: 0.15, render_order: 3,
  }));
  group.add(createParticleLayer(THREE, shared, {
    mode: "FLAMES", count: 320, life: 1.3, size: 0.017, height: 0.03, spread: 0.04,
    colors: FIRE_COLORS, additive: true, opacity: 0.13, render_order: 4,
  }));
}

function addStorm(THREE, shared, group) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: VORTEX_FRAGMENT, angular_radius: 0.21, altitude: 1.014, color: [1.05, 1.05, 1.08],
    color_alt: [0.42, 0.5, 0.62], spin: 0.55,
  }));
}

function addQuake(THREE, shared, group, colorHex) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: SHOCKWAVE_FRAGMENT, angular_radius: 0.16, color: createHexRgb(colorHex, 2.2),
    color_alt: [3.0, 1.9, 1.3], additive: true,
  }));
}

function addFlood(THREE, shared, group, colorHex) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: RIPPLE_FRAGMENT, angular_radius: 0.11, color: createHexRgb(colorHex, 1.8),
    color_alt: [0.02, 0.14, 0.4],
  }));
}

function addIce(THREE, shared, group, withSnow) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: FROST_FRAGMENT, angular_radius: withSnow ? 0.1 : 0.07, color: [0.95, 1.0, 1.05],
    color_alt: [0.45, 0.62, 0.75],
  }));
  if (!withSnow) return;
  group.add(createParticleLayer(THREE, shared, {
    mode: "SNOW", count: 420, life: 4.0, size: 0.006, height: 0.07, spread: 0.09,
    colors: [[2, 2, 2.2], [1.8, 1.9, 2.2], [1.5, 1.7, 2.0]], additive: true,
  }));
}

function addHaze(THREE, shared, group, colorHex) {
  group.add(createSurfaceCap(THREE, shared, {
    fragment: HAZE_FRAGMENT, angular_radius: 0.12, color: createHexRgb(colorHex, 1.3),
    color_alt: createHexRgb(colorHex, 0.35),
  }));
}

// Zamanla değişen efektler (volkan yükselişi) bir animatör döner; diğerleri sabit shader ile çalışır
function addEffectBody(THREE, shared, group, style, eventId) {
  if (style.kind === "VOLCANO") return addVolcano(THREE, shared, group, eventId);
  if (style.kind === "WILDFIRE") addWildfire(THREE, shared, group);
  else if (style.kind === "STORM") addStorm(THREE, shared, group);
  else if (style.kind === "QUAKE") addQuake(THREE, shared, group, style.color_hex);
  else if (style.kind === "FLOOD") addFlood(THREE, shared, group, style.color_hex);
  else if (style.kind === "ICE") addIce(THREE, shared, group, false);
  else if (style.kind === "SNOW") addIce(THREE, shared, group, true);
  else addHaze(THREE, shared, group, style.color_hex);
}

// shared: { uTime, uPixelRatio, uViewScale, uSunDir } — küreyle ortak uniform nesneleri
export function createDisasterEffect(THREE, shared, event) {
  const style = getDisasterStyle(event?.category);
  const group = new THREE.Group();
  const normal = calculateSurfaceNormal(event?.coordinates?.latitude_deg, event?.coordinates?.longitude_deg);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(normal.x, normal.y, normal.z));

  const animator = addEffectBody(THREE, shared, group, style, event?.id);
  const startS = shared.uTime.value;
  // Volkanda dağın kendisi işarettir; yüksek ışın gayzer izlenimi verirdi
  if (style.kind !== "VOLCANO") group.add(createBeacon(THREE, shared, createHexRgb(style.color_hex, 1.6)));
  group.add(createSurfaceCap(THREE, shared, {
    fragment: TARGET_RING_FRAGMENT, angular_radius: style.kind === "VOLCANO" ? 0.1 : 0.07, altitude: 1.016,
    color: createHexRgb(style.color_hex, 1.8), additive: true, render_order: 6,
  }));

  return {
    object: group,
    update() {
      animator?.update(shared.uTime.value - startS);
    },
    // Kamera titremesi genliği (dünya birimi), efekt yoksa 0
    getShake() {
      return animator?.getShake(shared.uTime.value - startS) || 0;
    },
    destroy() {
      group.removeFromParent();
      disposeObjectTree(group);
    },
  };
}
