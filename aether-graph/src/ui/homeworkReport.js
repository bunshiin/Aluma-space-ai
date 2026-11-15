// Ödev sepetinden PDF'e dönüştürülecek "Küçük Kaşif Ödev Raporu" DOM ağacını kurar (sayfaya eklenmez) ve dışa aktarır.

import { exportHomeworkPdf } from "./pdfExporter.js";

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

function createReportItem(doc, item, index, getText) {
  const section = createElement(doc, "section", "homework-report-item");
  section.append(createElement(doc, "h2", "homework-report-item-title", `${index + 1}. ${item.title}`));
  if (item.photo?.image_url) {
    const figure = createElement(doc, "figure", "homework-report-photo");
    const image = createElement(doc, "img", "homework-report-photo-img");
    // NASA görseli başka alan adında: html2canvas'ın çizebilmesi için CORS ile istenir
    if (item.photo.image_url.startsWith("https://")) image.setAttribute("crossorigin", "anonymous");
    image.setAttribute("src", item.photo.image_url);
    image.setAttribute("alt", getText("photo_alt", { topic: item.title }));
    figure.append(image);
    const caption = [item.photo.image_title, item.photo.image_source].filter(Boolean).join(" · ");
    if (caption) figure.append(createElement(doc, "figcaption", "homework-report-photo-caption", caption));
    section.append(figure);
  }
  // Öğrencinin kartta düzenlediği metnin son hali basılır; satır sonları korunur
  if (item.text && item.text.trim()) section.append(createElement(doc, "p", "homework-report-text", item.text.trim()));
  if (item.facts.length > 0) {
    const table = createElement(doc, "table", "homework-report-facts");
    const tbody = createElement(doc, "tbody", "homework-report-facts-body");
    for (const fact of item.facts) {
      const row = createElement(doc, "tr", "homework-report-fact-row");
      row.append(createElement(doc, "th", "homework-report-fact-label", fact.label), createElement(doc, "td", "homework-report-fact-value", fact.value));
      tbody.append(row);
    }
    table.append(tbody);
    section.append(table);
  }
  return section;
}

/**
 * Rapor öğesini kurar.
 */
export function createHomeworkReportElement(doc, { items, student_name, homework_title, date_text, getText }) {
  const report = createElement(doc, "article", "homework-report");
  const header = createElement(doc, "header", "homework-report-header");
  header.append(
    createElement(doc, "p", "homework-report-kicker", getText("report_title")),
    createElement(doc, "h1", "homework-report-title", homework_title || getText("default_homework_title")),
    createElement(doc, "p", "homework-report-meta",
      `${getText("report_student_label")}: ${student_name || getText("report_unknown_student")} · ${getText("report_date_label")}: ${date_text}`)
  );
  report.append(header);
  items.forEach((item, index) => report.append(createReportItem(doc, item, index, getText)));
  return report;
}

/**
 * Raporu kurup html2pdf ile indirir; sonuç pdfExporter ile aynı biçimdedir ({ exported, reason?, filename? }).
 */
export async function exportHomeworkReport({ doc, items, profile, getText, date, html2pdf, pdfEnv }) {
  const date_text = getReportDateText(date);
  const reportEl = doc ? createHomeworkReportElement(doc, { items, ...profile, date_text, getText }) : null;
  return exportHomeworkPdf(reportEl, {
    html2pdf,
    env: pdfEnv,
    filename: getReportFilename(profile.homework_title || getText("default_homework_title"), date_text),
    backgroundColor: "#ffffff"
  });
}
