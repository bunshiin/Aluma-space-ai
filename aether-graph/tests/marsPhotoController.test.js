import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMarsPhotoController, createOrbitalPhotoIdentifier, createOrbitalPhotoRoute } from "../src/ui/marsPhotoController.js";

const CONNECTION = { connection_message: "Uyduya bağlanıldı.", query: { crater_name: "Gale Crater", camera_instrument: "CTX" } };
const PHOTOS = [{ nasa_id: "N1", title: "Gale", image_url: "https://images-assets.nasa.gov/image/N1/N1~small.jpg", description: "d", date_taken_utc: "2021-01-01T00:00:00Z", camera_instrument: "CTX" }];

describe("marsPhotoController", () => {
  it("uydu sorgusunu veri katmanı kimliğine çevirir, eksik alanlarda Jezero/HiRISE'a düşer", () => {
    assert.equal(createOrbitalPhotoIdentifier(CONNECTION.query), "gale crater|ctx");
    assert.equal(createOrbitalPhotoIdentifier(null), "jezero crater|hirise");
  });

  it("fotoğraf listesinden sözleşmeye uygun OPEN_POPUP rotası kurar, boş listede null döner", () => {
    const route = createOrbitalPhotoRoute(PHOTOS, CONNECTION);
    assert.equal(route.action_type, "OPEN_POPUP");
    assert.equal(route.template_id, "NONE");
    assert.equal(route.parameters.image_url, PHOTOS[0].image_url);
    assert.equal(route.speech_text, "Uyduya bağlanıldı.");
    assert.equal(createOrbitalPhotoRoute([], CONNECTION), null);
    assert.equal(createOrbitalPhotoRoute(null, CONNECTION), null);
  });

  it("ag:mars-photo-ready gelince getSpaceData çağrılır ve rota iletilir; sözleşme yoksa sessiz kalır", async () => {
    const calls = [];
    const routes = [];
    const controller = createMarsPhotoController({
      getSpaceDataFn: () => async (queryType, identifier) => { calls.push([queryType, identifier]); return PHOTOS; },
      onRoute: (route) => routes.push(route),
    });
    await controller.handleMarsPhotoReady({ detail: CONNECTION });
    assert.deepEqual(calls, [["mars_orbital_photos", "gale crater|ctx"]]);
    assert.equal(routes.length, 1);
    controller.destroy();

    const silent = createMarsPhotoController({ getSpaceDataFn: () => null, onRoute: () => assert.fail("rota gönderilmemeli") });
    await silent.handleMarsPhotoReady({ detail: CONNECTION });
    silent.destroy();
  });
});
