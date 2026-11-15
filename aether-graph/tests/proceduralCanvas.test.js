import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateNameSeed,
  calculateSurfaceProjection,
  createSeededRandom,
  createSurfaceFeatures,
  getPlanetPalette,
  isJezeroVisible,
  renderProceduralPlanet,
} from "../src/canvas/proceduralCanvas.js";

describe("proceduralCanvas", () => {
  it("aynı isim aynı tohumu ve aynı yüzeyi verir, büyük/küçük harf fark etmez", () => {
    assert.equal(calculateNameSeed("mars"), calculateNameSeed("MARS"));
    assert.notEqual(calculateNameSeed("MARS"), calculateNameSeed("VENUS"));
    assert.deepEqual(createSurfaceFeatures("Mars"), createSurfaceFeatures("MARS"));
    assert.notDeepEqual(createSurfaceFeatures("MARS"), createSurfaceFeatures("MERCURY"));
  });

  it("tohumlu üreteç deterministik ve [0, 1) aralığında", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    for (let i = 0; i < 100; i += 1) {
      const value = a();
      assert.equal(value, b());
      assert.ok(value >= 0 && value < 1);
    }
  });

  it("bilinen gezegen sabit renk, bilinmeyen isim tohumdan renk alır", () => {
    assert.equal(getPlanetPalette("mars").base, "#b5532a");
    assert.equal(getPlanetPalette("Kepler-22b").base, getPlanetPalette("KEPLER-22B").base);
  });

  it("izdüşüm: nokta sadece cos(boylam) > 0 iken görünür", () => {
    assert.equal(calculateSurfaceProjection(0, 0, 0).is_visible, true);
    assert.equal(calculateSurfaceProjection(0, 180, 0).is_visible, false);
    const center = calculateSurfaceProjection(0, 0, 0);
    assert.ok(Math.abs(center.x) < 1e-9 && Math.abs(center.y) < 1e-9);
  });

  it("Jezero (77.58° D) dönüşle ön yüzde görünür, arka yüzde gizlenir", () => {
    assert.equal(isJezeroVisible(0), true);
    assert.equal(isJezeroVisible(Math.PI), false);
    // Boylam + dönüş = 90°'yi geçince kenardan arkaya geçer
    assert.equal(isJezeroVisible((90 - 77.58 - 1) * Math.PI / 180), true);
    assert.equal(isJezeroVisible((90 - 77.58 + 1) * Math.PI / 180), false);
  });

  it("canvas yoksa hata fırlatmaz", () => {
    assert.doesNotThrow(() => renderProceduralPlanet("olmayan-canvas", "MARS"));
  });
});
