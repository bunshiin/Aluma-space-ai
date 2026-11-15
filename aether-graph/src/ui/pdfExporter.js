// Küçük Kaşif Ödev Sepeti içeriğini html2pdf.js kullanarak PDF dosyası olarak dışa aktarır.

export const PAGEBREAK_AVOID_SELECTORS = Object.freeze([
  ".homework-report-cover", ".homework-report-item-header", ".homework-report-photo", ".homework-report-facts"
]);

/**
 * jsPDF belgesinin her sayfasının altına ortalanmış "Sayfa n / N" yazar. jsPDF'in yerleşik yazı tipi Türkçe
 * karakterleri basamadığı için etiket ASCII'ye indirgenir.
 */
export function addPageNumbers(pdf, label) {
  const total = typeof pdf?.internal?.getNumberOfPages === "function" ? pdf.internal.getNumberOfPages() : 0;
  if (!total || typeof pdf.setPage !== "function" || typeof pdf.text !== "function") return 0;
  const safeLabel = String(label || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/İ/g, "I");
  const width_mm = pdf.internal.pageSize?.getWidth?.() ?? 210;
  const height_mm = pdf.internal.pageSize?.getHeight?.() ?? 297;
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize?.(9);
    pdf.setTextColor?.(120, 130, 150);
    pdf.text(`${safeLabel} ${page} / ${total}`, width_mm / 2, height_mm - 7, { align: "center" });
  }
  return total;
}

/**
 * Kullanılacak html2pdf fonksiyonunu seçer (verilen > ortam > global); yoksa null.
 */
export function resolveHtml2Pdf(options = {}) {
  const fn = options.html2pdf || options.env?.html2pdf || globalThis?.html2pdf;
  return typeof fn === "function" ? fn : null;
}

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

  const html2pdfFn = resolveHtml2Pdf(options);
  if (!html2pdfFn) {
    console.warn("html2pdf kütüphanesi yüklenemedi.");
    return { exported: false, reason: "MISSING_LIBRARY" };
  }

  const filename = options.filename || "kucuk-kasif-odev-sepeti.pdf";
  const pdfConfig = {
    // Üst, sol, alt, sağ (mm); altta sayfa numarasına yer kalır
    margin: [12, 12, 16, 12],
    filename,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: options.backgroundColor || "#0c121e" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    // Fotoğraf, bilgi kutusu ve kart başlığı sayfa sınırında ikiye bölünmez; sığmıyorsa sonraki sayfaya geçer
    pagebreak: { mode: ["css", "legacy"], avoid: PAGEBREAK_AVOID_SELECTORS }
  };

  try {
    const worker = html2pdfFn();
    if (worker && typeof worker.set === "function" && typeof worker.from === "function") {
      const prepared = worker.set(pdfConfig).from(printableElement);
      // html2pdf her adımda yeni bir çalışan döndürür; numaralar kaybolmasın diye kaydetme aynı zincirde yapılır
      if (options.pageNumberLabel && typeof prepared.toPdf === "function") {
        await prepared.toPdf().get("pdf").then((pdf) => { addPageNumbers(pdf, options.pageNumberLabel); }).save();
      } else {
        await prepared.save();
      }
    } else {
      await html2pdfFn(printableElement, pdfConfig);
    }
    return { exported: true, filename };
  } catch (err) {
    console.warn("PDF dışa aktarma başarısız:", err);
    return { exported: false, reason: "EXPORT_ERROR" };
  }
}
