import test from "node:test";
import assert from "node:assert/strict";

import {
  closeAllPanels,
  getSceneCardId,
  renderOverlayCard,
  renderPopup,
  renderSidePanel
} from "../src/ui/panelController.js";

function createClassList(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    add: (...items) => items.forEach((item) => classes.add(item)),
    remove: (...items) => items.forEach((item) => classes.delete(item)),
    toggle: (item, force) => {
      if (typeof force === "boolean") {
        if (force) classes.add(item);
        else classes.delete(item);
        return force;
      }
      if (classes.has(item)) {
        classes.delete(item);
        return false;
      }
      classes.add(item);
      return true;
    },
    contains: (item) => classes.has(item)
  };
}

function createMockElement(tagName, ownerDocument, initialClasses = []) {
  const attributes = new Map();
  const listeners = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    id: "",
    className: initialClasses.join(" "),
    type: "",
    textContent: "",
    ownerDocument,
    children: [],
    classList: createClassList(initialClasses),
    get firstChild() {
      return this.children[0] || null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    setAttribute(key, value) {
      attributes.set(key, String(value));
    },
    getAttribute(key) {
      return attributes.get(key) ?? null;
    },
    addEventListener(eventName, handler) {
      const list = listeners.get(eventName) || [];
      list.push(handler);
      listeners.set(eventName, list);
    },
    triggerClick() {
      const handlers = listeners.get("click") || [];
      handlers.forEach((fn) => fn({ target: this }));
    }
  };
  return el;
}

function createMockDocument() {
  const doc = {
    createElement(tagName) {
      return createMockElement(tagName, doc);
    }
  };
  return doc;
}

function findByClass(root, className) {
  const matches = [];
  function walk(node) {
    if (!node) return;
    const classes = String(node.className || "").split(/\s+/);
    if (classes.includes(className) || node.classList?.contains(className)) {
      matches.push(node);
    }
    for (const child of node.children || []) {
      walk(child);
    }
  }
  walk(root);
  return matches;
}

test("getSceneCardId sahne ve şablon adına göre kebab-case ID üretir", () => {
  assert.equal(getSceneCardId("NONE", { planet: "Mars" }), "mars-info-card");
  assert.equal(getSceneCardId("GRAVITY_SIM", { query: "mars bilgi kartı" }), "mars-info-card");
  assert.equal(getSceneCardId("LIGHT_DELAY", { source: "Earth", target: "Mars" }), "light-delay-panel");
  assert.equal(getSceneCardId("APOLLO_11", {}), "apollo-11-panel");
});

test("renderSidePanel başlık, açıklama ve tıklanabilir next_actions düğmelerini oluşturur", () => {
  const doc = createMockDocument();
  const sidePanelElements = {
    container: createMockElement("aside", doc, ["is-hidden"]),
    titleEl: createMockElement("h2", doc),
    bodyEl: createMockElement("div", doc),
    actionsEl: createMockElement("div", doc)
  };

  let clickedAction = null;
  renderSidePanel(
    sidePanelElements,
    {
      title: "LEO Yörüngesi",
      description: "Dünya yörüngesinde sistem kontrolleri tamamlanır.",
      next_actions: [
        { label: "TLI Ateşlemesi", target_state: "TLI" },
        { label: "Ödeve Ekle", action: "ADD_TO_HOMEWORK" }
      ]
    },
    (item) => {
      clickedAction = item;
    }
  );

  assert.equal(sidePanelElements.container.classList.contains("is-hidden"), false);
  assert.equal(sidePanelElements.container.getAttribute("aria-hidden"), "false");
  assert.equal(sidePanelElements.titleEl.textContent, "LEO Yörüngesi");
  assert.equal(findByClass(sidePanelElements.bodyEl, "ag-panel-description")[0].textContent, "Dünya yörüngesinde sistem kontrolleri tamamlanır.");
  assert.equal(sidePanelElements.actionsEl.children.length, 2);

  sidePanelElements.actionsEl.children[0].triggerClick();
  assert.deepEqual(clickedAction, { label: "TLI Ateşlemesi", target_state: "TLI" });
  assert.equal(sidePanelElements.actionsEl.classList.contains("is-hidden"), false);
  assert.equal(sidePanelElements.bodyEl.classList.contains("is-hidden"), false);

  renderSidePanel(sidePanelElements, { title: "görev paneli", step_id: "görev paneli" });
  assert.equal(sidePanelElements.actionsEl.classList.contains("is-hidden"), true);
  assert.equal(sidePanelElements.bodyEl.classList.contains("is-hidden"), true);
});

