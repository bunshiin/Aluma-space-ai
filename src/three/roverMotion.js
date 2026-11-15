// Perseverance görev hareketi: sürüş, yerinde dönüş, mast taraması ve kol ile numune alma.
// THREE'ye bağımlı değil; açılar radyan, mesafe metre. Rig bu durumu her karede node'lara uygular.

// Kol pozları [taban azimut, omuz, dirsek, bilek, taret]; gövde ve zeminle çarpışmayacak şekilde ölçüldü
const ARM_PARK_RAD = [0, 0, 0, 0, 0];
const ARM_UNSTOW_RAD = [0, -0.45, 1.3, 0.2, 0];
const ARM_HOVER_RAD = [0, -0.45, 2.55, 0.6, 0];
const ARM_CONTACT_RAD = [0, -0.3, 2.7, 0.3, 0];
const ARM_WATSON_RAD = [0, -0.2, 2.6, -0.6, -1.6];

export const ARM_KEYFRAMES = [
  { t_s: 0, pose_rad: ARM_PARK_RAD, phase_id: 'ARM_PARKED' },
  { t_s: 2.5, pose_rad: ARM_UNSTOW_RAD, phase_id: 'ARM_UNSTOW' },
  { t_s: 5.0, pose_rad: [0.35, -0.45, 2.55, 0.6, 0], phase_id: 'ARM_TARGET_SEARCH' },
  { t_s: 6.8, pose_rad: ARM_HOVER_RAD, phase_id: 'ARM_HOVER' },
  { t_s: 8.6, pose_rad: ARM_CONTACT_RAD, phase_id: 'ARM_CONTACT' },
  { t_s: 11.6, pose_rad: ARM_CONTACT_RAD, phase_id: 'ARM_CORE_DRILL', is_drilling: true },
  { t_s: 13.2, pose_rad: ARM_HOVER_RAD, phase_id: 'ARM_SAMPLE_RETRACT' },
  { t_s: 15.0, pose_rad: ARM_WATSON_RAD, phase_id: 'ARM_TURRET_WATSON' },
  { t_s: 17.5, pose_rad: ARM_WATSON_RAD, phase_id: 'ARM_CLOSEUP_IMAGING' },
  { t_s: 20.0, pose_rad: ARM_UNSTOW_RAD, phase_id: 'ARM_STOW' },
  { t_s: 22.5, pose_rad: ARM_PARK_RAD, phase_id: 'ARM_PARKED' },
];

// Mast ve anten [mast pan, mast tilt, anten pan, anten tilt]
export const MAST_KEYFRAMES = [
  { t_s: 0, pose_rad: [0, 0, 0, 0], phase_id: 'MAST_PANORAMA' },
  { t_s: 2, pose_rad: [1.1, 0.15, 0, 0], phase_id: 'MAST_PANORAMA' },
  { t_s: 5, pose_rad: [1.1, -0.35, 0, 0], phase_id: 'MAST_PANORAMA' },
  { t_s: 8, pose_rad: [-1.2, -0.35, 0, 0], phase_id: 'MAST_PANORAMA' },
  { t_s: 10, pose_rad: [-1.2, 0.25, 0, 0], phase_id: 'MAST_PANORAMA' },
  { t_s: 13, pose_rad: [0.4, 0.05, 0.9, -0.4], phase_id: 'HGA_EARTH_POINTING' },
  { t_s: 16, pose_rad: [0.4, 0.05, 0.9, -0.4], phase_id: 'HGA_EARTH_POINTING' },
  { t_s: 18, pose_rad: [0, 0, 0, 0], phase_id: 'HGA_EARTH_POINTING' },
];

export const ROVER_MISSION_SEGMENTS = [
  { duration_s: 9, mode: 'DRIVE' },
  { duration_s: 4, mode: 'TURN_IN_PLACE' },
  { duration_s: 18, mode: 'MAST_SCAN' },
  { duration_s: 22.5, mode: 'ARM_SAMPLE' },
];
const MISSION_LENGTH_S = ROVER_MISSION_SEGMENTS.reduce((sum, seg) => sum + seg.duration_s, 0);

