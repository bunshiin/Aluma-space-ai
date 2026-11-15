// Işık gecikmesi (LIGHT_DELAY) sinyal simülasyonu: canlı gezegen konumları arasında ışık paketi akıtır.
// Fizik değerleri sadece spacePhysics.js'ten gelir; buradaki süreler yalnızca görsel tempodur.
import { calculateCmeArrival, calculateLightDelay } from '../physics/spacePhysics.js';
import { calculateRadFromDeg } from './solarSystemConfig.js';
import {
  createLightDelayMeshes,
  getBodyRadius_units,
  LIGHT_DELAY_COLORS,
  PACKET_SPACING,
} from './lightDelayMeshes.js';
import { calculateVisualDuration_s, getLightDelayRequest, LIGHT_DELAY_PHASES } from './lightDelayRequest.js';

const WAVE_PACKET_COUNT = 5;
const BURST_S = 0.9;
const HOLD_AFTER_S = 1.6;
const RING_FADE_IN_S = 0.6;
const CAMERA_ELEVATION_RAD = calculateRadFromDeg(24);
// 45° FOV'da iki cismi kenarlardan pay bırakarak sığdırır
const CAMERA_FRAME_MULTIPLIER = 1.25;
const MIN_CAMERA_DISTANCE_UNITS = 7;
const CAMERA_EASE_PER_S = 1.6;

/**
 * Mevcut Güneş Sistemi sahnesine takılan ışık gecikmesi kontrolcüsü.
 */
