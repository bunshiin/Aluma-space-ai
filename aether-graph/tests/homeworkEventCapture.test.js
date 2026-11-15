import test from "node:test";
import assert from "node:assert/strict";

import { MissionStateMachine } from "../src/logic/stateMachine.js";
import { createHomeworkEventCapture, isPromptPhase } from "../src/ui/homeworkEventCapture.js";
import { CountingEventTarget } from "./mockDom.js";

const emitOn = (target) => (name, detail) => target.dispatchEvent(new CustomEvent(name, { detail }));

test("isPromptPhase prompt_phases yoksa her zaman, varsa sadece listedeki fazda true döner", () => {
  assert.equal(isPromptPhase({}, {}), true);
  assert.equal(isPromptPhase({ prompt_phases: ["COMPLETE"] }, { phase: "OUTBOUND" }), false);
  assert.equal(isPromptPhase({ prompt_phases: ["COMPLETE"] }, { phase: "COMPLETE" }), true);
});

test("sahne olaylarını yakalar, aynı konu için soruyu bir kez ister ve destroy dinleyicileri kaldırır", () => {
  const eventTarget = new CountingEventTarget();
  const machine = new MissionStateMachine();
  const captures = [];
  const capture = createHomeworkEventCapture({ eventTarget, machine, onCapture: (item, info) => captures.push([item.id, info.should_prompt]) });
  assert.equal(capture.getListenerCount(), 7, "5 sahne durumu + ag:focus-target + ag:earth-events");

  const emit = emitOn(eventTarget);
  emit("ag:spacecraft-ready", { id: "MRO", action_type: "FOCUS_OBJECT", parameters: {} });
  emit("ag:spacecraft-ready", { id: "MRO", action_type: "FOCUS_OBJECT" });
  emit("ag:planet-comparison-status", "bozuk");
  emit("ag:apollo-status", { phase: "LANDING", title: "Kartal indi" });

  assert.deepEqual(captures, [
    ["MARS_EXPLORATION|MRO", true],
    ["MARS_EXPLORATION|MRO", false],
    ["PLANET_COMPARISON", true],
    ["APOLLO_11|LANDING|Kartal indi", true]
  ]);
  assert.equal(capture.getLastItem().scene_id, "APOLLO_11");
  assert.equal(machine.getCurrentStateId(), "APOLLO_11");

  capture.destroy();
  assert.equal(eventTarget.getActiveCount(), 0);
  emit("ag:apollo-status", { phase: "LAUNCH" });
  assert.equal(captures.length, 4);
  assert.equal(capture.getLastItem(), null);
});

test("bağlam: odak hedefi sahne özetini siler, sahne olayı hedefi detail'den veya kameradan alır", () => {
  const eventTarget = new CountingEventTarget();
  const contexts = [];
  const capture = createHomeworkEventCapture({ eventTarget, machine: new MissionStateMachine(), onContextChange: (c) => contexts.push(c) });
  const emit = emitOn(eventTarget);

  emit("ag:light-delay-status", { source: "EARTH", target: "MARS", mode: "one-way", delay_s: 750, phase: "COMPLETE" });
  assert.equal(capture.getContext().target, "MARS");
  assert.equal(capture.getContext().scene_id, "LIGHT_DELAY");
  assert.equal(capture.getContext().scene_item.id, "LIGHT_DELAY|EARTH|MARS|one-way");

  emit("ag:focus-target", { target: "moon" });
  assert.deepEqual(capture.getContext(), { target: "MOON", scene_id: null, scene_item: null });

  emit("ag:apollo-status", { phase: "LANDING" });
  assert.equal(capture.getContext().target, "MOON", "detail'de hedef yoksa sahnenin camera_target'ı");

  emit("ag:earth-events", { events: [] });
  assert.equal(capture.getContext().scene_id, "EARTH_EVENTS");
  emit("ag:focus-target", { target: "<script>" });
  assert.equal(capture.getContext().target, "EARTH", "geçersiz hedef yok sayılır");
  assert.equal(contexts.length, 4);
  capture.destroy();
});
