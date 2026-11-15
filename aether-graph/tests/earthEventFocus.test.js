import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { attachEarthEventsToRoute, createEarthEventContext, resolveEarthEventChoice, selectFocusEvent } from "../src/services/earthEventFocus.js";
import { clearConversationHistory, createGeminiRouterConfig, getRouteFromGemini } from "../src/services/geminiRouter.js";
import { clearDataLayerCache } from "../src/api/dataLayer.js";

const EVENTS = [
  { id: "A", title: "Wildfire in Australia", status: "CLOSED", coordinates: { latitude_deg: -17, longitude_deg: 124 } },
  { id: "B", title: "Wildfire Red Hill, Perry, Mississippi", status: "OPEN", coordinates: { latitude_deg: 31, longitude_deg: -89 } },
  { id: "C", title: "Etna Volcano, Italy", status: "OPEN", coordinates: { latitude_deg: 37.7, longitude_deg: 15 } },
];

describe("earthEventFocus", () => {
  it("varsayılan olarak en yeni olayı seçer", () => {
    assert.equal(selectFocusEvent(EVENTS, "en son orman yangını").id, "A");
  });

  it("'şu an aktif' sorusunda sona ermiş olayı atlar", () => {
    assert.equal(selectFocusEvent(EVENTS, "şu an aktif orman yangınları").id, "B");
  });

  it("soruda olayın adı geçiyorsa o olayı seçer", () => {
    assert.equal(selectFocusEvent(EVENTS, "Etna'nın son durumu").id, "C");
    assert.equal(selectFocusEvent(EVENTS, "Mississippi yangını").id, "B");
  });

  it("boş listede null döner", () => {
    assert.equal(selectFocusEvent([], "x"), null);
    assert.equal(selectFocusEvent(null, "x"), null);
  });

  it("soruda geçen yerde kayıt yoksa olay SEÇMEZ (rastgele yer işaretlenmez)", () => {
    assert.equal(selectFocusEvent(EVENTS, "Türkiye'de son deprem"), null);
    assert.equal(selectFocusEvent(EVENTS, "Japonya'daki yangınlar"), null);
    assert.equal(selectFocusEvent(EVENTS, "İtalya'daki volkan").id, "C");
    assert.equal(selectFocusEvent(EVENTS, "Avustralya orman yangını").id, "A");
  });

  it("Gemini bağlamı aday listesi, öneri ve NONE seçim kuralını içerir", () => {
    const ctx = createEarthEventContext(EVENTS, EVENTS[1]);
    assert.deepEqual(ctx.candidates.map((c) => c.id), ["A", "B", "C"]);
    assert.equal(ctx.suggested_focus_event_id, "B");
    assert.ok(ctx.selection_rule.includes("NONE"));
    assert.equal(createEarthEventContext(EVENTS, null).suggested_focus_event_id, "NONE");
  });

  it("Gemini seçimi: NONE eşleşme yok, geçerli id o olay, geçersiz/eksik id yerel seçim", () => {
    assert.equal(resolveEarthEventChoice(EVENTS, "NONE", EVENTS[0]), null);
    assert.equal(resolveEarthEventChoice(EVENTS, "C", EVENTS[0]).id, "C");
    assert.equal(resolveEarthEventChoice(EVENTS, "UYDURMA", EVENTS[0]).id, "A");
    assert.equal(resolveEarthEventChoice(EVENTS, undefined, null), null);
  });

  it("odak olay yoksa küre açılmaz, olay listesi rotadan çıkar, bilgi kartı ve mesaj kalır", () => {
    const route = { action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { data_source: "FALLBACK" }, speech_text: "Sinyal sorunu", is_student_mode: false };
    attachEarthEventsToRoute(route, EVENTS, null, "earthquakes", "Eşleşen afet yok.");
    assert.equal("events" in route.parameters, false);
    assert.equal("model_url" in route.parameters, false);
    assert.equal(route.action_type, "SHOW_FACT_CARD");
    assert.equal(route.speech_text, "Eşleşen afet yok.");
  });

  it("rotaya olayları ve odak kimliğini ekler, şablonu NONE bırakıp küre sahnesini seçer", () => {
    const route = { action_type: "RESET_VIEW", template_id: "NONE", parameters: {}, speech_text: "x", is_student_mode: false };
    attachEarthEventsToRoute(route, EVENTS, EVENTS[2], "volcanoes");
    assert.equal(route.parameters.focus_event_id, "C");
    assert.equal(route.parameters.events.length, 3);
    assert.equal(route.template_id, "NONE");
    assert.equal(route.parameters.model_url, "EARTH_EVENTS");
    assert.equal(route.action_type, "FOCUS_OBJECT");
  });
});

describe("getRouteFromGemini + EONET", () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;

  beforeEach(() => {
    clearConversationHistory();
    clearDataLayerCache();
    console.log = () => {};
    console.warn = () => {};
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        events: [{
          id: "EONET_V",
          title: "Nevados del Chillan Volcano, Chile",
          categories: [{ id: "volcanoes" }],
          geometry: [{ date: "2026-06-15T00:00:00Z", type: "Point", coordinates: [-71.378, -36.868] }],
        }],
      }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
    createGeminiRouterConfig({ client: null });
  });

  it("volkan sorusunda olay listesi ve odak rotaya eklenir", async () => {
    createGeminiRouterConfig({
      client: { models: { generateContent: async () => ({ text: JSON.stringify({ action_type: "SHOW_FACT_CARD", template_id: "NONE", parameters: {}, speech_text: "Volkan bilgisi.", is_student_mode: false }) }) } },
    });
    const route = await getRouteFromGemini("en son gerçekleşen volkan patlaması");
    assert.equal(route.parameters.focus_event_id, "EONET_V");
    assert.equal(route.parameters.events[0].coordinates.latitude_deg, -36.868);
    assert.equal(route.template_id, "NONE");
    assert.equal(route.parameters.model_url, "EARTH_EVENTS");
  });

  it("Gemini NONE derse olay işaretlenmez, Gemini'nin 'kayıt yok' metni korunur", async () => {
    createGeminiRouterConfig({
      client: { models: { generateContent: async () => ({ text: JSON.stringify({ action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { focus_event_id: "NONE" }, speech_text: "Şili dışında güncel volkan kaydı yok.", is_student_mode: false }) }) } },
    });
    const route = await getRouteFromGemini("Türkiye'de son volkan patlaması");
    assert.equal(route.parameters.events, undefined);
    assert.equal(route.parameters.model_url, undefined);
    assert.equal(route.action_type, "SHOW_FACT_CARD");
    assert.equal(route.speech_text, "Şili dışında güncel volkan kaydı yok.");
  });

  it("Gemini bozuk yanıt verse de olaylar UI'ya ulaşır", async () => {
    createGeminiRouterConfig({ client: { models: { generateContent: async () => ({ text: "{bozuk" }) } } });
    const route = await getRouteFromGemini("en son gerçekleşen volkan patlaması");
    assert.equal(route.parameters.focus_event_id, "EONET_V");
    assert.ok(route.speech_text.length > 0);
  });
});
