import test from "node:test";
import assert from "node:assert/strict";

import { createSpeechController, isSttSupported } from "../src/ui/speechController.js";

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...items) => items.forEach((i) => classes.add(i)),
    remove: (...items) => items.forEach((i) => classes.delete(i)),
    toggle: (item, force) => {
      if (typeof force === "boolean") {
        if (force) classes.add(item);
        else classes.delete(item);
        return force;
      }
      if (classes.has(item)) {
        classes.delete(item);
        return false;
      }
      classes.add(item);
      return true;
    },
    contains: (item) => classes.has(item)
  };
}

function createMockControl(initialClasses = []) {
  const attrs = new Map();
  let focused = false;
  return {
    value: "",
    placeholder: "Komut yaz...",
    textContent: "",
    classList: createClassList(initialClasses),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    focus: () => {
      focused = true;
    },
    wasFocused: () => focused
  };
}

test("isSttSupported ortam özelliğini doğru algılar", () => {
  assert.equal(isSttSupported({}), false);
  assert.equal(isSttSupported({ webkitSpeechRecognition: function MockStt() {} }), true);
  assert.equal(isSttSupported({ SpeechRecognition: function MockStdStt() {} }), true);

});

test("sahte webkitSpeechRecognition ile dinleme, transkript iletimi ve bitiş akışı çalışır", () => {
  let activeInstance = null;
  class FakeRecognition {
    constructor() {
      this.lang = "";
      this.started = false;
      this.aborted = false;
      activeInstance = this;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.aborted = true;
    }
  }

  const micButton = createMockControl();
  const commandInput = createMockControl();
  const transcripts = [];

  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    micButton,
    commandInput,
    onTranscript: (text) => transcripts.push(text)
  });

  const started = controller.startListening();
  assert.equal(started, true);
  assert.equal(activeInstance.started, true);
  assert.equal(activeInstance.lang, "tr-TR");
  assert.equal(activeInstance.continuous, false);
  assert.equal(micButton.classList.contains("is-listening"), true);
  assert.equal(micButton.getAttribute("aria-pressed"), "true");

  activeInstance.onresult({
    results: [[{ transcript: "  mars bilgi kartı  " }]]
  });

  assert.equal(commandInput.value, "mars bilgi kartı");
  assert.deepEqual(transcripts, ["mars bilgi kartı"]);
  assert.equal(activeInstance.aborted, true);
  assert.equal(activeInstance.onend, null);
  assert.equal(micButton.classList.contains("is-listening"), false);
  assert.equal(micButton.getAttribute("aria-pressed"), "false");
});

test("STT desteği yokken hata fırlatmadan commandInput.focus() ile yazılı girişe düşer", () => {
  const micButton = createMockControl();
  const commandInput = createMockControl();
  const errors = [];

  const controller = createSpeechController({
    env: {},
    micButton,
    commandInput,
    onError: (code) => errors.push(code)
  });

  const started = controller.startListening();
  assert.equal(started, false);
  assert.equal(commandInput.wasFocused(), true);
  assert.equal(micButton.classList.contains("is-listening"), false);
  assert.deepEqual(errors, ["STT_UNSUPPORTED"]);
});

test("ara (interim) sonuçlarda input anlık güncellenir ve onend/isFinal ile komut çalışır", () => {
  let instance = null;
  class FakeRecognition {
    constructor() {
      instance = this;
    }
    start() {}
    stop() {
      this.onend?.();
    }
  }

  const commandInput = createMockControl();
  const statusBadge = createMockControl();
  const transcripts = [];

  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    commandInput,
    statusBadge,
    onTranscript: (text) => transcripts.push(text)
  });

  controller.startListening();
  assert.equal(instance.interimResults, true);
  assert.equal(statusBadge.textContent, "LISTENING");
  assert.match(commandInput.placeholder, /Dinleniyor/);

  const interimSegment = [{ transcript: "zaman çizel" }];
  interimSegment.isFinal = false;
  instance.onresult({ results: [interimSegment] });

  assert.equal(commandInput.value, "zaman çizel");
  assert.deepEqual(transcripts, []);

  instance.onend();
  assert.deepEqual(transcripts, ["zaman çizel"]);
  assert.equal(commandInput.placeholder, "Komut yaz...");
});

