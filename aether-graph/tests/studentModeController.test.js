import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createStudentModeController } from "../src/ui/studentModeController.js";
import { CountingEventTarget, createMockDocument, findAllByClass, findByClass } from "./mockDom.js";

const LIGHT_DELAY_DETAIL = { source: "EARTH", target: "MARS", mode: "one-way", delay_s: 751.2, round_trip_s: 1502.4 };
const NASA_PHOTOS = [
  { nasa_id: "a", image_title: "Ay yüzeyi", image_url: "https://images-assets.nasa.gov/image/a/a~thumb.jpg", image_source: "NASA Görsel Arşivi" },
  { nasa_id: "b", image_title: "Ay kraterleri", image_url: "https://images-assets.nasa.gov/image/b/b~thumb.jpg", image_source: "NASA Görsel Arşivi" }
];

function setup(extra = {}) {
  const doc = createMockDocument();
  const container = doc.createElement("div");
  const eventTarget = new CountingEventTarget();
  const events = [];
  for (const name of ["ag:student-mode-changed", "ag:homework-added"]) {
    eventTarget.addEventListener(name, (e) => events.push({ name, detail: e.detail }));
  }
  const photoQueries = [];
  const getSpaceData = extra.getSpaceData ?? (() => async (queryType, identifier) => {
    photoQueries.push([queryType, identifier]);
    return NASA_PHOTOS;
  });
  const controller = createStudentModeController({ container, eventTarget, now: () => new Date(2026, 10, 15), ...extra, getSpaceData });
  const panel = () => findByClass(container, "student-mode-panel");
  const isOpen = () => panel()?.classList.contains("student-mode-panel-open") ?? false;
  const clickButton = (text) => {
    const button = findAllByClass(container, "student-mode-panel-btn").find((b) => b.textContent === text);
    assert.ok(button, `buton yok: ${text}`);
    button.dispatch("click");
  };
  const message = () => findByClass(container, "student-mode-panel-message").textContent;
  const emit = (name, detail) => eventTarget.dispatchEvent(new CustomEvent(name, { detail }));
  const questionTexts = () => findAllByClass(container, "homework-questions-btn").map((b) => b.textContent);
  return { doc, container, eventTarget, events, controller, panel, isOpen, clickButton, message, emit, photoQueries, questionTexts };
}

