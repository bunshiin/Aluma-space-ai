import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDiveDuration_s,
  calculateDiveHaze,
  calculateDivePose,
  calculateLandingHaze,
  calculateLandingPose,
  calculateNearPlane_units,
  calculateOrbitAscentPose,
  calculateSurfaceAscentHaze,
  calculateSurfaceAscentPose,
  LANDING_START_DISTANCE_M,
} from '../src/three/marsDescentPath.js';
import { calculateMarsSurfaceFrame, calculateMarsSurfacePoint } from '../src/three/marsCoordinates.js';
import { SURFACE_VIEW_OFFSET_M } from '../src/three/marsSurfaceScene.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const site = calculateMarsSurfacePoint(18.38, 77.58, 0.85).position;
const { normal, north } = calculateMarsSurfaceFrame(18.38, 77.58);
const startOffset = { x: 2.8, y: 1.8, z: 4 };

test('Dalış: başlangıçta kamera yerinde, sonda kraterin üstünde ve atmosfer yüksekliğinde', () => {
  const p0 = calculateDivePose(site, normal, north, startOffset, 0.02, 0);
  assert.ok(dist(p0.position, { x: site.x + 2.8, y: site.y + 1.8, z: site.z + 4 }) < 1e-9);
  const p1 = calculateDivePose(site, normal, north, startOffset, 0.02, 1);
  assert.ok(Math.abs(dist(p1.position, site) - 0.02) < 1e-9);
  // Son konum yüzeyin dışında (normal yönünde), gezegenin içine girmez
  const up = (p1.position.x - site.x) * normal.x + (p1.position.y - site.y) * normal.y + (p1.position.z - site.z) * normal.z;
  assert.ok(up > 0.01);
  assert.deepEqual(p1.look_at, site);
});

test('Dalış mesafesi tekdüze azalır (geri sıçrama yok), pus ilk yarıda yok, sonda tam kapalı', () => {
  let prev = Infinity;
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const d = calculateDivePose(site, normal, north, startOffset, 0.02, u).distance_units;
    assert.ok(d <= prev + 1e-12);
    prev = d;
  }
  assert.equal(calculateDiveHaze(0), 0);
  assert.equal(calculateDiveHaze(0.4), 0);
  assert.ok(calculateDiveHaze(0.6) > 0 && calculateDiveHaze(0.6) < 1);
  assert.equal(calculateDiveHaze(1), 1);
});

test('Kalkış dalışın tersi: başta atmosferde, sonda odak pozunda', () => {
  const a0 = calculateOrbitAscentPose(site, normal, north, startOffset, 0.02, 0);
  const d1 = calculateDivePose(site, normal, north, startOffset, 0.02, 1);
  assert.ok(dist(a0.position, d1.position) < 1e-9);
  const a1 = calculateOrbitAscentPose(site, normal, north, startOffset, 0.02, 1);
  assert.ok(dist(a1.position, { x: site.x + 2.8, y: site.y + 1.8, z: site.z + 4 }) < 1e-9);
});

test('İniş: 420 m yükseklikten varsayılan takip açısına, pus açılır; kalkış tersine kapanır', () => {
  const anchor = { x: 3, y: 0.9, z: -2 };
  const l0 = calculateLandingPose(anchor, 0);
  assert.ok(Math.abs(dist(l0.position, anchor) - LANDING_START_DISTANCE_M) < 1e-6);
  assert.ok(l0.position.y > 300, 'iniş yukarıdan başlamalı');
  const l1 = calculateLandingPose(anchor, 1);
  assert.ok(dist(l1.position, { x: anchor.x + SURFACE_VIEW_OFFSET_M.x, y: anchor.y + SURFACE_VIEW_OFFSET_M.y, z: anchor.z + SURFACE_VIEW_OFFSET_M.z }) < 1e-9);
  assert.equal(calculateLandingHaze(0), 1);
  assert.equal(calculateLandingHaze(1), 0);

  const off = { x: -4, y: 2, z: 3 };
  const s0 = calculateSurfaceAscentPose(anchor, off, 0);
  assert.ok(dist(s0.position, { x: -1, y: 2.9, z: 1 }) < 1e-9);
  assert.ok(Math.abs(dist(calculateSurfaceAscentPose(anchor, off, 1).position, anchor) - LANDING_START_DISTANCE_M) < 1e-6);
  assert.equal(calculateSurfaceAscentHaze(0), 0);
  assert.equal(calculateSurfaceAscentHaze(1), 1);
});

