import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSubsolarPoint } from '../src/physics/solarPosition.js';
import {
  SPEED_OF_LIGHT_KMS,
  PLANET_GRAVITY_MS2,
  calculateLightDelay,
  calculateFallTime,
  calculateImpactSpeed,
  calculatePlanetWeight,
  calculateGravityComparison,
  calculatePlanetComparison,
  MARS_RADIUS_KM,
  calculateFallRemainingHeight,
  calculatePlanetAge,
  calculateCmeArrival,
  calculateLunarDistanceRatio,
  calculateOrbitPeriod,
  calculateAcceleratedTime,
  kmToSceneUnits
} from '../src/physics/spacePhysics.js';

describe('spacePhysics - Sözleşme, Fizik ve Matematik Testleri', () => {

  it('sözleşme: calculateLightDelay beklenen alanları ve tipleri döner, asla null/undefined dönmez', () => {
    const res = calculateLightDelay('EARTH', 'MARS', 'one-way');
    assert.ok(res !== null && res !== undefined);
    assert.deepEqual(Object.keys(res).sort(), ['delay_s', 'round_trip_s']);
    assert.equal(typeof res.delay_s, 'number');
    assert.equal(typeof res.round_trip_s, 'number');
  });

  it('ışık gecikmesi: Ay-Dünya (~1.28s) ve Dünya-Güneş (~499s) doğru hesaplanır', () => {
    const moon = calculateLightDelay('EARTH', 'MOON', 'one-way');
    assert.ok(Math.abs(moon.delay_s - 1.28) < 0.05, `Beklenen ~1.28s, gelen: ${moon.delay_s}`);

    const sun = calculateLightDelay('EARTH', 'SUN', 'one-way');
    assert.ok(Math.abs(sun.delay_s - 499) < 2, `Beklenen ~499s, gelen: ${sun.delay_s}`);
  });

  it('ışık gecikmesi: round-trip değeri tek yönün 2 katı olmalı', () => {
    const oneWay = calculateLightDelay('EARTH', 'MARS', 'one-way');
    const roundTrip = calculateLightDelay('EARTH', 'MARS', 'round-trip');
    assert.ok(
      Math.abs(roundTrip.delay_s - oneWay.delay_s * 2) < 0.05,
      `round-trip (${roundTrip.delay_s}) tek yönün 2 katı olmalı`
    );
    assert.equal(oneWay.round_trip_s, roundTrip.round_trip_s);
  });

  it('hata yolları: sıfır mesafe, bilinmeyen hedef ve geçersiz girdi hata fırlatmaz', () => {
    assert.doesNotThrow(() => calculateLightDelay('EARTH', 'EARTH', 'one-way'));
    assert.doesNotThrow(() => calculateLightDelay('UNKNOWN_A', 'MARS', 'one-way'));
    assert.doesNotThrow(() => calculateLightDelay(null, undefined, 'invalid'));

    const sameBody = calculateLightDelay('EARTH', 'EARTH', 'one-way');
    assert.equal(sameBody.delay_s, 0);
    assert.equal(sameBody.round_trip_s, 0);
  });

  it('düşme süresi ve çarpma hızı: T = sqrt(2H/g) ve v = sqrt(2gH) doğru çalışır', () => {
    const earthFall_s = calculateFallTime(19.6133, 'EARTH');
    assert.ok(Math.abs(earthFall_s - 2.0) < 0.001);

    const moonFall_s = calculateFallTime(3.24, 'MOON');
    assert.ok(Math.abs(moonFall_s - 2.0) < 0.001);

    const impactSpeed_ms = calculateImpactSpeed(19.6133, 'EARTH');
    assert.ok(Math.abs(impactSpeed_ms - 19.6133) < 0.01);

    assert.equal(calculateFallTime(-10, 'MARS'), 0);
    assert.equal(calculateImpactSpeed(0, 'MARS'), 0);
  });

  it('gezegen ağırlığı ve gezegen yaşı doğru hesaplanır', () => {
    // 100 kg Mars'ta yaklaşık 37.93 kg gelir
    const marsWeight_kg = calculatePlanetWeight(100, 'MARS');
    assert.ok(Math.abs(marsWeight_kg - 37.93) < 0.2, `Gelen: ${marsWeight_kg}`);

    // 20 Dünya yılı Mars'ta (~686.98 gün) yaklaşık 10.63 Mars yılı eder
    const marsAge = calculatePlanetAge(20, 'MARS');
    assert.ok(Math.abs(marsAge - 10.63) < 0.1, `Gelen: ${marsAge}`);

    assert.equal(calculatePlanetWeight(-5, 'MARS'), 0);
    assert.equal(calculatePlanetAge(0, 'MARS'), 0);
  });

  it('yerçekimi kıyası: kütle verilmezse sadece yerçekimi döner, kütle verilirse ağırlık da eklenir', () => {
    const onlyGravity = calculateGravityComparison('EARTH', 'MOON');
    assert.equal(onlyGravity.source_gravity_ms2, 9.80665);
    assert.equal(onlyGravity.target_gravity_ms2, 1.62);
    assert.equal(onlyGravity.gravity_ratio, 6.05);
    assert.equal('mass_kg' in onlyGravity, false);
    assert.equal('target_weight_kg' in onlyGravity, false);

    const withMass = calculateGravityComparison('EARTH', 'MOON', { mass_kg: 67 });
    assert.equal(withMass.mass_kg, 67);
    assert.equal(withMass.source_weight_kg, 67);
    assert.equal(withMass.target_weight_kg, 11.07);
  });

  it('gezegen karşılaştırması: yarıçap oranı, opsiyonel alanlar ve varsayılana düşme', () => {
    const base = calculatePlanetComparison('EARTH', 'MOON');
    assert.ok(Math.abs(base.radius_ratio - 6371 / 1737.4) < 1e-4);
    assert.equal(base.primary_gravity_ms2, 9.80665);
    assert.equal('mass_kg' in base, false);
    assert.equal('primary_fall_time_s' in base, false);

    const full = calculatePlanetComparison('JUPITER', 'PLUTO', { mass_kg: 70, height_m: 10, age_years: 20 });
    assert.equal(full.primary_fall_time_s, calculateFallTime(10, 'JUPITER'));
    assert.ok(full.secondary_fall_time_s > full.primary_fall_time_s);
    assert.ok(full.primary_weight_kg > 70 && full.secondary_weight_kg < 70);
    assert.ok(full.secondary_age_years < 1);

    // Uydu yaşı bağlı olduğu gezegenin yılıyla hesaplanır
    assert.equal(calculatePlanetAge(20, 'EUROPA'), calculatePlanetAge(20, 'JUPITER'));

    const fallback = calculatePlanetComparison('NIBIRU', 7, null);
    assert.equal(fallback.primary_object, 'EARTH');
    assert.equal(fallback.secondary_object, 'MARS');
  });

  it('düşme anı yüksekliği: H - g·t²/2, yere değince 0, bozuk girdi hata fırlatmaz', () => {
    assert.equal(calculateFallRemainingHeight(10, 0, 'EARTH'), 10);
    assert.ok(Math.abs(calculateFallRemainingHeight(19.6133, 1, 'EARTH') - 14.709975) < 1e-6);
    assert.equal(calculateFallRemainingHeight(10, calculateFallTime(10, 'MOON') + 0.01, 'MOON'), 0);
    assert.equal(calculateFallRemainingHeight(-1, 1, 'EARTH'), 0);
    assert.doesNotThrow(() => calculateFallRemainingHeight(10, NaN, null));
  });

  it('Güneş fırtınası varış süresi, Ay mesafe oranı ve ISS yörünge süresi doğru hesaplanır', () => {
    // 1500 km/s CME -> ~27.70 saat
    const cmeHours = calculateCmeArrival(1500);
    assert.ok(Math.abs(cmeHours - 27.7) < 0.2, `Gelen: ${cmeHours}`);

    // 768800 km -> 2.00 LD
    assert.equal(calculateLunarDistanceRatio(768800), 2);

    // ISS: 420 km irtifa, 27600 km/sa hız -> ~92.75 dk
    const issPeriodMin = calculateOrbitPeriod(420, 27600);
    assert.ok(issPeriodMin > 90 && issPeriodMin < 95, `Gelen: ${issPeriodMin}`);

    assert.equal(calculateCmeArrival(0), 0);
    assert.equal(calculateLunarDistanceRatio(-100), 0);
    assert.equal(calculateOrbitPeriod(-1, 27600), 0);
  });

  it('zaman hızlandırma, sahne ölçekleme ve sabitler tutarlıdır', () => {
    assert.equal(calculateAcceleratedTime(2, 10), 20);
    assert.equal(calculateAcceleratedTime(-2, 10), 0);
    assert.ok(kmToSceneUnits(1000000) > 0);
    assert.equal(kmToSceneUnits(-10), 0);

    assert.ok(SPEED_OF_LIGHT_KMS > 299000 && SPEED_OF_LIGHT_KMS < 300000);
    assert.equal(PLANET_GRAVITY_MS2.EARTH, 9.80665);
  });
});

