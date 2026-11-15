import test from "node:test";
import assert from "node:assert/strict";

import { MissionStateMachine } from "../src/logic/stateMachine.js";
import { createTopicHomeworkItem, resolveHomeworkTopic } from "../src/ui/homeworkTopic.js";

const machine = new MissionStateMachine();
const build = (text, context) => createTopicHomeworkItem(resolveHomeworkTopic(text, context), machine);

test("tek gök cismi yerçekimi kendisiyle kıyaslanmaz, sadece o cismin bilgisi alınır", () => {
  assert.deepEqual(resolveHomeworkTopic("Ay yerçekimini ödevime ekle"), { kind: "GRAVITY", body: "MOON", text: "Ay yerçekimini" });
  assert.equal(resolveHomeworkTopic("Ay ile Ay yerçekimini ödevime ekle").kind, "GRAVITY", "aynı cisim iki kez geçse de kıyas yok");

  const item = build("Ay yerçekimini ödevime ekle");
  assert.equal(item.id, "GRAVITY|MOON");
  assert.deepEqual(item.facts, [
    { label: "Yüzey yerçekimi (m/s²)", value: "1.62" },
    { label: "Ortalama yarıçap (km)", value: "1737.4" },
    { label: "10 m'den düşme süresi (sn)", value: "3.51" }
  ]);
  assert.equal(item.image_query, "Moon surface");
  assert.ok(!("secondary_object" in item));
});

test("iki farklı cisimde yerçekimi karşılaştırması, ışık gecikmesinde sahneyle aynı id", () => {
  const comparison = build("Dünya ve Mars yerçekimini ödevime ekle");
  assert.equal(comparison.id, "PLANET_COMPARISON|EARTH|MARS");
  assert.ok(comparison.facts.some((f) => f.label === "Çekim oranı"));

  const light = build("Dünya'dan Mars'a ışık gecikmesini ödevime ekle");
  assert.equal(light.id, "LIGHT_DELAY|EARTH|MARS|one-way", "sahneden yakalanan ışık gecikmesiyle aynı id");
  assert.equal(light.title, "Dünya → Mars Işık Gecikmesi");
  assert.ok(light.facts.some((f) => f.label === "Tek yön gecikme (sn)" && Number(f.value) > 180));
});

test("araç, genel konu ve bağlam yedekleri", () => {
  assert.equal(build("Perseverance'ı ödevime ekle").id, "BODY|PERSEVERANCE");
  assert.equal(build("Perseverance'ı ödevime ekle").title, "Perseverance");
  const general = build("Kara delikler ödevime ekle");
  assert.equal(general.id, "TOPIC|kara delikler");
  assert.equal(general.title, "Kara delikler");

  const sceneItem = machine.createHomeworkItem("APOLLO_11", { phase: "LANDING" });
  assert.equal(build("bunu ödevime ekle", { target: "MOON", scene_item: sceneItem }).id, "APOLLO_11|LANDING");
  assert.equal(build("bunu ödevime ekle", { target: "SATURN" }).id, "BODY|SATURN");
  assert.equal(resolveHomeworkTopic("bunu ödevime ekle", {}), null);
  assert.equal(createTopicHomeworkItem(null, machine), null);
});

test("bilinmeyen cisim Dünya değerine düşmez, yerçekimi satırı üretilmez", () => {
  const item = build("Voyager 1 ödevime ekle");
  assert.equal(item.id, "BODY|VOYAGER_1");
  assert.deepEqual(item.facts, []);
});
