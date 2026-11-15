// Volkan sahnesi: dağ yerden yükselir, ardından kraterden duman ve kıvılcım başlar; yükselirken kamera hafif titrer

import { GLOBE_RADIUS } from "./geoMath.js";
import { HEAT_FRAGMENT } from "./surfaceShaders.js";
import { createParticleLayer, createSurfaceCap } from "./effectLayers.js";
import { VOLCANO_CRATER_HEIGHT, createVolcanoMountain } from "./volcanoMesh.js";

// Kamera olaya varana kadar beklenir ki kullanıcı yükselişi baştan görsün
const RISE_DELAY_S = 1.5;
const RISE_DURATION_S = 3.6;
const SHAKE_TAIL_S = 0.8;
const SHAKE_AMPLITUDE = 0.0032;
const EMISSION_START = 0.55;

const ASH_COLORS = [[0.34, 0.24, 0.19], [0.19, 0.18, 0.18], [0.09, 0.09, 0.1]];
const SMOKE_COLORS = [[0.3, 0.26, 0.23], [0.2, 0.19, 0.19], [0.11, 0.11, 0.12]];
const DUST_COLORS = [[0.36, 0.3, 0.24], [0.26, 0.22, 0.19], [0.14, 0.13, 0.12]];
const FIRE_COLORS = [[3.2, 2.5, 1.3], [2.8, 0.95, 0.18], [0.55, 0.07, 0.02]];
const SPARK_COLORS = [[3.0, 2.2, 1.2], [2.4, 0.8, 0.15], [0.6, 0.1, 0.03]];

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// Duman/kıvılcım katmanı: krater yükseldikçe yukarı çıkar, dağ tamamlanmaya yaklaşırken belirir
function createEmitter(THREE, shared, group, options, { followsCrater }) {
  const points = createParticleLayer(THREE, shared, { ...options, base_height: 0 });
  group.add(points);
  return { points, base_opacity: options.opacity ?? 1, followsCrater, crater_offset: options.base_height || 0 };
}

export function addVolcano(THREE, shared, group, eventId) {
  const mountain = createVolcanoMountain(THREE, shared, eventId);
  const riseUniform = mountain.material.uniforms.uRise;
  group.add(mountain);
  group.add(createSurfaceCap(THREE, shared, {
    fragment: HEAT_FRAGMENT, angular_radius: 0.1, color: [1.5, 0.45, 0.07], color_alt: [0.25, 0.02, 0.0],
    intensity: 0.28, additive: true, altitude: 1.0015,
  }));

  const emitters = [
    createEmitter(THREE, shared, group, {
      mode: "PLUME", count: 420, life: 7.5, size: 0.026, height: 0.06, spread: 0.05, wind: [1.15, 0.45],
      base_height: VOLCANO_CRATER_HEIGHT, colors: ASH_COLORS, opacity: 0.8, puffy: true, fade_in: 0.12, render_order: 3,
    }, { followsCrater: true }),
    createEmitter(THREE, shared, group, {
      mode: "SMOKE", count: 160, life: 6, size: 0.02, height: 0.026, spread: 0.022, wind: [1.5, 0.6],
      base_height: VOLCANO_CRATER_HEIGHT, colors: SMOKE_COLORS, opacity: 0.4, puffy: true, fade_in: 0.2, render_order: 3,
    }, { followsCrater: true }),
    createEmitter(THREE, shared, group, {
      mode: "FLAMES", count: 80, life: 1.1, size: 0.016, height: 0.012, spread: 0.012,
      base_height: VOLCANO_CRATER_HEIGHT - 0.004, colors: FIRE_COLORS, additive: true, opacity: 0.3, render_order: 4,
    }, { followsCrater: true }),
    createEmitter(THREE, shared, group, {
      mode: "SPARKS", count: 220, life: 1.9, size: 0.007, height: 0.04, spread: 0.05,
      base_height: VOLCANO_CRATER_HEIGHT, colors: SPARK_COLORS, additive: true, opacity: 0.55, render_order: 5,
    }, { followsCrater: true }),
  ];
  // Yükselirken yerden kalkan toz: sadece yükseliş boyunca görünür
  const dust = createEmitter(THREE, shared, group, {
    mode: "SMOKE", count: 200, life: 3.2, size: 0.02, height: 0.03, spread: 0.075, wind: [0.5, 0.2],
    base_height: 0.002, colors: DUST_COLORS, opacity: 0.55, puffy: true, fade_in: 0.1, render_order: 3,
  }, { followsCrater: false });

  function setEmitterState(emitter, rise, amount) {
    emitter.points.visible = amount > 0.001;
    emitter.points.position.y = GLOBE_RADIUS + emitter.crater_offset * (emitter.followsCrater ? rise : 1);
    emitter.points.material.uniforms.uOpacity.value = emitter.base_opacity * amount;
  }

  return {
    // elapsedS: efekt kurulduğundan beri geçen süre
    update(elapsedS) {
      const progress = Math.min(Math.max((elapsedS - RISE_DELAY_S) / RISE_DURATION_S, 0), 1);
      const rise = smoothstep(0, 1, progress);
      riseUniform.value = rise;
      mountain.visible = rise > 0.001;
      const emission = smoothstep(EMISSION_START, 1, rise);
      emitters.forEach((e) => setEmitterState(e, rise, emission));
      const dustAmount = smoothstep(0.02, 0.2, rise) * (1 - smoothstep(0.75, 1, rise));
      setEmitterState(dust, rise, dustAmount);
    },
    // 0..1: yükseliş sırasında şiddetlenir, bitince kuyruk süresinde söner
    getShake(elapsedS) {
      const t = elapsedS - RISE_DELAY_S;
      if (t < 0 || t > RISE_DURATION_S + SHAKE_TAIL_S) return 0;
      const ramp = smoothstep(0, 0.6, t);
      const fade = 1 - smoothstep(RISE_DURATION_S - 0.4, RISE_DURATION_S + SHAKE_TAIL_S, t);
      return ramp * fade * SHAKE_AMPLITUDE;
    },
  };
}
