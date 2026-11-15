import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_ACTION_TYPES,
  VALID_TEMPLATE_IDS,
  configureActionRouter,
  handleActionRouter,
  resetActionRouterState
} from "../src/ui/actionRouter.js";
import { initApp, submitTextCommand } from "../src/app.js";

function createClassList(initialClasses = []) {
  const set = new Set(initialClasses);
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (name) => set.has(name),
    toggle: (name, force) => {
      if (force === true) {
        set.add(name);
        return true;
      }
      if (force === false) {
        set.delete(name);
        return false;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    }
  };
}

function createMockElement(id, initialClasses = []) {
  const listeners = new Map();
  return {
    id,
    className: initialClasses.join(" "),
    classList: createClassList(initialClasses),
    style: {},
    textContent: "",
    value: "",
    children: [],
    attributes: new Map(),
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) || []) {
        fn({ preventDefault() {}, stopPropagation() {}, ...event });
      }
    },
    contains(other) {
      return other === this;
    },
    focus() {}
  };
}

function createMockDocument() {
  const elements = new Map([
    ["app-shell", createMockElement("app-shell")],
    ["scene-container", createMockElement("scene-container")],
    ["canvas-container", createMockElement("canvas-container", ["is-hidden"])],
    ["loading-overlay", createMockElement("loading-overlay", ["is-hidden"])],
    ["loading-progress-bar", createMockElement("loading-progress-bar")],
    ["loading-progress-text", createMockElement("loading-progress-text")],
    ["hud-container", createMockElement("hud-container")],
    ["status-badge", createMockElement("status-badge")],
    ["settings-panel", createMockElement("settings-panel", ["is-hidden"])],
    ["settings-toggle-button", createMockElement("settings-toggle-button")],
    ["student-mode-toggle", createMockElement("student-mode-toggle")],
    ["homework-basket-toggle", createMockElement("homework-basket-toggle", ["is-hidden"])],
    ["homework-count-badge", createMockElement("homework-count-badge")],
    ["homework-list", createMockElement("homework-list")],
    ["homework-basket-container", createMockElement("homework-basket-container", ["is-hidden"])],
    ["side-panel-container", createMockElement("side-panel-container", ["is-hidden"])],
    ["overlay-card-container", createMockElement("overlay-card-container", ["is-hidden"])],
    ["popup-container", createMockElement("popup-container", ["is-hidden"])],
    ["speech-panel", createMockElement("speech-panel", ["is-hidden"])],
    ["speech-text", createMockElement("speech-text")],
    ["command-form", createMockElement("command-form")],
    ["command-input", createMockElement("command-input")],
    ["mic-button", createMockElement("mic-button")]
  ]);
  const docListeners = new Map();

  return {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => createMockElement(tag),
    addEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      list.push(fn);
      docListeners.set(type, list);
    }
  };
}

