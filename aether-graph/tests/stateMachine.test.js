import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MissionStateMachine } from "../src/logic/stateMachine.js";

const statesData = JSON.parse(readFileSync(new URL("../src/config/states.json", import.meta.url), "utf8"));
const CONTRACT_TEMPLATE_IDS = ["LIGHT_DELAY", "GRAVITY_SIM", "NEO_SWARM", "SOLAR_FLARE", "APOLLO_11", "NONE"];

test("states.json şeması: her sahnede zorunlu alanlar var ve template_id geçerli", () => {
  assert.deepEqual(statesData.valid_template_ids, CONTRACT_TEMPLATE_IDS);
  for (const [id, scene] of Object.entries(statesData.scenes)) {
    assert.match(id, /^[A-Z0-9_]+$/);
    for (const key of ["title", "description", "student_description", "camera_target"]) {
      assert.equal(typeof scene[key], "string", `${id}.${key}`);
      assert.ok(scene[key].length > 0, `${id}.${key} boş`);
    }
    assert.ok(Array.isArray(scene.next_actions), `${id}.next_actions`);
    assert.ok(statesData.valid_template_ids.includes(scene.template_id), `${id}.template_id`);
  }
});

test("her target_state var olan bir adıma gider ve başlangıçtan her sahneye ulaşılır", () => {
  const scenes = statesData.scenes;
  const visited = new Set([statesData.initial_state]);
  const queue = [statesData.initial_state];
  while (queue.length > 0) {
    for (const action of scenes[queue.shift()].next_actions) {
      if (!action.target_state) continue;
      assert.ok(scenes[action.target_state], `bilinmeyen target_state: ${action.target_state}`);
      if (!visited.has(action.target_state)) { visited.add(action.target_state); queue.push(action.target_state); }
    }
  }
  assert.deepEqual([...visited].sort(), Object.keys(scenes).sort());
});

test("aynı öğe iki kez eklendiğinde ödev sepetinde tekil kalır", () => {
  const machine = new MissionStateMachine(statesData);
  const item = machine.createHomeworkItem("LIGHT_DELAY", { source: "EARTH", target: "MARS", mode: "one-way", delay_s: 750.5, phase: "COMPLETE" });
  const first = machine.addToHomework(item);
  const second = machine.addToHomework(machine.createHomeworkItem("LIGHT_DELAY", { source: "EARTH", target: "MARS", mode: "one-way", delay_s: 760 }));
  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(machine.getHomeworkItems().length, 1);

  const other = machine.addToHomework(machine.createHomeworkItem("LIGHT_DELAY", { source: "EARTH", target: "MOON", mode: "one-way" }));
  assert.equal(other.added, true);
  assert.equal(machine.getHomeworkItems().length, 2);
});

test("createHomeworkItem sadece states.json data_fields alanlarını alır, bilinmeyeni yok sayar", () => {
  const machine = new MissionStateMachine(statesData);
  const item = machine.createHomeworkItem("LIGHT_DELAY", { source: "EARTH", target: "MARS", mode: "one-way", delay_s: 750.123456789, secret: "x" });
  assert.equal(item.id, "LIGHT_DELAY|EARTH|MARS|one-way");
  assert.equal(item.title, "Işık Gecikmesi");
  assert.ok(item.facts.some((f) => f.label === "Tek yön gecikme (sn)" && f.value === "750.123"));
  assert.ok(!item.facts.some((f) => f.value === "x"));
  assert.equal(machine.createHomeworkItem("UNKNOWN_SCENE", {}), null);
  assert.equal(machine.createHomeworkItem("LIGHT_DELAY", null).id, "LIGHT_DELAY");
});

test("bozuk girdiler hata fırlatmaz", () => {
  const machine = new MissionStateMachine(null);
  assert.equal(machine.getCurrentStep(), null);
  assert.deepEqual(machine.addToHomework(null), { added: false, reason: "INVALID_ITEM", item: null });
  assert.equal(machine.createHomeworkItemFromParameters({}), null);
  assert.equal(machine.removeFromHomework("yok"), false);
  assert.equal(machine.updateHomeworkText("yok", "metin"), false);
  assert.equal(machine.setHomeworkPhoto("yok", { image_url: "https://x" }), false);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(machine.handleTransition("YOK"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("öğrenci modunda student_description döner, mod değişimi sadece değişince true", () => {
  const machine = new MissionStateMachine(statesData);
  assert.equal(machine.getStepDescription("MARS_EXPLORATION"), statesData.scenes.MARS_EXPLORATION.description);
  assert.equal(machine.setStudentMode(true), true);
  assert.equal(machine.setStudentMode(true), false);
  assert.equal(machine.getStepDescription("MARS_EXPLORATION"), statesData.scenes.MARS_EXPLORATION.student_description);
});

test("düzenlenen metin kaydedilir, silme sepeti günceller, dışarıya kopya döner", () => {
  const machine = new MissionStateMachine(statesData);
  machine.addToHomework(machine.createHomeworkItemFromParameters({ id: "apollo-leo", title: "Apollo 11 LEO", description: "Ay'a iniş görevi." }));
  assert.equal(machine.getHomeworkItems()[0].text, "Ay'a iniş görevi.", "metin açıklamayla başlar");
  assert.equal(machine.updateHomeworkText("apollo-leo", "Ay'a kaç günde gidildi?\nBence 4 gün."), true);
  const items = machine.getHomeworkItems();
  assert.equal(items[0].text, "Ay'a kaç günde gidildi?\nBence 4 gün.");
  items[0].title = "değişti";
  assert.equal(machine.getHomeworkItems()[0].title, "Apollo 11 LEO");
  assert.equal(machine.removeFromHomework("apollo-leo"), true);
  assert.equal(machine.getHomeworkItems().length, 0);
});

test("ui_texts değişkenleri doldurur", () => {
  const machine = new MissionStateMachine(statesData);
  assert.equal(machine.getUiText("add_question", { topic: "Mars Keşfi" }), "Bu konuyu (Mars Keşfi) Ödev Sepetine eklemek ister misin?");
  assert.equal(machine.getUiText("olmayan_anahtar"), "");
});

test("setHomeworkPhoto sadece https veya data:image adresini kabul eder", () => {
  const machine = new MissionStateMachine(statesData);
  machine.addToHomework(machine.createHomeworkItemFromParameters({ id: "mars", title: "Mars" }));
  assert.equal(machine.setHomeworkPhoto("mars", { image_url: "javascript:alert(1)" }), false);
  assert.equal(machine.setHomeworkPhoto("mars", { image_url: "http://insecure.example/x.jpg" }), false);
  assert.equal(machine.setHomeworkPhoto("mars", { image_url: "https://images-assets.nasa.gov/a.jpg", image_source: "NASA" }), true);
  assert.equal(machine.getHomeworkItems()[0].photo.image_url, "https://images-assets.nasa.gov/a.jpg");
  assert.equal(machine.setHomeworkPhoto("mars", { image_url: "data:image/png;base64,AAAA" }), true);
});
