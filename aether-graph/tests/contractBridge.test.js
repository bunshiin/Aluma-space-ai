import test from "node:test";
import assert from "node:assert/strict";

import { resetActionRouterState } from "../src/ui/actionRouter.js";
import {
  createContractBridge,
  enrichRoutePayload,
  loadExternalContracts,
  requestRouteFromServer,
  resolveFallbackActionType
} from "../src/ui/contractBridge.js";

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...items) => items.forEach((i) => set.add(i)),
    remove: (...items) => items.forEach((i) => set.delete(i)),
    toggle: (item, force) => {
      if (typeof force === "boolean") {
        if (force) set.add(item);
        else set.delete(item);
        return force;
      }
      if (set.has(item)) {
        set.delete(item);
        return false;
      }
      set.add(item);
      return true;
    },
    contains: (item) => set.has(item)
  };
}

function createMockElement(tagName, ownerDocument, id = "", initialClasses = []) {
  const attrs = new Map();
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    id,
    className: initialClasses.join(" "),
    value: "",
    textContent: "",
    style: {},
    ownerDocument,
    children: [],
    classList: createClassList(initialClasses),
    get firstChild() {
      return this.children[0] || null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      return child;
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    removeAttribute: (k) => attrs.delete(k),
    addEventListener(eventName, handler) {
      const list = listeners.get(eventName) || [];
      list.push(handler);
      listeners.set(eventName, list);
    },
    triggerClick() {
      (listeners.get("click") || []).forEach((fn) => fn({ target: this }));
    }
  };
}

function createMockDom() {
  const map = new Map();
  const doc = {
    createElement: (tagName) => createMockElement(tagName, doc),
    getElementById: (id) => map.get(id) || null
  };
  const reg = (id, tag = "div", cls = []) => {
    const el = createMockElement(tag, doc, id, cls);
    map.set(id, el);
    return el;
  };
  [
    ["app-shell"], ["scene-container"], ["canvas-container", "div", ["is-hidden"]],
    ["procedural-canvas", "canvas"], ["loading-overlay", "div", ["is-hidden"]],
    ["loading-progress-bar"], ["loading-progress-text"], ["hud-container"],
    ["status-badge", "span"], ["speech-panel", "div", ["is-hidden"]], ["speech-text", "p"],
    ["hud-size-toggle", "button"], ["simplify-text-button", "button"],
    ["play-animation-button", "button"], ["pause-animation-button", "button"],
    ["overlay-card-container", "section", ["is-hidden"]],
    ["side-panel-container", "aside", ["is-hidden"]], ["side-panel-title", "h2"],
    ["side-panel-body"], ["side-panel-actions"], ["side-panel-close-button", "button"],
    ["popup-container", "div", ["is-hidden"]], ["popup-dialog"], ["popup-title", "h2"],
    ["popup-content"], ["popup-close-button", "button"],
    ["homework-basket-container", "div", ["is-hidden"]], ["homework-list", "ul"],
    ["homework-count-badge", "span"]
  ].forEach(([id, tag, cls]) => reg(id, tag, cls));
  return doc;
}

test("resolveFallbackActionType ve loadExternalContracts eksik modüllerde çökmez", async () => {
  assert.equal(resolveFallbackActionType("mars bilgi kartı"), "SHOW_FACT_CARD");
  assert.equal(resolveFallbackActionType("pdf indir"), "EXPORT_PDF");
  assert.equal(resolveFallbackActionType("merhaba"), "OPEN_SIDE_PANEL");

  const loaded = await loadExternalContracts(async () => {
    throw new Error("ERR_MODULE_NOT_FOUND");
  });
  assert.deepEqual(loaded, {
    getRouteFromGemini: null,
    create3DMissionScene: null,
    getSpaceData: null,
    calculateLightDelay: null,
    renderProceduralPlanet: null,
    MissionStateMachine: null,
    statesData: null
  });
});

