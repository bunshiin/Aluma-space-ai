import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTemplateIntentGuard, SCENE_TARGET_INSTRUCTION } from "../src/services/sceneIntentGuard.js";
import { createSystemPrompt } from "../src/services/geminiPrompt.js";
import { enrichRoutePayload } from "../src/ui/contractBridge.js";
import { resolveFallbackSceneParams } from "../src/ui/routeFallbackParser.js";

describe("sahne şablonu bekçisi ve hedef önceliği", () => {
  it("'Güneş'te uzay aracı var mı?' patlama şablonu açmaz; açıkça istenen patlama korunur", () => {
    const spacecraft = applyTemplateIntentGuard({ template_id: "SOLAR_FLARE", parameters: { flare_class: "X2", target_object: "PARKER" } }, "Güneşte uzay aracı var mı?");
    assert.equal(spacecraft.template_id, "NONE");
    assert.equal("flare_class" in spacecraft.parameters, false);
    assert.equal(spacecraft.parameters.target_object, "PARKER");
    assert.equal(applyTemplateIntentGuard({ template_id: "SOLAR_FLARE", parameters: {} }, "Güneş patlamasını göster").template_id, "SOLAR_FLARE");
  });

  it("asteroit ve ışık gecikmesi şablonları da sadece ilgili sözlerle açılır", () => {
    assert.equal(applyTemplateIntentGuard({ template_id: "NEO_SWARM", parameters: { asteroids: [] } }, "Dünya hakkında bilgi").template_id, "NONE");
    assert.equal(applyTemplateIntentGuard({ template_id: "NEO_SWARM", parameters: {} }, "Dünya'ya yaklaşan asteroitler").template_id, "NEO_SWARM");
    assert.equal(applyTemplateIntentGuard({ template_id: "LIGHT_DELAY", parameters: {} }, "Mars'a sinyal ne kadar sürede gider").template_id, "LIGHT_DELAY");
    assert.equal(applyTemplateIntentGuard({ template_id: "GRAVITY_SIM", parameters: {} }, "x").template_id, "GRAVITY_SIM");
  });

  it("sistem istemi araç hedeflerini ve 'yakınındaki araç' kuralını içerir", () => {
    const prompt = createSystemPrompt();
    assert.ok(prompt.includes(SCENE_TARGET_INSTRUCTION));
    assert.ok(prompt.includes("PARKER"));
    assert.ok(prompt.includes("MARS_PHOTO_SAT"));
  });

  it("Gemini'nin target_object seçimi soru metnindeki başka cisimden önce gelir", async () => {
    const route = await enrichRoutePayload({
      action_type: "SHOW_FACT_CARD",
      template_id: "NONE",
      parameters: { target_object: "PARKER" },
      speech_text: "Güneş'e en yakın araç Parker Güneş Sondası'dır.",
    }, {}, "güneşte uzay aracı var mı");
    assert.equal(route.parameters.camera_target, "PARKER");
    assert.equal(route.parameters.model_url, "SOLAR_SYSTEM");
  });

  it("kullanıcı tekil bir modeli açıkça adlandırdıysa Gemini başka hedef seçse de o model açılır", async () => {
    const route = await enrichRoutePayload({
      action_type: "FOCUS_OBJECT",
      template_id: "NONE",
      parameters: { target_object: "ISS" },
      speech_text: "Astronot kıyafetleri...",
    }, {}, "Astronot kıyafetlerini göster");
    assert.equal(route.parameters.model_url, "/public/models/advanced_crew_escape_suit.glb");
    assert.equal(resolveFallbackSceneParams("ASTRONAUT_SUIT").model_url, "/public/models/advanced_crew_escape_suit.glb");
  });

  it("UPPER_SNAKE hedef kimlikleri yerel ayrıştırıcıda çözülür", () => {
    assert.equal(resolveFallbackSceneParams("NEW_HORIZONS").camera_target, "NEW_HORIZONS");
    assert.equal(resolveFallbackSceneParams("MARS_PHOTO_SAT").camera_target, "MARS_PHOTO_SAT");
    assert.equal(resolveFallbackSceneParams("VOYAGER_2").camera_target, "VOYAGER_2");
  });

  it("ışık/sinyal gecikmesi komutu yerel yedekte LIGHT_DELAY + kaynak/hedef üretir", () => {
    assert.deepEqual(resolveFallbackSceneParams("Dünya ile Mars arası ışık gecikmesi"), { template_id: "LIGHT_DELAY", model_url: "SOLAR_SYSTEM", source: "EARTH", target: "MARS" });
    assert.equal(resolveFallbackSceneParams("Jüpitere sinyal ne kadar sürede gider").target, "JUPITER");
  });
});
