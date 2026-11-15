import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARM_KEYFRAMES,
  calculateKeyframePose,
  calculateWheelTarget,
  createRoverMotionState,
  handleRoverMotionStep,
  MAST_KEYFRAMES,
  ROVER_MISSION_SEGMENTS,
} from '../src/three/roverMotion.js';

// Perseverance'a yakın teker yerleşimi (metre): 2 yan × ön/orta/arka
function createWheels() {
  const wheels = [];
  [0.95, -0.95].forEach((x_m) => {
    [[1.1, 'FRONT'], [0, 'MIDDLE'], [-1.1, 'REAR']].forEach(([z_m, position_id]) => {
      wheels.push({ x_m, z_m, radius_m: 0.26, position_id, is_steerable: position_id !== 'MIDDLE', delta_rad: 0, angle_rad: 0 });
    });
  });
  return wheels;
}

function runFor(state, wheels, seconds, dt = 1 / 60) {
  const phases = new Set();
  for (let t = 0; t < seconds; t += dt) {
    handleRoverMotionStep(state, wheels, dt);
    phases.add(state.phase_id);
  }
  return phases;
}

test('Anahtar kare örnekleme: uçlarda tam poz, aralık dışı t sabitlenir', () => {
  assert.deepEqual(calculateKeyframePose(ARM_KEYFRAMES, 0).pose_rad, ARM_KEYFRAMES[0].pose_rad);
  assert.deepEqual(calculateKeyframePose(ARM_KEYFRAMES, 8.6).pose_rad, ARM_KEYFRAMES[4].pose_rad);
  assert.deepEqual(calculateKeyframePose(ARM_KEYFRAMES, 999).pose_rad, ARM_KEYFRAMES.at(-1).pose_rad);
  assert.deepEqual(calculateKeyframePose(ARM_KEYFRAMES, -5).pose_rad, ARM_KEYFRAMES[0].pose_rad);
  assert.deepEqual(calculateKeyframePose(ARM_KEYFRAMES, NaN).pose_rad, ARM_KEYFRAMES[0].pose_rad);
  // Ara değer iki kare arasında kalır (yumuşak geçiş, sıçrama yok)
  const mid = calculateKeyframePose(ARM_KEYFRAMES, 1.25).pose_rad[2];
  assert.ok(mid > 0 && mid < ARM_KEYFRAMES[1].pose_rad[2]);
  assert.equal(calculateKeyframePose(MAST_KEYFRAMES, 14).key.phase_id, 'HGA_EARTH_POINTING');
});

test('Görev döngüsü sırasıyla sürüş → yerinde dönüş → mast → kol fazlarından geçer', () => {
  const state = createRoverMotionState();
  const wheels = createWheels();
  const total_s = ROVER_MISSION_SEGMENTS.reduce((s, seg) => s + seg.duration_s, 0);
  const phases = runFor(state, wheels, total_s - 0.05);
  ['DRIVE', 'TURN_IN_PLACE', 'MAST_PANORAMA', 'HGA_EARTH_POINTING', 'ARM_UNSTOW', 'ARM_CORE_DRILL', 'ARM_TURRET_WATSON'].forEach((id) =>
    assert.ok(phases.has(id), `${id} fazı görülmedi`)
  );
});

test('Sürüş: rover ileri gider, tekerler yuvarlanır; kol parkta kalır', () => {
  const state = createRoverMotionState();
  const wheels = createWheels();
  runFor(state, wheels, 6);
  assert.equal(state.mode, 'DRIVE');
  assert.ok(Math.hypot(state.drive.x_m, state.drive.z_m) > 1.5, 'rover yerinden oynamadı');
  wheels.forEach((w) => assert.ok(w.angle_rad > 1, 'teker dönmedi'));
  state.arm_rad.forEach((a) => assert.ok(Math.abs(a) < 1e-6));
});

test('Yerinde dönüş: köşe tekerleri teğete döner, gövde konumu sabit, yön değişir', () => {
  const state = createRoverMotionState();
  const wheels = createWheels();
  runFor(state, wheels, 9);
  const before = { x: state.drive.x_m, z: state.drive.z_m, yaw: state.drive.yaw_rad };
  runFor(state, wheels, 3.5);
  assert.equal(state.mode, 'TURN_IN_PLACE');
  assert.ok(Math.hypot(state.drive.x_m - before.x, state.drive.z_m - before.z) < 0.6);
  assert.ok(Math.abs(state.drive.yaw_rad - before.yaw) > 0.5);
  // Teğet açı: atan(z/x) ≈ ±49°, orta tekerler dönmez
  wheels.filter((w) => w.is_steerable).forEach((w) => assert.ok(Math.abs(Math.abs(w.delta_rad) - Math.atan2(1.1, 0.95)) < 0.1));
  wheels.filter((w) => !w.is_steerable).forEach((w) => assert.equal(w.delta_rad, 0));
});

test('Matkap sadece karot delme fazında döner', () => {
  const state = createRoverMotionState();
  const wheels = createWheels();
  runFor(state, wheels, 9 + 4 + 18 + 8.5);
  const beforeDrill = state.drill_rad;
  assert.equal(beforeDrill, 0);
  runFor(state, wheels, 2.5);
  assert.equal(state.phase_id, 'ARM_CORE_DRILL');
  assert.ok(state.drill_rad > beforeDrill + 10);
  // Delme 11.6 sn'de biter; geri çekilme ve WATSON fazlarında matkap durur
  runFor(state, wheels, 1);
  assert.equal(state.phase_id, 'ARM_SAMPLE_RETRACT');
  const afterDrill = state.drill_rad;
  runFor(state, wheels, 3);
  assert.equal(state.drill_rad, afterDrill);
});

test('Teker hedefi: ±90°\'yi aşan açı ters yöne çevrilir, orta teker direksiyon almaz', () => {
  const back = calculateWheelTarget({ x_m: 0, z_m: 1, is_steerable: true, delta_rad: 0 }, { v_ms: -1, w_rads: 0, target_w_rads: 0 });
  assert.equal(back.dir, -1);
  assert.ok(Math.abs(back.target_rad) < 1e-9);
  const middle = calculateWheelTarget({ x_m: 1, z_m: 0, is_steerable: false, delta_rad: 0 }, { v_ms: 0, w_rads: 1, target_w_rads: 1 });
  assert.equal(middle.target_rad, 0);
  assert.equal(middle.dir, -1);
});

test('Aynı adımlar aynı sonucu verir (deterministik), bozuk delta hareket ettirmez', () => {
  const a = createRoverMotionState();
  const b = createRoverMotionState();
  runFor(a, createWheels(), 20);
  runFor(b, createWheels(), 20);
  assert.deepEqual(a, b);
  const c = createRoverMotionState();
  [NaN, -1, undefined, Infinity].forEach((dt) => handleRoverMotionStep(c, createWheels(), dt));
  assert.equal(c.mission_t_s, 0);
  assert.equal(c.drive.x_m, 0);
});