export function createLightDelayController(THREE, scene, cameraController, getBodyMap) {
  let run = null;
  let last_phase = LIGHT_DELAY_PHASES.IDLE;
  const sourcePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const idealCamPos = new THREE.Vector3();
  const shotPos = new THREE.Vector3();
  const shotLook = new THREE.Vector3();

  function getStatusDetail(phase) {
    const detail = {
      source: run.source,
      target: run.target,
      mode: run.mode,
      delay_s: run.delay_s,
      round_trip_s: run.round_trip_s,
      phase,
    };
    if (run.speed_kms !== null) {
      detail.speed_kms = run.speed_kms;
      detail.cme_arrival_h = run.cme_arrival_h;
    }
    return detail;
  }

  function handleStatusDispatch(phase) {
    last_phase = phase;
    if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') {
      return;
    }
    globalThis.dispatchEvent(new CustomEvent('ag:light-delay-status', { detail: getStatusDetail(phase) }));
  }

  function handlePhaseChange(phase) {
    run.phase = phase;
    run.phase_s = 0;
    run.has_hit = false;
    handleStatusDispatch(phase);
  }

  function handleClearLightDelay() {
    if (!run) {
      return;
    }
    const had_camera_shot = run.has_camera_shot;
    run.meshes?.destroyLightDelayMeshes();
    handleStatusDispatch(LIGHT_DELAY_PHASES.CLEARED);
    run = null;
    if (had_camera_shot) {
      cameraController?.handleEndCinematic?.();
    }
  }

  function handleTriggerLightDelay(detail) {
    handleClearLightDelay();
    const request = getLightDelayRequest(detail);
    const { delay_s, round_trip_s } = calculateLightDelay(request.source, request.target, request.mode);
    const is_wave = request.speed_kms !== null;
    const cme_arrival_h = is_wave ? calculateCmeArrival(request.speed_kms) : 0;
    const is_round_trip = request.mode === 'round-trip';
    const real_s = is_wave ? cme_arrival_h * 3600 : delay_s;
    const color_hex = is_wave ? LIGHT_DELAY_COLORS.WAVE : LIGHT_DELAY_COLORS.SIGNAL;

    run = {
      ...request,
      delay_s,
      round_trip_s,
      cme_arrival_h,
      color_hex,
      signal_color_hex: color_hex,
      leg_s: calculateVisualDuration_s(real_s) / (is_round_trip ? 2 : 1),
      source_radius_units: getBodyRadius_units(request.source),
      target_radius_units: getBodyRadius_units(request.target),
      phase: null,
      phase_s: 0,
      time_s: 0,
      burst_s: -1,
      burst_body: null,
      has_hit: false,
      has_camera_shot: false,
      has_perp: false,
      perp_x: 0,
      perp_z: 1,
      meshes: null,
    };

    if (request.source === request.target) {
      // Aynı cisim: ışın yok, sadece o cisme odaklan (delay_s fizikten 0 gelir)
      cameraController?.handleFocusTarget?.(request.source);
      handleStatusDispatch(LIGHT_DELAY_PHASES.FOCUSED);
      run = null;
      return;
    }

    run.meshes = createLightDelayMeshes(THREE, scene, {
      packet_count: is_wave ? WAVE_PACKET_COUNT : 1,
      color_hex,
      line_opacity: is_wave ? 0.7 : 0.3,
    });
    const start = cameraController?.handleBeginCinematic?.();
    if (start) {
      shotPos.set(start.position.x, start.position.y, start.position.z);
      shotLook.set(start.target.x, start.target.y, start.target.z);
      run.has_camera_shot = true;
    }
    handlePhaseChange(LIGHT_DELAY_PHASES.OUTBOUND);
  }

  // İki cismi birlikte kadraja alır: orta noktaya bakar, hattın yanından ve düzlemin hafif üstünden
  function handleCameraShot(dt_s) {
    if (!run.has_camera_shot) {
      return;
    }
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dz = targetPos.z - sourcePos.z;
    midPos.set(sourcePos.x + dx / 2, sourcePos.y + dy / 2, sourcePos.z + dz / 2);
    const flat_units = Math.hypot(dx, dz);
    let perp_x = flat_units > 1e-6 ? -dz / flat_units : 0;
    let perp_z = flat_units > 1e-6 ? dx / flat_units : 1;
    // Kamera hattın hangi yanındaysa orada kalsın; gezegenler dönerken taraf değiştirip savrulmasın
    const ref_x = run.has_perp ? run.perp_x : shotPos.x - midPos.x;
    const ref_z = run.has_perp ? run.perp_z : shotPos.z - midPos.z;
    if (perp_x * ref_x + perp_z * ref_z < 0) {
      perp_x = -perp_x;
      perp_z = -perp_z;
    }
    run.perp_x = perp_x;
    run.perp_z = perp_z;
    run.has_perp = true;

    const dist_units = Math.max(MIN_CAMERA_DISTANCE_UNITS, Math.hypot(dx, dy, dz) * CAMERA_FRAME_MULTIPLIER);
    const flatDist_units = Math.cos(CAMERA_ELEVATION_RAD) * dist_units;
    idealCamPos.set(
      midPos.x + perp_x * flatDist_units,
      midPos.y + Math.sin(CAMERA_ELEVATION_RAD) * dist_units,
      midPos.z + perp_z * flatDist_units
    );
    const ease = 1 - Math.exp(-CAMERA_EASE_PER_S * dt_s);
    shotPos.lerp(idealCamPos, ease);
    shotLook.lerp(midPos, ease);
    // Kullanıcı sürüklediyse kamera kontrolcüsü bu çağrıyı yok sayar, kontrol kullanıcıda kalır
    cameraController.handleCinematicShot(shotPos, shotLook);
  }

  function handleEffects(dt_s) {
    const { meshes } = run;
    const fade = Math.min(1, run.time_s / RING_FADE_IN_S);
    meshes.handleFocusRings(sourcePos, run.source_radius_units, targetPos, run.target_radius_units, run.time_s, fade);
    if (run.burst_s < 0) {
      return;
    }
    run.burst_s += dt_s;
    const is_at_source = run.burst_body === run.source;
    const k = run.burst_s / BURST_S;
    meshes.handleBurstFrame(
      is_at_source ? sourcePos : targetPos,
      is_at_source ? run.source_radius_units : run.target_radius_units,
      k
    );
    if (k >= 1) {
      run.burst_s = -1;
    }
  }

  function handleBurstStart(bodyId) {
    run.burst_s = 0;
    run.burst_body = bodyId;
    // Gidiş-dönüşte yansıma ve dönüş parıltısı amber, diğerlerinde sinyal rengi
    run.meshes.handleBurstColor(run.mode === 'round-trip' ? LIGHT_DELAY_COLORS.ECHO : run.color_hex);
  }

  function handleSignalProgress() {
    const { meshes } = run;
    meshes.handleLinePoints(sourcePos, targetPos);
    const is_return = run.phase === LIGHT_DELAY_PHASES.RETURN;
    const is_moving = run.phase === LIGHT_DELAY_PHASES.OUTBOUND || is_return;
    if (!is_moving) {
      meshes.handlePacketPositions(sourcePos, targetPos, -1);
      if (run.phase_s >= HOLD_AFTER_S) {
        handleClearLightDelay();
      }
      return;
    }

    const progress = Math.min(run.phase_s / run.leg_s, 1);
    // Dalga modunda son paket de varınca bacak biter; tek pakette lead === progress
    const lead = progress * (1 + (meshes.packet_count - 1) * PACKET_SPACING);
    meshes.handlePacketPositions(is_return ? targetPos : sourcePos, is_return ? sourcePos : targetPos, lead);
    if (lead >= 1 && !run.has_hit) {
      run.has_hit = true;
      handleBurstStart(is_return ? run.source : run.target);
    }
    if (progress < 1) {
      return;
    }
    if (!is_return && run.mode === 'round-trip') {
      run.signal_color_hex = LIGHT_DELAY_COLORS.ECHO;
      meshes.handleSignalColor(LIGHT_DELAY_COLORS.ECHO);
      handlePhaseChange(LIGHT_DELAY_PHASES.RETURN);
      return;
    }
    handlePhaseChange(is_return ? LIGHT_DELAY_PHASES.COMPLETE : LIGHT_DELAY_PHASES.ARRIVED);
  }

  /**
   * Gerçek zamanlı delta (sn) ile ilerler; yörünge hızlandırması sinyali hızlandırmaz.
   */
  function handleLightDelayFrameUpdate(delta_s) {
    if (!run || !run.meshes) {
      return;
    }
    const bodyMap = typeof getBodyMap === 'function' ? getBodyMap() : null;
    const sourceNode = bodyMap?.get?.(run.source);
    const targetNode = bodyMap?.get?.(run.target);
    if (!sourceNode || !targetNode) {
      // Gezegenler henüz yüklenmedi; animasyon da onları beklesin
      run.meshes.root.visible = false;
      return;
    }
    run.meshes.root.visible = true;
    sourceNode.getWorldPosition(sourcePos);
    targetNode.getWorldPosition(targetPos);

    const dt_s = typeof delta_s === 'number' && Number.isFinite(delta_s) && delta_s > 0 ? delta_s : 0;
    run.time_s += dt_s;
    run.phase_s += dt_s;
    handleCameraShot(dt_s);
    handleEffects(dt_s);
    handleSignalProgress();
  }

  function getLightDelayState() {
    if (!run) {
      return { phase: last_phase };
    }
    return {
      phase: run.phase,
      source: run.source,
      target: run.target,
      mode: run.mode,
      delay_s: run.delay_s,
      round_trip_s: run.round_trip_s,
      visual_leg_s: run.leg_s,
      signal_color_hex: run.signal_color_hex,
    };
  }

  function destroyLightDelayController() {
    run?.meshes?.destroyLightDelayMeshes();
    run = null;
    last_phase = LIGHT_DELAY_PHASES.CLEARED;
  }

  return {
    handleTriggerLightDelay,
    handleClearLightDelay,
    handleLightDelayFrameUpdate,
    getLightDelayState,
    destroyLightDelayController,
  };
}