const DRIVE_SPEED_MS = 0.9;
const DRIVE_TURN_GAIN = 0.22;
const TURN_IN_PLACE_RAD_S = 0.45;
const DRILL_SPIN_RAD_S = 18;
const MIN_SPEED_MS = 1e-3;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export function createRoverMotionState() {
  return {
    mission_t_s: 0,
    mode: 'DRIVE',
    phase_id: 'DRIVE',
    drive: { v_ms: 0, w_rads: 0, target_v_ms: 0, target_w_rads: 0, yaw_rad: 0, x_m: 0, z_m: 0 },
    arm_rad: [0, 0, 0, 0, 0],
    mast_rad: [0, 0, 0, 0],
    drill_rad: 0,
  };
}

/**
 * Anahtar karelerden t anındaki pozu yumuşak geçişle örnekler; aralık dışı t uçlara sabitlenir.
 */
export function calculateKeyframePose(keys, t_s) {
  const end_s = keys[keys.length - 1].t_s;
  const t = Math.max(0, Math.min(end_s, Number.isFinite(t_s) ? t_s : 0));
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t_s) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const u = easeInOutCubic(clamp01((t - a.t_s) / (b.t_s - a.t_s)));
  // Faz, gidilen kareye aittir: CONTACT → CORE_DRILL arasında matkap döner
  return { pose_rad: a.pose_rad.map((x, k) => lerp(x, b.pose_rad[k], u)), key: b, end_s };
}

/**
 * Tekerin gitmesi gereken direksiyon açısı ve dönüş yönü (Ackermann benzeri, gövde merkezli).
 * Açı ±90°'yi aşarsa teker ters döner; böylece direksiyon hiçbir zaman yarım tur atmaz.
 */
export function calculateWheelTarget(wheel, drive) {
  const vx = drive.w_rads * wheel.z_m;
  const vz = drive.v_ms - drive.w_rads * wheel.x_m;
  const speed_ms = Math.hypot(vx, vz);
  let target_rad = wheel.delta_rad;
  let dir = 1;
  if (wheel.is_steerable && speed_ms > MIN_SPEED_MS) {
    target_rad = Math.atan2(vx, vz);
    if (target_rad > Math.PI / 2) {
      target_rad -= Math.PI;
      dir = -1;
    } else if (target_rad < -Math.PI / 2) {
      target_rad += Math.PI;
      dir = -1;
    }
  } else if (!wheel.is_steerable) {
    dir = vz >= 0 ? 1 : -1;
  }
  if (wheel.is_steerable && speed_ms < MIN_SPEED_MS && Math.abs(drive.target_w_rads) < MIN_SPEED_MS) {
    target_rad = 0;
  }
  return { target_rad, dir, speed_ms };
}

/**
 * Teker direksiyonunu hedefe yaklaştırır ve yuvarlanma açısını ilerletir.
 * Direksiyon hizalanmadan teker dönmez, böylece kayma görüntüsü oluşmaz.
 */
export function handleWheelStep(wheel, drive, delta_s) {
  const { target_rad, dir, speed_ms } = calculateWheelTarget(wheel, drive);
  wheel.delta_rad += (target_rad - wheel.delta_rad) * Math.min(1, delta_s * 6);
  const aligned = Math.max(0, Math.cos(target_rad - wheel.delta_rad));
  wheel.angle_rad += ((dir * speed_ms) / wheel.radius_m) * delta_s * aligned;
}

// Direksiyonlar hizalanmadıkça gövde ilerlemez (8. kuvvet: neredeyse hizalanana kadar ~0)
function calculateSteerAlignment(wheels, drive) {
  let align = 1;
  wheels.forEach((wheel) => {
    if (!wheel.is_steerable) return;
    const vx = drive.w_rads * wheel.z_m;
    const vz = drive.v_ms - drive.w_rads * wheel.x_m;
    if (Math.hypot(vx, vz) <= MIN_SPEED_MS) return;
    let t = Math.atan2(vx, vz);
    if (t > Math.PI / 2) t -= Math.PI;
    else if (t < -Math.PI / 2) t += Math.PI;
    align = Math.min(align, Math.max(0, Math.cos(t - wheel.delta_rad)) ** 8);
  });
  return align;
}

