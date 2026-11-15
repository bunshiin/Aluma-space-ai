import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createArchiveSearchTerm, createWorldviewSnapshotUrl, getImageryDate } from "../src/ui/eonetImagery.js";

function getBbox(url) {
  return new URL(url).searchParams.get("BBOX").split(",").map(Number);
}

describe("eonetImagery", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("bugünün olayı için işlenmiş bir önceki günün görüntüsünü ister", () => {
    assert.equal(getImageryDate("2026-11-15T10:00:00Z", now), "2026-11-14");
    assert.equal(getImageryDate("2026-06-15T00:00:00Z", now), "2026-06-15");
    assert.equal(getImageryDate("bozuk", now), "2026-11-14");
  });

  it("kutu olay konumunu içerir ve 180° boylamını aşmaz", () => {
    for (const lon of [-173.2, 0, 178.5]) {
      const event = { category: "severeStorms", timestamp_utc: "2026-11-12T00:00:00Z", coordinates: { latitude_deg: 9.8, longitude_deg: lon } };
      const [south, west, north, east] = getBbox(createWorldviewSnapshotUrl(event, now).url);
      assert.ok(west >= -180 && east <= 180, `kutu taştı: ${west}, ${east}`);
      assert.ok(south <= 9.8 && north >= 9.8 && west <= lon && east >= lon);
    }
  });

  it("yangında termal anomali katmanını da ekler", () => {
    const event = { category: "wildfires", coordinates: { latitude_deg: 31, longitude_deg: -89 } };
    assert.match(new URL(createWorldviewSnapshotUrl(event, now).url).searchParams.get("LAYERS"), /Thermal_Anomalies/);
  });

  it("arşiv arama terimi başlığın ilk kısmıdır", () => {
    assert.equal(createArchiveSearchTerm("Nevados del Chillan Volcano, Chile"), "Nevados del Chillan Volcano");
    assert.equal(createArchiveSearchTerm("Wildfire in Australia 1033825"), "Wildfire in Australia");
  });
});
