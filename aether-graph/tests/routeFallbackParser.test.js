import test from "node:test";
import assert from "node:assert/strict";

import { applyComparisonEnrichment, isHomeworkIntent, removeHomeworkIntent, resolveFallbackActionType, stripHomeworkIntent } from "../src/ui/routeFallbackParser.js";

test("ödeve ekleme niyeti yakalanır, 'ödevimi göster' sepeti açar", () => {
  for (const text of ["Ay yerçekimini ödevime ekle", "ödeve ekle", "ödev sepetine ekle", "Ödevlerime kaydet", "add this to my homework"]) {
    assert.equal(isHomeworkIntent(text), true, text);
    assert.equal(resolveFallbackActionType(text), "ADD_TO_HOMEWORK", text);
  }
  assert.equal(isHomeworkIntent("ödevimi göster"), false);
  assert.equal(resolveFallbackActionType("ödevimi göster"), "SHOW_HOMEWORK_BASKET");
  assert.equal(resolveFallbackActionType("ödev sepeti pdf indir"), "EXPORT_PDF");
  assert.equal(stripHomeworkIntent("Bunu da Mars yerçekimini ödevime ekle!"), "Mars yerçekimini");
});

test("konu 'ödevime' ile 'ekle' arasında da olabilir; soru metni korunur", () => {
  const cases = [
    ["ödevime apollo 11 in çektiği siyah beyaz fotoğraflardan ekle", "apollo 11 in çektiği siyah beyaz fotoğraflardan"],
    ["Ödevime Jüpiter'in uydularını ekler misin", "Jüpiter'in uydularını"],
    ["Hubble nerede, ödevime ekle", "Hubble nerede"],
    ["ödev sepetime Satürn'ün halkalarını kaydet", "Satürn'ün halkalarını"],
    ["ödevime ekle", ""]
  ];
  for (const [text, question] of cases) {
    assert.equal(isHomeworkIntent(text), true, text);
    assert.equal(removeHomeworkIntent(text), question, text);
  }
  assert.equal(stripHomeworkIntent("bunu da ödevime ekle"), "", "sadece dolgu kelimesi kalırsa konu yok sayılır");
  assert.equal(isHomeworkIntent("ödevimi göster"), false);
});

test("aynı cisim (MOON vs MOON) kendisiyle kıyaslanmaz, tek cisim yerçekimi kartı açılır", () => {
  const params = { primary_object: "moon", secondary_object: "Ay", model_url: "PLANET_COMPARISON" };
  const action = applyComparisonEnrichment({ action_type: "SHOW_COMPARISON" }, params, "ay yerçekimi", "GRAVITY_SIM");
  assert.equal(action, "SHOW_FACT_CARD");
  assert.equal(params.secondary_object, undefined);
  assert.equal(params.primary_object, undefined);
  assert.equal(params.model_url, "SOLAR_SYSTEM");
  assert.equal(params.camera_target, "MOON");
  assert.equal(params.title, "Ay Yüzey Yerçekimi");
  assert.equal(params.facts[0].value, "1.62");

  const fromTarget = { target: "MOON" };
  assert.equal(applyComparisonEnrichment({ action_type: "FOCUS_OBJECT" }, fromTarget, "MOON", "GRAVITY_SIM"), "SHOW_FACT_CARD");
  assert.equal(fromTarget.camera_target, "MOON");
});

test("farklı iki cisim karşılaştırması bozulmaz", () => {
  const params = { primary_object: "EARTH", secondary_object: "MARS" };
  assert.equal(applyComparisonEnrichment({ action_type: "SHOW_COMPARISON" }, params, "dünya mars", "NONE"), "SHOW_COMPARISON");
  assert.equal(params.model_url, "PLANET_COMPARISON");
  assert.equal(params.secondary_object, "MARS");
});