test("createContractBridge Gemini, statesData, getSpaceData ve next_actions geçişlerini uçtan uca bağlar", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const homeworkItems = [];
  const speechCalls = [];

  const statesData = {
    APOLLO_11: {
      LEO: {
        title: "Alçak Dünya Yörüngesi",
        description: "Ay yolculuğu öncesi son kontroller yapılır.",
        camera_target: "SATURN_V_STAGE_3",
        next_actions: [
          { label: "TLI Ateşlemesi", target_state: "TLI" },
          { label: "Ödeve Ekle", action: "ADD_TO_NOTEBOOK", id: "apollo-leo", title: "Apollo 11 LEO" }
        ]
      },
      TLI: {
        title: "Ay Transfer Yörüngesi",
        description: "J-2 motoru uzay aracını Ay rotasına çıkarır.",
        camera_target: "MOON_TRAJECTORY",
        next_actions: []
      }
    }
  };

  const bridge = createContractBridge({
    doc,
    contracts: {
      statesData,
      getRouteFromGemini: async (input) => ({
        action_type: "OPEN_SIDE_PANEL",
        template_id: "APOLLO_11",
        parameters: { target_state: "LEO", query: input },
        speech_text: "Alçak Dünya yörüngesi açıldı.",
        is_student_mode: true
      }),
      getSpaceData: async (queryType) => {
        assert.equal(queryType, "APOLLO_11");
        return [{ label: "Kalkış", value: "16 Temmuz 1969" }];
      }
    },
    onHomeworkAdded: (item) => homeworkItems.push(item),
    onSpeechText: (txt) => speechCalls.push(txt)
  });

  const result = await bridge.dispatchUserCommand("Apollo 11 başlat", false);
  assert.equal(result.handled, true);
  assert.equal(result.template_id, "APOLLO_11");
  assert.equal(result.is_student_mode, true);
  assert.deepEqual(speechCalls, ["Alçak Dünya yörüngesi açıldı."]);

  assert.equal(doc.getElementById("side-panel-container").classList.contains("is-hidden"), false);
  assert.equal(doc.getElementById("side-panel-title").textContent, "Alçak Dünya Yörüngesi");
  assert.equal(doc.getElementById("side-panel-body").classList.contains("is-hidden"), false);

  const actionButtons = doc.getElementById("side-panel-actions").children;
  assert.equal(actionButtons.length, 2);

  actionButtons[1].triggerClick();
  assert.equal(homeworkItems.length, 1);
  assert.equal(homeworkItems[0].id, "apollo-leo");
  assert.equal(homeworkItems[0].title, "Apollo 11 LEO");

  actionButtons[0].triggerClick();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(doc.getElementById("side-panel-title").textContent, "Ay Transfer Yörüngesi");
  assert.equal(doc.getElementById("scene-container").getAttribute("data-camera-target"), "MOON_TRAJECTORY");
  assert.equal(doc.getElementById("side-panel-actions").classList.contains("is-hidden"), true);
});

test("enrichRoutePayload geçersiz JSON geldiğinde güvenli fallback döner", async () => {
  const safe = await enrichRoutePayload(null, {});
  assert.equal(safe.action_type, "RESET_VIEW");
  assert.equal(safe.template_id, "NONE");
});

