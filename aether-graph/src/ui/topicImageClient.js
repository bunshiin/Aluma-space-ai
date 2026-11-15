// Sunucudaki POST /api/topic-image ucundan konu görseli ister (arama sunucuda yapılır, tarayıcıya sadece adres gelir).

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Konu görselini döner: { image_url, image_title, image_source } ya da bulunamazsa / hata olursa null.
 * Zaman aşımında istek iptal edilir; zamanlayıcı her durumda temizlenir.
 */
export async function requestTopicImage(query, title = "", fetchFn = globalThis.fetch) {
  const safeQuery = typeof query === "string" ? query.trim() : "";
  if (!safeQuery || typeof fetchFn !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const resp = await fetchFn("/api/topic-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: safeQuery, title: typeof title === "string" ? title : "" }),
      signal: controller?.signal
    });
    if (!resp?.ok) return null;
    const json = await resp.json();
    if (typeof json?.image_url !== "string" || !json.image_url.startsWith("https://")) return null;
    return {
      image_url: json.image_url,
      image_title: typeof json.image_title === "string" ? json.image_title : "",
      image_source: typeof json.image_source === "string" ? json.image_source : ""
    };
  } catch (err) {
    console.warn("Konu görseli alınamadı:", err?.message);
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