describe("actionRouter sözleşme ve yaşam döngüsü testleri", () => {
  let originalWarn;
  let warnCalls;

  beforeEach(() => {
    resetActionRouterState();
    warnCalls = [];
    originalWarn = console.warn;
    console.warn = (...args) => warnCalls.push(args.join(" "));
  });

  afterEach(() => {
    console.warn = originalWarn;
    resetActionRouterState();
  });

  it("sözleşme: geçersiz girdilerde asla null dönmez veya hata fırlatmaz", () => {
    for (const badInput of [null, undefined, 42, "OPEN_POPUP", [], {}]) {
      const result = handleActionRouter(badInput);
      assert.equal(typeof result, "object");
      assert.notEqual(result, null);
      assert.equal(result.handled, false);
      assert.equal(result.action_type, null);
      assert.equal(result.template_id, "NONE");
      assert.equal(typeof result.is_student_mode, "boolean");
    }
    assert.equal(warnCalls.length, 6);
  });

  it("Bölüm 4 listesindeki 19 action_type değerinin tamamını karşılar", () => {
    assert.equal(VALID_ACTION_TYPES.length, 19);
    assert.equal(VALID_TEMPLATE_IDS.length, 6);
    const mockDoc = createMockDocument();
    const addedHomework = [];
    configureActionRouter({ doc: mockDoc, onHomeworkAdded: (item) => addedHomework.push(item) });

    for (const actionType of VALID_ACTION_TYPES) {
      const result = handleActionRouter({
        action_type: actionType,
        template_id: "APOLLO_11",
        parameters: { title: "Adım 1", step_id: "STEP_1" },
        speech_text: "Test açıklaması.",
        is_student_mode: true
      });
      assert.equal(result.handled, true);
      assert.equal(result.action_type, actionType);
      assert.equal(result.template_id, "APOLLO_11");
      assert.equal(result.is_student_mode, true);
      assert.equal(mockDoc.getElementById("status-badge").textContent, actionType);
    }

    assert.equal(warnCalls.length, 0);
    assert.equal(addedHomework.length, 1);
  });

  it("bilinmeyen veya küçük harfli action_type çökmez ve console.warn yazar", () => {
    const mockDoc = createMockDocument();
    configureActionRouter({ doc: mockDoc });

    const r1 = handleActionRouter({ action_type: "UNKNOWN_ACTION", template_id: "NONE", parameters: {} });
    const r2 = handleActionRouter({ action_type: "open_popup", template_id: "NONE", parameters: {} });

    assert.equal(r1.handled, false);
    assert.equal(r2.handled, false);
    assert.equal(warnCalls.length, 2);
  });

  it("bilinmeyen template_id değerini NONE olarak ele alır", () => {
    const mockDoc = createMockDocument();
    configureActionRouter({ doc: mockDoc });

    const result = handleActionRouter({
      action_type: "SHOW_FACT_CARD",
      template_id: "UNKNOWN_TEMPLATE",
      parameters: {}
    });

    assert.equal(result.handled, true);
    assert.equal(result.template_id, "NONE");
    assert.equal(mockDoc.getElementById("overlay-card-container").classList.contains("is-hidden"), false);
  });

  it("yeni 3D sahne açılırken önce eskisinin destroy() metodunu çağırır ve onProgress işler", async () => {
    const mockDoc = createMockDocument();
    const callOrder = [];
    let sceneCounter = 0;

    configureActionRouter({
      doc: mockDoc,
      create3DMissionScene: async (_container, modelUrl, onProgress) => {
        const id = ++sceneCounter;
        callOrder.push(`create:${id}:${modelUrl}`);
        onProgress(45);
        assert.equal(mockDoc.getElementById("loading-progress-bar").style.width, "45%");
        assert.equal(mockDoc.getElementById("loading-progress-text").textContent, "%45");
        return {
          destroy: () => {
            callOrder.push(`destroy:${id}`);
          }
        };
      }
    });

    const first = handleActionRouter({
      action_type: "FOCUS_OBJECT",
      template_id: "APOLLO_11",
      parameters: { model_url: "/public/models/saturn_v.glb" }
    });
    await first.scene_promise;
    assert.equal(mockDoc.getElementById("loading-overlay").classList.contains("is-hidden"), true);
    assert.equal(mockDoc.getElementById("loading-progress-text").textContent, "%100");

    const second = handleActionRouter({
      action_type: "SPLIT_SCREEN",
      template_id: "GRAVITY_SIM",
      parameters: { model_url: "/public/models/perseverance.glb" }
    });
    await second.scene_promise;

    handleActionRouter({ action_type: "RESET_VIEW", template_id: "NONE", parameters: {} });

    assert.deepEqual(callOrder, [
      "create:1:/public/models/saturn_v.glb",
      "destroy:1",
      "create:2:/public/models/perseverance.glb",
      "destroy:2"
    ]);
  });

  it("ses desteği yokken yazılı komut girişi router üzerinden tam çalışır", () => {
    const mockDoc = createMockDocument();
    initApp(mockDoc, { skipBootLoading: true });
    mockDoc.getElementById("command-input").value = "mars bilgi kartı";

    const result = submitTextCommand(mockDoc, "mars bilgi kartı");

    assert.equal(result.handled, true);
    assert.equal(result.action_type, "SHOW_FACT_CARD");
    assert.equal(mockDoc.getElementById("status-badge").textContent, "SHOW_FACT_CARD");
    assert.equal(mockDoc.getElementById("overlay-card-container").classList.contains("is-hidden"), false);
    assert.equal(mockDoc.getElementById("command-input").value, "");
  });

  it("NEO_SWARM için SOLAR_SYSTEM açar, bağımsız sahne açmaz, varolanı korur ve RESET_VIEW ile temizler", async () => {
    const mockDoc = createMockDocument();
    const bus = new EventTarget();
    const prevDispatch = globalThis.dispatchEvent;
    const emitted = [];
    const callOrder = [];
    let sceneCounter = 0;

    globalThis.dispatchEvent = (ev) => {
      if (ev?.type === "ag:neo-data" || ev?.type === "ag:focus-target") {
        emitted.push({ type: ev.type, detail: ev.detail });
      }
      return bus.dispatchEvent(ev);
    };

    try {
      configureActionRouter({
        doc: mockDoc,
        create3DMissionScene: async (_container, modelUrl) => {
          const id = ++sceneCounter;
          callOrder.push(`create:${id}:${modelUrl}`);
          return { destroy: () => callOrder.push(`destroy:${id}`) };
        }
      });

      const sample = [{ name: "99942 Apophis", distance_km: 31600, velocity_kmh: 107000, is_hazardous: true }];
      const first = handleActionRouter({
        action_type: "FOCUS_OBJECT",
        template_id: "NEO_SWARM",
        parameters: { model_url: "NEO_SWARM", asteroids: sample }
      });
      await first.scene_promise;

      // NEO_SWARM yerine SOLAR_SYSTEM açılmalı ve olaylar sırayla gönderilmeli
      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM"]);
      assert.deepEqual(emitted.map((e) => e.type), ["ag:neo-data", "ag:focus-target"]);
      assert.equal(emitted[1].detail.target, "EARTH");

      // SOLAR_SYSTEM zaten açıkken ikinci NEO_SWARM çağrısında destroy() ve yeniden kurulum olmamalı
      emitted.length = 0;
      const second = handleActionRouter({
        action_type: "FOCUS_OBJECT",
        template_id: "NONE",
        parameters: { asteroids: sample, camera_target: "99942 Apophis" }
      });
      assert.equal(second.scene_promise, null);
      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM"]);
      assert.equal(emitted[1].detail.target, "99942 Apophis");

      // RESET_VIEW SOLAR_SYSTEM'i açık bırakır, önce boş asteroit listesi sonra SUN odağı gönderir
      emitted.length = 0;
      handleActionRouter({ action_type: "RESET_VIEW", template_id: "NONE", parameters: {} });
      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM"]);
      assert.deepEqual(emitted, [
        { type: "ag:neo-data", detail: { parameters: { asteroids: [] } } },
        { type: "ag:focus-target", detail: { target: "SUN" } }
      ]);

      // Başka tekil modelden NEO_SWARM'a geçerken önce eskisinin destroy()'u çağrılır
      const standalone = handleActionRouter({
        action_type: "FOCUS_OBJECT",
        template_id: "APOLLO_11",
        parameters: { model_url: "/public/models/saturn_v.glb" }
      });
      await standalone.scene_promise;
      const backToNeo = handleActionRouter({
        action_type: "FOCUS_OBJECT",
        template_id: "NEO_SWARM",
        parameters: { asteroids: sample }
      });
      await backToNeo.scene_promise;
      assert.deepEqual(callOrder, [
        "create:1:SOLAR_SYSTEM",
        "destroy:1",
        "create:2:/public/models/saturn_v.glb",
        "destroy:2",
        "create:3:SOLAR_SYSTEM"
      ]);
    } finally {
      globalThis.dispatchEvent = prevDispatch;
    }
  });

  it("PLANET_COMPARISON geçişte önceki sahneyi destroy() ile temizler, açıkken ag:planet-comparison ile günceller", async () => {
    const mockDoc = createMockDocument();
    const bus = new EventTarget();
    const prevDispatch = globalThis.dispatchEvent;
    const emitted = [];
    const callOrder = [];
    let sceneCounter = 0;
    let latestProgress = null;

    globalThis.dispatchEvent = (ev) => {
      if (ev?.type === "ag:planet-comparison" || ev?.type === "ag:focus-target") {
        emitted.push({ type: ev.type, detail: ev.detail });
      }
      return bus.dispatchEvent(ev);
    };

    try {
      configureActionRouter({
        doc: mockDoc,
        create3DMissionScene: async (_container, modelUrl, onProgress) => {
          const id = ++sceneCounter;
          latestProgress = onProgress;
          callOrder.push(`create:${id}:${modelUrl}`);
          return { destroy: () => callOrder.push(`destroy:${id}`) };
        }
      });

      const solar = handleActionRouter({
        action_type: "FOCUS_OBJECT",
        template_id: "NONE",
        parameters: { model_url: "SOLAR_SYSTEM", camera_target: "SUN" }
      });
      await solar.scene_promise;

      const comp1 = handleActionRouter({
        action_type: "SHOW_COMPARISON",
        template_id: "NONE",
        parameters: { model_url: "PLANET_COMPARISON", primary_object: "EARTH", secondary_object: "MARS", is_gravity_test: false }
      });
      await comp1.scene_promise;

      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM", "destroy:1", "create:2:PLANET_COMPARISON"]);
      assert.equal(mockDoc.getElementById("overlay-card-container").classList.contains("is-hidden"), true);
      const initialAttr = JSON.parse(mockDoc.getElementById("scene-container").getAttribute("data-comparison-request"));
      assert.deepEqual(initialAttr, { primary_object: "EARTH", secondary_object: "MARS", is_gravity_test: false });

      emitted.length = 0;
      const comp2 = handleActionRouter({
        action_type: "SHOW_COMPARISON",
        template_id: "GRAVITY_SIM",
        parameters: { primary_object: "JUPITER", secondary_object: "MOON", mass_kg: 70, is_gravity_test: true }
      });
      assert.equal(comp2.scene_promise, null);
      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM", "destroy:1", "create:2:PLANET_COMPARISON"]);
      assert.deepEqual(emitted, [{
        type: "ag:planet-comparison",
        detail: { primary_object: "JUPITER", secondary_object: "MOON", is_gravity_test: true, mass_kg: 70 }
      }]);
      latestProgress(50);
      assert.equal(mockDoc.getElementById("loading-overlay").classList.contains("is-hidden"), false);
      latestProgress(100);
      assert.equal(mockDoc.getElementById("loading-overlay").classList.contains("is-hidden"), true);

      handleActionRouter({ action_type: "RESET_VIEW", template_id: "NONE", parameters: {} });
      assert.deepEqual(callOrder, ["create:1:SOLAR_SYSTEM", "destroy:1", "create:2:PLANET_COMPARISON", "destroy:2"]);
      assert.equal(mockDoc.getElementById("scene-container").attributes.has("data-comparison-request"), false);
    } finally {
      globalThis.dispatchEvent = prevDispatch;
    }
  });
});

