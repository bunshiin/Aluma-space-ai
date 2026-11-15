// Sağ kenardan açılan Küçük Kaşif paneli: öğrenci modu sorusu, "ödeve ekle" sorusu, ödev sepeti listesi
// ve bakılan yere göre örnek sorular. Sadece verilen container içinde çalışır; metinler getText ile states.json'dan gelir.

import { createHomeworkBasketCard } from "./homeworkBasketCard.js";

const OPEN_CLASS = "student-mode-panel-open";

function createElement(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

/**
 * Paneli container içinde kurar. getText(key, vars) metin verir, callbacks kullanıcı seçimlerini iletir.
 */
export function createStudentPanel(container, getText, callbacks = {}) {
  const doc = container?.ownerDocument;
  if (!doc || typeof doc.createElement !== "function") {
    const noop = () => {};
    return { open: noop, close: noop, isOpen: () => false, showStudentModePrompt: noop, showAddPrompt: noop, showBasket: noop, showMessage: noop, showQuestions: noop, updateItemPhoto: noop, destroy: noop };
  }

  const panelCleanups = [];
  let viewCleanups = [];
  let questionCleanups = [];
  let isPanelOpen = false;
  const cardsById = new Map();

  function listen(el, type, handler, bucket) {
    el.addEventListener(type, handler);
    bucket.push(() => el.removeEventListener(type, handler));
  }

  function createButton(label, className, handler) {
    const button = createElement(doc, "button", `student-mode-panel-btn ${className}`.trim(), label);
    button.setAttribute("type", "button");
    listen(button, "click", handler, viewCleanups);
    return button;
  }

  function createField(labelText, value, placeholder, onInput) {
    const label = createElement(doc, "label", "student-mode-field");
    const caption = createElement(doc, "span", "student-mode-field-label", labelText);
    const input = createElement(doc, "input", "student-mode-field-input");
    input.setAttribute("type", "text");
    input.setAttribute("maxlength", "80");
    input.setAttribute("placeholder", placeholder);
    input.value = value || "";
    if (onInput) listen(input, "input", () => onInput(input.value), viewCleanups);
    label.append(caption, input);
    return { label, input };
  }

  const panel = createElement(doc, "aside", "student-mode-panel");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("aria-label", getText("panel_title"));
  const header = createElement(doc, "div", "student-mode-panel-header");
  const title = createElement(doc, "h2", "student-mode-panel-title", getText("panel_title"));
  const closeButton = createElement(doc, "button", "student-mode-panel-btn student-mode-panel-close", getText("close_button"));
  closeButton.setAttribute("type", "button");
  listen(closeButton, "click", () => callbacks.onClose?.(), panelCleanups);
  header.append(title, closeButton);
  const body = createElement(doc, "div", "student-mode-panel-body");
  const message = createElement(doc, "p", "student-mode-panel-message");
  message.setAttribute("aria-live", "polite");
  // Örnek sorular görünümden bağımsızdır: bağlam değişince sadece bu bölüm yenilenir, kartlardaki yazı kaybolmaz
  const questions = createElement(doc, "section", "homework-questions");
  questions.setAttribute("aria-label", getText("questions_title"));
  panel.append(header, body, questions, message);
  container.appendChild(panel);

  function resetView() {
    viewCleanups.forEach((cleanup) => cleanup());
    viewCleanups = [];
    cardsById.clear();
    body.replaceChildren();
    message.textContent = "";
    message.className = "student-mode-panel-message";
  }

  function open() {
    isPanelOpen = true;
    panel.classList.add(OPEN_CLASS);
    panel.setAttribute("aria-hidden", "false");
  }

  function close() {
    isPanelOpen = false;
    panel.classList.remove(OPEN_CLASS);
    panel.setAttribute("aria-hidden", "true");
  }

  function showStudentModePrompt(profile = {}) {
    resetView();
    const question = createElement(doc, "p", "student-mode-question", getText("student_mode_question"));
    const nameField = createField(getText("student_name_label"), profile.student_name, getText("student_name_placeholder"));
    const titleField = createField(getText("homework_title_label"), profile.homework_title, getText("homework_title_placeholder"));
    const actions = createElement(doc, "div", "student-mode-panel-actions");
    const submit = (is_student_mode) => callbacks.onStudentModeChoice?.({
      is_student_mode, student_name: nameField.input.value, homework_title: titleField.input.value
    });
    actions.append(
      createButton(getText("student_mode_on"), "student-mode-panel-btn-primary", () => submit(true)),
      createButton(getText("student_mode_off"), "", () => submit(false))
    );
    body.append(question, nameField.label, titleField.label, actions);
    open();
  }

  function showAddPrompt(item, description) {
    resetView();
    const question = createElement(doc, "p", "student-mode-question", getText("add_question", { topic: item.title }));
    const card = createElement(doc, "div", "homework-basket-card");
    card.append(createElement(doc, "h3", "homework-basket-card-title", item.title));
    if (description) card.append(createElement(doc, "p", "homework-basket-card-text", description));
    const actions = createElement(doc, "div", "student-mode-panel-actions");
    actions.append(
      createButton(getText("add_confirm"), "student-mode-panel-btn-primary", () => callbacks.onAddConfirm?.(item)),
      createButton(getText("add_skip"), "", () => callbacks.onAddSkip?.(item))
    );
    body.append(question, card, actions);
    open();
  }

  function showBasket(items) {
    resetView();
    body.append(createElement(doc, "h3", "homework-basket-heading", getText("basket_title")));
    if (items.length === 0) {
      body.append(createElement(doc, "p", "homework-basket-empty", getText("basket_empty")));
    } else {
      const list = createElement(doc, "ul", "homework-basket-list");
      const listenView = (el, type, handler) => listen(el, type, handler, viewCleanups);
      for (const item of items) {
        const card = createHomeworkBasketCard({ doc, item, getText, listen: listenView, callbacks });
        cardsById.set(item.id, card);
        list.append(card.element);
      }
      body.append(list);
    }
    const actions = createElement(doc, "div", "student-mode-panel-actions");
    actions.append(createButton(getText("export_button"), "student-mode-panel-btn-primary homework-basket-export", () => callbacks.onExport?.()));
    body.append(actions);
    open();
  }

  /**
   * Kartın fotoğrafını görünümü yeniden çizmeden günceller (öğrencinin yazdığı metin korunur).
   */
  function updateItemPhoto(id, photo) {
    cardsById.get(id)?.setPhoto(photo);
  }

  /**
   * Örnek soruları gösterir; boş liste bölümü gizler. Tıklanan soru onAskQuestion ile sohbete gider.
   */
  function showQuestions(list) {
    questionCleanups.forEach((cleanup) => cleanup());
    questionCleanups = [];
    questions.replaceChildren();
    if (!Array.isArray(list) || list.length === 0) return;
    questions.append(createElement(doc, "h3", "homework-questions-title", getText("questions_title")));
    const listEl = createElement(doc, "ul", "homework-questions-list");
    for (const question of list) {
      const entry = createElement(doc, "li", "homework-questions-item");
      const button = createElement(doc, "button", "homework-questions-btn", question);
      button.setAttribute("type", "button");
      listen(button, "click", () => callbacks.onAskQuestion?.(question), questionCleanups);
      entry.append(button);
      listEl.append(entry);
    }
    questions.append(listEl);
  }

  function showMessage(text, tone = "info") {
    message.textContent = text || "";
    message.className = `student-mode-panel-message student-mode-panel-message-${tone}`;
  }

  return {
    open,
    close,
    isOpen: () => isPanelOpen,
    showStudentModePrompt,
    showAddPrompt,
    showBasket,
    showMessage,
    showQuestions,
    updateItemPhoto,
    destroy() {
      resetView();
      showQuestions([]);
      panelCleanups.forEach((cleanup) => cleanup());
      panelCleanups.length = 0;
      panel.remove();
      isPanelOpen = false;
    }
  };
}
