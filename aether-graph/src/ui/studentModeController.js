// Öğrenci Modu + Ödev Sepeti + PDF akışını yönetir: sağ paneli, MissionStateMachine'i, sahne olay yakalayıcısını,
// fotoğraf yükleyicisini ve bağlama göre örnek soruları birleştirir.

import { MissionStateMachine } from "../logic/stateMachine.js";
import { createExampleQuestions } from "./exampleQuestions.js";
import { isAcceptedImageFile, readImageFileAsDataUrl } from "./homeworkBasketCard.js";
import { createHomeworkEventCapture } from "./homeworkEventCapture.js";
import { createHomeworkPhotoLoader } from "./homeworkPhotoLoader.js";
import { createAnswerHomeworkItem, hasUsableAnswer } from "./homeworkAnswer.js";
import { exportHomeworkReport, getPdfResultTextKey } from "./homeworkReport.js";
import { createTopicHomeworkItem, resolveHomeworkTopic } from "./homeworkTopic.js";
import { removeHomeworkIntent, stripHomeworkIntent } from "./routeFallbackParser.js";
import { createStudentPanel } from "./studentPanel.js";

export const STUDENT_MODE_CHANGED_EVENT = "ag:student-mode-changed";
export const HOMEWORK_ADDED_EVENT = "ag:homework-added";
export const STUDENT_PANEL_VIEWS = Object.freeze(["STUDENT_MODE", "HOMEWORK_PROMPT", "HOMEWORK_BASKET"]);

