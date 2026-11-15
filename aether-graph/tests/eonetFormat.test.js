import { describe, it } from "node:test";
import assert from "node:assert/strict";
import texts from "../src/config/eonet_texts.json" with { type: "json" };
import { fillTemplate, formatCoordinates, formatMagnitude, formatRelativeDay } from "../src/ui/eonetFormat.js";

describe("eonetFormat", () => {
  it("koordinatı yön harfleriyle yazar", () => {
    assert.equal(formatCoordinates({ latitude_deg: -36.868, longitude_deg: -71.378 }), "36.87° G, 71.38° B");
    assert.equal(formatCoordinates({ latitude_deg: 37.75, longitude_deg: 14.99 }), "37.75° K, 14.99° D");
    assert.equal(formatCoordinates(null), "");
  });

  it("göreli günü hesaplar", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    assert.equal(formatRelativeDay("2026-11-15T01:00:00Z", texts, now), texts.relative_today);
    assert.equal(formatRelativeDay("2026-11-14T06:00:00Z", texts, now), texts.relative_yesterday);
    assert.equal(formatRelativeDay("2026-11-10T12:00:00Z", texts, now), fillTemplate(texts.relative_days_ago, { n: "5" }));
  });

  it("büyüklüğü birimiyle, yoksa 'belirtilmemiş' yazar", () => {
    assert.equal(formatMagnitude({ magnitude_value: 30, magnitude_unit: "kts" }, texts), "30 knot rüzgâr");
    assert.equal(formatMagnitude({ magnitude_value: null }, texts), texts.field_unknown);
  });

  it("her EONET kategorisinin Türkçe adı var", async () => {
    const { EONET_CATEGORY_IDS } = await import("../src/api/eonetNormalizer.js");
    for (const id of EONET_CATEGORY_IDS) assert.ok(texts.categories[id], `${id} için metin yok`);
  });
});
