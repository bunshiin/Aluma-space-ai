import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateScenePosition } from "../src/three/geoMath.js";

function assertVector(actual, expected) {
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9, `${axis}: ${actual[axis]} ≠ ${expected[axis]}`);
  }
}

describe("geoMath.calculateScenePosition", () => {
  it("SphereGeometry doku eşlemesiyle uyumlu eksenleri verir", () => {
    assertVector(calculateScenePosition(0, 0), { x: 1, y: 0, z: 0 });
    assertVector(calculateScenePosition(90, 0), { x: 0, y: 1, z: 0 });
    assertVector(calculateScenePosition(0, 90), { x: 0, y: 0, z: -1 });
    assertVector(calculateScenePosition(0, -90), { x: 0, y: 0, z: 1 });
  });

  it("yarıçapla ölçeklenir ve bozuk girdide hata fırlatmaz", () => {
    assertVector(calculateScenePosition(0, 0, 2), { x: 2, y: 0, z: 0 });
    const p = calculateScenePosition(Number.NaN, undefined);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  });
});
