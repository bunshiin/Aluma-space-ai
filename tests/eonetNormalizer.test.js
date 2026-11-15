import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEonetEvent, normalizeEonetResponse, normalizeFallbackEvent } from "../src/api/eonetNormalizer.js";

const RAW_VOLCANO = {
  id: "EONET_1",
  title: "Etna Volcano, Italy",
  closed: null,
  categories: [{ id: "volcanoes", title: "Volcanoes" }],
  sources: [{ id: "SIVolcano", url: "https://volcano.si.edu/x" }],
  link: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1",
  geometry: [
    { magnitudeValue: null, magnitudeUnit: null, date: "2026-01-01T00:00:00Z", type: "Point", coordinates: [14.0, 37.0] },
    { magnitudeValue: 3, magnitudeUnit: "VEI", date: "2026-03-01T00:00:00Z", type: "Point", coordinates: [14.99, 37.75] },
  ],
};

describe("eonetNormalizer", () => {
  it("en son geometriyi konum ve büyüklük için kullanır, sadece gereken alanları bırakır", () => {
    const e = normalizeEonetEvent(RAW_VOLCANO);
    assert.equal(e.coordinates.latitude_deg, 37.75);
    assert.equal(e.coordinates.longitude_deg, 14.99);
    assert.equal(e.timestamp_utc, "2026-03-01T00:00:00Z");
    assert.equal(e.first_seen_utc, "2026-01-01T00:00:00Z");
    assert.equal(e.magnitude_value, 3);
    assert.equal(e.status, "OPEN");
    assert.equal(e.track_point_count, 2);
    assert.equal(e.source_id, "SIVolcano");
    assert.equal(e.geometry, undefined, "ham geometri UI'ya gitmemeli");
  });

  it("Polygon geometrinin merkezini hesaplar", () => {
    const e = normalizeEonetEvent({
      ...RAW_VOLCANO,
      categories: [{ id: "seaLakeIce" }],
      geometry: [{ date: "2026-01-01T00:00:00Z", type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
    });
    assert.deepEqual(e.coordinates, { latitude_deg: 5, longitude_deg: 5 });
  });

  it("koordinatsız veya bozuk olayı eler, sonucu tarihe göre yeniden eskiye sıralar", () => {
    const list = normalizeEonetResponse({
      events: [
        { ...RAW_VOLCANO, id: "OLD", geometry: [{ date: "2020-01-01T00:00:00Z", type: "Point", coordinates: [1, 1] }] },
        { id: "BROKEN", geometry: [] },
        null,
        { ...RAW_VOLCANO, id: "NEW" },
      ],
    });
    assert.deepEqual(list.map((e) => e.id), ["NEW", "OLD"]);
  });

  it("bilinmeyen kategoriyi geçerli bir değere çevirir, kapalı olayı CLOSED işaretler", () => {
    const e = normalizeEonetEvent({ ...RAW_VOLCANO, closed: "2026-04-01T00:00:00Z", categories: [{ id: "alien" }] });
    assert.equal(e.category, "manmade");
    assert.equal(e.status, "CLOSED");
  });

  it("bozuk yanıtta boş dizi döner, null dönmez", () => {
    assert.deepEqual(normalizeEonetResponse(null), []);
    assert.deepEqual(normalizeEonetResponse({ events: "x" }), []);
  });

  it("yedek kaydı aynı şemaya tamamlar", () => {
    const e = normalizeFallbackEvent({ id: "F", title: "T", category: "earthquakes", coordinates: { latitude_deg: 1, longitude_deg: 2 } });
    for (const key of ["id", "title", "category", "timestamp_utc", "status", "coordinates", "magnitude_value", "source_id", "track_point_count"]) {
      assert.ok(key in e, `${key} alanı eksik`);
    }
    assert.equal(e.source_id, "FALLBACK");
  });
});
