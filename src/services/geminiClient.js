// Gemini API istemcisi, anahtar rotasyonu ve yeniden deneme (failover) yönetimi

import { isNonEmptyString, isPlainObject } from "./geminiConstants.js";

function createKeyArrayFromString(rawKeys) {
  if (!isNonEmptyString(rawKeys)) return [];
  return rawKeys.split(",").map((k) => k.trim()).filter(isNonEmptyString);
}

function resolveEnvironmentApiKeys() {
  const fromList = createKeyArrayFromString(process.env.GEMINI_API_KEYS);
  if (fromList.length > 0) return fromList;
  return createKeyArrayFromString(process.env.GEMINI_API_KEY);
}

const moduleConfig = {
  apiKeys: [],
  activeKeyIndex: 0,
  client: null,
  clientFactory: null,
  modelName: "gemini-3.5-flash-lite",
  retryDelayMs: 3000,
  maxRetryRounds: 2,
  requestTimeoutMs: 20000,
  silentTelemetry: false,
};

export function createGeminiRouterConfig(options = {}) {
  if (!isPlainObject(options)) return;
  if (Array.isArray(options.apiKeys)) {
    moduleConfig.apiKeys = options.apiKeys.filter(isNonEmptyString).map((k) => k.trim());
    moduleConfig.activeKeyIndex = 0;
  } else if (typeof options.apiKey === "string") {
    moduleConfig.apiKeys = createKeyArrayFromString(options.apiKey);
    moduleConfig.activeKeyIndex = 0;
  }
  if (options.client !== undefined) moduleConfig.client = options.client;
  if (options.clientFactory !== undefined) moduleConfig.clientFactory = options.clientFactory;
  if (isNonEmptyString(options.modelName)) moduleConfig.modelName = options.modelName.trim();
  if (typeof options.retryDelayMs === "number" && options.retryDelayMs >= 0) {
    moduleConfig.retryDelayMs = options.retryDelayMs;
  }
  if (typeof options.maxRetryRounds === "number" && options.maxRetryRounds >= 1) {
    moduleConfig.maxRetryRounds = options.maxRetryRounds;
  }
  if (typeof options.requestTimeoutMs === "number" && options.requestTimeoutMs > 0) {
    moduleConfig.requestTimeoutMs = options.requestTimeoutMs;
  }
  if (typeof options.silentTelemetry === "boolean") {
    moduleConfig.silentTelemetry = options.silentTelemetry;
  }
}

export function getGeminiRouterRuntimeInfo() {
  return {
    modelName: moduleConfig.modelName,
    hasCustomClient: Boolean(moduleConfig.client || moduleConfig.clientFactory),
    silentTelemetry: Boolean(moduleConfig.silentTelemetry),
  };
}

function ensureApiKeysLoaded() {
  if (moduleConfig.client) return;
  if (moduleConfig.apiKeys.length === 0) {
    const envKeys = resolveEnvironmentApiKeys();
    if (envKeys.length > 0) moduleConfig.apiKeys = envKeys;
  }
}

function getNextClientInfo() {
  if (moduleConfig.client) {
    return { client: moduleConfig.client, keyIndex: -1, rawKey: null };
  }
  ensureApiKeysLoaded();
  if (moduleConfig.apiKeys.length === 0) {
    throw new Error("Hiçbir Gemini API anahtarı tanımlı değil.");
  }

  const currentIndex = moduleConfig.activeKeyIndex % moduleConfig.apiKeys.length;
  const selectedKey = moduleConfig.apiKeys[currentIndex];
  const client = moduleConfig.clientFactory ? moduleConfig.clientFactory(selectedKey) : null;
  return { client, keyIndex: currentIndex, rawKey: selectedKey };
}

function rotateApiKey() {
  if (moduleConfig.apiKeys.length > 1) {
    moduleConfig.activeKeyIndex = (moduleConfig.activeKeyIndex + 1) % moduleConfig.apiKeys.length;
  }
}

async function callV1BetaDirect(rawKey, modelName, contents, systemInstructionText, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${rawKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstructionText }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await resp.json();
  if (!resp.ok || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
  }
  return data.candidates[0].content.parts[0].text;
}

export async function requestGeminiWithFailover(contents, sysPrompt) {
  ensureApiKeysLoaded();
  let attempts = 0;
  const maxAttempts = Math.max(1, moduleConfig.apiKeys.length) * moduleConfig.maxRetryRounds;

  while (attempts < maxAttempts) {
    attempts += 1;
    const clientInfo = getNextClientInfo();

    try {
      if (clientInfo.client) {
        const response = await clientInfo.client.models.generateContent({
          model: moduleConfig.modelName,
          contents,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: "application/json",
          },
        });
        const responseText = response?.text;
        if (!isNonEmptyString(responseText)) {
          throw new Error("Gemini API boş yanıt döndürdü.");
        }
        return { text: responseText, keyIndex: clientInfo.keyIndex };
      }

      const directText = await callV1BetaDirect(
        clientInfo.rawKey,
        moduleConfig.modelName,
        contents,
        sysPrompt,
        moduleConfig.requestTimeoutMs
      );
      return { text: directText, keyIndex: clientInfo.keyIndex };
    } catch (error) {
      if (moduleConfig.client) throw error;
      const detail = error.cause?.message ? `${error.message} (${error.cause.message})` : error.message;
      console.warn(`Gemini isteği başarısız (deneme ${attempts}/${maxAttempts}):`, detail);
      rotateApiKey();
      if (attempts % Math.max(1, moduleConfig.apiKeys.length) === 0 && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, moduleConfig.retryDelayMs));
      }
    }
  }
  throw new Error("Tüm API anahtarları tükendi.");
}