function dispatchAgEvent(eventTarget, eventName, detail) {
  if (typeof eventTarget?.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  eventTarget.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Denetleyiciyi container içinde kurar. Seçenekler: eventTarget, statesData, html2pdf, pdfEnv, now,
 * getSpaceData (sözleşme fonksiyonunu döndüren fonksiyon), getTopicImage(query, title), readFileAsDataUrl, onAskQuestion(text),
 * onStudentModeChange(is_student_mode, source), onBasketChange(count).
 */
export function createStudentModeController(options = {}) {
  const eventTarget = options.eventTarget ?? globalThis;
  const machine = new MissionStateMachine(options.statesData);
  const getText = (key, vars) => machine.getUiText(key, vars);
  const readFileAsDataUrl = options.readFileAsDataUrl || readImageFileAsDataUrl;
  const profile = { student_name: "", homework_title: "" };
  const pendingPhotos = new Set();
  let hasAskedStudentMode = false;
  let currentView = null;
  let pendingAddItem = null;
  let isDestroyed = false;
  // "ödevime ekle" tek başına söylenirse son sorulan sorunun cevabı eklenir (henüz sepette değilse)
  let lastAnswer = null;

  const describe = (item) => (machine.isStudentMode()
    ? item.student_description || item.description
    : item.description || item.student_description);
  const findItem = (id) => machine.getHomeworkItems().find((item) => item.id === id) || null;

  const photoLoader = createHomeworkPhotoLoader({
    getSpaceData: options.getSpaceData,
    getTopicImage: options.getTopicImage,
    fallbackSource: getText("photo_fallback_source")
  });
  const panel = createStudentPanel(options.container, getText, {
    onClose: () => close(),
    onStudentModeChoice: (choice) => handleStudentModeChoice(choice),
    onAddConfirm: (item) => addItem(item, { show_basket: true }),
    onAddSkip: () => close(),
    onRemove: (id) => {
      if (machine.removeFromHomework(id)) {
        photoLoader.forget(id);
        options.onBasketChange?.(machine.getHomeworkItems().length);
      }
      showBasket();
    },
    onTextChange: (id, text) => machine.updateHomeworkText(id, text),
    onNextPhoto: (id) => trackPhoto(id, (item) => photoLoader.getNextPhoto(item)),
    onPhotoFile: (id, file) => handlePhotoFile(id, file),
    onAskQuestion: (question) => options.onAskQuestion?.(question),
    onExport: () => exportPdf()
  });

  const capture = createHomeworkEventCapture({
    eventTarget,
    machine,
    onCapture: (item, { should_prompt }) => { if (should_prompt) showAddPrompt(item); },
    onContextChange: () => refreshQuestions()
  });

  function refreshQuestions() {
    const isVisible = panel.isOpen() && (machine.isStudentMode() || machine.getHomeworkItems().length > 0);
    panel.showQuestions(isVisible ? createExampleQuestions(capture.getContext(), machine) : []);
  }

  function close() {
    currentView = null;
    panel.close();
  }

  function showView(name, render) {
    currentView = name;
    render();
    refreshQuestions();
  }

  function showStudentModePrompt() {
    showView({ name: "STUDENT_MODE" }, () => panel.showStudentModePrompt({ ...profile, is_student_mode: machine.isStudentMode() }));
  }

  function showAddPrompt(item) {
    if (!hasAskedStudentMode) {
      // İlk etkileşimde önce öğrenci modu ve isim sorulur, ardından konu sorusuna dönülür
      pendingAddItem = item;
      showStudentModePrompt();
      return;
    }
    showView({ name: "HOMEWORK_PROMPT", item }, () => panel.showAddPrompt(item, describe(item)));
  }

  function showBasket() {
    showView({ name: "HOMEWORK_BASKET" }, () => panel.showBasket(machine.getHomeworkItems()));
  }

  // Öğrenci modunu değiştirir ve ag:student-mode-changed yayınlar. source: "panel" | "router".
  function setStudentMode(isStudentMode, source = "panel") {
    if (!machine.setStudentMode(isStudentMode === true)) return false;
    const is_student_mode = machine.isStudentMode();
    dispatchAgEvent(eventTarget, STUDENT_MODE_CHANGED_EVENT, { is_student_mode });
    options.onStudentModeChange?.(is_student_mode, source);
    // Sepet yeniden çizilmez: kartlardaki metin öğrencinindir, sadece soru kartı ve örnek sorular güncellenir
    if (panel.isOpen() && currentView?.name === "HOMEWORK_PROMPT") panel.showAddPrompt(currentView.item, describe(currentView.item));
    refreshQuestions();
    return true;
  }

  function handleStudentModeChoice(choice) {
    hasAskedStudentMode = true;
    profile.student_name = String(choice?.student_name || "").trim().slice(0, 80);
    profile.homework_title = String(choice?.homework_title || "").trim().slice(0, 80);
    setStudentMode(choice?.is_student_mode === true, "panel");
    if (pendingAddItem) {
      const item = pendingAddItem;
      pendingAddItem = null;
      showAddPrompt(item);
      return;
    }
    showBasket();
    panel.showMessage(getText(machine.isStudentMode() ? "student_mode_active" : "student_mode_inactive"));
  }

  // Fotoğraf yanıtı geç gelebilir: kart silinmişse veya denetleyici kapanmışsa sonuç yok sayılır
  function trackPhoto(id, fetchPhoto) {
    const item = findItem(id);
    if (!item) return Promise.resolve(null);
    const task = fetchPhoto(item).then((photo) => {
      if (isDestroyed || !photo || !machine.setHomeworkPhoto(id, photo)) return null;
      panel.updateItemPhoto(id, findItem(id).photo);
      return photo;
    }).finally(() => pendingPhotos.delete(task));
    pendingPhotos.add(task);
    return task;
  }

  function handlePhotoFile(id, file) {
    if (isAcceptedImageFile(file)) return trackPhoto(id, () => photoLoader.loadUserPhoto(file, readFileAsDataUrl, getText("photo_user_source")));
    panel.showMessage(getText("photo_upload_invalid"), "warning");
    return Promise.resolve(null);
  }

  /**
   * Öğeyi sepete ekler; aynı id ikinci kez eklenmez. Eklenirse ag:homework-added yayınlar ve fotoğrafını arar.
   */
  function addItem(item, { show_basket = false } = {}) {
    const result = machine.addToHomework(item);
    if (result.added) {
      dispatchAgEvent(eventTarget, HOMEWORK_ADDED_EVENT, { item: result.item, count: machine.getHomeworkItems().length });
      options.onBasketChange?.(machine.getHomeworkItems().length);
    }
    if (show_basket) {
      showBasket();
      if (result.added) panel.showMessage(getText("added_message", { topic: result.item.title }), "success");
      else if (result.reason === "DUPLICATE") panel.showMessage(getText("duplicate_message"), "warning");
    }
    if (result.added && !result.item.photo) trackPhoto(result.item.id, (stored) => photoLoader.loadPhoto(stored));
    return result;
  }

  /**
   * ADD_TO_HOMEWORK: sahne değiştirmeden konuyu çözer, hesabı arka planda yapar ve kartı sağ panele ekler.
   * query varsa konu metinden çözülür; yoksa panel düğmesinden gelen id/başlık kullanılır.
   */
  function handleAddToHomework(parameters) {
    const query = typeof parameters.query === "string" ? parameters.query.trim() : "";
    const isBareRequest = query ? !stripHomeworkIntent(query) : !machine.createHomeworkItemFromParameters(parameters);
    if (isBareRequest && lastAnswer && !lastAnswer.is_added) return addAnswer(lastAnswer.question, lastAnswer.route);
    // Gemini ADD_TO_HOMEWORK rotası cevabın kendisini (açıklama, veriler, fotoğraf) taşıyorsa o yazılır
    const routeAnswer = { action_type: "ADD_TO_HOMEWORK", speech_text: "", parameters };
    if (query && !isBareRequest && hasUsableAnswer(routeAnswer)) return addAnswer(removeHomeworkIntent(query) || query, routeAnswer);
    const context = capture.getContext();
    const item = query
      ? createTopicHomeworkItem(resolveHomeworkTopic(query, context), machine)
      : machine.createHomeworkItemFromParameters(parameters) || createTopicHomeworkItem(resolveHomeworkTopic("", context), machine);
    if (!item) {
      console.warn("Ödeve eklenecek konu bulunamadı:", query);
      showBasket();
      panel.showMessage(getText("homework_need_topic"), "warning");
      return { added: false, reason: "INVALID_ITEM", item: null };
    }
    return addItem(item, { show_basket: true });
  }

  // Sepetteki öğelerden Küçük Kaşif Ödev Raporu PDF'i üretir; hata fırlatmaz, sorunu panelde gösterir.
  async function exportPdf() {
    const result = await exportHomeworkReport({
      doc: options.container?.ownerDocument, items: machine.getHomeworkItems(), profile, getText,
      date: options.now?.() ?? new Date(), html2pdf: options.html2pdf, pdfEnv: options.pdfEnv
    });
    if (!panel.isOpen() || currentView?.name !== "HOMEWORK_BASKET") showBasket();
    panel.showMessage(getText(getPdfResultTextKey(result)), result.exported ? "success" : "warning");
    return result;
  }

  // Gemini'nin bir soruya verdiği son cevabı hatırlar ("bunu ödevime ekle" bu cevabı ekler).
  function recordAnswer(question, route) {
    if (typeof question === "string" && question.trim() && hasUsableAnswer(route)) lastAnswer = { question: question.trim(), route, is_added: false };
  }

  // Soru Gemini'ye giderken paneli açıp bekleme mesajı gösterir.
  function beginAnswer(question) {
    showBasket();
    panel.showMessage(getText("answer_pending", { question }));
  }

  // Soru + Gemini cevabını (cevapla gelen fotoğrafla birlikte) karta ekler; cevap yoksa null döner.
  function addAnswer(question, route) {
    const item = createAnswerHomeworkItem(question, route, {
      isStudentMode: machine.isStudentMode(), getText, getImageQuery: (key) => machine.getImageQuery(key, "")
    });
    if (!item) return null;
    recordAnswer(question, route);
    if (lastAnswer) lastAnswer.is_added = true;
    return addItem(item, { show_basket: true });
  }

  /**
   * Router aksiyonlarını işler. İşlenen aksiyonda true, ilgisiz/bilinmeyen aksiyonda false döner.
   */
  function handleAction(actionType, parameters = {}) {
    const params = parameters && typeof parameters === "object" ? parameters : {};
    switch (actionType) {
      case "OPEN_SIDE_PANEL":
        if (params.panel_view === "STUDENT_MODE") showStudentModePrompt();
        else if (params.panel_view === "HOMEWORK_BASKET") showBasket();
        else if (params.panel_view === "HOMEWORK_PROMPT") {
          const item = machine.createHomeworkItemFromParameters(params) || capture.getLastItem();
          if (item) showAddPrompt(item);
          else showBasket();
        } else return false;
        return true;
      case "CLOSE_PANEL":
      case "RESET_VIEW":
        close();
        return true;
      case "SIMPLIFY_TEXT":
        setStudentMode(typeof params.is_student_mode === "boolean" ? params.is_student_mode : !machine.isStudentMode(), "router");
        return true;
      case "SHOW_HOMEWORK_BASKET":
        showBasket();
        return true;
      case "ADD_TO_HOMEWORK":
        handleAddToHomework(params);
        return true;
      case "EXPORT_PDF":
        exportPdf();
        return true;
      default:
        console.warn("Öğrenci paneli bu aksiyonu tanımıyor:", actionType);
        return false;
    }
  }

  return {
    handleAction,
    setStudentMode,
    addItem,
    addAnswer,
    beginAnswer,
    recordAnswer,
    showMessage: (textKey) => panel.showMessage(getText(textKey), "warning"),
    exportPdf,
    isPanelOpen: () => panel.isOpen(),
    waitForPhotos: () => Promise.all([...pendingPhotos]),
    getState: () => ({
      is_student_mode: machine.isStudentMode(),
      current_view: currentView?.name ?? null,
      items: machine.getHomeworkItems(),
      context: capture.getContext(),
      ...profile
    }),
    destroy() {
      isDestroyed = true;
      capture.destroy();
      photoLoader.destroy();
      panel.destroy();
      pendingPhotos.clear();
      currentView = null;
      pendingAddItem = null;
    }
  };
}
