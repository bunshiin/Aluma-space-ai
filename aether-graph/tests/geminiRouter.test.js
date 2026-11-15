import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_ACTION_TYPES,
  VALID_TEMPLATE_IDS,
  clearConversationHistory,
  createCleanedJsonString,
  createGeminiRouterConfig,
  createSystemPrompt,
  detectNasaQueryCategory,
  getRouteFromGemini,
  sanitizeGeminiOutput,
} from "../src/services/geminiRouter.js";
import { fetchUniversalNasaPhoto } from "../src/services/nasaPhotoFetcher.js";

function assertValidRouteContract(route) {
  assert.ok(route && typeof route === "object", "Sonuç geçerli bir obje olmalı");
  assert.ok(VALID_ACTION_TYPES.includes(route.action_type), `Geçersiz action_type: ${route.action_type}`);
  assert.ok(VALID_TEMPLATE_IDS.includes(route.template_id), `Geçersiz template_id: ${route.template_id}`);
  assert.ok(route.parameters && typeof route.parameters === "object" && !Array.isArray(route.parameters));
  assert.equal(typeof route.speech_text, "string");
  assert.ok(route.speech_text.trim().length > 0, "speech_text boş olmamalı");
  assert.equal(typeof route.is_student_mode, "boolean");
}

function createMockClient(responseText) {
  return {
    models: {
      generateContent: async () => ({ text: responseText }),
    },
  };
}

