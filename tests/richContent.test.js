import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRichContentParam } from "../src/services/richContent.js";
import { createSystemPrompt, sanitizeGeminiOutput } from "../src/services/geminiPrompt.js";

describe("richContent", () => {
  it("facts ve sections doğrulanır: sayılar metne çevrilir, boş/bozuk satırlar atılır, sınır uygulanır", () => {
    const facts = sanitizeRichContentParam("facts", [{ label: "Çap", value: 139820 }, { label: "", value: "x" }, "bozuk"]);
    assert.deepEqual(facts, [{ label: "Çap", value: "139820" }]);
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: "v" }));
    assert.equal(sanitizeRichContentParam("facts", many).length, 10);
    assert.equal(sanitizeRichContentParam("sections", "bozuk"), null);
    assert.deepEqual(
      sanitizeRichContentParam("sections", [{ heading: "Neden?", body: "Çünkü." }, { heading: "Boş" }]),
      [{ heading: "Neden?", body: "Çünkü." }]
    );
    assert.equal(sanitizeRichContentParam("is_general_question", "evet"), null);
    assert.equal(sanitizeRichContentParam("is_general_question", true), true);
  });

  it("Gemini çıktısında zengin alanlar korunur, konuşma metni linksiz kalır", () => {
    const route = sanitizeGeminiOutput({
      action_type: "OPEN_POPUP",
      template_id: "NONE",
      parameters: {
        description: "Kara delik...",
        facts: [{ label: "Tür", value: "Yıldızsal" }],
        image_query: "black hole",
        is_general_question: true,
        uydurma_alan: 1,
      },
      speech_text: "Kara delik budur https://nasa.gov/bh.jpg",
    });
    assert.equal(route.parameters.image_query, "black hole");
    assert.equal(route.parameters.is_general_question, true);
    assert.equal("uydurma_alan" in route.parameters, false);
    assert.equal(route.speech_text, "Kara delik budur");
  });

  it("sistem istemi zengin içerik ve genel soru kurallarını, link yasağını içerir", () => {
    const prompt = createSystemPrompt();
    assert.ok(prompt.includes("ZENGİN İÇERİK"));
    assert.ok(prompt.includes("GENEL SORU"));
    assert.ok(prompt.includes("KESİNLİKLE link"));
    assert.equal(prompt.includes("linki ekle"), false);
  });
});
