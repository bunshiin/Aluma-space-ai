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