test("requestRouteFromServer POST /api/route gönderir ve hata durumunda null döner", async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, method: init.method, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({ action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { target: "Mars" }, speech_text: "Mars odaklandı.", is_student_mode: true })
    };
  };
  try {
    const res = await requestRouteFromServer("Marsı göster", true);
    assert.deepEqual(captured, { url: "/api/route", method: "POST", body: { text: "Marsı göster", is_student_mode: true } });
    assert.equal(res.action_type, "FOCUS_OBJECT");
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    assert.equal(await requestRouteFromServer("test"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enrichRoutePayload genişletilmiş AI action/template ve hedef alanlarını normalleştirir", async () => {
  const apod = await enrichRoutePayload({
    action_type: "FILTER_DATA",
    template_id: "APOD_GALLERY",
    parameters: { hd_image_url: "https://apod.nasa.gov/apod/img.jpg", data_source: "NASA_API" },
    speech_text: "Günün fotoğrafı açıldı. [Doğrudan NASA Görsel Linki: https://apod.nasa.gov/apod/img.jpg]",
    is_student_mode: false
  }, {}, "günün uzay fotoğrafı");
  assert.equal(apod.action_type, "OPEN_POPUP");
  assert.equal(apod.template_id, "NONE");
  assert.equal(apod.parameters.image_url, "https://apod.nasa.gov/apod/img.jpg");
  assert.equal(apod.speech_text, "Günün fotoğrafı açıldı.");

  const mars = await enrichRoutePayload({
    action_type: "NAVIGATE_TO",
    template_id: "PLANET_ORBIT_VIEW",
    parameters: { target: "Mars" },
    speech_text: "Mars yakınlaştırılıyor.",
    is_student_mode: false
  });
  assert.equal(mars.action_type, "FOCUS_OBJECT");
  assert.equal(mars.parameters.model_url, "SOLAR_SYSTEM");
  assert.equal(mars.parameters.camera_target, "MARS");
});

test("createContractBridge FALLBACK yanıtında normal komutta sohbeti sıfırlamaz, sıfırlamada RESET_VIEW korur", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const bridge = createContractBridge({
    doc,
    contracts: {
      getRouteFromGemini: async () => ({
        action_type: "RESET_VIEW",
        template_id: "NONE",
        parameters: { data_source: "FALLBACK" },
        speech_text: "Sinyal işlenirken geçici bir sorun oluştu.",
        is_student_mode: false
      })
    }
  });

  const marsRes = await bridge.resolveUserCommand("Mars hakkında bilgi ver", false);
  assert.equal(marsRes.action_type, "SHOW_FACT_CARD");
  assert.equal(marsRes.parameters.camera_target, "MARS");
  assert.equal(marsRes.parameters.model_url, "SOLAR_SYSTEM");

  const resetRes = await bridge.resolveUserCommand("sıfırla", false);
  assert.equal(resetRes.action_type, "RESET_VIEW");
});

test("PLANET_COMPARISON Mod A ve Mod B yerçekimi komutlarını çözer, çıplak tekil yerçekimini bozmaz", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const bridge = createContractBridge({ doc, contracts: {} });

  const modeA = await bridge.resolveUserCommand("Dünya ile Mars'ı karşılaştır", false);
  assert.equal(modeA.action_type, "SHOW_COMPARISON");
  assert.equal(modeA.template_id, "NONE");
  assert.equal(modeA.parameters.model_url, "PLANET_COMPARISON");
  assert.equal(modeA.parameters.primary_object, "EARTH");
  assert.equal(modeA.parameters.secondary_object, "MARS");
  assert.equal(modeA.parameters.is_gravity_test, false);

  const modeB = await bridge.resolveUserCommand("Jüpiter ve Ay 70 kg astronot yerçekimi testi", false);
  assert.equal(modeB.action_type, "SHOW_COMPARISON");
  assert.equal(modeB.template_id, "GRAVITY_SIM");
  assert.equal(modeB.parameters.model_url, "PLANET_COMPARISON");
  assert.equal(modeB.parameters.primary_object, "JUPITER");
  assert.equal(modeB.parameters.secondary_object, "MOON");
  assert.equal(modeB.parameters.is_gravity_test, true);
  assert.equal(modeB.parameters.mass_kg, 70);

  const bareGravity = await bridge.resolveUserCommand("mars yerçekimi", false);
  assert.equal(bareGravity.action_type, "OPEN_SIDE_PANEL");

  const normalizedGemini = await enrichRoutePayload({
    action_type: "COMPARE_OBJECTS",
    template_id: "NONE",
    parameters: { primary_object: "Jüpiter", secondary_object: "mars" },
    speech_text: "Karşılaştırma açıldı.",
    is_student_mode: false
  });
  assert.equal(normalizedGemini.action_type, "SHOW_COMPARISON");
  assert.equal(normalizedGemini.parameters.model_url, "PLANET_COMPARISON");
  assert.equal(normalizedGemini.parameters.primary_object, "JUPITER");
  assert.equal(normalizedGemini.parameters.secondary_object, "MARS");
});

