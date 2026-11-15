import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVoicePlayer } from "../src/ui/voicePlayer.js";

function createEnv(status = 200) {
  const requests = [];
  const played = [];
  return {
    requests,
    played,
    env: {
      fetch: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        return { ok: status === 200, status, blob: async () => ({}) };
      },
      Audio: class {
        constructor(src) { this.src = src; }
        async play() { played.push(this.src); }
        pause() {}
      },
      URL: { createObjectURL: () => "blob:ses", revokeObjectURL() {} },
    },
  };
}

describe("voicePlayer (ElevenLabs)", () => {
  it("metni /api/tts ucuna linksiz gönderir ve dönen sesi çalar", async () => {
    const { env, requests, played } = createEnv();
    const player = createVoicePlayer({ env });
    assert.equal(await player.speak("Satürn halkalıdır https://nasa.gov/s.jpg"), true);
    assert.equal(requests[0].url, "/api/tts");
    assert.equal(requests[0].body.text, "Satürn halkalıdır");
    assert.deepEqual(played, ["blob:ses"]);
  });

  it("kapalıyken istek atmaz; sunucu ses vermezse (204) sessiz kalır", async () => {
    const off = createEnv();
    const player = createVoicePlayer({ env: off.env, is_enabled: false });
    assert.equal(await player.speak("Merhaba"), false);
    assert.equal(off.requests.length, 0);

    const silent = createEnv(204);
    assert.equal(await createVoicePlayer({ env: silent.env }).speak("Merhaba"), false);
    assert.equal(silent.played.length, 0);
  });

  it("sunucu sessizlik nedenini bildirirse onUnavailable ile UI'ya iletir", async () => {
    const reasons = [];
    const player = createVoicePlayer({
      onUnavailable: (reason) => reasons.push(reason),
      env: {
        fetch: async () => ({ ok: true, status: 204, headers: { get: (name) => (name === "X-Tts-Reason" ? "quota_exceeded" : null) } }),
        Audio: class {},
        URL: {},
      },
    });
    assert.equal(await player.speak("Merhaba"), false);
    assert.deepEqual(reasons, ["quota_exceeded"]);
  });
});
