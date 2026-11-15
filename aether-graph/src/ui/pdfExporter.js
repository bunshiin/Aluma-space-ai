// Küçük Kaşif Ödev Sepeti içeriğini html2pdf.js kullanarak PDF dosyası olarak dışa aktarır.

/**
 * Ortamda html2pdf.js desteğinin bulunup bulunmadığını döner.
 */
export function isPdfExportSupported(env = globalThis) {
  return typeof env?.html2pdf === "function";
}

/**
 * Verilen ödev alanı DOM öğesini A4 PDF dosyasına dönüştürüp indirir; hata fırlatmaz.
 */
export async function exportHomeworkPdf(printableElement, options = {}) {
  if (!printableElement) {
    console.warn("PDF dışa aktarılacak öğe bulunamadı.");
    return { exported: false, reason: "MISSING_ELEMENT" };
  }

  const html2pdfFn = options.html2pdf || options.env?.html2pdf || globalThis?.html2pdf;
  if (typeof html2pdfFn !== "function") {
    console.warn("html2pdf kütüphanesi yüklenemedi.");
    return { exported: false, reason: "MISSING_LIBRARY" };
  }

  const filename = options.filename || "kucuk-kasif-odev-sepeti.pdf";
  const pdfConfig = {
    margin: 12,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: options.backgroundColor || "#0c121e" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  try {
    const worker = html2pdfFn();
    if (worker && typeof worker.set === "function" && typeof worker.from === "function") {
      await worker.set(pdfConfig).from(printableElement).save();
    } else {
      await html2pdfFn(printableElement, pdfConfig);
    }
    return { exported: true, filename };
  } catch (err) {
    console.warn("PDF dışa aktarma başarısız:", err);
    return { exported: false, reason: "EXPORT_ERROR" };
  }
}
