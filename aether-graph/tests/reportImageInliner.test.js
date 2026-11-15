import test from "node:test";
import assert from "node:assert/strict";

import { calculateCoverCrop, createCroppedImageDataUrl, inlineReportImages } from "../src/ui/reportImageInliner.js";
import { createMockDocument, findAllByClass } from "./mockDom.js";

function buildReport(doc, urls) {
  const report = doc.createElement("article");
  for (const url of urls) {
    const figure = doc.createElement("figure");
    figure.className = "homework-report-photo";
    const img = doc.createElement("img");
    img.className = "homework-report-photo-img";
    img.setAttribute("src", url);
    img.setAttribute("crossorigin", "anonymous");
    figure.append(img);
    report.append(figure);
  }
  return report;
}

test("calculateCoverCrop oranı bozmadan keser: yatayda ortadan, dikeyde üste yakın", () => {
  const vertical = calculateCoverCrop(1600, 1200, 1600, 900);
  assert.equal(vertical.sx, 0);
  assert.ok(Math.abs(vertical.sy - 105) < 1e-9, "300 px taşmanın %35'i üstten kesilir");
  assert.deepEqual([vertical.sw, vertical.sh], [1600, 900]);
  assert.deepEqual(calculateCoverCrop(2000, 900, 1600, 900), { sx: 200, sy: 0, sw: 1600, sh: 900 });
  assert.equal(calculateCoverCrop(0, 900, 1600, 900), null);
});

test("inlineReportImages fotoğrafları veri adresine çevirir, hazırlanamayanın kutusunu kaldırır", async () => {
  const doc = createMockDocument();
  const report = buildReport(doc, ["https://images-assets.nasa.gov/a.jpg", "https://upload.wikimedia.org/b.jpg"]);
  const requested = [];
  const result = await inlineReportImages(report, {
    loadImageDataUrl: async (src) => {
      requested.push(src);
      return src.includes("nasa") ? "data:image/jpeg;base64,QQ==" : null;
    }
  });
  assert.deepEqual(result, { inlined: 1, removed: 1 });
  assert.deepEqual(requested, ["https://images-assets.nasa.gov/a.jpg", "https://upload.wikimedia.org/b.jpg"]);
  const images = findAllByClass(report, "homework-report-photo-img");
  assert.equal(images.length, 1, "boş çerçeve PDF'te kalmaz");
  assert.equal(images[0].getAttribute("src"), "data:image/jpeg;base64,QQ==");
  assert.equal(images[0].getAttribute("crossorigin"), null);
});

test("createCroppedImageDataUrl güvensiz veya eksik girdide ağa çıkmadan null döner", async () => {
  const doc = createMockDocument();
  let calls = 0;
  const fetchFn = async () => { calls += 1; throw new Error("çağrılmamalı"); };
  assert.equal(await createCroppedImageDataUrl("http://insecure.example/a.jpg", { doc, fetchFn }), null);
  assert.equal(await createCroppedImageDataUrl("javascript:alert(1)", { doc, fetchFn }), null);
  assert.equal(await createCroppedImageDataUrl("", { doc, fetchFn }), null);
  assert.equal(await createCroppedImageDataUrl("https://images-assets.nasa.gov/a.jpg", { doc: null, fetchFn }), null);
  assert.equal(calls, 0);
});

test("createCroppedImageDataUrl doğrudan indirme olmazsa sunucu aktarıcısını dener, ikisi de olmazsa null", async () => {
  const doc = createMockDocument();
  const urls = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await createCroppedImageDataUrl("https://upload.wikimedia.org/x.jpg", {
      doc,
      fetchFn: async (url) => { urls.push(url); return { ok: false, status: 403 }; }
    });
    assert.equal(result, null);
    assert.deepEqual(urls, [
      "https://upload.wikimedia.org/x.jpg",
      `/api/image-proxy?url=${encodeURIComponent("https://upload.wikimedia.org/x.jpg")}`
    ]);
  } finally {
    console.warn = originalWarn;
  }
});
