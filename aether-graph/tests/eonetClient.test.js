import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEonetEventsUrl, fetchNormalizedEonetEvents, getEonetCategoryId } from "../src/api/eonetClient.js";

describe("eonetClient", () => {
  it("kategori kimliğini büyük/küçük harf duyarsız çözer, bilinmeyeni null döner", () => {
    assert.equal(getEonetCategoryId("severestorms"), "severeStorms");
    assert.equal(getEonetCategoryId("VOLCANOES"), "volcanoes");
    assert.equal(getEonetCategoryId(""), "all");
    assert.equal(getEonetCategoryId("all"), "all");
    assert.equal(getEonetCategoryId("uzaylı_istilası"), null);
  });

  it("kategori sorgusunda kapanmış olayları da ister, genel sorguda sadece açık olayları", () => {
    const volcano = new URL(createEonetEventsUrl("volcanoes"));
    assert.equal(volcano.searchParams.get("category"), "volcanoes");
    assert.equal(volcano.searchParams.get("status"), "all");
    const all = new URL(createEonetEventsUrl("all"));
    assert.equal(all.searchParams.get("category"), null);
    assert.equal(all.searchParams.get("status"), "open");
  });

  it("canlı yanıtı küre biçimine çevirir", async () => {
    const events = await fetchNormalizedEonetEvents("volcanoes", async () => ({
      events: [{
        id: "EONET_1", title: "Etna Volcano, Italy",
        categories: [{ id: "volcanoes", title: "Volcanoes" }],
        geometry: [{ type: "Point", date: "2026-11-14T00:00:00Z", coordinates: [15, 37.7] }],
        sources: [{ id: "SIVolcano", url: "https://volcano.si.edu" }],
      }],
    }));
    assert.equal(events.length, 1);
    assert.equal(events[0].category, "volcanoes");
    assert.equal(events[0].coordinates.latitude_deg, 37.7);
    assert.equal(events[0].coordinates.longitude_deg, 15);
  });

  it("ağ hatası veya boş yanıtta null değil yedek kayıt döner", async () => {
    const failed = await fetchNormalizedEonetEvents("volcanoes", async () => { throw new Error("internet yok"); });
    assert.ok(Array.isArray(failed) && failed.length > 0);
    assert.ok(failed.every((e) => e.category === "volcanoes" && e.source_id === "FALLBACK"));
    const empty = await fetchNormalizedEonetEvents("all", async () => ({ events: [] }));
    assert.ok(Array.isArray(empty) && empty.length > 0);
  });
});
