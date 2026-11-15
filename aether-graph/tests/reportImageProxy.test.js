import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PROXY_IMAGE_BYTES, fetchProxiedImage, isAllowedImageUrl } from "../src/services/reportImageProxy.js";

function fakeResponse({ ok = true, url = "", type = "image/jpeg", length = null, bytes = 4 } = {}) {
  return {
    ok,
    url,
    headers: { get: (name) => (name === "content-type" ? type : name === "content-length" ? length : null) },
    arrayBuffer: async () => new Uint8Array(bytes).buffer
  };
}

test("isAllowedImageUrl yalnızca https NASA/Wikimedia adreslerine izin verir", () => {
  assert.equal(isAllowedImageUrl("https://images-assets.nasa.gov/image/a/a~small.jpg"), true);
  assert.equal(isAllowedImageUrl("https://upload.wikimedia.org/wikipedia/commons/a.jpg"), true);
  assert.equal(isAllowedImageUrl("https://en.wikipedia.org/x.png"), true);
  assert.equal(isAllowedImageUrl("http://images-assets.nasa.gov/a.jpg"), false, "https zorunlu");
  assert.equal(isAllowedImageUrl("https://evil-nasa.gov.example.com/a.jpg"), false);
  assert.equal(isAllowedImageUrl("https://notnasa.gov/a.jpg"), false);
  assert.equal(isAllowedImageUrl("https://user:pw@images-assets.nasa.gov/a.jpg"), false);
  assert.equal(isAllowedImageUrl("https://images-assets.nasa.gov:8443/a.jpg"), false);
  assert.equal(isAllowedImageUrl("https://127.0.0.1/a.jpg"), false);
  assert.equal(isAllowedImageUrl("nonsense"), false);
  assert.equal(isAllowedImageUrl(null), false);
});

test("fetchProxiedImage izinli resmi döner, izinsiz adreste ağa çıkmaz", async () => {
  let calls = 0;
  const ok = await fetchProxiedImage("https://upload.wikimedia.org/a.jpg", async () => { calls += 1; return fakeResponse({ url: "https://upload.wikimedia.org/a.jpg" }); });
  assert.equal(ok.status, 200);
  assert.equal(ok.content_type, "image/jpeg");
  assert.equal(ok.body.length, 4);
  assert.deepEqual(await fetchProxiedImage("https://example.com/a.jpg", async () => { calls += 1; }), { status: 400 });
  assert.equal(calls, 1);
});

test("fetchProxiedImage resim olmayan, SVG, çok büyük veya izinsiz yere yönlenen içeriği reddeder", async () => {
  const url = "https://images-assets.nasa.gov/a.jpg";
  assert.equal((await fetchProxiedImage(url, async () => fakeResponse({ type: "text/html" }))).status, 415);
  assert.equal((await fetchProxiedImage(url, async () => fakeResponse({ type: "image/svg+xml" }))).status, 415);
  assert.equal((await fetchProxiedImage(url, async () => fakeResponse({ length: String(MAX_PROXY_IMAGE_BYTES + 1) }))).status, 413);
  assert.equal((await fetchProxiedImage(url, async () => fakeResponse({ url: "https://evil.example/a.jpg" }))).status, 400);
  assert.equal((await fetchProxiedImage(url, async () => fakeResponse({ ok: false }))).status, 502);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await fetchProxiedImage(url, async () => { throw new Error("offline"); })).status, 502);
  } finally {
    console.warn = originalWarn;
  }
});