describe("geminiRouter sözleşme ve birim testleri", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearConversationHistory();
    createGeminiRouterConfig({ silentTelemetry: true });
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    clearConversationHistory();
    createGeminiRouterConfig({ client: null, clientFactory: null, apiKeys: [], silentTelemetry: false });
    globalThis.fetch = originalFetch;
  });

  it("temiz JSON yanıtını sözleşmeye uygun döndürür", async () => {
    createGeminiRouterConfig({
      client: createMockClient(
        JSON.stringify({
          action_type: "OPEN_SIDE_PANEL",
          template_id: "LIGHT_DELAY",
          parameters: { source: "Earth", target: "Mars" },
          speech_text: "Dünya ile Mars arasındaki ışık gecikmesi hesaplanıyor.",
          is_student_mode: false,
        })
      ),
    });

    const result = await getRouteFromGemini("Dünya ile Mars arası ışık gecikmesi nedir?");
    assertValidRouteContract(result);
    assert.equal(result.action_type, "OPEN_SIDE_PANEL");
    assert.equal(result.template_id, "LIGHT_DELAY");
    assert.equal(result.parameters.data_source, "GEMINI");
  });

  it("```json kod bloğu içine sarılı JSON yanıtını temizler ve ayrıştırır", async () => {
    const wrapped = [
      "```json",
      JSON.stringify({
        action_type: "SHOW_FACT_CARD",
        template_id: "SOLAR_FLARE",
        parameters: { flare_class: "C4.4" },
        speech_text: "Güneş patlaması verileri gösteriliyor.",
        is_student_mode: true,
      }),
      "```",
    ].join("\n");

    createGeminiRouterConfig({ client: createMockClient(wrapped) });
    const result = await getRouteFromGemini("Öğrenci modunda güneş patlamasını anlat");
    assertValidRouteContract(result);
    assert.equal(result.template_id, "SOLAR_FLARE");
    assert.equal(result.is_student_mode, true);
  });

  it("bozuk JSON geldiğinde hata fırlatmaz ve güvenli fallback döner", async () => {
    createGeminiRouterConfig({ client: createMockClient("{ bozuk json :::") });
    const result = await getRouteFromGemini("Mars'ı göster");
    assertValidRouteContract(result);
    assert.equal(result.template_id, "NONE");
    assert.equal(result.action_type, "RESET_VIEW");
    assert.equal(result.parameters.data_source, "FALLBACK");
  });

  it("bilinmeyen template_id veya action_type geldiğinde fallback döner", () => {
    const badTemplate = sanitizeGeminiOutput({
      action_type: "OPEN_POPUP",
      template_id: "UYDURMA_SAHNE",
      speech_text: "Test",
      is_student_mode: false,
    });
    assertValidRouteContract(badTemplate);
    assert.equal(badTemplate.template_id, "NONE");
    assert.equal(badTemplate.action_type, "RESET_VIEW");

    const badAction = sanitizeGeminiOutput({
      action_type: "UYDURMA_AKSIYON",
      template_id: "LIGHT_DELAY",
      speech_text: "Test",
      is_student_mode: false,
    });
    assertValidRouteContract(badAction);
    assert.equal(badAction.template_id, "NONE");
    assert.equal(badAction.action_type, "RESET_VIEW");
  });

  it("speech_text boş geldiğinde varsayılan metni kullanır", () => {
    const sanitized = sanitizeGeminiOutput({
      action_type: "FOCUS_OBJECT",
      template_id: "GRAVITY_SIM",
      speech_text: "   ",
      is_student_mode: false,
    });
    assertValidRouteContract(sanitized);
    assert.ok(sanitized.speech_text.length > 0);
  });

  it("boş veya geçersiz kullanıcı girdisinde güvenli fallback döner", async () => {
    const emptyRes = await getRouteFromGemini("");
    assertValidRouteContract(emptyRes);
    assert.equal(emptyRes.template_id, "NONE");

    const nullRes = await getRouteFromGemini(null);
    assertValidRouteContract(nullRes);
    assert.equal(nullRes.template_id, "NONE");
  });

  it("createCleanedJsonString markdown kod bloklarını temizler", () => {
    const raw = '```json\n{"a":1}\n```';
    assert.equal(createCleanedJsonString(raw), '{"a":1}');
  });

  it("detectNasaQueryCategory niyet kategorilerini doğru algılar", () => {
    assert.equal(detectNasaQueryCategory("Hubble'ın çektiği en son fotoğraf nedir?")?.queryType, "universal_photo");
    assert.equal(detectNasaQueryCategory("Perseverance rover fotoğrafı göster")?.queryType, "mars_photos");
    assert.equal(detectNasaQueryCategory("percevarence nin çekmiş olduğu bir fotoğraf ver")?.queryType, "mars_photos");
    assert.equal(detectNasaQueryCategory("Günün uzay fotoğrafı nedir?")?.queryType, "apod");
    assert.equal(detectNasaQueryCategory("Mars'ta toz fırtınası var mı?")?.queryType, "mars_weather");
    assert.equal(detectNasaQueryCategory("Son depremler neler?")?.queryType, "eonet");
    assert.equal(detectNasaQueryCategory("Yaklaşan asteroitler var mı?")?.queryType, "neo");
    assert.equal(detectNasaQueryCategory("Güneşte patlama oldu mu?")?.queryType, "solar");
    assert.equal(detectNasaQueryCategory("ISS göster")?.queryType, "iss");
    assert.equal(detectNasaQueryCategory("İSS nerede?")?.queryType, "iss");
    assert.equal(detectNasaQueryCategory("Uluslararası Uzay İstasyonu göster")?.queryType, "iss");
    assert.equal(detectNasaQueryCategory("Kara delikler nasıl oluşur?"), null);
  });

  it("createSystemPrompt güncel sistem tarihini ve saatini içerir", () => {
    const fixedDate = new Date("2026-11-14T17:40:00.000Z");
    const prompt = createSystemPrompt(false, null, fixedDate);
    assert.ok(prompt.includes("2026-11-14T17:40:00.000Z"));
    assert.ok(prompt.includes("2026-11-14"));
  });

  it("fetchUniversalNasaPhoto güncel yıl filtresiyle NASA arşivini sorgular", async () => {
    const calledUrls = [];
    globalThis.fetch = async (url) => {
      calledUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          collection: {
            items: [
              {
                data: [
                  {
                    title: "Some Rocket Launch",
                    description: "A rocket launch far larger than Hubble's field of view.",
                    nasa_id: "KSC-LAUNCH-2026",
                    center: "KSC",
                    date_created: "2026-10-15T00:00:00Z",
                  },
                ],
                links: [{ href: "https://images-assets.nasa.gov/image/KSC-LAUNCH-2026/KSC-LAUNCH-2026~medium.jpg" }],
              },
              {
                data: [
                  {
                    title: "Hubble Recent Galaxy",
                    nasa_id: "HST-2026",
                    center: "STScI",
                    date_created: "2026-10-01T00:00:00Z",
                  },
                ],
                links: [{ href: "https://images-assets.nasa.gov/image/HST-2026/HST-2026~medium.jpg" }],
              },
            ],
          },
        }),
      };
    };

    const photo = await fetchUniversalNasaPhoto("Hubble uzay teleskobu en son fotoğrafı");
    assert.ok(calledUrls.length >= 1);
    const currentYear = new Date().getUTCFullYear();
    assert.ok(calledUrls[0].includes(`year_start=${currentYear - 2}`));
    assert.ok(calledUrls[0].includes("center=STScI"));
    assert.equal(photo.nasa_id, "HST-2026");

    const secondPhoto = await fetchUniversalNasaPhoto("Hubble uzay teleskobu fotoğrafı", 1);
    assert.equal(secondPhoto.nasa_id, "HST-2026");
  });

  it("takip sorusunda ('başka bir tane ver') önceki bağlamı korur ve sıradaki NASA fotoğrafını seçer", async () => {
    const mockClient = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            action_type: "OPEN_POPUP",
            template_id: "NONE",
            parameters: {},
            speech_text: "Güncel Hubble görüntüsü açılıyor.",
            is_student_mode: false,
          }),
        }),
      },
    };
    createGeminiRouterConfig({ client: mockClient });

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        collection: {
          items: [
            {
              data: [{ title: "Hubble Photo 1", nasa_id: "HST-1", center: "STScI", date_created: "2026-10-10T00:00:00Z" }],
              links: [{ href: "https://images-assets.nasa.gov/image/HST-1/HST-1~medium.jpg" }],
            },
            {
              data: [{ title: "Hubble Photo 2", nasa_id: "HST-2", center: "STScI", date_created: "2026-09-10T00:00:00Z" }],
              links: [{ href: "https://images-assets.nasa.gov/image/HST-2/HST-2~medium.jpg" }],
            },
          ],
        },
      }),
    });

    const first = await getRouteFromGemini("hubble uzay teleskobunun çektiği son fotoğrafı ver");
    assert.equal(first.parameters.data_source, "NASA_API");
    assert.ok(first.speech_text.includes("Güncel Hubble"));

    const second = await getRouteFromGemini("baka bir tane ver");
    assert.equal(second.parameters.data_source, "NASA_API");

    clearConversationHistory();
    const p1 = await fetchUniversalNasaPhoto("hubble", 0);
    const p2 = await fetchUniversalNasaPhoto("hubble", 1);
    assert.equal(p1.nasa_id, "HST-1");
    assert.equal(p2.nasa_id, "HST-2");
  });

  it("dinamik karşılaştırma identifier üretir ve sabit UPPER_SNAKE parameters korur", async () => {
    const cat = detectNasaQueryCategory("Jüpiter ile Ay'ı karşılaştır");
    assert.equal(cat?.queryType, "comparison");
    assert.equal(cat?.identifier, "jupiter_vs_moon");

    const sanitized = sanitizeGeminiOutput({
      action_type: "SHOW_COMPARISON",
      template_id: "NONE",
      parameters: {
        primary_object: "jupiter",
        secondary_object: "moon",
        jupiter_radius_km: 69911,
        moon_gravity_ms2: 1.62,
        height_m: 100,
      },
      speech_text: "Jüpiter ve Ay karşılaştırılıyor.",
      is_student_mode: false,
    });

    assert.equal(sanitized.parameters.primary_object, "JUPITER");
    assert.equal(sanitized.parameters.secondary_object, "MOON");
    assert.equal(sanitized.parameters.height_m, 100);
    assert.equal(sanitized.parameters.jupiter_radius_km, undefined);
    assert.equal(sanitized.parameters.moon_gravity_ms2, undefined);
  });

  it("ilk ve son fotoğraf isteğinde (Uranüs) hem en eski hem en yeni fotoğrafı ve linklerini döndürür", async () => {
    const cat = detectNasaQueryCategory("uranüsün ilk ve son çekilmiş fotoğrafları görmek istiyorum");
    assert.equal(cat?.queryType, "universal_photo");
    assert.equal(cat?.identifier, "uranus");

    createGeminiRouterConfig({
      client: createMockClient(
        JSON.stringify({
          action_type: "OPEN_POPUP",
          template_id: "NONE",
          parameters: {},
          speech_text: "Uranüs'ün Voyager 2 ile çekilen ilk ve JWST ile çekilen son fotoğrafı karşılaştırılıyor.",
          is_student_mode: false,
        })
      ),
    });

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        collection: {
          items: [
            {
              data: [{ title: "JWST Uranus 2023", nasa_id: "URANUS-NEW", center: "STScI", date_created: "2023-12-18T00:00:00Z" }],
              links: [{ href: "https://images-assets.nasa.gov/image/URANUS-NEW/URANUS-NEW~orig.jpg" }],
            },
            {
              data: [{ title: "Voyager 2 Uranus 1986", nasa_id: "URANUS-OLD", center: "JPL", date_created: "1986-01-24T00:00:00Z" }],
              links: [{ href: "https://images-assets.nasa.gov/image/URANUS-OLD/URANUS-OLD~orig.jpg" }],
            },
          ],
        },
      }),
    });

    const route = await getRouteFromGemini("uranüsün ilk ve son çekilmiş fotoğrafları görmek istiyorum");
    assert.equal(route.parameters.first_nasa_id, "URANUS-OLD");
    assert.equal(route.parameters.nasa_id, "URANUS-NEW");
    assert.ok(route.parameters.first_image_url.includes("URANUS-OLD"));
    assert.ok(route.parameters.image_url.includes("URANUS-NEW"));
    // Seslendirme metninde link, dosya adı veya arşiv kimliği bulunmaz; görseller parameters'tan gelir
    assert.equal(/https?:|.jpe?g|URANUS-/i.test(route.speech_text), false);
  });
});

describe("takip sorusu ipuçları", () => {
  it("yeni bir konu ('astronot kıyafetlerini göster', 'uzay aracı') önceki fotoğrafın devamı sayılmaz", async () => {
    const prompts = [];
    createGeminiRouterConfig({
      client: { models: { generateContent: async (req) => { prompts.push(JSON.stringify(req)); return { text: JSON.stringify({ action_type: "SHOW_FACT_CARD", template_id: "NONE", parameters: {}, speech_text: "Tamam.", is_student_mode: false }) }; } } },
    });
    const originalFetch = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async (url) => { urls.push(String(url)); return { ok: false, status: 500, json: async () => ({}) }; };
    try {
      clearConversationHistory();
      await getRouteFromGemini("Mars uydularından çekilmiş görselleri ver");
      urls.length = 0;
      await getRouteFromGemini("Astronot kıyafetlerini göster");
      await getRouteFromGemini("Güneşte uzay aracı var mı?");
      assert.equal(urls.some((u) => u.includes("images-api.nasa.gov")), false, "yeni konuda NASA fotoğraf araması yapılmamalı");
    } finally {
      globalThis.fetch = originalFetch;
      createGeminiRouterConfig({ client: null });
    }
  });
});