function handleBodyStep(state, wheels, delta_s) {
  const drive = state.drive;
  const k = Math.min(1, delta_s * 1.5);
  drive.v_ms += (drive.target_v_ms - drive.v_ms) * k;
  drive.w_rads += (drive.target_w_rads - drive.w_rads) * k;
  const align = calculateSteerAlignment(wheels, drive);
  drive.yaw_rad += drive.w_rads * delta_s * align;
  const forward_m = drive.v_ms * delta_s * align;
  drive.x_m += Math.sin(drive.yaw_rad) * forward_m;
  drive.z_m += Math.cos(drive.yaw_rad) * forward_m;
  wheels.forEach((wheel) => handleWheelStep(wheel, drive, delta_s));
}

function calculateRelaxed(pose_rad, delta_s, rate) {
  return pose_rad.map((x) => x - x * Math.min(1, delta_s * rate));
}

function calculateMissionSegment(mission_t_s) {
  let t = mission_t_s % MISSION_LENGTH_S;
  for (const seg of ROVER_MISSION_SEGMENTS) {
    if (t < seg.duration_s) return { mode: seg.mode, t_s: t };
    t -= seg.duration_s;
  }
  return { mode: ROVER_MISSION_SEGMENTS[0].mode, t_s: 0 };
}

/**
 * Görev döngüsünü delta_s kadar ilerletir. wheels: [{ x_m, z_m, radius_m, is_steerable, delta_rad, angle_rad }]
 */
export function handleRoverMotionStep(state, wheels, delta_s) {
  const dt = Number.isFinite(delta_s) && delta_s > 0 ? delta_s : 0;
  state.mission_t_s += dt;
  const { mode, t_s } = calculateMissionSegment(state.mission_t_s);
  state.mode = mode;
  state.phase_id = mode;
  const drive = state.drive;

  if (mode === 'DRIVE') {
    drive.target_v_ms = DRIVE_SPEED_MS;
    drive.target_w_rads = DRIVE_SPEED_MS * DRIVE_TURN_GAIN * Math.sin(t_s * 0.35);
  } else if (mode === 'TURN_IN_PLACE') {
    drive.target_v_ms = 0;
    drive.target_w_rads = TURN_IN_PLACE_RAD_S;
  } else {
    drive.target_v_ms = 0;
    drive.target_w_rads = 0;
  }

  let is_drilling = false;
  if (mode === 'ARM_SAMPLE') {
    const sample = calculateKeyframePose(ARM_KEYFRAMES, t_s);
    state.arm_rad = sample.pose_rad;
    is_drilling = Boolean(sample.key.is_drilling) && t_s < sample.end_s;
    state.phase_id = sample.key.phase_id;
  } else {
    state.arm_rad = calculateRelaxed(state.arm_rad, dt, 2.5);
  }
  if (is_drilling) state.drill_rad += dt * DRILL_SPIN_RAD_S;

  if (mode === 'MAST_SCAN') {
    const sample = calculateKeyframePose(MAST_KEYFRAMES, t_s);
    state.mast_rad = sample.pose_rad;
    state.phase_id = sample.key.phase_id;
  } else if (mode === 'DRIVE' || mode === 'TURN_IN_PLACE') {
    // Sürüşte mast dönüş yönüne bakar
    state.mast_rad = calculateRelaxed(state.mast_rad, dt, 1.5);
    state.mast_rad[0] = lerp(state.mast_rad[0], drive.w_rads * 1.2, Math.min(1, dt * 2));
  } else {
    state.mast_rad = calculateRelaxed(state.mast_rad, dt, 2.5);
  }

  handleBodyStep(state, wheels, dt);
  return state;
}
