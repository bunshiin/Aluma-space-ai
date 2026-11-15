import test from "node:test";
import assert from "node:assert/strict";

import { createAnswerHomeworkItem, getAnswerText, hasUsableAnswer } from "../src/ui/homeworkAnswer.js";

const HUBBLE_ROUTE = {
  action_type: "FOCUS_OBJECT",
  template_id: "NONE",
  speech_text: "Hubble, Dünya'nın çevresinde yaklaşık 535 kilometre yükseklikte döner.",
  parameters: {
    title: "Hubble Uzay Teleskobu Yörüngesi",
    description: "Hubble Uzay Teleskobu, Dünya'nın alçak yörüngesinde, ortalama 535 kilometre yükseklikte bulunmaktadır.",
    sections: [{ heading: "Neden önemli?", body: "Atmosferin bulanıklığından kurtulur." }],
    facts: [{ label: "Yükseklik", value: "535 km" }],
    image_query: "Hubble Space Telescope",
    image_url: "https://upload.wikimedia.org/hubble.jpg",
    image_title: "Hubble Space Telescope",
    image_source: "Wikipedia (en)",
    supporting_photo: true,
    data_source: "GEMINI"
  },
  is_student_mode: false
};
const getText = (key) => (key === "answer_question_label" ? "Soru" : "");

test("Gemini cevabı soru, başlık, cevap metni, veriler ve soruyla gelen fotoğrafla karta çevrilir", () => {
  const item = createAnswerHomeworkItem("Hubble nerede?", HUBBLE_ROUTE, { getText });
  assert.equal(item.id, "ANSWER|hubble nerede");
  assert.equal(item.title, "Hubble Uzay Teleskobu Yörüngesi");
  assert.deepEqual(item.facts, [{ label: "Soru", value: "Hubble nerede?" }, { label: "Yükseklik", value: "535 km" }]);
  assert.equal(item.text, "Hubble Uzay Teleskobu, Dünya'nın alçak yörüngesinde, ortalama 535 kilometre yükseklikte bulunmaktadır.\n\nNeden önemli?: Atmosferin bulanıklığından kurtulur.");
  assert.deepEqual(item.photo, { image_url: "https://upload.wikimedia.org/hubble.jpg", image_title: "Hubble Space Telescope", image_source: "Wikipedia (en)" });
});

test("öğrenci modunda cevap sade sesli özetle başlar", () => {
  const text = getAnswerText(HUBBLE_ROUTE, true);
  assert.ok(text.startsWith("Hubble, Dünya'nın çevresinde yaklaşık 535 kilometre"));
  assert.ok(text.includes("alçak yörüngesinde"));
  assert.equal(createAnswerHomeworkItem("Hubble nerede?", HUBBLE_ROUTE, { isStudentMode: true, getText }).text, text);
});

test("yerel yedek, FALLBACK veya boş cevap karta yazılmaz; https olmayan görsel alınmaz", () => {
  assert.equal(hasUsableAnswer({ speech_text: "\"x\" komutu yerel uzay veri katmanıyla işlendi.", parameters: { query: "x" } }), false);
  assert.equal(hasUsableAnswer({ parameters: { description: "a", data_source: "FALLBACK" } }), false);
  assert.equal(createAnswerHomeworkItem("", HUBBLE_ROUTE, { getText }), null);
  assert.equal(createAnswerHomeworkItem("soru", null, { getText }), null);
  const insecure = createAnswerHomeworkItem("soru", { ...HUBBLE_ROUTE, parameters: { ...HUBBLE_ROUTE.parameters, image_url: "data:image/svg+xml,x" } }, { getText });
  assert.equal(insecure.photo, null, "uygulamanın yer tutucu görseli gerçek fotoğraf sayılmaz; kart kendi fotoğrafını arar");
});

test("sadece sesli özet dönen Gemini cevabı da eklenir; fotoğraf araması hedef cisimden yapılır", () => {
  const route = {
    action_type: "FOCUS_OBJECT", template_id: "NONE",
    parameters: { target_object: "JUPITER", data_source: "GEMINI" },
    speech_text: "Güneş Sistemi'nin en büyük gezegeni Jüpiter'dir."
  };
  const item = createAnswerHomeworkItem("En büyük gezegen hangisi?", route, { getText, getImageQuery: (key) => (key === "JUPITER" ? "Jupiter Juno" : "") });
  assert.equal(item.title, "En büyük gezegen hangisi?");
  assert.equal(item.text, "Güneş Sistemi'nin en büyük gezegeni Jüpiter'dir.");
  assert.equal(item.image_query, "Jupiter Juno");
  assert.equal(item.photo, null);
});
