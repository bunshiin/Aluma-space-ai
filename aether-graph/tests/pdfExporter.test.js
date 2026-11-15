import test from "node:test";
import assert from "node:assert/strict";

import { exportHomeworkPdf, isPdfExportSupported } from "../src/ui/pdfExporter.js";

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
