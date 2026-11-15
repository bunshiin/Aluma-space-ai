import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createOrbitalSearchTerm,
  fetchMarsOrbitalPhotos,
  getFallbackOrbitalPhotos,
  normalizeOrbitalPhotoResponse,
} from "../src/api/marsOrbitalClient.js";

const RAW = {
  collection: {
    items: [
      { data: [{ nasa_id: "OLD", title: "Old HiRISE", date_created: "2015-03-04T00:00:00Z", description: "x", keywords: [] }], links: [{ href: "https://images-assets.nasa.gov/image/OLD/OLD~small.jpg", render: "image" }] },
      { data: [{ nasa_id: "NEW", title: "New CTX view", date_created: "2021-02-22T00:00:00Z", description: "y", keywords: ["CTX"] }], links: [{ href: "https://images-assets.nasa.gov/image/NEW/NEW~small.jpg", render: "image" }] },
      { data: [{ nasa_id: "NOLINK", title: "Bozuk" }] },
    ],
  },
};

describe("marsOrbitalClient", () => {
  it("arama terimi krater ve kameradan kurulur, bilinmeyen kamera HiRISE olur", () => {
    assert.equal(createOrbitalSearchTerm("gale crater|ctx"), "CTX gale crater");
    assert.equal(createOrbitalSearchTerm("jezero crater|hirise"), "HiRISE jezero crater");
    assert.equal(createOrbitalSearchTerm("ares vallis|xyz"), "HiRISE ares vallis");
    assert.equal(createOrbitalSearchTerm(""), "HiRISE jezero crater");
  });

  it("ham NASA yanıtı sade biçime iner, linksiz kayıt atılır, en yeni önce gelir", () => {
    const photos = normalizeOrbitalPhotoResponse(RAW);
    assert.deepEqual(photos.map((p) => p.nasa_id), ["NEW", "OLD"]);
    assert.deepEqual(Object.keys(photos[0]).sort(), ["camera_instrument", "date_taken_utc", "description", "image_url", "nasa_id", "title"]);
    assert.equal(photos[0].camera_instrument, "CTX");
    assert.deepEqual(normalizeOrbitalPhotoResponse(null), []);
  });

  it("ağ hatası veya boş yanıtta null değil yedek kayıt döner", async () => {
    const failed = await fetchMarsOrbitalPhotos("jezero crater|hirise", async () => { throw new Error("internet yok"); });
    assert.deepEqual(failed, getFallbackOrbitalPhotos());
    const empty = await fetchMarsOrbitalPhotos("gale crater|ctx", async () => ({ collection: { items: [] } }));
    assert.ok(Array.isArray(empty) && empty.length > 0);
  });

  it("istek URL'si resmi NASA görsel arşivine gider", async () => {
    let requested = "";
    await fetchMarsOrbitalPhotos("gale crater|ctx", async (url) => { requested = url; return RAW; });
    const url = new URL(requested);
    assert.equal(url.host, "images-api.nasa.gov");
    assert.equal(url.searchParams.get("q"), "CTX gale crater");
    assert.equal(url.searchParams.get("media_type"), "image");
  });
});
