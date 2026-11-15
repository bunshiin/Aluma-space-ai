import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSubtitleDuration_ms, createSubtitleController } from "../src/ui/subtitleController.js";

function createElement() {
  const classes = new Set(["is-hidden"]);
  return {
    textContent: "",
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
  };
}

function createTimers() {
  const pending = [];
  return {
    pending,
    env: {
      setTimeout: (fn, ms) => { pending.push({ fn, ms }); return pending.length; },
      clearTimeout: (id) => { if (pending[id - 1]) pending[id - 1].fn = null; },
    },
  };
}

describe("subtitleController", () => {
  it("süre okuma hızına göre hesaplanır ve alt/üst sınırda kalır", () => {
    assert.equal(calculateSubtitleDuration_ms("Kısa."), 4000);
    assert.equal(calculateSubtitleDuration_ms("a".repeat(100)), 1200 + 100 * 75);
    assert.equal(calculateSubtitleDuration_ms("a".repeat(2000)), 16000);
    assert.equal(calculateSubtitleDuration_ms(null), 4000);
  });

  it("metni gösterir, süre dolunca gizler; yeni metin eskisini hemen değiştirir", () => {
    const el = createElement();
    const { env, pending } = createTimers();
    const subtitle = createSubtitleController(el, env);
    subtitle.show("Neil Armstrong Aya ilk ayak basan insandır.");
    assert.equal(el.textContent, "Neil Armstrong Aya ilk ayak basan insandır.");
    assert.equal(el.classList.contains("is-visible"), true);
    assert.equal(el.classList.contains("is-hidden"), false);

    subtitle.show("İkinci metin.");
    assert.equal(el.textContent, "İkinci metin.");
    assert.equal(pending[0].fn, null, "eski zamanlayıcı iptal edilir");
    pending[1].fn();
    assert.equal(el.classList.contains("is-hidden"), true);
    assert.equal(el.textContent, "");
  });

  it("link ve dosya adı altyazıya girmez; boş metinde gizlenir; öğe yoksa hata vermez", () => {
    const el = createElement();
    const { env } = createTimers();
    const subtitle = createSubtitleController(el, env);
    subtitle.show("Fotoğraf hazır https://nasa.gov/a.jpg moon.png");
    assert.equal(el.textContent, "Fotoğraf hazır");
    subtitle.show("   ");
    assert.equal(el.classList.contains("is-hidden"), true);
    assert.doesNotThrow(() => createSubtitleController(null).show("x"));
  });
});