test("renderOverlayCard SHOW_FACT_CARD, SHOW_COMPARISON ve SHOW_TIMELINE kartlarını üretir", () => {
  const doc = createMockDocument();
  const container = createMockElement("div", doc, ["is-hidden"]);

  const factCard = renderOverlayCard(container, "SHOW_FACT_CARD", "LIGHT_DELAY", {
    title: "Dünya - Mars Sinyali",
    description: "Tek yön ışık gecikmesi.",
    light_delay: { delay_s: 750, round_trip_s: 1500, risk_level: "HIGH" }
  });

  assert.equal(container.classList.contains("is-hidden"), false);
  assert.equal(factCard.id, "light-delay-panel");
  assert.equal(findByClass(factCard, "ag-card-title")[0].textContent, "Dünya - Mars Sinyali");
  assert.equal(findByClass(factCard, "ag-comparison-row").length, 3);

  const compCard = renderOverlayCard(container, "SHOW_COMPARISON", "GRAVITY_SIM", {
    title: "Yerçekimi Karşılaştırması",
    rows: [
      { label: "Dünya", value: "9.81 m/s²" },
      { label: "Mars", value: "3.71 m/s²" }
    ]
  });

  assert.equal(container.children.length, 1);
  assert.equal(findByClass(compCard, "ag-comparison-grid").length, 1);
  assert.equal(findByClass(compCard, "ag-comparison-row").length, 2);

  const timelineCard = renderOverlayCard(container, "SHOW_TIMELINE", "APOLLO_11", {
    title: "Apollo 11 Akışı",
    steps: [
      { date: "1969-07-16", title: "Fırlatma", description: "Saturn V ateşlendi." },
      { date: "1969-07-20", title: "Ay İnişi", description: "Kartal modülü indi." }
    ]
  });

  assert.equal(timelineCard.id, "apollo-11-panel");
  assert.equal(findByClass(timelineCard, "ag-timeline-list").length, 1);
  assert.equal(findByClass(timelineCard, "ag-timeline-step").length, 2);
  assert.equal(findByClass(timelineCard, "ag-timeline-step-title")[1].textContent, "1969-07-20 · Ay İnişi");
});

test("renderPopup ve closeAllPanels görünürlüğü doğru yönetir", () => {
  const doc = createMockDocument();
  const popupElements = {
    container: createMockElement("div", doc, ["is-hidden"]),
    titleEl: createMockElement("h2", doc),
    contentEl: createMockElement("div", doc)
  };
  const extraPanel = createMockElement("div", doc);

  renderPopup(popupElements, { title: "Görev Özeti", description: "Veri akışı hazır." }, "NEO_SWARM");

  assert.equal(popupElements.container.classList.contains("is-hidden"), false);
  assert.equal(popupElements.titleEl.textContent, "Görev Özeti");
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-image").length, 1);
  assert.equal(findByClass(popupElements.contentEl, "ag-panel-description").length, 0);

  closeAllPanels({ popup: popupElements.container, extra: extraPanel });
  assert.equal(popupElements.container.classList.contains("is-hidden"), true);
  assert.equal(popupElements.container.getAttribute("aria-hidden"), "true");
  assert.equal(extraPanel.classList.contains("is-hidden"), true);
});
