import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_RADIUS_KM, ORBIT_RADIUS_KM } from '../src/physics/spacePhysics.js';
import {
  ASTEROID_RADIUS_UNITS,
  EARTH_RADIUS_UNITS,
  getAsteroidListFromPayload,
  calculateAsteroidLayout,
  calculateAsteroidMotionStyle,
  calculateAsteroidOrbitUnits,
  calculateDebrisLayout,
  calculateMoonOrbitUnits,
  calculateRelativeSpeeds,
  getSanitizedAsteroids,
  DISTANCE_STYLES,
  NEAR_LIMIT_KM,
  MID_LIMIT_KM,
  calculateDistanceLevel,
  isBennuAsteroid,
  MAX_ASTEROID_COUNT,
} from '../src/three/asteroidSwarmConfig.js';

// Ekteki yönlendirici çıktısıyla aynı biçim
const SAMPLE = [
  { name: '99942 Apophis', close_approach_utc: '2026-11-14T19:40:00Z', distance_km: 31000, velocity_kmh: 107000, is_hazardous: true },
  { name: '101955 Bennu', close_approach_utc: '2026-11-14T22:10:00Z', distance_km: 2200000, velocity_kmh: 100800, is_hazardous: true },
  { name: '2024 BX1', close_approach_utc: '2026-11-14T09:15:00Z', distance_km: 450000, velocity_kmh: 54000, is_hazardous: false },
];

test('getSanitizedAsteroids: geçerli veri aynen geçer, alan isimleri korunur', () => {
  const clean = getSanitizedAsteroids(SAMPLE);
  assert.equal(clean.length, 3);
  assert.deepEqual(clean[0], SAMPLE[0]);
  assert.deepEqual(Object.keys(clean[1]).sort(), Object.keys(SAMPLE[1]).sort());
});

test('getSanitizedAsteroids: bozuk girdi hata fırlatmaz, her zaman dizi döner', () => {
  for (const bad of [null, undefined, 'x', 42, {}, [null, 3, 'a', {}]]) {
    const out = getSanitizedAsteroids(bad);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 0);
  }
});

test('getSanitizedAsteroids: bilinmeyen alan atılır, eksik alana varsayılan konur', () => {
  const [a, b] = getSanitizedAsteroids([
    { name: ' X ', distance_km: -5, velocity_kmh: 'hızlı', hazard_level: 'EXTREME', secret: 1 },
    { name: 'Y', is_hazardous: true },
  ]);
  assert.equal(a.name, 'X');
  assert.equal('secret' in a, false);
  // Renk mesafeden gelir; veriden gelen hazard_level sahneye taşınmaz, yanıltmasın
  assert.equal('hazard_level' in a, false);
  assert.ok(a.distance_km > 0);
  assert.equal(a.velocity_kmh, 0);
  assert.equal(a.is_hazardous, false);
  assert.equal(b.is_hazardous, true);
});

test('getSanitizedAsteroids: tekrar eden isim ve üst sınır', () => {
  const dup = getSanitizedAsteroids([SAMPLE[0], { ...SAMPLE[0], distance_km: 5 }]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].distance_km, 31000);
  const many = Array.from({ length: MAX_ASTEROID_COUNT + 10 }, (_, i) => ({ name: `A${i}` }));
  assert.equal(getSanitizedAsteroids(many).length, MAX_ASTEROID_COUNT);
});