test('Yakın düzlem yüzeye yaklaştıkça küçülür, geçersiz mesafede varsayılan kalır', () => {
  assert.equal(calculateNearPlane_units(10, 0.05), 0.05);
  assert.ok(calculateNearPlane_units(0.02, 0.05) < 0.002);
  assert.equal(calculateNearPlane_units(NaN, 0.05), 0.05);
  assert.equal(calculateNearPlane_units(1e-9, 0.05), 0.0002);
});

test('Gezegenin arka yüzünden başlayan dalış ve kalkış gezegenin içinden asla geçmez', () => {
  const radius_units = 0.85;
  const end_units = radius_units * 0.025;
  const center = { x: 0, y: 0, z: 0 };
  // Kamera kraterin tam ters tarafında (gezegenin arkasında) başlar
  const backOffset = { x: -normal.x * 4, y: -normal.y * 4, z: -normal.z * 4 };
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const dive = calculateDivePose(site, normal, north, backOffset, end_units, u);
    const ascent = calculateOrbitAscentPose(site, normal, north, backOffset, end_units, u);
    assert.ok(dist(dive.position, center) > radius_units * 1.01, `dalış u=${u} gezegenin içine girdi`);
    assert.ok(dist(ascent.position, center) > radius_units * 1.01, `kalkış u=${u} gezegenin içine girdi`);
  }
});

test('Dalış ve kalkış sürekli: ön, yan, arka ve alçak başlangıçlarda konum adımı ve dönüş hızı sınırlı, kamera gezegen yüzeyinin üstünde', () => {
  const radius_units = 0.85;
  const end_units = radius_units * 0.025;
  const center = { x: site.x - normal.x * radius_units, y: site.y - normal.y * radius_units, z: site.z - normal.z * radius_units };
  const starts = {
    onu: { x: normal.x * 4.5, y: normal.y * 4.5, z: normal.z * 4.5 },
    yani: { x: north.x * 4.5, y: north.y * 4.5, z: north.z * 4.5 },
    arkasi: { x: -normal.x * 4.5, y: -normal.y * 4.5, z: -normal.z * 4.5 },
    alcak: { x: north.x * 0.3 + normal.x * 0.15, y: north.y * 0.3 + normal.y * 0.15, z: north.z * 0.3 + normal.z * 0.15 },
  };
  Object.entries(starts).forEach(([name, offset]) => {
    let prev = calculateDivePose(site, normal, north, offset, end_units, 0).position;
    let max_step = 0;
    let max_turn_deg = 0;
    let prev_dir = null;
    const step_s = 0.005 * calculateDiveDuration_s(site, normal, north, offset, end_units);
    for (let u = 0.005; u <= 1.0001; u += 0.005) {
      const pose = calculateDivePose(site, normal, north, offset, end_units, u);
      max_step = Math.max(max_step, dist(pose.position, prev));
      const rel = { x: pose.position.x - center.x, y: pose.position.y - center.y, z: pose.position.z - center.z };
      const len = Math.hypot(rel.x, rel.y, rel.z);
      assert.ok(len > radius_units, `${name}: u=${u.toFixed(3)} gezegenin içine girdi`);
      const dir = { x: rel.x / len, y: rel.y / len, z: rel.z / len };
      if (prev_dir) {
        const dot = Math.max(-1, Math.min(1, dir.x * prev_dir.x + dir.y * prev_dir.y + dir.z * prev_dir.z));
        max_turn_deg = Math.max(max_turn_deg, ((Math.acos(dot) * 180) / Math.PI) / step_s);
      }
      prev_dir = dir;
      prev = pose.position;
    }
    assert.ok(max_step < 0.25, `${name}: konum adımı çok büyük (${max_step.toFixed(3)})`);
    assert.ok(max_turn_deg < 90, `${name}: gezegen etrafında dönüş hızı çok büyük (${max_turn_deg.toFixed(1)}°/sn)`);
  });
});

test('Dalış süresi gezegen etrafında dönülecek açıyla uzar, sınırlı kalır', () => {
  const end_units = 0.85 * 0.025;
  const front = calculateDiveDuration_s(site, normal, north, { x: normal.x * 4.5, y: normal.y * 4.5, z: normal.z * 4.5 }, end_units);
  const back = calculateDiveDuration_s(site, normal, north, { x: -normal.x * 4.5, y: -normal.y * 4.5, z: -normal.z * 4.5 }, end_units);
  assert.ok(back > front, 'arkadan dalış daha uzun sürmeli');
  assert.ok(front >= 6.5 && back <= 6.5 * 1.71, `süre sınır dışı: ${front}, ${back}`);
  assert.equal(calculateDiveDuration_s(site, normal, north, { x: 1, y: 0, z: 0 }, end_units, 4.5) >= 4.5, true);
});
