import test from "node:test";
import assert from "node:assert/strict";

import { MissionStateMachine } from "../src/logic/stateMachine.js";
import { createExampleQuestions } from "../src/ui/exampleQuestions.js";

const machine = new MissionStateMachine();

test("örnek sorular bakılan hedefe göre üretilir", () => {
  const mars = createExampleQuestions({ target: "MARS" }, machine);
  assert.ok(mars.includes("Mars'ta yerçekimi ne kadar?"));
  assert.ok(mars.includes("Perseverance şu an nerede?"));

  const moon = createExampleQuestions({ target: "MOON" }, machine);
  assert.ok(moon.includes("Dünya'dan Ay'a ışık kaç saniyede gider?"));
  assert.ok(moon.includes("Apollo 11 nereye indi?"));
  assert.notDeepEqual(mars, moon);
});

test("hedef ve sahne birleşir, tekrar etmez, sınırı aşmaz", () => {
  const questions = createExampleQuestions({ target: "MARS", scene_id: "MARS_EXPLORATION" }, machine, { limit: 6 });
  assert.equal(new Set(questions).size, questions.length);
  assert.ok(questions.length <= 6);
  assert.ok(questions.includes("Jezero kraterinin uydu fotoğrafını göster"), "sahne soruları da eklenir");
  assert.equal(createExampleQuestions({ target: "MARS" }, machine, { limit: 2 }).length, 2);
});

test("bilinmeyen veya boş bağlam genel listeye düşer, makine yoksa boş dizi", () => {
  const fallback = machine.getExampleQuestions("DEFAULT");
  assert.deepEqual(createExampleQuestions({ target: "BILINMEYEN" }, machine), fallback);
  assert.deepEqual(createExampleQuestions(null, machine), fallback);
  assert.deepEqual(createExampleQuestions({ target: "MARS" }, null), []);
});

test("sepetteki sahne için 'ödevime ekle' sorusu tekrar önerilmez", () => {
  const local = new MissionStateMachine();
  const sceneItem = local.createHomeworkItem("LIGHT_DELAY", { source: "EARTH", target: "MARS", mode: "one-way" });
  const context = { target: "LIGHT_DELAY_NONE", scene_id: "LIGHT_DELAY", scene_item: sceneItem };
  assert.ok(createExampleQuestions(context, local).includes("Bu ışık gecikmesini ödevime ekle"));
  local.addToHomework(sceneItem);
  assert.ok(!createExampleQuestions(context, local).includes("Bu ışık gecikmesini ödevime ekle"));
});
