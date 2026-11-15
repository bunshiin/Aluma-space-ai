import test from "node:test";
import assert from "node:assert/strict";

import { initApp } from "../src/app.js";
import { resetActionRouterState } from "../src/ui/actionRouter.js";
import { enrichRoutePayload } from "../src/ui/contractBridge.js";
import {
  createFallbackSpaceImageDataUri,
  renderPopup
} from "../src/ui/popupController.js";

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...items) => items.forEach((i) => classes.add(i)),
    remove: (...items) => items.forEach((i) => classes.delete(i)),
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

function createMockElement(tagName, ownerDocument, id = "", initialClasses = []) {
  const attrs = new Map();
  const listeners = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    id,
    className: initialClasses.join(" "),
    value: "",
    src: "",
    alt: "",
    textContent: "",
    style: {},
    ownerDocument,
    children: [],
    classList: createClassList(initialClasses),
    get firstChild() {
      return this.children[0] || null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) ownerDocument?.registerElement?.(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      return child;
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    removeAttribute: (k) => attrs.delete(k),
    addEventListener(eventName, handler) {
      const list = listeners.get(eventName) || [];
      list.push(handler);
      listeners.set(eventName, list);
    },
    triggerClick() {
      (listeners.get("click") || []).forEach((fn) => fn({ target: this }));
    },
    triggerEvent(eventName, payload = {}) {
      (listeners.get(eventName) || []).forEach((fn) => fn({ target: this, ...payload }));
    }
  };
  return el;
}

function createMockDom() {
  const map = new Map();
  const doc = {
    createElement: (tagName) => createMockElement(tagName, doc),
    getElementById: (id) => {
      if (map.has(id)) return map.get(id);
      for (const node of map.values()) {
        const found = findById(node, id);
        if (found) return found;
      }
      return null;
    },
    addEventListener: () => {}
  };
  const reg = (id, tag = "div", cls = []) => {
    const el = createMockElement(tag, doc, id, cls);
    map.set(id, el);
    return el;
  };
  [
    ["app-shell"], ["scene-container"], ["canvas-container", "div", ["is-hidden"]],
    ["procedural-canvas", "canvas"], ["loading-overlay", "div", ["is-hidden"]],
    ["loading-progress-bar"], ["loading-progress-text"], ["hud-container"],
    ["hud-bottom-dock"], ["chat-history"],
    ["status-badge", "span"], ["speech-panel", "div", ["is-hidden"]], ["speech-text", "p"],
    ["hud-size-toggle", "button"], ["simplify-text-button", "button"],
    ["play-animation-button", "button"], ["pause-animation-button", "button"],
    ["overlay-card-container", "section", ["is-hidden"]],
    ["side-panel-container", "aside", ["is-hidden"]], ["side-panel-title", "h2"],
    ["side-panel-body"], ["side-panel-actions"], ["side-panel-close-button", "button"],
    ["popup-container", "div", ["is-hidden"]], ["popup-dialog"], ["popup-title", "h2"],
    ["popup-content"], ["popup-close-button", "button"],
    ["homework-basket-container", "div", ["is-hidden"]], ["homework-list", "ul"],
    ["homework-count-badge", "span"], ["command-input", "input"]
  ].forEach(([id, tag, cls]) => reg(id, tag, cls));
  return doc;
}

function findById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function findByClass(root, className) {
  const hits = [];
  function walk(node) {
    if (!node) return;
    if (String(node.className || "").split(/\s+/).includes(className) || node.classList?.contains(className)) {
      hits.push(node);
    }
    for (const child of node.children || []) walk(child);
  }
  walk(root);
  return hits;
}

