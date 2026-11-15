// Işık gecikmesi sahnesinin geçici nesneleri: kılavuz çizgi, ışık paketleri, odak ve varış halkaları.
// Gezegen mesh'lerine dokunulmaz; her şey ayrı bir kök grupta durur ve birlikte dispose edilir.
import { SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';

export const LIGHT_DELAY_COLORS = Object.freeze({
  SIGNAL: 0x38bdf8,
  ECHO: 0xfacc15,
  WAVE: 0xf97316,
});

// Dalga modunda paketler arası mesafe (yol uzunluğunun oranı)
export const PACKET_SPACING = 0.07;

const PACKET_CORE_RADIUS_UNITS = 0.16;
const PACKET_HALO_RADIUS_UNITS = 0.42;
const PACKET_TAPER = 0.13; // arkadaki paketler küçülsün, akış yönü okunabilsin
// Halka gövde yarıçapının bu katında durur; model yüzeyiyle çakışıp titremesin
const FOCUS_RING_GAP = 1.7;
const FOCUS_RING_BREATH = 0.06;
const FOCUS_RING_BREATH_RAD_S = 2.4;
const BURST_START_SCALE = 1.2;
const BURST_GROWTH_SCALE = 2.4;

export function getBodyRadius_units(bodyId) {
  return SOLAR_SYSTEM_BODIES.find((cfg) => cfg.id === bodyId)?.target_radius_units ?? 1;
}

function handleMaterialColor(material, color_hex) {
  if (material?.color && typeof material.color.setHex === 'function') {
    material.color.setHex(color_hex);
  }
}

/**
 * Sinyal hattı için geçici nesneleri kurar ve sahneye ekler.
 */
export function createLightDelayMeshes(THREE, scene, { packet_count, color_hex, line_opacity }) {
  const geometries = [];
  const materials = [];
  const track = (list, item) => {
    list.push(item);
    return item;
  };
  const createGlowMaterial = (color, opacity) =>
    track(
      materials,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );

  const root = new THREE.Group();
  root.name = 'light-delay-root';

  const linePositions = new Float32Array(6);
  const lineGeometry = track(geometries, new THREE.BufferGeometry());
  const lineAttribute = new THREE.BufferAttribute(linePositions, 3);
  lineGeometry.setAttribute('position', lineAttribute);
  const lineMaterial = track(
    materials,
    new THREE.LineBasicMaterial({
      color: color_hex,
      transparent: true,
      opacity: line_opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const guideLine = new THREE.Line(lineGeometry, lineMaterial);
  // Uçlar her karede değiştiği için sınır küresi eskir; kırpma çizgiyi yanlışlıkla gizlemesin
  guideLine.frustumCulled = false;
  root.add(guideLine);

  const coreGeometry = track(geometries, new THREE.SphereGeometry(PACKET_CORE_RADIUS_UNITS, 16, 12));
  const haloGeometry = track(geometries, new THREE.SphereGeometry(PACKET_HALO_RADIUS_UNITS, 16, 12));
  const coreMaterial = createGlowMaterial(color_hex, 1);
  const haloMaterial = createGlowMaterial(color_hex, 0.28);
  const packets = Array.from({ length: packet_count }, (_, index) => {
    const packet = new THREE.Group();
    packet.add(new THREE.Mesh(coreGeometry, coreMaterial));
    packet.add(new THREE.Mesh(haloGeometry, haloMaterial));
    const size = Math.max(0.35, 1 - index * PACKET_TAPER);
    packet.scale.set(size, size, size);
    packet.visible = false;
    root.add(packet);
    return packet;
  });

  const ringGeometry = track(geometries, new THREE.RingGeometry(1, 1.06, 64));
  const createRing = (color) => {
    const ring = new THREE.Mesh(ringGeometry, createGlowMaterial(color, 0));
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    return ring;
  };
  const sourceRing = createRing(color_hex);
  const targetRing = createRing(color_hex);
  const burstRing = createRing(color_hex);
  burstRing.visible = false;

  scene.add(root);

  function handleLinePoints(from, to) {
    linePositions[0] = from.x;
    linePositions[1] = from.y;
    linePositions[2] = from.z;
    linePositions[3] = to.x;
    linePositions[4] = to.y;
    linePositions[5] = to.z;
    lineAttribute.needsUpdate = true;
  }

  function handleSignalColor(next_color_hex) {
    handleMaterialColor(coreMaterial, next_color_hex);
    handleMaterialColor(haloMaterial, next_color_hex);
    handleMaterialColor(lineMaterial, next_color_hex);
  }

  /** Öndeki paket `lead` oranında, arkadakiler PACKET_SPACING geriden gelir; yol dışındakiler gizlenir. */
  function handlePacketPositions(from, to, lead) {
    packets.forEach((packet, index) => {
      const progress = lead - index * PACKET_SPACING;
      packet.visible = progress >= 0 && progress <= 1;
      if (packet.visible) {
        packet.position.set(
          from.x + (to.x - from.x) * progress,
          from.y + (to.y - from.y) * progress,
          from.z + (to.z - from.z) * progress
        );
      }
    });
  }

  function handleRingBreath(ring, pos, radius_units, time_s, phase_rad, fade) {
    const wave = Math.sin(time_s * FOCUS_RING_BREATH_RAD_S + phase_rad);
    const size = radius_units * FOCUS_RING_GAP * (1 + FOCUS_RING_BREATH * wave);
    ring.position.copy(pos);
    ring.scale.set(size, size, size);
    ring.material.opacity = (0.35 + 0.2 * (0.5 + 0.5 * wave)) * fade;
  }

  function handleFocusRings(sourcePos, sourceRadius_units, targetPos, targetRadius_units, time_s, fade) {
    handleRingBreath(sourceRing, sourcePos, sourceRadius_units, time_s, 0, fade);
    handleRingBreath(targetRing, targetPos, targetRadius_units, time_s, Math.PI / 2, fade);
  }

  function handleBurstColor(burst_color_hex) {
    handleMaterialColor(burstRing.material, burst_color_hex);
  }

  /** k: 0 -> 1 arası ilerleme; halka genişlerken söner. */
  function handleBurstFrame(pos, radius_units, k) {
    if (k >= 1) {
      burstRing.visible = false;
      return;
    }
    const size = radius_units * (BURST_START_SCALE + BURST_GROWTH_SCALE * k);
    burstRing.visible = true;
    burstRing.position.copy(pos);
    burstRing.scale.set(size, size, size);
    burstRing.material.opacity = 0.9 * (1 - k) * (1 - k);
  }

  function destroyLightDelayMeshes() {
    if (typeof scene.remove === 'function') {
      scene.remove(root);
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    geometries.length = 0;
    materials.length = 0;
  }

  return {
    root,
    packet_count,
    handleLinePoints,
    handleSignalColor,
    handlePacketPositions,
    handleFocusRings,
    handleBurstColor,
    handleBurstFrame,
    destroyLightDelayMeshes,
  };
}
