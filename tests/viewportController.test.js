import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createViewportController } from "../src/ui/viewportController.js";

function createMockElement() {
  const attrs = new Map();
  const classes = new Set();
  return {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    removeAttribute: (k) => attrs.delete(k),
    dispatchEvent: () => true,
  };
}

const EVENTS = [
  { id: "A", title: "Etna", category: "volcanoes", coordinates: { latitude_deg: 37.7, longitude_deg: 15 } },
  { id: "B", title: "Fire", category: "wildfires", coordinates: { latitude_deg: 31, longitude_deg: -89 } },
];

describe("viewportController: EONET Dünya küresi rotası", () => {
  let dispatched;
  let originalDispatch;

  beforeEach(() => {
    dispatched = [];
    originalDispatch = globalThis.dispatchEvent;
    globalThis.dispatchEvent = (event) => {
      dispatched.push({ type: event.type, detail: event.detail });
      return true;
    };
  });

  afterEach(() => {
    globalThis.dispatchEvent = originalDispatch;
  });

  function createController(calls) {
    let sceneId = 0;
    return createViewportController({
      sceneContainer: createMockElement(),
      create3DMissionScene: async (_container, modelUrl) => {
        const id = ++sceneId;
        calls.push(`create:${id}:${modelUrl}`);
        return { destroy: () => calls.push(`destroy:${id}`) };
      },
    });
  }

  it("afet listesi gelince EARTH_EVENTS sahnesi açılır, olaylar sahne hazır olunca gönderilir", async () => {
    const calls = [];
    const vc = createController(calls);
    const result = vc.applyAction("FOCUS_OBJECT", "NONE", { events: EVENTS, focus_event_id: "B" });
    assert.equal(dispatched.some((e) => e.type === "ag:earth-events"), false, "sahne hazır olmadan olay gönderilmez");
    await result.scene_promise;
    await Promise.resolve();
    assert.deepEqual(calls, ["create:1:EARTH_EVENTS"]);
    const sent = dispatched.find((e) => e.type === "ag:earth-events");
    assert.equal(sent.detail.focus_event_id, "B");
    assert.equal(sent.detail.events.length, 2);
    assert.equal(dispatched.some((e) => e.type === "ag:focus-target"), false, "küre rotası Güneş Sistemi kamerasına dokunmaz");
  });

  it("küre açıkken yeni afet sorgusu sahneyi yeniden kurmaz, RESET_VIEW küreyi kapatır", async () => {
    const calls = [];
    const vc = createController(calls);
    await vc.applyAction("FOCUS_OBJECT", "NONE", { events: EVENTS }).scene_promise;
    const second = vc.applyAction("SHOW_FACT_CARD", "NONE", { events: [EVENTS[1]] });
    assert.equal(second.scene_promise, null);
    assert.equal(dispatched.filter((e) => e.type === "ag:earth-events").length, 2);
    vc.applyAction("RESET_VIEW", "NONE", {});
    assert.deepEqual(calls, ["create:1:EARTH_EVENTS", "destroy:1"]);
  });

  it("Güneş Sisteminden küreye geçişte önce eski sahne temizlenir", async () => {
    const calls = [];
    const vc = createController(calls);
    await vc.applyAction("FOCUS_OBJECT", "NONE", { model_url: "SOLAR_SYSTEM", camera_target: "MARS" }).scene_promise;
    await vc.applyAction("FOCUS_OBJECT", "NONE", { events: EVENTS }).scene_promise;
    assert.deepEqual(calls, ["create:1:SOLAR_SYSTEM", "destroy:1", "create:2:EARTH_EVENTS"]);
  });

  it("aynı hedefe (ISS) zaten odaklıyken tekrar ag:focus-target yayınlamaz, farklı hedefte yayınlar", async () => {
    const calls = [];
    const vc = createController(calls);
    await vc.applyAction("FOCUS_OBJECT", "NONE", { model_url: "SOLAR_SYSTEM", camera_target: "ISS" }).scene_promise;
    await Promise.resolve();
    const initialFocusEvents = dispatched.filter((e) => e.type === "ag:focus-target");
    assert.equal(initialFocusEvents.length, 1);
    assert.equal(initialFocusEvents[0].detail.target, "ISS");

    vc.applyAction("OPEN_POPUP", "NONE", { model_url: "SOLAR_SYSTEM", camera_target: "ISS", image_url: "https://images-assets.nasa.gov/iss.jpg" });
    vc.applyAction("OPEN_POPUP", "NONE", { image_url: "https://images-assets.nasa.gov/iss2.jpg" });
    assert.equal(dispatched.filter((e) => e.type === "ag:focus-target").length, 1, "aynı hedefte tekrar odak atılmamalı");
    assert.equal(vc.getState().camera_target, "ISS");

    vc.applyAction("FOCUS_OBJECT", "NONE", { model_url: "SOLAR_SYSTEM", camera_target: "HUBBLE" });
    const afterChange = dispatched.filter((e) => e.type === "ag:focus-target");
    assert.equal(afterChange.length, 2, "farklı bir araç anıldığında odak atılmalı");
    assert.equal(afterChange[1].detail.target, "HUBBLE");
  });
});

describe("viewportController: ışık gecikmesi rotası", () => {
  let dispatched;
  let originalDispatch;

  beforeEach(() => {
    dispatched = [];
    originalDispatch = globalThis.dispatchEvent;
    globalThis.dispatchEvent = (event) => {
      dispatched.push({ type: event.type, detail: event.detail });
      return true;
    };
  });

  afterEach(() => {
    globalThis.dispatchEvent = originalDispatch;
  });

  it("LIGHT_DELAY Güneş Sistemi'nde ag:light-delay gönderir, kamerayı simülasyona bırakır, sıfırla ışını temizler", async () => {
    const calls = [];
    const vc = createViewportController({
      sceneContainer: createMockElement(),
      create3DMissionScene: async (_c, modelUrl) => {
        calls.push(modelUrl);
        return { destroy() {} };
      },
    });
    await vc.applyAction("SHOW_FACT_CARD", "LIGHT_DELAY", { source: "earth", target: "jupiter", mode: "round-trip", camera_target: "EARTH" }).scene_promise;
    await Promise.resolve();
    assert.deepEqual(calls, ["SOLAR_SYSTEM"]);
    const light = dispatched.find((e) => e.type === "ag:light-delay");
    assert.deepEqual(light.detail, { source: "EARTH", target: "JUPITER", mode: "round-trip" });
    assert.equal(dispatched.some((e) => e.type === "ag:focus-target"), false);

    vc.applyAction("RESET_VIEW", "NONE", {});
    assert.ok(dispatched.some((e) => e.type === "ag:light-delay-clear"));
  });
});
