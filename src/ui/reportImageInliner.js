// PDF'e basılmadan önce rapordaki fotoğrafları hazırlar. html2canvas uzak resmi yüklenmesini beklemeden ve CORS
// izni yoksa hiç çizmez (resim yarım ya da boş çıkar), object-fit kırpmasını da desteklemez. Bu yüzden her
// fotoğraf önceden indirilir, 16:9 kırpılıp JPEG veri adresine (data URL) çevrilir; olmayan fotoğraf rapordan çıkar.

export const REPORT_PHOTO_SIZE_PX = Object.freeze({ width: 1600, height: 900 });
const IMAGE_TIMEOUT_MS = 10000;
const JPEG_QUALITY = 0.9;
const PROXY_PATH = "/api/image-proxy";

function collectReportImages(node, found = []) {
  if (!node) return found;
  if (String(node.className || "").split(/\s+/).includes("homework-report-photo-img")) found.push(node);
  for (const child of Array.from(node.children || [])) collectReportImages(child, found);
  return found;
}

async function fetchBlob(url, fetchFn, init) {
  const resp = await fetchFn(url, init);
  if (!resp?.ok) throw new Error(`HTTP ${resp?.status}`);
  const blob = await resp.blob();
  if (!String(blob.type || "").startsWith("image/")) throw new Error("resim değil");
  return blob;
}

// Önce doğrudan (CORS), olmazsa sunucudaki izinli aktarıcı üzerinden indirilir
async function downloadImageBlob(src, fetchFn) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    try {
      return await fetchBlob(src, fetchFn, { mode: "cors", signal: controller.signal });
    } catch {
      return await fetchBlob(`${PROXY_PATH}?url=${encodeURIComponent(src)}`, fetchFn, { signal: controller.signal });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function loadImageElement(doc, src) {
  return new Promise((resolve, reject) => {
    const image = doc.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("resim çözülemedi"));
    image.src = src;
  });
}

// Dikey fotoğrafta konu (astronotun başı, roketin gövdesi) genelde üst-ortadadır; tam ortadan kesmek başı keser
const VERTICAL_FOCUS = 0.35;

/**
 * "Cover" kırpma bölgesini hesaplar: taşan kenarlar kesilir, oran bozulmaz. Yatayda ortalanır, dikeyde üste
 * yakın (VERTICAL_FOCUS) tutulur. Saf hesaptır; geçersiz boyutta null döner.
 */
export function calculateCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (!(sourceWidth > 0 && sourceHeight > 0 && targetWidth > 0 && targetHeight > 0)) return null;
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const cropWidth = targetWidth / scale;
  const cropHeight = targetHeight / scale;
  return { sx: (sourceWidth - cropWidth) / 2, sy: (sourceHeight - cropHeight) * VERTICAL_FOCUS, sw: cropWidth, sh: cropHeight };
}

/**
 * Tarayıcıda resmi indirir, 16:9 kırpar ve JPEG data URL döner. Başarısızsa null.
 */
export async function createCroppedImageDataUrl(src, { doc, fetchFn = globalThis.fetch } = {}) {
  if (!doc || typeof src !== "string" || !src) return null;
  let objectUrl = null;
  try {
    let imageSrc = src;
    if (!src.startsWith("data:image/")) {
      if (!src.startsWith("https://") || typeof fetchFn !== "function") return null;
      objectUrl = URL.createObjectURL(await downloadImageBlob(src, fetchFn));
      imageSrc = objectUrl;
    }
    const image = await loadImageElement(doc, imageSrc);
    const { width, height } = REPORT_PHOTO_SIZE_PX;
    const crop = calculateCoverCrop(image.naturalWidth, image.naturalHeight, width, height);
    if (!crop) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch (err) {
    console.warn("Rapor fotoğrafı hazırlanamadı:", err?.message);
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Rapordaki her fotoğrafı veri adresine çevirir; hazırlanamayan fotoğrafın kutusu kaldırılır (boş çerçeve kalmaz).
 * loadImageDataUrl testte sahte verilebilir. Sonuç: { inlined, removed }.
 */
export async function inlineReportImages(rootEl, { loadImageDataUrl } = {}) {
  const loader = typeof loadImageDataUrl === "function"
    ? loadImageDataUrl
    : (src) => createCroppedImageDataUrl(src, { doc: rootEl?.ownerDocument });
  const images = collectReportImages(rootEl);
  const results = await Promise.all(images.map(async (image) => {
    const dataUrl = await loader(image.getAttribute("src"));
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      image.setAttribute("src", dataUrl);
      image.removeAttribute?.("crossorigin");
      return true;
    }
    image.parentNode?.remove?.();
    return false;
  }));
  return { inlined: results.filter(Boolean).length, removed: results.filter((ok) => !ok).length };
}
