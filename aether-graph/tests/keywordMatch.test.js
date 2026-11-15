import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasKeyword } from "../src/services/keywordMatch.js";
import { detectNasaQueryCategory } from "../src/services/intentDetector.js";

describe("kelime başı anahtar kelime eşleşmesi", () => {
  it("anahtar kelime başka kelimenin içinde eşleşmez, Türkçe ekle eşleşir", () => {
    assert.equal(hasKeyword("astronot kıyafetlerini göster", "afet"), false);
    assert.equal(hasKeyword("dünyadaki aktif afetler", "afet"), true);
    assert.equal(hasKeyword("Etna'nın son durumu", "etna"), true);
    assert.equal(hasKeyword("görselleri ver", "sel"), false);
  });

  it("astronot kıyafeti sorusu doğal afet (EONET) sanılmaz", () => {
    assert.equal(detectNasaQueryCategory("astronot kıyafetlerini göster"), null);
    assert.equal(detectNasaQueryCategory("dünyadaki aktif afetler").queryType, "eonet");
    assert.equal(detectNasaQueryCategory("en son gerçekleşen volkan patlaması").identifier, "volcanoes");
  });

  it("Mars uydusundan/yörüngeden fotoğraf istenince rover değil MRO yörünge arşivi seçilir", () => {
    const orbital = detectNasaQueryCategory("mars uydularından çekilmiş görselleri ver");
    assert.equal(orbital.queryType, "universal_photo");
    assert.equal(orbital.identifier, "mars_orbiter");
    assert.equal(detectNasaQueryCategory("Perseverance fotoğrafı").identifier, "perseverance");
  });
});
