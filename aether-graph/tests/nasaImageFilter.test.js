import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNonPhotoImageText, isRealPhotoItem } from "../src/services/nasaImageFilter.js";
import { normalizeOrbitalPhotoResponse } from "../src/api/marsOrbitalClient.js";

const item = (title, description = "", keywords = []) => ({
  data: [{ nasa_id: title.replace(/\W+/g, "_"), title, description, keywords, date_created: "2021-01-01T00:00:00Z" }],
  links: [{ href: `https://images-assets.nasa.gov/${title.length}.jpg`, render: "image" }],
});

describe("nasaImageFilter", () => {
  it("rota/harita çizilmiş, etiketli, illüstrasyon ve animasyon kayıtları gerçek fotoğraf sayılmaz", () => {
    assert.equal(isNonPhotoImageText("Mid-2019 Map of NASA's Curiosity Rover Mission"), true);
    assert.equal(isNonPhotoImageText("Curiosity's Route to Gediz Vallis Channel"), true);
    assert.equal(isNonPhotoImageText("Annotated view of the traverse"), true);
    assert.equal(isNonPhotoImageText("Artist's concept of Perseverance"), true);
    assert.equal(isNonPhotoImageText("Jezero Crater Flyover animation"), true);
    assert.equal(isNonPhotoImageText("HiRISE Spots Curiosity at Woodland Bay"), false);
    assert.equal(isNonPhotoImageText("Gullies of Matara Crater"), false);
  });

  it("anahtar kelimelerdeki işaretler de dikkate alınır; bozuk öğe reddedilir", () => {
    assert.equal(isRealPhotoItem(item("Gale Crater", "", ["map", "Mars"])), false);
    assert.equal(isRealPhotoItem(item("Layers and Dark Dunes", "HiRISE image", ["Mars"])), true);
    assert.equal(isRealPhotoItem(null), false);
  });

  it("Mars yörünge istemcisi işaretli haritaları popup'a göndermez", () => {
    const photos = normalizeOrbitalPhotoResponse({
      collection: {
        items: [
          item("Perseverance's Location at the Base of Jezero Crater's Rim", "This annotated image shows the rover's path."),
          item("HiRISE Spots Perseverance in South Seitah", "Image taken by HiRISE on Mars Reconnaissance Orbiter."),
        ],
      },
    });
    assert.deepEqual(photos.map((p) => p.title), ["HiRISE Spots Perseverance in South Seitah"]);
  });
});
