// Ödev sepetinden PDF'e dönüştürülecek "Küçük Kaşif Ödev Raporu" DOM ağacını kurar (sayfaya eklenmez) ve dışa aktarır.

import { exportHomeworkPdf, resolveHtml2Pdf } from "./pdfExporter.js";
import { inlineReportImages } from "./reportImageInliner.js";

const PDF_REASON_TEXT_KEYS = Object.freeze({
  EMPTY_BASKET: "export_empty_warning",
  MISSING_LIBRARY: "export_missing_library",
  MISSING_ELEMENT: "export_failed",
  EXPORT_ERROR: "export_failed"
});

/**
 * PDF sonucuna karşılık gelen states.json metin anahtarını döner (panelde gösterilecek mesaj).
 */
export function getPdfResultTextKey(result) {
  return result?.exported ? "export_success" : PDF_REASON_TEXT_KEYS[result?.reason] || "export_failed";
}

function createElement(doc, tag, className, text) {
  const el = doc.createElement(tag);
  el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

/**
 * Tarihi rapor için gün.ay.yıl biçimine çevirir; geçersiz tarihte bugünü kullanır.
 */
export function getReportDateText(date = new Date()) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(safeDate.getDate())}.${pad(safeDate.getMonth() + 1)}.${safeDate.getFullYear()}`;
}

/**
 * PDF dosya adını ödev başlığından güvenli biçimde üretir.
 */
export function getReportFilename(homeworkTitle, dateText) {
  const slug = String(homeworkTitle || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "kucuk-kasif-odev-raporu"}-${String(dateText).replace(/\./g, "-")}.pdf`;
}

function createReportPhoto(doc, item, getText) {
  const figure = createElement(doc, "figure", "homework-report-photo");
  const image = createElement(doc, "img", "homework-report-photo-img");
  // PDF öncesi reportImageInliner bu adresi kırpılmış veri adresine çevirir; çevrilemezse kutu kaldırılır
  if (item.photo.image_url.startsWith("https://")) image.setAttribute("crossorigin", "anonymous");
  image.setAttribute("src", item.photo.image_url);
  image.setAttribute("alt", getText("photo_alt", { topic: item.title }));
  figure.append(image);
  const caption = [item.photo.image_title, item.photo.image_source].filter(Boolean).join(" · ");
  if (caption) figure.append(createElement(doc, "figcaption", "homework-report-photo-caption", caption));
  return figure;
}

function createReportFacts(doc, facts, getText) {
  const box = createElement(doc, "div", "homework-report-facts");
  box.append(createElement(doc, "p", "homework-report-facts-title", getText("report_facts_title")));
  const grid = createElement(doc, "dl", "homework-report-facts-grid");
  for (const fact of facts) {
    const cell = createElement(doc, "div", "homework-report-fact");
    cell.append(createElement(doc, "dt", "homework-report-fact-label", fact.label), createElement(doc, "dd", "homework-report-fact-value", fact.value));
    grid.append(cell);
  }
  box.append(grid);
  return box;
}

function createReportItem(doc, item, index, getText) {
  const section = createElement(doc, "section", "homework-report-item");
  const header = createElement(doc, "div", "homework-report-item-header");
  header.append(
    createElement(doc, "span", "homework-report-item-number", String(index + 1).padStart(2, "0")),
    createElement(doc, "h2", "homework-report-item-title", item.title)
  );
  section.append(header);
  if (item.photo?.image_url) section.append(createReportPhoto(doc, item, getText));
  // Öğrencinin kartta düzenlediği metnin son hali basılır; satır sonları korunur
  if (item.text && item.text.trim()) section.append(createElement(doc, "p", "homework-report-text", item.text.trim()));
  if (item.facts.length > 0) section.append(createReportFacts(doc, item.facts, getText));
  return section;
}

function createMetaChip(doc, label, value) {
  const chip = createElement(doc, "span", "homework-report-chip");
  chip.append(createElement(doc, "span", "homework-report-chip-label", label), createElement(doc, "span", "homework-report-chip-value", value));
  return chip;
}

/**
 * Rapor öğesini kurar: kapak bandı, numaralı konu kartları ve alt bilgi.
 */
export function createHomeworkReportElement(doc, { items, student_name, homework_title, date_text, getText }) {
  const report = createElement(doc, "article", "homework-report");
  const cover = createElement(doc, "header", "homework-report-cover");
  const meta = createElement(doc, "div", "homework-report-meta");
  meta.append(
    createMetaChip(doc, getText("report_student_label"), student_name || getText("report_unknown_student")),
    createMetaChip(doc, getText("report_date_label"), date_text),
    createMetaChip(doc, getText("report_topic_count_label"), String(items.length))
  );
  cover.append(
    createElement(doc, "p", "homework-report-brand", getText("report_brand")),
    createElement(doc, "p", "homework-report-kicker", getText("report_title")),
    createElement(doc, "h1", "homework-report-title", homework_title || getText("default_homework_title")),
    meta
  );
  report.append(cover);
  items.forEach((item, index) => report.append(createReportItem(doc, item, index, getText)));
  report.append(createElement(doc, "footer", "homework-report-footer", `${getText("report_footer")} · ${date_text}`));
  return report;
}

/**
 * Raporu kurar, fotoğrafları önceden hazırlar ve html2pdf ile indirir; sonuç pdfExporter ile aynı biçimdedir
 * ({ exported, reason?, filename? }). Sepet boşsa PDF denenmez. loadImageDataUrl testte sahte verilebilir.
 */
export async function exportHomeworkReport({ doc, items, profile, getText, date, html2pdf, pdfEnv, loadImageDataUrl }) {
  if (!Array.isArray(items) || items.length === 0) {
    console.warn("Ödev sepeti boş, PDF oluşturulmadı.");
    return { exported: false, reason: "EMPTY_BASKET" };
  }
  const date_text = getReportDateText(date);
  const reportEl = doc ? createHomeworkReportElement(doc, { items, ...profile, date_text, getText }) : null;
  // PDF aracı yoksa fotoğraflar boşuna indirilmez; uyarıyı exportHomeworkPdf verir
  if (reportEl && resolveHtml2Pdf({ html2pdf, env: pdfEnv })) await inlineReportImages(reportEl, { loadImageDataUrl });
  return exportHomeworkPdf(reportEl, {
    html2pdf,
    env: pdfEnv,
    filename: getReportFilename(profile.homework_title || getText("default_homework_title"), date_text),
    backgroundColor: "#ffffff",
    pageNumberLabel: getText("report_page_label")
  });
}