// EONET: Güneş tepe noktası (gece/gündüz çizgisi)

describe("spacePhysics.calculateSubsolarPoint", () => {
  it("Haziran gündönümünde Güneş Yengeç Dönencesi üzerindedir (≈ +23.44°)", () => {
    const p = calculateSubsolarPoint(new Date("2024-06-20T20:51:00Z"));
    assert.ok(Math.abs(p.latitude_deg - 23.44) < 0.1, `enlem ${p.latitude_deg}`);
  });

  it("Mart ekinoksunda Güneş ekvator üzerindedir (≈ 0°)", () => {
    const p = calculateSubsolarPoint(new Date("2024-03-20T03:06:00Z"));
    assert.ok(Math.abs(p.latitude_deg) < 0.1, `enlem ${p.latitude_deg}`);
  });

  it("UTC öğlende tepe noktası Greenwich yakınıdır (zaman denklemi kadar sapma)", () => {
    const p = calculateSubsolarPoint(new Date("2024-04-15T12:00:00Z"));
    assert.ok(Math.abs(p.longitude_deg) < 1.5, `boylam ${p.longitude_deg}`);
  });

  it("boylam her zaman -180..180 aralığındadır, geçersiz tarih hata fırlatmaz", () => {
    for (const hour of [0, 6, 18, 23]) {
      const p = calculateSubsolarPoint(new Date(Date.UTC(2026, 10, 15, hour)));
      assert.ok(p.longitude_deg >= -180 && p.longitude_deg <= 180);
    }
    const p = calculateSubsolarPoint(new Date("geçersiz"));
    assert.ok(Number.isFinite(p.latitude_deg) && Number.isFinite(p.longitude_deg));
  });
});

describe("spacePhysics sabitleri", () => {
  it("Mars yarıçapı yüzey koordinat dönüşümü için tek yerde tanımlı", () => {
    assert.equal(MARS_RADIUS_KM, 3389.5);
  });
});
