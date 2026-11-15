import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClearedPoint,
  calculateSmootherstep,
  calculateTransitionDuration_s,
  calculateTransitionPoint,
  TRANSITION_CLEARANCE_RATIO,
} from '../src/three/cameraTransition.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('Yumuşatma: uçlarda 0 ve 1, tekdüze artar, sınır dışı değerler kenetlenir', () => {
  assert.equal(calculateSmootherstep(0), 0);
  assert.equal(calculateSmootherstep(1), 1);
  assert.equal(calculateSmootherstep(-3), 0);
  assert.equal(calculateSmootherstep(9), 1);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = calculateSmootherstep(t);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('Süre: yakın hedef kısa, uzak hedef uzun ama sınırlı; geçersiz mesafe güvenli', () => {
  assert.equal(calculateTransitionDuration_s(0), 1.4);
  assert.ok(calculateTransitionDuration_s(40) > calculateTransitionDuration_s(2));
  assert.equal(calculateTransitionDuration_s(1e9), 4.5);
  assert.equal(calculateTransitionDuration_s(NaN), 1.4);
  assert.equal(calculateTransitionDuration_s(-5), 1.4);
});

test('Küre içindeki nokta güvenli yarıçapa itilir, dışındaki nokta değişmez, geçersiz küre yok sayılır', () => {
  const sphere = { center: { x: 0, y: 0, z: 0 }, radius_units: 2 };
  const out = calculateClearedPoint({ x: 0.5, y: 0, z: 0 }, [sphere]);
  assert.ok(Math.abs(dist(out, sphere.center) - 2 * TRANSITION_CLEARANCE_RATIO) < 1e-9);
  const far = { x: 10, y: 1, z: -3 };
  assert.deepEqual(calculateClearedPoint(far, [sphere]), far);
  assert.deepEqual(calculateClearedPoint(far, [null, { center: null }, { center: sphere.center, radius_units: -1 }]), far);
  assert.deepEqual(calculateClearedPoint(far, undefined), far);
  // Tam merkezdeki nokta da bir yöne itilir (sıfıra bölme yok)
  const centered = calculateClearedPoint({ x: 0, y: 0, z: 0 }, [sphere]);
  assert.ok(Math.abs(dist(centered, sphere.center) - 2 * TRANSITION_CLEARANCE_RATIO) < 1e-9);
});

test('Geçiş yolu uçlarda tam başlangıç/bitiş noktasıdır ve aralarında sıçramaz', () => {
  const start = { x: -30, y: 4, z: 0 };
  const end = { x: 30, y: 4, z: 0 };
  assert.deepEqual(calculateTransitionPoint(start, end, [], 0), start);
  assert.deepEqual(calculateTransitionPoint(start, end, [], 1), end);
  let prev = start;
  let max_step = 0;
  for (let t = 0.01; t <= 1.0001; t += 0.01) {
    const p = calculateTransitionPoint(start, end, [], t);
    max_step = Math.max(max_step, dist(p, prev));
    prev = p;
  }
  assert.ok(max_step < 1.0, `adım çok büyük: ${max_step}`);
});

test('Doğrudan yol bir gezegenin içinden geçiyorsa yol dolanır, kamera hiçbir karede içeri girmez', () => {
  const planet = { center: { x: 0, y: 0, z: 0 }, radius_units: 3 };
  const start = { x: -30, y: 0, z: 0 };
  const end = { x: 30, y: 0, z: 0 };
  let prev = start;
  let max_step = 0;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const p = calculateTransitionPoint(start, end, [planet], t);
    assert.ok(dist(p, planet.center) >= planet.radius_units * TRANSITION_CLEARANCE_RATIO - 1e-9, `t=${t} gezegenin içine girdi`);
    max_step = Math.max(max_step, dist(p, prev));
    prev = p;
  }
  assert.ok(max_step < 1.5, `dolanırken sıçrama var: ${max_step}`);
});

test('Gezegenin tam arkasındaki hedefe geçiş de içinden geçmez; hedefin kendi küresi engel sayılmaz', () => {
  const mars = { center: { x: 0, y: 0, z: 0 }, radius_units: 0.85 };
  const sat = { center: { x: 1.2, y: 0, z: 0 }, radius_units: 0.06 };
  const start = { x: -5, y: 0.3, z: 0 };
  const end = { x: 1.45, y: 0.11, z: 0 };
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const p = calculateTransitionPoint(start, end, [mars, sat], t);
    assert.ok(dist(p, mars.center) >= mars.radius_units * TRANSITION_CLEARANCE_RATIO - 1e-9, `t=${t} Mars'ın içine girdi`);
  }
  assert.deepEqual(calculateTransitionPoint(start, end, [mars, sat], 1), end);
});

test('Bozuk girdiler hata fırlatmaz', () => {
  const p = { x: 1, y: 2, z: 3 };
  assert.doesNotThrow(() => calculateTransitionPoint(p, p, null, 0.5));
  assert.deepEqual(calculateTransitionPoint(p, p, [], 0.5), p);
  assert.doesNotThrow(() => calculateTransitionPoint(p, { x: 1, y: 2, z: 3 }, [{ center: p, radius_units: 1 }], 0.5));
});
