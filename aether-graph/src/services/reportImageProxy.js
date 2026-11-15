// PDF raporundaki fotoğrafların tuvale çizilebilmesi için sunucudan aktarılması (CORS izni vermeyen kaynaklar).
// Açık bir vekil (open proxy) olmasın diye yalnızca https ve uygulamanın kullandığı NASA/Wikimedia alan adları,
// yalnızca resim içeriği ve sınırlı boyut kabul edilir.

const ALLOWED_HOST_SUFFIXES = Object.freeze(['nasa.gov', 'wikimedia.org', 'wikipedia.org']);
const MAX_URL_LENGTH = 2048;
export const MAX_PROXY_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'AetherGraph/1.0 (egitim amacli uzay platformu)';

/**
 * Adres https ise ve izinli bir alan adına (veya alt alan adına) aitse true döner.
 */
export function isAllowedImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) return false;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * İzinli resmi indirir. Sonuç { status, content_type?, body? }: 200 resim, 400 izinsiz adres,
 * 413 çok büyük, 415 resim değil, 502 kaynak hatası. Hata fırlatmaz.
 */
export async function fetchProxiedImage(rawUrl, fetchFn = globalThis.fetch) {
  if (!isAllowedImageUrl(rawUrl)) return { status: 400 };
  if (typeof fetchFn !== 'function') return { status: 502 };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetchFn(rawUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }, signal: controller.signal, redirect: 'follow' });
    if (!resp?.ok) return { status: 502 };
    // Yönlendirme izinsiz bir yere gittiyse içerik verilmez
    if (resp.url && !isAllowedImageUrl(resp.url)) return { status: 400 };
    const content_type = String(resp.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!content_type.startsWith('image/') || content_type === 'image/svg+xml') return { status: 415 };
    const declared = Number(resp.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PROXY_IMAGE_BYTES) return { status: 413 };
    const body = Buffer.from(await resp.arrayBuffer());
    if (body.length > MAX_PROXY_IMAGE_BYTES) return { status: 413 };
    return { status: 200, content_type, body };
  } catch (err) {
    console.warn('Rapor görseli aktarılamadı:', err?.message);
    return { status: 502 };
  } finally {
    clearTimeout(timeoutId);
  }
}
