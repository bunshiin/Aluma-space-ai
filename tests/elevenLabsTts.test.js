import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearElevenLabsCache, createElevenLabsAudio, getElevenLabsFailure, isElevenLabsConfigured, TTS_FAILURE } from "../src/services/elevenLabsTts.js";

const ENV = { ELEVENLABS_API_KEY: "test-key", ELEVENLABS_VOICE_ID: "VOICE_A" };

function createAudioResponse(status) {
  return { ok: status === 200, status, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
}

describe("elevenLabsTts", () => {
  beforeEach(() => clearElevenLabsCache());

  it("anahtar yoksa veya örnek anahtar varsa istek atmadan null döner", async () => {
    assert.equal(isElevenLabsConfigured({}), false);
    assert.equal(isElevenLabsConfigured({ ELEVENLABS_API_KEY: "your_elevenlabs_api_key" }), false);
    const audio = await createElevenLabsAudio("Merhaba", { env: {}, fetchFn: async () => assert.fail("istek atılmamalı") });
    assert.equal(audio, null);
  });

  it("giden metinde link yoktur, anahtar başlıkta gider, MP3 döner ve önbelleğe alınır", async () => {
    const requests = [];
    const fetchFn = async (url, init) => {
      requests.push({ url, init });
      return createAudioResponse(200);
    };
    const audio = await createElevenLabsAudio("Jüpiter https://nasa.gov/j.jpg dev bir gezegen.", { env: ENV, fetchFn });
    assert.ok(Buffer.isBuffer(audio) && audio.length === 3);
    assert.ok(requests[0].url.endsWith("/text-to-speech/VOICE_A"));
    assert.equal(requests[0].init.headers["xi-api-key"], "test-key");
    const sentText = JSON.parse(requests[0].init.body).text;
    assert.equal(/https?:|\.jpg|nasa\.gov/.test(sentText), false, sentText);

    await createElevenLabsAudio("Jüpiter https://nasa.gov/j.jpg dev bir gezegen.", { env: ENV, fetchFn });
    assert.equal(requests.length, 1, "aynı metin ikinci kez kota harcamaz");
  });

  it("tercih edilen ses kotaya takılırsa (402) sıradaki sese geçer, kalıcı hatada null döner", async () => {
    const voices = [];
    const audio = await createElevenLabsAudio("Mars kızıl gezegendir.", {
      env: ENV,
      fetchFn: async (url) => {
        voices.push(url.split("/").pop());
        return createAudioResponse(voices.length === 1 ? 402 : 200);
      },
    });
    assert.ok(audio);
    assert.equal(voices.length, 2);
    assert.notEqual(voices[1], "VOICE_A");

    const failed = await createElevenLabsAudio("Satürn halkalıdır.", { env: ENV, fetchFn: async () => createAudioResponse(401) });
    assert.equal(failed, null);
    const offline = await createElevenLabsAudio("Venüs sıcaktır.", { env: ENV, fetchFn: async () => { throw new Error("internet yok"); } });
    assert.equal(offline, null);
  });

  it("ElevenLabs kota dolunca (401 + quota_exceeded) nedeni bildirir ve bir süre tekrar istek atmaz", async () => {
    let calls = 0;
    const quotaFetch = async () => {
      calls += 1;
      return { ok: false, status: 401, json: async () => ({ detail: { code: "quota_exceeded", message: "0 credits remaining" } }) };
    };
    assert.equal(await createElevenLabsAudio("Birinci cümle.", { env: ENV, fetchFn: quotaFetch }), null);
    assert.equal(getElevenLabsFailure(), TTS_FAILURE.QUOTA);
    assert.equal(calls, 1, "diğer seslere geçilmez, hepsi aynı kotayı kullanır");

    assert.equal(await createElevenLabsAudio("İkinci cümle.", { env: ENV, fetchFn: quotaFetch }), null);
    assert.equal(calls, 1, "kota bekleme süresinde istek atılmaz");
    assert.equal(getElevenLabsFailure(), TTS_FAILURE.QUOTA);
  });

  it("birinci anahtar kotaya takılırsa ikinci anahtara geçer ve anahtarları başlıkta sırayla kullanır", async () => {
    const keysUsed = [];
    const env = { ELEVENLABS_API_KEYS: "key-one, key-two", ELEVENLABS_API_KEY: "key-one", ELEVENLABS_VOICE_ID: "VOICE_A" };
    const fetchFn = async (url, init) => {
      keysUsed.push(init.headers["xi-api-key"]);
      return init.headers["xi-api-key"] === "key-one"
        ? { ok: false, status: 401, json: async () => ({ detail: { code: "quota_exceeded" } }) }
        : createAudioResponse(200);
    };
    const audio = await createElevenLabsAudio("Yedek anahtar testi.", { env, fetchFn });
    assert.ok(Buffer.isBuffer(audio));
    assert.deepEqual(keysUsed, ["key-one", "key-two"], "tekrarlayan anahtar denenmez, sıra korunur");
    assert.equal(getElevenLabsFailure(), null);
  });

  it("gerçek yetki hatası (401 veya 400 api_key_id, kota değil) UNAUTHORIZED olarak ayrılır; başarı hatayı temizler", async () => {
    const bad = async () => ({ ok: false, status: 401, json: async () => ({ detail: { code: "invalid_api_key" } }) });
    assert.equal(await createElevenLabsAudio("Yetkisiz.", { env: ENV, fetchFn: bad }), null);
    assert.equal(getElevenLabsFailure(), TTS_FAILURE.UNAUTHORIZED);

    const keyIdError = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: { type: "authentication_error", code: "invalid_api_key", status: "api_key_id_used_as_api_key" } })
    });
    assert.equal(await createElevenLabsAudio("Key ID hatası.", { env: ENV, fetchFn: keyIdError }), null);
    assert.equal(getElevenLabsFailure(), TTS_FAILURE.UNAUTHORIZED);

    await createElevenLabsAudio("Başarılı.", { env: ENV, fetchFn: async () => createAudioResponse(200) });
    assert.equal(getElevenLabsFailure(), null);
  });
});
