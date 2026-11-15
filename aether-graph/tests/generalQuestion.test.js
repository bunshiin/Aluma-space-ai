import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyGeneralQuestionRoute, attachSupportingPhoto } from "../src/services/generalQuestion.js";
import { fetchGeneralTopicImage } from "../src/services/generalImageFetcher.js";

const json = (body, ok = true) => ({ ok, json: async () => body });

describe("genel soru niyeti", () => {
  it("hedef alanları silinir, OPEN_POPUP + NONE olur ve Wikipedia görseli eklenir", async () => {
    const route = {
      action_type: "FOCUS_OBJECT",
      template_id: "NONE",
      parameters: { is_general_question: true, image_query: "black hole", title: "Kara Delik", target: "SUN", primary_object: "EARTH" },
      speech_text: "x",
    };
    const urls = [];
    const headers = [];
    await applyGeneralQuestionRoute(route, "kara delik nedir", async (url, init) => {
      urls.push(url);
      headers.push(init?.headers?.["User-Agent"]);
      if (url.includes("/search/page")) return json({ pages: [{ key: "Black_hole", title: "Black hole", thumbnail: { url: "//x" } }] });
      return json({
        title: "Black hole",
        originalimage: { source: "https://upload.wikimedia.org/bh.jpg", width: 1200 },
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Black_hole" } },
      });
    });
    assert.equal(route.action_type, "OPEN_POPUP");
    assert.equal(route.template_id, "NONE");
    assert.equal("target" in route.parameters, false);
    assert.equal("primary_object" in route.parameters, false);
    assert.equal(route.parameters.image_url, "https://upload.wikimedia.org/bh.jpg");
    assert.equal(route.parameters.image_source, "Wikipedia (en)");
    // Terim tam başlık olmayabilir: önce arama, sonra bulunan sayfanın özeti
    assert.ok(urls[0].startsWith("https://en.wikipedia.org/w/rest.php/v1/search/page?q=black%20hole"));
    assert.equal(urls[1], "https://en.wikipedia.org/api/rest_v1/page/summary/Black_hole");
    assert.ok(headers.every((ua) => typeof ua === "string" && ua.startsWith("AetherGraph/")));
  });

  it("özgün görsel çok büyükse küçük resim 1280 piksele büyütülerek kullanılır", async () => {
    const image = await fetchGeneralTopicImage("galaxy", "", async (url) => {
      if (url.includes("/search/page")) return json({ pages: [{ key: "Galaxy", thumbnail: { url: "//x" } }] });
      return json({
        title: "Galaxy",
        originalimage: { source: "https://upload.wikimedia.org/huge.jpg", width: 8000 },
        thumbnail: { source: "https://upload.wikimedia.org/thumb/a/ab/G.jpg/320px-G.jpg" },
      });
    });
    assert.equal(image.image_url, "https://upload.wikimedia.org/thumb/a/ab/G.jpg/1280px-G.jpg");
  });

  it("genel soru değilse veya afet listesi varsa rotaya dokunmaz", async () => {
    const normal = { action_type: "FOCUS_OBJECT", parameters: { target: "MARS" } };
    await applyGeneralQuestionRoute(normal, "", async () => assert.fail("istek atılmamalı"));
    assert.equal(normal.action_type, "FOCUS_OBJECT");
    const earth = { action_type: "FOCUS_OBJECT", parameters: { is_general_question: true, events: [] } };
    await applyGeneralQuestionRoute(earth, "", async () => assert.fail("istek atılmamalı"));
    assert.equal(earth.action_type, "FOCUS_OBJECT");
  });

  it("görsel sırası: İngilizce Wikipedia, Türkçe Wikipedia, NASA; hiçbiri yoksa null", async () => {
    const calls = [];
    const image = await fetchGeneralTopicImage("supernova", "Süpernova", async (url) => {
      calls.push(new URL(url).host);
      if (url.includes("images-api.nasa.gov")) {
        return json({ collection: { items: [{ data: [{ title: "SN 1987A" }], links: [{ href: "https://images-assets.nasa.gov/x.jpg" }] }] } });
      }
      return json({}, false);
    });
    assert.deepEqual(calls, ["en.wikipedia.org", "tr.wikipedia.org", "images-api.nasa.gov"]);
    assert.equal(image.image_source, "NASA Görsel Arşivi");
    assert.equal(await fetchGeneralTopicImage("x", "y", async () => { throw new Error("internet yok"); }), null);
  });
});

describe("destekleyici fotoğraf (odakla birlikte)", () => {
  const wikiFetch = async (url) => {
    if (url.includes("/search/page")) return json({ pages: [{ key: "Apollo_11", thumbnail: { url: "//x" } }] });
    return json({ title: "Apollo 11", originalimage: { source: "https://upload.wikimedia.org/a11.jpg", width: 900 } });
  };

  it("odak rotasında image_query varsa fotoğraf aranır ve supporting_photo işaretlenir", async () => {
    const route = {
      action_type: "FOCUS_OBJECT",
      template_id: "NONE",
      parameters: { target_object: "MOON", image_query: "Neil Armstrong Apollo 11 Moon landing" },
    };
    await attachSupportingPhoto(route, wikiFetch);
    assert.equal(route.parameters.image_url, "https://upload.wikimedia.org/a11.jpg");
    assert.equal(route.parameters.supporting_photo, true);
    assert.equal(route.parameters.target_object, "MOON", "odak hedefi korunur");
    assert.equal(route.action_type, "FOCUS_OBJECT");
  });

  it("APOLLO_11 gibi konu şablonlu rotada da fotoğraf gelir (Gemini Ay sorusunda bu şablonu seçiyor)", async () => {
    const route = { action_type: "FOCUS_OBJECT", template_id: "APOLLO_11", parameters: { target_object: "MOON", image_query: "Neil Armstrong Apollo 11" } };
    await attachSupportingPhoto(route, wikiFetch);
    assert.equal(route.parameters.supporting_photo, true);
    assert.equal(route.template_id, "APOLLO_11");
  });

  it("karşılaştırma, afet, NASA fotoğrafı, şablonlu ve sorgusuz rotalara dokunmaz", async () => {
    const untouched = [
      { action_type: "SHOW_COMPARISON", template_id: "NONE", parameters: { image_query: "x" } },
      { action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { image_query: "x", events: [{}] } },
      { action_type: "OPEN_POPUP", template_id: "NONE", parameters: { image_query: "x", image_url: "https://a/b.jpg" } },
      { action_type: "FOCUS_OBJECT", template_id: "SOLAR_FLARE", parameters: { image_query: "x" } },
      { action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: {} },
    ];
    for (const route of untouched) {
      await attachSupportingPhoto(route, async () => assert.fail("istek atılmamalı"));
      assert.equal("supporting_photo" in route.parameters, false);
    }
  });

  it("görsel bulunamazsa rota değişmez", async () => {
    const route = { action_type: "FOCUS_OBJECT", template_id: "NONE", parameters: { image_query: "yok" } };
    await attachSupportingPhoto(route, async () => json({}, false));
    assert.equal("image_url" in route.parameters, false);
  });
});