test("renderPopup görselin altına niyete göre açıklama, bilgi satırları ve bölümleri yazar", () => {
  const doc = createMockDom();
  const popupElements = {
    container: doc.getElementById("popup-container"),
    titleEl: doc.getElementById("popup-title"),
    contentEl: doc.getElementById("popup-content")
  };

  renderPopup(popupElements, {
    title: "NASA Mars Görseli",
    image_url: "https://example.org/mars-rover.jpg",
    caption: "Jezero Krateri yüzeyi",
    description: "Perseverance kamerasından alındı.",
    facts: [{ label: "Sol", value: 1200 }, { label: "Kamera", value: "Mastcam-Z" }],
    sections: [{ heading: "Neden önemli?", body: "Antik göl yatağı." }]
  });

  assert.equal(popupElements.container.classList.contains("is-hidden"), false);
  const singleImgs = findByClass(popupElements.contentEl, "ag-popup-image");
  assert.equal(singleImgs.length, 1);
  assert.equal(singleImgs[0].src, "https://example.org/mars-rover.jpg");
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-description").length, 1);
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-fact").length, 2);
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-section").length, 1);

  renderPopup(popupElements, {
    title: "Apollo 11 Galeri",
    description: "Apollo 11 Ay yüzeyine 1969'da indi.",
    images: [
      { hdurl: "https://example.org/a11-1.jpg", caption: "Fırlatma" },
      { url: "https://example.org/a11-2.jpg", caption: "Ay Modülü" }
    ]
  }, "APOLLO_11");

  assert.equal(findByClass(popupElements.contentEl, "ag-popup-gallery").length, 1);
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-image").length, 2);
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-description").length, 1);
  assert.equal(findByClass(popupElements.contentEl, "ag-popup-fact").length, 0, "bilgi satırı yoksa tablo çizilmez");
});

test("initApp ardışık sahne komutlarında geçiş pop-up'ı açmadan doğrudan sahneyi günceller", () => {
  resetActionRouterState();
  const doc = createMockDom();
  const app = initApp(doc, { skipBootLoading: true });

  const r1 = app.submitCommand("dünya mars mesafe sahnesi");
  assert.equal(r1.handled, true);
  assert.equal(doc.getElementById("overlay-card-container").classList.contains("is-hidden"), false);
  assert.equal(doc.getElementById("popup-container").classList.contains("is-hidden"), true);

  const r2 = app.submitCommand("apollo 11 sahnesi");
  assert.equal(r2.handled, true);
  assert.equal(r2.action_type, "OPEN_SIDE_PANEL");
  assert.equal(doc.getElementById("popup-container").classList.contains("is-hidden"), true);
  assert.equal(doc.getElementById("side-panel-container").classList.contains("is-hidden"), false);
  assert.equal(doc.getElementById("side-panel-title").textContent, "apollo 11 sahnesi");

  const r3 = app.submitCommand("mars yerçekimi");
  assert.equal(r3.handled, true);
  assert.equal(doc.getElementById("popup-container").classList.contains("is-hidden"), true);
  assert.equal(doc.getElementById("side-panel-title").textContent, "mars yerçekimi");
});

test("enrichRoutePayload getSpaceData görsellerini ve fallback SVG verisini ekler", async () => {
  const apiEnriched = await enrichRoutePayload(
    { action_type: "OPEN_POPUP", template_id: "APOLLO_11", parameters: { title: "Ay" } },
    {
      getSpaceData: async () => [{ name: "Kartal", image_url: "https://example.org/eagle.jpg" }]
    }
  );
  assert.equal(apiEnriched.parameters.image_url, "https://example.org/eagle.jpg");
  assert.equal(apiEnriched.parameters.images.length, 1);

  const fallbackPopup = await enrichRoutePayload(
    { action_type: "OPEN_POPUP", template_id: "NONE", parameters: { title: "Mars Yüzeyi" } },
    {}
  );
  assert.match(fallbackPopup.parameters.image_url, /^data:image\/svg\+xml/);
  assert.match(createFallbackSpaceImageDataUri("Test", "SOLAR_FLARE"), /SOLAR_FLARE/);
});

