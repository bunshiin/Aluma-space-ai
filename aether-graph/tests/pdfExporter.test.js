import test from "node:test";
import assert from "node:assert/strict";

import { addPageNumbers, exportHomeworkPdf, isPdfExportSupported } from "../src/ui/pdfExporter.js";

test("isPdfExportSupported kütüphane varlığını doğru kontrol eder", () => {
  assert.equal(isPdfExportSupported({}), false);
  assert.equal(isPdfExportSupported({ html2pdf: () => {} }), true);
});

test("exportHomeworkPdf sahte html2pdf zinciri ile başarılı sonuç döner", async () => {
  let receivedConfig = null;
  let receivedElement = null;
  let saveCalled = false;

  const fakeHtml2Pdf = () => ({
    set(cfg) {
      receivedConfig = cfg;
      return this;
    },
    from(el) {
      receivedElement = el;
      return this;
    },
    async save() {
      saveCalled = true;
    }
  });

  const dummyArea = { id: "homework-printable-area" };
  const result = await exportHomeworkPdf(dummyArea, { html2pdf: fakeHtml2Pdf });

  assert.deepEqual(result, {
    exported: true,
    filename: "kucuk-kasif-odev-sepeti.pdf"
  });
  assert.equal(saveCalled, true);
  assert.equal(receivedElement, dummyArea);
  assert.equal(receivedConfig.filename, "kucuk-kasif-odev-sepeti.pdf");
  assert.equal(receivedConfig.jsPDF.format, "a4");
});

test("exportHomeworkPdf eksik element veya kütüphanede hata fırlatmaz", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const missingEl = await exportHomeworkPdf(null, { html2pdf: () => {} });
    assert.deepEqual(missingEl, { exported: false, reason: "MISSING_ELEMENT" });

    const missingLib = await exportHomeworkPdf({ id: "homework-printable-area" }, { env: {} });
    assert.deepEqual(missingLib, { exported: false, reason: "MISSING_LIBRARY" });

    const failingLib = await exportHomeworkPdf(
      { id: "homework-printable-area" },
      {
        html2pdf: () => ({
          set() { return this; },
          from() { return this; },
          async save() {
            throw new Error("PDF boom");
          }
        })
      }
    );
    assert.deepEqual(failingLib, { exported: false, reason: "EXPORT_ERROR" });
  } finally {
    console.warn = originalWarn;
  }
});

test("exportHomeworkPdf sayfa bölme kurallarını verir ve sayfa numaralarını aynı zincirde ekler", async () => {
  const calls = [];
  const pages = [];
  const fakePdf = {
    internal: { getNumberOfPages: () => 2, pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setPage: (n) => calls.push(`page:${n}`),
    setFontSize() {},
    setTextColor() {},
    text: (text, x, y, opts) => pages.push({ text, x, y, align: opts.align })
  };
  let config = null;
  const worker = {
    set(cfg) { config = cfg; return this; },
    from() { return this; },
    toPdf() { calls.push("toPdf"); return this; },
    get(name) { calls.push(`get:${name}`); return this; },
    then(fn) { fn(fakePdf); return this; },
    async save() { calls.push("save"); }
  };
  const result = await exportHomeworkPdf({ id: "r" }, { html2pdf: () => worker, pageNumberLabel: "Sayfa" });
  assert.equal(result.exported, true);
  assert.deepEqual(config.margin, [12, 12, 16, 12]);
  assert.deepEqual(config.pagebreak.mode, ["css", "legacy"]);
  assert.ok(config.pagebreak.avoid.includes(".homework-report-facts"));
  assert.deepEqual(calls, ["toPdf", "get:pdf", "page:1", "page:2", "save"]);
  assert.deepEqual(pages.map((p) => p.text), ["Sayfa 1 / 2", "Sayfa 2 / 2"]);
  assert.equal(pages[0].align, "center");
});

test("addPageNumbers Türkçe etiketi jsPDF'in basabileceği harflere indirger, bozuk pdf'te 0 döner", () => {
  const texts = [];
  const pdf = { internal: { getNumberOfPages: () => 1, pageSize: {} }, setPage() {}, text: (t) => texts.push(t) };
  assert.equal(addPageNumbers(pdf, "Sayfa Iğdır"), 1);
  assert.deepEqual(texts, ["Sayfa Igdir 1 / 1"]);
  assert.equal(addPageNumbers({}, "Sayfa"), 0);
  assert.equal(addPageNumbers(null, "Sayfa"), 0);
});