describe("actionRouter öğrenci paneli köprüsü", () => {
  it("OPEN_SIDE_PANEL panel_view, CLOSE_PANEL ve SHOW_HOMEWORK_BASKET öğrenci paneline gider; is_student_mode bildirilir", () => {
    const studentActions = [];
    const modeChanges = [];
    configureActionRouter({
      doc: createMockDocument(),
      onStudentAction: (actionType, parameters) => { studentActions.push([actionType, parameters.panel_view ?? null]); return true; },
      onStudentModeChange: (flag) => modeChanges.push(flag)
    });
    const route = (action_type, parameters = {}, is_student_mode = false) =>
      handleActionRouter({ action_type, template_id: "NONE", parameters, speech_text: "", is_student_mode });

    route("OPEN_SIDE_PANEL", { panel_view: "STUDENT_MODE" });
    route("SHOW_HOMEWORK_BASKET");
    route("CLOSE_PANEL");
    route("FOCUS_OBJECT", {}, false);
    route("FOCUS_OBJECT", {}, true);
    route("SIMPLIFY_TEXT", {}, false);

    assert.deepEqual(studentActions, [["OPEN_SIDE_PANEL", "STUDENT_MODE"], ["SHOW_HOMEWORK_BASKET", null], ["CLOSE_PANEL", null]]);
    assert.deepEqual(modeChanges, [true, false], "iç rotaların false değeri modu kapatmaz, SIMPLIFY_TEXT kapatır");
  });

  it("öğrenci modunda student_description açıklamanın yerine geçer", () => {
    const added = [];
    configureActionRouter({ doc: createMockDocument(), onHomeworkAdded: (item) => added.push(item) });
    const params = { id: "mars", title: "Mars", description: "Uzun bilimsel metin", student_description: "Kırmızı gezegen" };
    handleActionRouter({ action_type: "ADD_TO_HOMEWORK", template_id: "NONE", parameters: params, speech_text: "", is_student_mode: true });
    handleActionRouter({ action_type: "SIMPLIFY_TEXT", template_id: "NONE", parameters: {}, speech_text: "", is_student_mode: false });
    handleActionRouter({ action_type: "ADD_TO_HOMEWORK", template_id: "NONE", parameters: params, speech_text: "", is_student_mode: false });
    assert.deepEqual(added.map((item) => item.description), ["Kırmızı gezegen", "Uzun bilimsel metin"]);
  });
});