test("ISS göster ve uzay istasyonu niyeti Türkçe büyük/küçük harf fark etmeksizin SOLAR_SYSTEM + ISS odağına yönlendirilir", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const bridge = createContractBridge({ doc, contracts: {} });

  for (const cmd of ["ISS göster", "İSS göster", "ıss göster", "Uluslararası Uzay İstasyonu nerede", "uzay istasyonuna odaklan"]) {
    const res = await bridge.resolveUserCommand(cmd, false);
    assert.equal(res.parameters.model_url, "SOLAR_SYSTEM", `model_url hatalı: ${cmd}`);
    assert.equal(res.parameters.camera_target, "ISS", `camera_target hatalı: ${cmd}`);
  }

  const fromTargetObject = await enrichRoutePayload({
    action_type: "FOCUS_OBJECT",
    template_id: "NONE",
    parameters: { target_object: "ISS", data_source: "NASA_API" },
    speech_text: "ISS odaklandı.",
    is_student_mode: false
  });
  assert.equal(fromTargetObject.parameters.model_url, "SOLAR_SYSTEM");
  assert.equal(fromTargetObject.parameters.camera_target, "ISS");
});

test("ISS odaklıyken 'ISS son fotoğrafları getir' veya 'son fotoğrafları getir' tekrar odak atmaz, başka araçta atar", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const focusEvents = [];
  const originalDispatch = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (event) => {
    if (event.type === "ag:focus-target") {
      focusEvents.push(event.detail);
    }
    return true;
  };

  try {
    const bridge = createContractBridge({
      doc,
      contracts: {
        create3DMissionScene: async () => ({ destroy: () => {} }),
        getRouteFromGemini: async (input) => {
          if (input === "ISS nedir") {
            return {
              action_type: "FOCUS_OBJECT",
              template_id: "NONE",
              parameters: { target_object: "ISS", target: "ISS", data_source: "NASA_API" },
              speech_text: "Uluslararası Uzay İstasyonu alçak Dünya yörüngesindedir.",
              is_student_mode: false
            };
          }
          if (input === "ISS son fotoğrafları getir" || input === "son fotoğrafları getir") {
            return {
              action_type: "OPEN_POPUP",
              template_id: "NONE",
              parameters: {
                image_url: "https://images-assets.nasa.gov/image/iss070e001/iss070e001~orig.jpg",
                title: "Earth from International Space Station",
                target_object: "ISS",
                data_source: "NASA_API"
              },
              speech_text: "İşte ISS'in son fotoğrafı.",
              is_student_mode: false
            };
          }
          return {
            action_type: "OPEN_POPUP",
            template_id: "NONE",
            parameters: {
              image_url: "https://images-assets.nasa.gov/image/hubble001/hubble001~orig.jpg",
              title: "Hubble Deep Field",
              target_object: "HUBBLE",
              data_source: "NASA_API"
            },
            speech_text: "İşte Hubble fotoğrafı.",
            is_student_mode: false
          };
        }
      }
    });

    await bridge.dispatchUserCommand("ISS nedir", false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(focusEvents.length, 1);
    assert.equal(focusEvents[0].target, "ISS");

    await bridge.dispatchUserCommand("ISS son fotoğrafları getir", false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(focusEvents.length, 1, "ISS zaten odaklıyken ISS fotoğraf isteğinde tekrar odak atılmamalı");
    assert.equal(doc.getElementById("scene-container").getAttribute("data-camera-target"), "ISS");

    await bridge.dispatchUserCommand("son fotoğrafları getir", false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(focusEvents.length, 1, "Takip fotoğraf isteğinde fotoğraf başlığındaki 'Earth' yüzünden Dünya'ya odak kaymamalı");
    assert.equal(doc.getElementById("scene-container").getAttribute("data-camera-target"), "ISS");

    await bridge.dispatchUserCommand("Hubble son fotoğrafları getir", false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(focusEvents.length, 2, "Başka bir araç (Hubble) anıldığında yeni araca odak atılmalı");
    assert.equal(focusEvents[1].target, "HUBBLE");
  } finally {
    globalThis.dispatchEvent = originalDispatch;
  }
});

test("enrichRoutePayload genel soruda sahne/odak alanı eklemez, geniş pop-up açar", async () => {
  const route = await enrichRoutePayload({
    action_type: "FOCUS_OBJECT",
    template_id: "NONE",
    parameters: { is_general_question: true, title: "Güneş neden sıcak?", camera_target: "SUN", model_url: "SOLAR_SYSTEM" },
    speech_text: "Güneş çekirdeğinde füzyon olur.",
  }, {}, "güneş neden sıcak");
  assert.equal(route.action_type, "OPEN_POPUP");
  assert.equal(route.template_id, "NONE");
  assert.equal("camera_target" in route.parameters, false);
  assert.equal("model_url" in route.parameters, false);
  assert.equal(route.parameters.is_general_question, true);
});

test("enrichRoutePayload Gemini zengin içerik verdiyse yönlendirme alanlarını kartta ham satır yapmaz", async () => {
  const route = await enrichRoutePayload({
    action_type: "SHOW_FACT_CARD",
    template_id: "NONE",
    parameters: {
      data_source: "GEMINI",
      target_object: "MOON",
      image_query: "Neil Armstrong Apollo 11 Moon landing",
      facts: [{ label: "Yıl", value: "1969" }],
    },
    speech_text: "Aya ilk ayak basan insan Neil Armstrong'dur.",
  }, {}, "aya ilk ayak basan insan kim");
  assert.equal(route.parameters.items, undefined);
  assert.equal(route.parameters.metrics, undefined);
  assert.equal(route.parameters.camera_target, "MOON");

  const bare = await enrichRoutePayload({
    action_type: "SHOW_FACT_CARD", template_id: "NONE",
    parameters: { data_source: "GEMINI", target_object: "MOON", image_query: "moon", is_general_question: undefined, uzunluk: "12" },
    speech_text: "x",
  }, {}, "ay");
  const labels = (bare.parameters.metrics || []).map((m) => m.label);
  assert.equal(labels.includes("target_object"), false);
  assert.equal(labels.includes("image_query"), false);
});

test("apollo 11 gibi odak komutları boş görev yan paneli açmaz, FOCUS_OBJECT ile kamerayı odaklar", async () => {
  resetActionRouterState();
  const doc = createMockDom();
  const bridge = createContractBridge({ doc, contracts: {} });

  const localRes = await bridge.dispatchUserCommand("apollo 11", false);
  assert.equal(localRes.action_type, "FOCUS_OBJECT");
  assert.equal(doc.getElementById("side-panel-container").classList.contains("is-hidden"), true);
  assert.equal(doc.getElementById("scene-container").getAttribute("data-camera-target"), "APOLLO_LUNAR_MODULE");

  const enrichedEmptySidePanel = await enrichRoutePayload({
    action_type: "OPEN_SIDE_PANEL",
    template_id: "NONE",
    parameters: { title: "apollo 11", query: "apollo 11", camera_target: "APOLLO_LUNAR_MODULE", model_url: "SOLAR_SYSTEM" },
    speech_text: "Apollo 11 ay modülü odaklandı."
  }, {}, "apollo 11");
  assert.equal(enrichedEmptySidePanel.action_type, "FOCUS_OBJECT");
});