test("stopListening ve onerror abort() ile mikrofonu serbest bırakır; network devre kesici tekrar açmaz", () => {
  let constructorCount = 0;
  let instance = null;
  class FakeRecognition {
    constructor() {
      constructorCount += 1;
      this.aborted = false;
      instance = this;
    }
    start() {}
    stop() {}
    abort() {
      this.aborted = true;
    }
  }

  const commandInput = createMockControl();
  const statusBadge = createMockControl();
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const manualCtrl = createSpeechController({
      env: { webkitSpeechRecognition: FakeRecognition },
      commandInput,
      statusBadge
    });
    manualCtrl.startListening();
    const firstInstance = instance;
    manualCtrl.stopListening();
    assert.equal(firstInstance.aborted, true);
    assert.equal(firstInstance.onresult, null);

    const netCtrl = createSpeechController({
      env: { webkitSpeechRecognition: FakeRecognition },
      commandInput,
      statusBadge
    });
    netCtrl.startListening();
    const netInstance = instance;
    const countBeforeRetry = constructorCount;
    netInstance.onerror({ error: "network" });

    assert.equal(netInstance.aborted, true);
    assert.equal(statusBadge.textContent, "STT_FALLBACK");
    assert.match(commandInput.placeholder, /Chrome/);
    assert.equal(commandInput.wasFocused(), true);

    const retryStarted = netCtrl.startListening();
    assert.equal(retryStarted, false);
    assert.equal(constructorCount, countBeforeRetry);

    const permCtrl = createSpeechController({
      env: { webkitSpeechRecognition: FakeRecognition },
      commandInput,
      statusBadge
    });
    permCtrl.startListening();
    const permInstance = instance;
    permInstance.onerror({ error: "not-allowed" });

    assert.equal(permInstance.aborted, true);
    assert.equal(statusBadge.textContent, "STT_FALLBACK");
    assert.match(commandInput.placeholder, /Mikrofon izni kapalı/);
  } finally {
    console.warn = originalWarn;
  }
});

function createMockButton(initialClasses = []) {
  const attrs = new Map();
  const listeners = new Map();
  const classes = new Set(initialClasses);
  return {
    innerHTML: "",
    classList: {
      add: (...items) => items.forEach((i) => classes.add(i)),
      remove: (...items) => items.forEach((i) => classes.delete(i)),
      toggle: (item, force) => {
        if (typeof force === "boolean") {
          if (force) classes.add(item);
          else classes.delete(item);
          return force;
        }
        if (classes.has(item)) {
          classes.delete(item);
          return false;
        }
        classes.add(item);
        return true;
      },
      contains: (item) => classes.has(item)
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    addEventListener: (type, fn) => {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: (type, fn) => {
      const list = listeners.get(type) || [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    click: () => {
      const list = listeners.get("click") || [];
      list.forEach((fn) => fn({ preventDefault: () => {} }));
    },
    getListenerCount: (type) => (listeners.get(type) || []).length
  };
}

function createFakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(evt) {
      const list = listeners.get(evt?.type) || [];
      list.forEach((fn) => fn(evt));
      return true;
    },
    getListenerCount: (type) => (listeners.get(type) || []).length
  };
}

test("3 durumlu buton: IDLE durumunda klasik mikrofon ikonu görünür ve tıklanınca LISTENING'e geçer", () => {
  let activeInstance = null;
  class FakeRecognition {
    constructor() { activeInstance = this; }
    start() { this.started = true; }
    abort() { this.aborted = true; }
  }

  const micButton = createMockButton();
  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    micButton
  });

  // 1. IDLE durumu kontrolleri
  assert.equal(controller.getState().state, "IDLE");
  assert.equal(controller.getState().is_listening, false);
  assert.equal(controller.getState().is_speaking, false);
  assert.equal(micButton.classList.contains("is-idle"), true);
  assert.equal(micButton.classList.contains("is-listening"), false);
  assert.equal(micButton.classList.contains("is-speaking"), false);
  assert.equal(micButton.getAttribute("data-state"), "IDLE");
  assert.equal(micButton.getAttribute("aria-pressed"), "false");
  assert.equal(micButton.getAttribute("aria-label"), "Sesli komut");
  assert.match(micButton.innerHTML, /<svg.*<rect x="9" y="2"/); // Klasik mikrofon SVG

  // Butona tıklanır -> dinleme başlar (LISTENING durumuna geçer)
  micButton.click();
  assert.equal(controller.getState().state, "LISTENING");
  assert.equal(controller.getState().is_listening, true);
  assert.equal(micButton.classList.contains("is-listening"), true);
  assert.equal(micButton.classList.contains("is-idle"), false);
  assert.equal(micButton.getAttribute("data-state"), "LISTENING");
  assert.equal(micButton.getAttribute("aria-pressed"), "true");
  assert.equal(activeInstance.started, true);

  controller.destroy();
});