test('calculateAsteroidOrbitUnits: sıra korunur, sınırlar fiziksel noktalara bağlı, geçersiz girdi çökmez', () => {
  const grazer = calculateAsteroidOrbitUnits(9300);
  const apophis = calculateAsteroidOrbitUnits(31000);
  const moon = calculateMoonOrbitUnits();
  const bennu = calculateAsteroidOrbitUnits(2200000);
  const phaLimit = calculateAsteroidOrbitUnits(ORBIT_RADIUS_KM.EARTH * 0.05);
  assert.ok(grazer < apophis && apophis < moon && moon < bennu && bennu < phaLimit);

  // Alt sınır Dünya yüzeyi: en yakın küme bile parçalarıyla birlikte Dünya'nın dışında kalır
  const surface = calculateAsteroidOrbitUnits(EARTH_RADIUS_KM);
  assert.ok(surface - ASTEROID_RADIUS_UNITS * 3.4 > EARTH_RADIUS_UNITS);
  assert.equal(calculateAsteroidOrbitUnits(1), surface);
  assert.equal(calculateAsteroidOrbitUnits(-1), surface);
  assert.equal(calculateAsteroidOrbitUnits(NaN), surface);

  // Üst sınır 0,5 AU: daha uzakları aynı dış halkaya kırpılır
  const outer = calculateAsteroidOrbitUnits(ORBIT_RADIUS_KM.EARTH * 0.5);
  assert.equal(calculateAsteroidOrbitUnits(1e12), outer);
  assert.ok(outer <= 20);
});

test('getAsteroidListFromPayload: dizi, { asteroids } ve Gemini JSON biçimi kabul edilir', () => {
  assert.equal(getAsteroidListFromPayload(SAMPLE), SAMPLE);
  assert.equal(getAsteroidListFromPayload({ asteroids: SAMPLE }), SAMPLE);
  assert.equal(getAsteroidListFromPayload({ template_id: 'NEO_SWARM', parameters: { asteroids: SAMPLE } }), SAMPLE);
  for (const bad of [null, undefined, 'x', 5, {}, { asteroids: 'x' }, { parameters: null }]) {
    assert.deepEqual(getAsteroidListFromPayload(bad), []);
  }
});

test('calculateRelativeSpeeds: en yavaş 0, en hızlı 1, tek veya eşit hız 0.5', () => {
  assert.deepEqual(calculateRelativeSpeeds([]), []);
  assert.deepEqual(calculateRelativeSpeeds(null), []);
  assert.deepEqual(calculateRelativeSpeeds([SAMPLE[0]]), [0.5]);
  const rel = calculateRelativeSpeeds(SAMPLE);
  assert.equal(rel[0], 1);
  assert.equal(rel[2], 0);
  assert.ok(rel[1] > 0 && rel[1] < 1);
});

test('calculateDistanceLevel: yakın NEAR (kırmızı), orta MID (sarı), uzak FAR (yeşil); eşikler Ay ve 0,05 AU', () => {
  assert.equal(NEAR_LIMIT_KM, 384400);
  assert.equal(MID_LIMIT_KM, ORBIT_RADIUS_KM.EARTH * 0.05);
  assert.equal(calculateDistanceLevel(9300), 'NEAR');
  assert.equal(calculateDistanceLevel(31000), 'NEAR');
  assert.equal(calculateDistanceLevel(NEAR_LIMIT_KM - 1), 'NEAR');
  assert.equal(calculateDistanceLevel(NEAR_LIMIT_KM), 'MID');
  assert.equal(calculateDistanceLevel(450000), 'MID');
  assert.equal(calculateDistanceLevel(2200000), 'MID');
  assert.equal(calculateDistanceLevel(MID_LIMIT_KM - 1), 'MID');
  assert.equal(calculateDistanceLevel(MID_LIMIT_KM), 'FAR');
  assert.equal(calculateDistanceLevel(44900000), 'FAR');
  // Geçersiz mesafe güvenli sayılır, alarm vermez
  for (const bad of [0, -5, NaN, Infinity, null, undefined, '31000']) {
    assert.equal(calculateDistanceLevel(bad), 'FAR');
  }
});