describe("ADD_TO_HOMEWORK aktif sahneyi korur", () => {
  it("ödev aksiyonları sahne açmaz, karşılaştırma isteği yazmaz, fotoğraf pop-up'ı açmaz", async () => {
    const mockDoc = createMockDocument();
    const created = [];
    const homework = [];
    configureActionRouter({
      doc: mockDoc,
      create3DMissionScene: async (_container, modelUrl) => { created.push(modelUrl); return { destroy() {} }; },
      onHomeworkAdded: (item) => homework.push(item)
    });
    handleActionRouter({ action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { model_url: "SOLAR_SYSTEM", camera_target: "MARS" }, speech_text: "", is_student_mode: false });
    await Promise.resolve();
    assert.deepEqual(created, ["SOLAR_SYSTEM"]);

    const sceneContainer = mockDoc.getElementById("scene-container");
    const result = handleActionRouter({
      action_type: "ADD_TO_HOMEWORK", template_id: "GRAVITY_SIM",
      parameters: { query: "Ay yerçekimini ödevime ekle", model_url: "PLANET_COMPARISON", primary_object: "MOON", secondary_object: "MOON", supporting_photo: true, image_url: "https://x/y.jpg" },
      speech_text: "", is_student_mode: false
    });
    handleActionRouter({ action_type: "SHOW_HOMEWORK_BASKET", template_id: "NONE", parameters: { model_url: "EARTH_EVENTS" }, speech_text: "", is_student_mode: false });
    handleActionRouter({ action_type: "EXPORT_PDF", template_id: "NONE", parameters: { model_url: "SOLAR_FLARE" }, speech_text: "", is_student_mode: false });
    await Promise.resolve();

    assert.equal(result.handled, true);
    assert.equal(result.scene_promise, null);
    assert.deepEqual(created, ["SOLAR_SYSTEM"], "yeni sahne açılmadı");
    assert.equal(sceneContainer.getAttribute?.("data-comparison-request") ?? null, null);
    assert.equal(mockDoc.getElementById("popup-container").classList.contains("is-hidden"), true);
    assert.equal(homework.length, 1);
    assert.equal(homework[0].query, "Ay yerçekimini ödevime ekle");
  });
});