test("3 durumlu buton: LISTENING durumunda kırmızı kare durdur kutusu görünür ve tıklanınca IDLE'a döner", () => {
  let activeInstance = null;
  class FakeRecognition {
    constructor() { activeInstance = this; }
    start() { this.started = true; }
    abort() { this.aborted = true; }
  }

  const micButton = createMockButton();
  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    micButton
  });

  // Dinlemeyi başlat
  micButton.click();
  assert.equal(controller.getState().state, "LISTENING");
  assert.equal(micButton.getAttribute("aria-label"), "Dinlemeyi durdur");
  assert.match(micButton.innerHTML, /<rect x="5" y="5" width="14" height="14"/); // Kırmızı kare / durdur simgesi

  // LISTENING durumundayken butona tıklanır -> mikrofonu kapatır ve IDLE'a döner
  micButton.click();
  assert.equal(controller.getState().state, "IDLE");
  assert.equal(controller.getState().is_listening, false);
  assert.equal(activeInstance.aborted, true);
  assert.equal(micButton.classList.contains("is-idle"), true);
  assert.equal(micButton.classList.contains("is-listening"), false);
  assert.equal(micButton.getAttribute("data-state"), "IDLE");
  assert.equal(micButton.getAttribute("aria-pressed"), "false");
  assert.equal(micButton.getAttribute("aria-label"), "Sesli komut");
  assert.match(micButton.innerHTML, /<rect x="9" y="2"/); // Klasik mikrofon ikonu geri döndü

  controller.destroy();
});

test("3 durumlu buton: SPEAKING durumunda tıklanınca aktif sesi keser, speechSynthesis iptal eder, ag:ai-voice-stop yayınlar ve IDLE'a geçer", () => {
  const micButton = createMockButton();
  const doc = createFakeEventTarget();
  let voicePlayerStopped = false;
  let speechSynthesisCancelled = false;
  const caughtEvents = [];

  doc.addEventListener("ag:ai-voice-stop", (e) => {
    caughtEvents.push(e.type);
  });

  const fakeVoicePlayer = {
    stop: () => { voicePlayerStopped = true; },
    isPlaying: () => true
  };

  const fakeEnv = {
    speechSynthesis: {
      cancel: () => { speechSynthesisCancelled = true; }
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    }
  };

  const controller = createSpeechController({
    env: fakeEnv,
    doc,
    micButton,
    voicePlayer: fakeVoicePlayer
  });

  // AI konuşmaya başladı (SPEAKING durumu)
  controller.setSpeaking(true);
  assert.equal(controller.getState().state, "SPEAKING");
  assert.equal(controller.getState().is_speaking, true);
  assert.equal(micButton.classList.contains("is-speaking"), true);
  assert.equal(micButton.classList.contains("is-idle"), false);
  assert.equal(micButton.classList.contains("is-listening"), false);
  assert.equal(micButton.getAttribute("data-state"), "SPEAKING");
  assert.equal(micButton.getAttribute("aria-pressed"), "true");
  assert.equal(micButton.getAttribute("aria-label"), "AI sesini durdur");
  assert.match(micButton.innerHTML, /<polygon points=/); // Konuşma/hoparlör SVG

  // AI ses çalarken butona tıklanır!
  micButton.click();

  // 1. Aktif ses oynatıcısı kesildi mi?
  assert.equal(voicePlayerStopped, true);
  // 2. speechSynthesis kesildi mi?
  assert.equal(speechSynthesisCancelled, true);
  // 3. ag:ai-voice-stop olayı yayınlandı mı?
  assert.deepEqual(caughtEvents, ["ag:ai-voice-stop"]);
  // 4. IDLE durumuna geçti mi?
  assert.equal(controller.getState().state, "IDLE");
  assert.equal(controller.getState().is_speaking, false);
  assert.equal(micButton.classList.contains("is-idle"), true);
  assert.equal(micButton.classList.contains("is-speaking"), false);
  assert.equal(micButton.getAttribute("data-state"), "IDLE");
  assert.equal(micButton.getAttribute("aria-pressed"), "false");
  assert.equal(micButton.getAttribute("aria-label"), "Sesli komut");

  controller.destroy();
});