test('calculateAsteroidMotionStyle: renk seviyeye, hareket göreli hıza bağlı', () => {
  assert.deepEqual(calculateAsteroidMotionStyle('NEAR', 0.5).color_rgb, DISTANCE_STYLES.NEAR.color_rgb);
  assert.deepEqual(calculateAsteroidMotionStyle('MID', 0.5).color_rgb, DISTANCE_STYLES.MID.color_rgb);
  assert.deepEqual(calculateAsteroidMotionStyle('UNKNOWN', 0.5).color_rgb, DISTANCE_STYLES.FAR.color_rgb);
  const slow = calculateAsteroidMotionStyle('FAR', 0);
  const fast = calculateAsteroidMotionStyle('FAR', 1);
  assert.ok(fast.orbit_speed_deg_s > slow.orbit_speed_deg_s);
  assert.ok(fast.pulse_hz > slow.pulse_hz);
  assert.ok(fast.glow_intensity > slow.glow_intensity);
  assert.doesNotThrow(() => calculateAsteroidMotionStyle(undefined, 'x'));
});

test('renkler doğru: kırmızı baskın kırmızı, sarı kırmızı+yeşil, yeşil baskın yeşil', () => {
  const [nr, ng, nb] = DISTANCE_STYLES.NEAR.color_rgb;
  const [mr, mg, mb] = DISTANCE_STYLES.MID.color_rgb;
  const [fr, fg, fb] = DISTANCE_STYLES.FAR.color_rgb;
  assert.ok(nr > 0.9 && ng < 0.15 && nb < 0.15);
  assert.ok(mr > 0.9 && mg > 0.6 && mb < 0.3);
  assert.ok(fg > 0.9 && fr < 0.4 && fb < 0.5);
});

test('alarm: NEAR yavaş ama derin yanıp söner, MID hafif, FAR sakin; yakın olan her zaman daha derin', () => {
  const near = calculateAsteroidMotionStyle('NEAR', 0.5);
  const mid = calculateAsteroidMotionStyle('MID', 0.5);
  const far = calculateAsteroidMotionStyle('FAR', 0.5);
  // "Yavaşça": saniyede bir kereden az (1 Hz altı), hızlı asteroitte bile
  assert.ok(calculateAsteroidMotionStyle('NEAR', 1).pulse_hz < 1);
  assert.ok(near.pulse_depth >= 0.8, 'kırmızı neredeyse tamamen sönmeli');
  assert.ok(near.pulse_depth > mid.pulse_depth && mid.pulse_depth > far.pulse_depth);
  assert.ok(far.pulse_depth < 0.2);
  for (const s of [near, mid, far]) {
    assert.ok(s.pulse_depth >= 0 && s.pulse_depth <= 1);
  }
});

test('parlaklık: NEAR > MID > FAR (algılanan parlaklık, aynı hızda)', () => {
  const luminance = (level) => {
    const s = calculateAsteroidMotionStyle(level, 0.5);
    const [r, g, b] = s.color_rgb;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) * s.glow_intensity;
  };
  assert.ok(luminance('NEAR') > luminance('MID'));
  assert.ok(luminance('MID') > luminance('FAR'));
});

test('yerleşim tohumlu: aynı isim aynı yörünge ve yuvarlanma, farklı isim farklı', () => {
  assert.deepEqual(calculateAsteroidLayout('99942 Apophis'), calculateAsteroidLayout('99942 Apophis'));
  assert.notDeepEqual(calculateAsteroidLayout('99942 Apophis'), calculateAsteroidLayout('2024 BX1'));
  assert.deepEqual(calculateDebrisLayout('A', 2), calculateDebrisLayout('A', 2));
  const layout = calculateAsteroidLayout('2024 BX1');
  assert.ok(layout.debris_count >= 3 && layout.debris_count <= 6);
  const { x, y, z } = layout.tumble_axis;
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.doesNotThrow(() => calculateAsteroidLayout(null));
});

test('isBennuAsteroid: Bennu adı veya numarası tanınır', () => {
  assert.equal(isBennuAsteroid('101955 Bennu'), true);
  assert.equal(isBennuAsteroid('BENNU'), true);
  assert.equal(isBennuAsteroid('101955'), true);
  assert.equal(isBennuAsteroid('99942 Apophis'), false);
  assert.equal(isBennuAsteroid(undefined), false);
});