describe("studentModeController", () => {
  let warnCalls;
  let originalWarn;

  beforeEach(() => {
    warnCalls = [];
    originalWarn = console.warn;
    console.warn = (...args) => warnCalls.push(args);
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it("aynı sahne öğesi iki kez eklendiğinde sepette tekil kalır ve ag:homework-added bir kez yayınlanır", async () => {
    const t = setup();
    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "COMPLETE" });
    t.controller.handleAction("ADD_TO_HOMEWORK", {});
    t.controller.handleAction("ADD_TO_HOMEWORK", {});
    t.controller.handleAction("ADD_TO_HOMEWORK", { id: "apollo-leo", title: "Apollo 11 LEO" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { id: "apollo-leo", title: "Apollo 11 LEO" });
    await t.controller.waitForPhotos();

    const items = t.controller.getState().items;
    assert.deepEqual(items.map((i) => i.id), ["LIGHT_DELAY|EARTH|MARS|one-way", "apollo-leo"]);
    assert.equal(t.events.filter((e) => e.name === "ag:homework-added").length, 2);
    assert.equal(t.message(), "Bu konu zaten Ödev Sepetinde.");
    assert.equal(findAllByClass(t.container, "homework-basket-card").length, 2);
  });

  it("'Ay yerçekimini ödevime ekle' tek cisim kartı üretir, fotoğrafı NASA'dan çekip kartın içinde gösterir", async () => {
    const t = setup();
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Ay yerçekimini ödevime ekle" });
    const [item] = t.controller.getState().items;
    assert.equal(item.id, "GRAVITY|MOON");
    assert.equal(item.title, "Ay Yüzey Yerçekimi");
    assert.ok(item.facts.some((f) => f.label === "Yüzey yerçekimi (m/s²)" && f.value === "1.62"));
    assert.ok(!item.facts.some((f) => /oran|ratio/i.test(f.label)), "kendisiyle kıyas yok");
    assert.equal(findByClass(t.container, "homework-basket-photo").classList.contains("homework-basket-photo-loading"), true);

    await t.controller.waitForPhotos();
    assert.deepEqual(t.photoQueries, [["nasa_images", "Moon surface"]]);
    const img = findByClass(t.container, "homework-basket-photo-img");
    assert.equal(img.getAttribute("src"), NASA_PHOTOS[0].image_url, "fotoğraf sağ paneldeki kartın içinde");
    assert.equal(findByClass(t.container, "homework-basket-photo-caption").textContent, "Ay yüzeyi · NASA Görsel Arşivi");

    findByClass(t.container, "homework-basket-photo-next").dispatch("click");
    await t.controller.waitForPhotos();
    assert.equal(img.getAttribute("src"), NASA_PHOTOS[1].image_url, "Başka NASA Fotoğrafı sıradaki adaya geçer");
  });

  it("NASA sonuç vermezse konu görseline, o da yoksa çevrimdışı görsele düşer; internet hatası çökertmez", async () => {
    const topicCalls = [];
    const t = setup({
      getSpaceData: () => async () => { throw new Error("offline"); },
      getTopicImage: async (query, title) => { topicCalls.push(query); return query === "Mars surface" ? { image_url: "https://upload.wikimedia.org/mars.jpg", image_source: "Wikipedia (en)" } : null; }
    });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Mars yerçekimini ödevime ekle" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Plüton ödevime ekle" });
    await t.controller.waitForPhotos();
    const [mars, pluto] = t.controller.getState().items;
    assert.equal(mars.photo.image_url, "https://upload.wikimedia.org/mars.jpg");
    assert.equal(pluto.photo.is_fallback, true);
    assert.match(pluto.photo.image_url, /^data:image\/svg\+xml/);
    assert.deepEqual(topicCalls, ["Mars surface", "Pluto New Horizons"]);
  });

  it("öğrencinin görsel eklemesi karta ve PDF'e basılır; resim olmayan dosya reddedilir", async () => {
    const t = setup({ readFileAsDataUrl: async () => "data:image/png;base64,QUJD" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Mars ödevime ekle" });
    await t.controller.waitForPhotos();
    const fileInput = findByClass(t.container, "homework-basket-file-input");
    fileInput.files = [{ type: "text/plain", size: 10, name: "not.txt" }];
    fileInput.dispatch("change");
    assert.match(t.message(), /resim dosyası/);
    fileInput.files = [{ type: "image/png", size: 2048, name: "cizimim.png" }];
    fileInput.dispatch("change");
    await t.controller.waitForPhotos();
    const photo = t.controller.getState().items[0].photo;
    assert.equal(photo.image_url, "data:image/png;base64,QUJD");
    assert.equal(photo.image_source, "Öğrencinin eklediği görsel");
  });

  it("textarea düzenlemesi anında kaydedilir, aynı konu tekrar eklenince tekil kalır ve metin korunur", async () => {
    const t = setup();
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Ay yerçekimini ödevime ekle" });
    const textArea = findByClass(t.container, "homework-basket-text");
    assert.match(textArea.value, /Ay yüzeyinde serbest düşme ivmesi 1\.62/, "metin kutusu açıklamayla dolu başlar");
    textArea.value = "Ay'da 10 metreden düşen taş 3.51 saniyede yere iner. Benim notum!";
    textArea.dispatch("input");
    assert.equal(t.controller.getState().items[0].text, textArea.value);

    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "ay yerçekimi ödevime ekle" });
    await t.controller.waitForPhotos();
    const items = t.controller.getState().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].text, "Ay'da 10 metreden düşen taş 3.51 saniyede yere iner. Benim notum!");
    assert.equal(findByClass(t.container, "homework-basket-text").value, items[0].text, "yeniden çizimde düzenlenmiş metin görünür");
  });

  it("konu yoksa bakılan hedefi ekler, hiçbir bağlam yoksa panelde uyarı gösterir", async () => {
    const t = setup();
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "bunu ödevime ekle" });
    assert.equal(t.controller.getState().items.length, 0);
    assert.match(t.message(), /Hangi konuyu ekleyeceğimi anlayamadım/);

    t.emit("ag:focus-target", { target: "JUPITER" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "bunu ödevime ekle" });
    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "OUTBOUND" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "bunu ödevime ekle" });
    await t.controller.waitForPhotos();
    assert.deepEqual(t.controller.getState().items.map((i) => i.id), ["BODY|JUPITER", "LIGHT_DELAY|EARTH|MARS|one-way"]);
  });

  it("sahne olayı sağ panelde 'Ödev Sepetine eklemek ister misin?' sorusunu açar, Evet ile eklenir", async () => {
    const t = setup();
    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "OUTBOUND" });
    assert.equal(t.isOpen(), false, "sonuç belli olmadan soru sorulmaz");

    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "COMPLETE" });
    assert.equal(t.isOpen(), true);
    assert.equal(t.controller.getState().current_view, "STUDENT_MODE", "ilk etkileşimde önce öğrenci modu sorulur");
    const [nameInput, titleInput] = findAllByClass(t.container, "student-mode-field-input");
    nameInput.value = "Ada";
    titleInput.value = "Gezegenler Ödevi";
    t.clickButton("Evet, Aç");

    assert.equal(t.controller.getState().student_name, "Ada");
    assert.equal(t.controller.getState().current_view, "HOMEWORK_PROMPT");
    assert.equal(findByClass(t.container, "student-mode-question").textContent, "Bu konuyu (Işık Gecikmesi) Ödev Sepetine eklemek ister misin?");
    t.clickButton("Evet, Ekle");
    await t.controller.waitForPhotos();
    assert.equal(t.controller.getState().items.length, 1);
    assert.equal(t.controller.getState().current_view, "HOMEWORK_BASKET");

    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "COMPLETE" });
    assert.equal(t.controller.getState().current_view, "HOMEWORK_BASKET", "sepetteki konu tekrar sorulmaz");
  });

  it("örnek sorular bakılan yere göre değişir ve tıklanınca sohbet akışını tetikler", () => {
    const asked = [];
    const t = setup({ onAskQuestion: (q) => asked.push(q) });
    t.emit("ag:focus-target", { target: "MARS" });
    assert.deepEqual(t.questionTexts(), [], "panel kapalıyken soru gösterilmez");

    t.controller.handleAction("SIMPLIFY_TEXT", { is_student_mode: true });
    t.controller.handleAction("SHOW_HOMEWORK_BASKET");
    assert.ok(t.questionTexts().includes("Mars'ta yerçekimi ne kadar?"));
    assert.ok(t.questionTexts().includes("Perseverance şu an nerede?"));

    t.emit("ag:focus-target", { target: "MOON" });
    assert.ok(t.questionTexts().includes("Dünya'dan Ay'a ışık kaç saniyede gider?"));
    assert.ok(t.questionTexts().includes("Apollo 11 nereye indi?"));
    assert.ok(!t.questionTexts().includes("Mars'ta yerçekimi ne kadar?"));

    findAllByClass(t.container, "homework-questions-btn")[1].dispatch("click");
    assert.deepEqual(asked, ["Apollo 11 nereye indi?"]);
  });

  it("Geç butonu paneli kapatır ve öğe eklemez", () => {
    const t = setup();
    t.controller.handleAction("OPEN_SIDE_PANEL", { panel_view: "STUDENT_MODE" });
    t.clickButton("Hayır, Normal Kalsın");
    t.emit("ag:planet-comparison-status", { primary_object: "EARTH", secondary_object: "MARS", gravity_ratio: 2.64 });
    assert.equal(t.controller.getState().current_view, "HOMEWORK_PROMPT");
    t.clickButton("Geç");
    assert.equal(t.isOpen(), false);
    assert.equal(t.controller.getState().items.length, 0);
  });

  it("OPEN_SIDE_PANEL sağ paneli açar, CLOSE_PANEL ve kapat butonu kapatır", () => {
    const t = setup();
    assert.equal(t.isOpen(), false);
    assert.equal(t.controller.handleAction("OPEN_SIDE_PANEL", { panel_view: "HOMEWORK_BASKET" }), true);
    assert.equal(t.isOpen(), true);
    assert.equal(t.panel().getAttribute("aria-hidden"), "false");
    assert.equal(findByClass(t.container, "homework-basket-empty").textContent.startsWith("Ödev Sepetin şimdilik boş"), true);

    assert.equal(t.controller.handleAction("CLOSE_PANEL"), true);
    assert.equal(t.isOpen(), false);
    assert.equal(t.panel().getAttribute("aria-hidden"), "true");

    t.controller.handleAction("SHOW_HOMEWORK_BASKET");
    assert.equal(t.isOpen(), true);
    findByClass(t.container, "student-mode-panel-close").dispatch("click");
    assert.equal(t.isOpen(), false);

    assert.equal(t.controller.handleAction("OPEN_SIDE_PANEL", { title: "EONET" }), false, "panel_view yoksa sol panel işi");
    assert.equal(t.isOpen(), false);
  });

  it("SIMPLIFY_TEXT / is_student_mode geçişi ag:student-mode-changed yayınlar ve metni sadeleştirir", () => {
    const changes = [];
    const t = setup({ onStudentModeChange: (flag, source) => changes.push([flag, source]) });
    t.controller.handleAction("OPEN_SIDE_PANEL", { panel_view: "STUDENT_MODE" });
    t.clickButton("Hayır, Normal Kalsın");
    t.emit("ag:spacecraft-ready", { id: "PERSEVERANCE" });
    const promptText = () => findByClass(t.container, "homework-basket-card-text").textContent;
    assert.match(promptText(), /keşif araçları/);

    t.controller.handleAction("SIMPLIFY_TEXT", { is_student_mode: true });
    assert.equal(t.controller.getState().is_student_mode, true);
    assert.match(promptText(), /robotlar/);
    t.clickButton("Evet, Ekle");
    assert.match(t.controller.getState().items[0].text, /robotlar/, "öğrenci modunda metin kutusu sade metinle başlar");

    t.controller.handleAction("SIMPLIFY_TEXT", { is_student_mode: true });
    t.controller.setStudentMode(true, "router");
    t.controller.handleAction("SIMPLIFY_TEXT");
    assert.equal(t.controller.getState().is_student_mode, false, "boolean yoksa tersine çevirir");

    const modeEvents = t.events.filter((e) => e.name === "ag:student-mode-changed").map((e) => e.detail);
    assert.deepEqual(modeEvents, [{ is_student_mode: true }, { is_student_mode: false }]);
    assert.deepEqual(changes, [[true, "router"], [false, "router"]]);
  });

  it("EXPORT_PDF sahte html2pdf ile öğrenci adı, tarih, düzenlenmiş metin ve fotoğrafla raporu üretir", async () => {
    let received = null;
    const fakeHtml2Pdf = () => ({
      set(cfg) { received = { cfg }; return this; },
      from(el) { received.el = el; return this; },
      async save() { received.saved = true; }
    });
    const t = setup({ html2pdf: fakeHtml2Pdf });
    t.controller.handleAction("OPEN_SIDE_PANEL", { panel_view: "STUDENT_MODE" });
    const [nameInput, titleInput] = findAllByClass(t.container, "student-mode-field-input");
    nameInput.value = "Ada";
    titleInput.value = "Gezegenler Ödevi";
    t.clickButton("Evet, Aç");
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Dünya'dan Mars'a ışık gecikmesini ödevime ekle" });
    await t.controller.waitForPhotos();
    const textArea = findByClass(t.container, "homework-basket-text");
    textArea.value = "Neden gecikme olur?\nÇünkü ışığın bile hızı sınırlı.";
    textArea.dispatch("input");

    const result = await t.controller.exportPdf();
    assert.deepEqual(result, { exported: true, filename: "gezegenler-odevi-15-11-2026.pdf" });
    assert.equal(received.saved, true);
    assert.equal(received.cfg.html2canvas.backgroundColor, "#ffffff");
    assert.equal(received.cfg.html2canvas.useCORS, true);
    assert.equal(findByClass(received.el, "homework-report-kicker").textContent, "Küçük Kaşif Ödev Raporu");
    assert.equal(findByClass(received.el, "homework-report-meta").textContent, "Öğrenci: Ada · Tarih: 15.11.2026");
    assert.equal(findByClass(received.el, "homework-report-item-title").textContent, "1. Dünya → Mars Işık Gecikmesi");
    assert.equal(findByClass(received.el, "homework-report-text").textContent, "Neden gecikme olur?\nÇünkü ışığın bile hızı sınırlı.");
    const reportImg = findByClass(received.el, "homework-report-photo-img");
    assert.equal(reportImg.getAttribute("src"), NASA_PHOTOS[0].image_url);
    assert.equal(reportImg.getAttribute("crossorigin"), "anonymous");
    assert.equal(t.message(), "PDF indirildi.");
    assert.equal(warnCalls.length, 0);
  });

  it("html2pdf yokken veya sepet boşken çökmez, panelde uyarı gösterir", async () => {
    const t = setup({ pdfEnv: {} });
    const originalHtml2Pdf = globalThis.html2pdf;
    delete globalThis.html2pdf;
    try {
      const empty = await t.controller.exportPdf();
      assert.deepEqual(empty, { exported: false, reason: "EMPTY_BASKET" });
      assert.equal(t.isOpen(), true);
      assert.equal(t.message(), "PDF oluşturmak için önce Ödev Sepetine en az bir konu ekle.");

      t.controller.handleAction("ADD_TO_HOMEWORK", { id: "apollo-leo", title: "Apollo 11 LEO" });
      await t.controller.waitForPhotos();
      const missing = await t.controller.exportPdf();
      assert.deepEqual(missing, { exported: false, reason: "MISSING_LIBRARY" });
      assert.match(t.message(), /PDF aracı yüklenemedi/);
      assert.ok(warnCalls.length >= 2, "console.warn yazılır");

      assert.doesNotThrow(() => t.controller.handleAction("EXPORT_PDF"));
    } finally {
      if (originalHtml2Pdf !== undefined) globalThis.html2pdf = originalHtml2Pdf;
    }
  });

  it("silme butonu öğeyi sepetten kaldırır", async () => {
    const counts = [];
    const t = setup({ onBasketChange: (count) => counts.push(count) });
    t.controller.handleAction("ADD_TO_HOMEWORK", { id: "a", title: "A" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { id: "b", title: "B" });
    await t.controller.waitForPhotos();
    findAllByClass(t.container, "homework-basket-remove")[0].dispatch("click");
    assert.deepEqual(t.controller.getState().items.map((i) => i.id), ["b"]);
    assert.deepEqual(counts, [1, 2, 1]);
  });

  it("destroy() tüm dinleyicileri ve DOM'u temizler, geç gelen fotoğraf yanıtı yok sayılır", async () => {
    let resolvePhoto;
    const t = setup({ getSpaceData: () => () => new Promise((resolve) => { resolvePhoto = resolve; }) });
    const baseline = t.eventTarget.getActiveCount();
    t.controller.handleAction("SIMPLIFY_TEXT", { is_student_mode: true });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "Mars ödevime ekle" });
    assert.ok(t.doc.listenerTotal > 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof resolvePhoto, "function", "NASA fotoğraf isteği yolda");

    t.controller.destroy();
    assert.equal(t.eventTarget.getActiveCount(), baseline - 7, "sadece testin kendi 2 dinleyicisi kalır");
    for (const name of ["ag:light-delay-status", "ag:planet-comparison-status", "ag:eonet-status", "ag:apollo-status", "ag:spacecraft-ready", "ag:focus-target", "ag:earth-events"]) {
      assert.equal(t.eventTarget.getActiveCount(name), 0, name);
    }
    assert.equal(t.doc.listenerTotal, 0, "kart, metin kutusu ve soru butonu dinleyicileri kaldırıldı");
    assert.equal(t.container.children.length, 0, "panel container'dan kaldırıldı");

    resolvePhoto(NASA_PHOTOS);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.container.children.length, 0, "destroy sonrası fotoğraf yanıtı DOM'a dokunmaz");
    t.emit("ag:light-delay-status", { ...LIGHT_DELAY_DETAIL, phase: "COMPLETE" });
    assert.equal(t.container.children.length, 0, "destroy sonrası olay paneli yeniden açmaz");
  });

  it("Gemini cevabı soruyla gelen fotoğrafla eklenir; NASA araması yapılmaz; 'bunu ödevime ekle' son cevabı ekler", async () => {
    const t = setup();
    const route = {
      speech_text: "Hubble yaklaşık 535 kilometre yükseklikte döner.",
      parameters: { title: "Hubble Uzay Teleskobu Yörüngesi", description: "Hubble alçak Dünya yörüngesindedir.", image_url: "https://upload.wikimedia.org/hubble.jpg", image_source: "Wikipedia (en)", image_query: "Hubble Space Telescope" }
    };
    t.controller.beginAnswer("Hubble nerede?");
    assert.match(t.message(), /Gemini'ye soruluyor/);
    const result = t.controller.addAnswer("Hubble nerede?", route);
    await t.controller.waitForPhotos();
    assert.equal(result.added, true);
    assert.deepEqual(t.photoQueries, [], "cevapla gelen fotoğraf varken ayrıca arama yapılmaz");
    assert.equal(findByClass(t.container, "homework-basket-photo-img").getAttribute("src"), "https://upload.wikimedia.org/hubble.jpg");
    assert.equal(findByClass(t.container, "homework-basket-card-title").textContent, "Hubble Uzay Teleskobu Yörüngesi");

    t.controller.recordAnswer("Jüpiter'in kaç uydusu var?", { speech_text: "95.", parameters: { title: "Jüpiter'in Uyduları", description: "Jüpiter'in 95 onaylı uydusu var." } });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "bunu ödevime ekle" });
    await t.controller.waitForPhotos();
    assert.deepEqual(t.controller.getState().items.map((i) => i.title), ["Hubble Uzay Teleskobu Yörüngesi", "Jüpiter'in Uyduları"]);

    t.emit("ag:focus-target", { target: "SATURN" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "bunu ödevime ekle" });
    assert.equal(t.controller.getState().items.at(-1).id, "BODY|SATURN", "cevaptan sonra başka yere bakıldıysa bakılan yer eklenir");
    assert.equal(t.controller.addAnswer("boş", { speech_text: "yerel yedek", parameters: {} }), null);
  });

  it("ikinci 'ödevime ekle' de çalışır: her yeni sorunun cevabı ayrı kart olur, aynı cevap tekrar eklenmez", async () => {
    const t = setup();
    const answer = (title) => ({ speech_text: `${title} cevabı.`, parameters: { title, description: `${title} açıklaması.`, data_source: "GEMINI" } });
    t.controller.recordAnswer("Hubble nerede?", answer("Hubble"));
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "ödevime ekle" });
    t.controller.recordAnswer("Apollo 11 nereye indi?", answer("Apollo 11"));
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "ödevime ekle" });
    t.controller.handleAction("ADD_TO_HOMEWORK", { query: "ödevime ekle" });
    await t.controller.waitForPhotos();
    assert.deepEqual(t.controller.getState().items.map((i) => i.title), ["Hubble", "Apollo 11"]);
  });

  it("Gemini'nin kendi ADD_TO_HOMEWORK rotası açıklama ve fotoğrafıyla karta yazılır", async () => {
    const t = setup();
    t.controller.handleAction("ADD_TO_HOMEWORK", {
      query: "ödevime apollo 11 in çektiği siyah beyaz fotoğraflardan ekle",
      title: "Apollo 11 Ay Yüzeyi",
      description: "Apollo 11 astronotları Ay yüzeyinde Hasselblad kamerayla fotoğraf çekti.",
      facts: [{ label: "Kamera", value: "Hasselblad" }],
      image_url: "https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~small.jpg",
      data_source: "NASA_API"
    });
    await t.controller.waitForPhotos();
    const [item] = t.controller.getState().items;
    assert.equal(item.title, "Apollo 11 Ay Yüzeyi");
    assert.match(item.text, /Hasselblad kamerayla/);
    assert.equal(item.facts[0].value, "apollo 11 in çektiği siyah beyaz fotoğraflardan");
    assert.equal(item.photo.image_url, "https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~small.jpg");
    assert.deepEqual(t.photoQueries, []);
  });

  it("container yoksa çökmez", () => {
    const controller = createStudentModeController({ container: null, eventTarget: new CountingEventTarget() });
    assert.equal(controller.handleAction("SHOW_HOMEWORK_BASKET"), true);
    assert.equal(controller.handleAction("BILINMEYEN"), false);
    assert.equal(controller.isPanelOpen(), false);
    controller.destroy();
  });
});