test("destroy() içinde butonun ve dokümanın event listener'ları temizlenir", () => {
  const micButton = createMockButton();
  const doc = createFakeEventTarget();

  let recognitionStarted = false;
  class FakeRecognition {
    start() { recognitionStarted = true; }
    abort() {}
  }

  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    doc,
    micButton
  });

  // Başlangıçta buton click dinleyicisi bağlı olmalı
  assert.equal(micButton.getListenerCount("click"), 1);
  assert.equal(doc.getListenerCount("ag:ai-voice-start"), 1);
  assert.equal(doc.getListenerCount("ag:ai-voice-stop"), 1);

  // destroy() çağrılır
  controller.destroy();

  // Dinleyiciler temizlenmiş olmalı
  assert.equal(micButton.getListenerCount("click"), 0);
  assert.equal(doc.getListenerCount("ag:ai-voice-start"), 0);
  assert.equal(doc.getListenerCount("ag:ai-voice-stop"), 0);

  // destroy sonrası tıklama hiçbir işlemi tetiklemez
  micButton.click();
  assert.equal(recognitionStarted, false);
  assert.equal(controller.getState().state, "IDLE");
});

test("ag:ai-voice-start ve ag:ai-voice-stop olayları buton durumunu otomatik SPEAKING ve IDLE yapar", () => {
  const micButton = createMockButton();
  const doc = createFakeEventTarget();

  const controller = createSpeechController({
    doc,
    micButton
  });

  assert.equal(controller.getState().state, "IDLE");

  // ag:ai-voice-start olayı yayınlanır
  doc.dispatchEvent({ type: "ag:ai-voice-start" });
  assert.equal(controller.getState().state, "SPEAKING");
  assert.equal(micButton.classList.contains("is-speaking"), true);
  assert.equal(micButton.getAttribute("data-state"), "SPEAKING");

  // ag:ai-voice-stop olayı yayınlanır
  doc.dispatchEvent({ type: "ag:ai-voice-stop" });
  assert.equal(controller.getState().state, "IDLE");
  assert.equal(micButton.classList.contains("is-idle"), true);
  assert.equal(micButton.classList.contains("is-speaking"), false);
  assert.equal(micButton.getAttribute("data-state"), "IDLE");

  controller.destroy();
});

test("dinleme (LISTENING) aktifken AI konuşmaya başlarsa mikrofonu kapatır ve SPEAKING durumuna geçer", () => {
  let activeInstance = null;
  class FakeRecognition {
    constructor() { activeInstance = this; }
    start() { this.started = true; }
    abort() { this.aborted = true; }
  }

  const micButton = createMockButton();
  const controller = createSpeechController({
    env: { webkitSpeechRecognition: FakeRecognition },
    micButton
  });

  micButton.click();
  assert.equal(controller.getState().state, "LISTENING");

  // AI konuşması başlar
  controller.setSpeaking(true);
  assert.equal(activeInstance.aborted, true);
  assert.equal(controller.getState().state, "SPEAKING");
  assert.equal(controller.getState().is_speaking, true);
  assert.equal(micButton.classList.contains("is-speaking"), true);

  controller.destroy();
});