describe("önceki sorgulardan kalan panellerin otomatik temizlenmesi", () => {
  it("Hubble sorgusundan sonra deprem veya başka odak açıldığında açık kalan yan panel, kart ve pop-up kapatılır", () => {
    const mockDoc = createMockDocument();
    initApp(mockDoc, { skipBootLoading: true });

    const sidePanelEl = mockDoc.getElementById("side-panel-container");
    const overlayCardEl = mockDoc.getElementById("overlay-card-container");
    const popupEl = mockDoc.getElementById("popup-container");

    // 1. Hubble sorgusu çalıştırılır (yan panel açılır)
    handleActionRouter({
      action_type: "OPEN_SIDE_PANEL",
      template_id: "NONE",
      parameters: { title: "Hubble Space Telescope", description: "Hubble uzay teleskobu derin uzayı gözlemler." }
    });
    assert.equal(sidePanelEl.classList.contains("is-hidden"), false, "Hubble yan paneli açılmış olmalı");

    // 2. Ardından son depremler / Dünya sorgusu çalıştırılır (FOCUS_OBJECT)
    handleActionRouter({
      action_type: "FOCUS_OBJECT",
      template_id: "NONE",
      parameters: {
        model_url: "SOLAR_SYSTEM",
        camera_target: "EARTH",
        events: [
          { id: "eq-1", title: "Deprem M5.2", coordinates: { latitude_deg: 38.4, longitude_deg: 27.1 } }
        ]
      }
    });

    // 3. Hubble'dan kalan yan panel, kart ve popup kapalı olmalı
    assert.equal(sidePanelEl.classList.contains("is-hidden"), true, "Önceki Hubble yan paneli otomatik gizlenmiş olmalı");
    assert.equal(overlayCardEl.classList.contains("is-hidden"), true, "Overlay kartı kapalı olmalı");
    assert.equal(popupEl.classList.contains("is-hidden"), true, "Popup kapalı olmalı");
  });

  it("bilgi kartı açıkken yeni bir nesneye odaklanıldığında önceki kart kapanır", () => {
    const mockDoc = createMockDocument();
    configureActionRouter({ doc: mockDoc });

    const overlayCardEl = mockDoc.getElementById("overlay-card-container");

    // Bilgi kartı aç
    handleActionRouter({
      action_type: "SHOW_FACT_CARD",
      template_id: "NONE",
      parameters: { title: "Mars Bilgi Kartı", description: "Kızıl gezegen" }
    });
    assert.equal(overlayCardEl.classList.contains("is-hidden"), false);

    // Yeni nesneye odaklan (FOCUS_OBJECT)
    handleActionRouter({
      action_type: "FOCUS_OBJECT",
      template_id: "NONE",
      parameters: { model_url: "SOLAR_SYSTEM", camera_target: "JUPITER" }
    });
    assert.equal(overlayCardEl.classList.contains("is-hidden"), true, "Önceki bilgi kartı kapanmış olmalı");
  });
});
