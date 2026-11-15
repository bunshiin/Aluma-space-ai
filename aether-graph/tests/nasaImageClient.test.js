import test from "node:test";
import assert from "node:assert/strict";

import { clearDataLayerCache, getSpaceData } from "../src/api/dataLayer.js";
import { fetchNasaImages, normalizeNasaImageItem } from "../src/api/nasaImageClient.js";

const archiveItem = (id, title, href = `https://images-assets.nasa.gov/image/${id}/${id}~thumb.jpg`) => ({
  data: [{ nasa_id: id, title, description: "Lunar surface photograph", date_created: "1969-07-20T00:00:00Z" }],
  links: [{ href }]
});

const ARCHIVE_RESPONSE = {
  collection: {
    items: [
      archiveItem("as11-40-5903", "Apollo 11 Aldrin on the Moon"),
      archiveItem("moon-map", "Moon traverse map of landing route"),
      archiveItem("bad", "No https", "http://example.com/x.jpg"),
      { data: [{ title: "linksiz" }] }
    ]
  }
};

test("fetchNasaImages sadece gerçek fotoğrafları ve dar alanları döner", async () => {
  const urls = [];
  const photos = await fetchNasaImages("Moon surface", async (url) => { urls.push(url); return ARCHIVE_RESPONSE; });
  assert.match(urls[0], /^https:\/\/images-api\.nasa\.gov\/search\?q=Moon\+surface&media_type=image$/);
  assert.deepEqual(photos, [{
    nasa_id: "as11-40-5903",
    image_title: "Apollo 11 Aldrin on the Moon",
    image_url: "https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~thumb.jpg",
    image_source: "NASA Görsel Arşivi",
    date_created_utc: "1969-07-20T00:00:00Z"
  }]);
  assert.equal(normalizeNasaImageItem({ links: [{ href: "javascript:x" }] }), null);
});

test("fetchNasaImages hata, zaman aşımı veya boş sorguda boş dizi döner", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await fetchNasaImages("Mars", async () => { throw new Error("AbortError"); }), []);
    assert.deepEqual(await fetchNasaImages("", async () => ARCHIVE_RESPONSE), []);
    assert.deepEqual(await fetchNasaImages("Mars", async () => ({ bozuk: true })), []);
  } finally {
    console.warn = originalWarn;
  }
});

test("getSpaceData('nasa_images') fetch mock'uyla çalışır, internet yokken null değil boş dizi döner", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  clearDataLayerCache();
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ARCHIVE_RESPONSE });
    const photos = await getSpaceData("nasa_images", "Moon surface");
    assert.equal(photos.length, 1);
    assert.equal(photos[0].image_source, "NASA Görsel Arşivi");

    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    assert.deepEqual(await getSpaceData("nasa_images", "Jupiter storm"), []);
    assert.deepEqual(await getSpaceData("nasa_images", ""), []);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    clearDataLayerCache();
  }
});
