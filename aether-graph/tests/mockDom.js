// Testler için küçük sahte DOM: createElement, sınıf listesi, dinleyici sayımı ve sınıfa göre arama.

function createClassList(el) {
  const read = () => new Set(el.className.split(/\s+/).filter(Boolean));
  const write = (set) => { el.className = [...set].join(" "); };
  return {
    add: (...names) => { const s = read(); names.forEach((n) => s.add(n)); write(s); },
    remove: (...names) => { const s = read(); names.forEach((n) => s.delete(n)); write(s); },
    contains: (name) => read().has(name),
    toggle: (name, force) => {
      const s = read();
      const next = typeof force === "boolean" ? force : !s.has(name);
      if (next) s.add(name); else s.delete(name);
      write(s);
      return next;
    }
  };
}

export function createMockDocument() {
  const doc = { listenerTotal: 0 };

  doc.createElement = (tagName) => {
    const listeners = new Map();
    const el = {
      tagName: String(tagName).toUpperCase(),
      ownerDocument: doc,
      className: "",
      textContent: "",
      value: "",
      children: [],
      parentNode: null,
      attributes: new Map(),
      setAttribute(name, val) { this.attributes.set(name, String(val)); },
      getAttribute(name) { return this.attributes.get(name) ?? null; },
      removeAttribute(name) { this.attributes.delete(name); },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
      replaceChildren(...nodes) {
        this.children.forEach((c) => { c.parentNode = null; });
        this.children = [];
        this.append(...nodes);
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
        this.parentNode = null;
      },
      addEventListener(type, fn) {
        const list = listeners.get(type) || [];
        list.push(fn);
        listeners.set(type, list);
        doc.listenerTotal += 1;
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type) || [];
        const index = list.indexOf(fn);
        if (index >= 0) { list.splice(index, 1); doc.listenerTotal -= 1; }
      },
      dispatch(type) { [...(listeners.get(type) || [])].forEach((fn) => fn({ type, target: el })); },
      getListenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.length, 0)
    };
    el.classList = createClassList(el);
    return el;
  };
  return doc;
}

/**
 * Ağaçta sınıfı içeren tüm öğeleri döner (derinlik öncelikli).
 */
export function findAllByClass(root, className) {
  const found = [];
  const walk = (node) => {
    if (String(node.className).split(/\s+/).includes(className)) found.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return found;
}

export function findByClass(root, className) {
  return findAllByClass(root, className)[0] ?? null;
}

/**
 * addEventListener/removeEventListener çağrılarını sayan EventTarget.
 */
export class CountingEventTarget extends EventTarget {
  constructor() {
    super();
    this.activeListeners = new Map();
  }

  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    this.activeListeners.set(type, (this.activeListeners.get(type) || 0) + 1);
  }

  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.activeListeners.set(type, Math.max(0, (this.activeListeners.get(type) || 0) - 1));
  }

  getActiveCount(type) {
    if (type) return this.activeListeners.get(type) || 0;
    return [...this.activeListeners.values()].reduce((sum, n) => sum + n, 0);
  }
}
