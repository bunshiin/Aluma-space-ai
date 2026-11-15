import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateClampedWindowPosition, calculateDefaultWindowPosition, createPopupWindow } from "../src/ui/popupWindow.js";

describe("popupWindow", () => {
  it("sürüklenen pencere ekrandan tamamen çıkamaz, başlığın bir kısmı görünür kalır", () => {
    assert.deepEqual(calculateClampedWindowPosition(-2000, -50, 400, 1200, 800), { left_px: -304, top_px: 0 });
    assert.deepEqual(calculateClampedWindowPosition(5000, 5000, 400, 1200, 800), { left_px: 1104, top_px: 752 });
    assert.deepEqual(calculateClampedWindowPosition(300, 120, 400, 1200, 800), { left_px: 300, top_px: 120 });
  });

  it("varsayılan yer: dikey pencere solda, geniş pencere ortada; üst şeridin altından başlar", () => {
    assert.deepEqual(calculateDefaultWindowPosition(false, 400, 600, 1200, 800), { left_px: 32, top_px: 80 });
    assert.deepEqual(calculateDefaultWindowPosition(true, 1000, 600, 1200, 800), { left_px: 100, top_px: 80 });
    // Küçük ekranda pencere dikeyde ortalanır, kenardan en az 16 px içeride kalır
    assert.deepEqual(calculateDefaultWindowPosition(false, 300, 500, 600, 560), { left_px: 32, top_px: 30 });
  });

  it("öğeler eksikse hata fırlatmaz", () => {
    assert.doesNotThrow(() => createPopupWindow({}).destroy());
  });
});
