import test from "node:test";
import assert from "node:assert/strict";

import { requestTopicImage } from "../src/ui/topicImageClient.js";

test("requestTopicImage POST /api/topic-image gönderir ve sadece https görseli kabul eder", async () => {
  let captured = null;
  const image = await requestTopicImage("Moon surface", "Ay", async (url, init) => {
    captured = { url, method: init.method, body: JSON.parse(init.body), hasSignal: Boolean(init.signal) };
    return { ok: true, json: async () => ({ image_url: "https://upload.wikimedia.org/moon.jpg", image_title: "Moon", image_source: "Wikipedia (en)" }) };
  });
  assert.deepEqual(captured, { url: "/api/topic-image", method: "POST", body: { query: "Moon surface", title: "Ay" }, hasSignal: true });
  assert.deepEqual(image, { image_url: "https://upload.wikimedia.org/moon.jpg", image_title: "Moon", image_source: "Wikipedia (en)" });

  assert.equal(await requestTopicImage("x", "", async () => ({ ok: true, json: async () => ({ image_url: "javascript:alert(1)" }) })), null);
  assert.equal(await requestTopicImage("x", "", async () => ({ ok: false })), null);
  assert.equal(await requestTopicImage("", "", async () => { throw new Error("çağrılmamalı"); }), null);
});

test("requestTopicImage ağ hatasında çökmez", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await requestTopicImage("Mars", "", async () => { throw new TypeError("Failed to fetch"); }), null);
  } finally {
    console.warn = originalWarn;
  }
});
