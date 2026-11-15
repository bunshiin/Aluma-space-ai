// Pop-up penceresinin içeriğini kurar: görsel(ler) + niyete göre açıklama, bilgi satırları ve bölümler.
// Genel soru (is_general_question) geniş düzende açılır; pencere taşıma/küçültme popupWindow.js'te.

function clearContainer(container) {
  if (!container) return;
  while (container.firstChild && typeof container.removeChild === "function") {
    container.removeChild(container.firstChild);
  }
  if (Array.isArray(container.children)) {
    container.children.length = 0;
  }
  if (!container.firstChild && typeof container.textContent === "string" && !Array.isArray(container.children)) {
    container.textContent = "";
  }
}

function resolveDocument(element, explicitDoc) {
  if (explicitDoc && typeof explicitDoc.createElement === "function") return explicitDoc;
  if (element?.ownerDocument && typeof element.ownerDocument.createElement === "function") return element.ownerDocument;
  return null;
}

function createEl(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null && text !== "") {
    el.textContent = String(text);
  }
  return el;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Canlı görsel URL'si henüz olmadığında sıfır-varlık koyu uzay telemetri SVG verisi üretir.
 */
export function createFallbackSpaceImageDataUri(title = "Aluma Telemetri", templateId = "NONE") {
  const safeTitle = escapeXml(String(title || "Aluma").slice(0, 40));
  const safeTag = escapeXml(templateId && templateId !== "NONE" ? templateId : "OPTICAL_FEED");
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">',
    '<rect width="640" height="360" fill="#050a14"/>',
    '<path d="M0 180H640M320 0V360" stroke="#1e293b" stroke-width="1"/>',
    '<circle cx="320" cy="180" r="120" fill="none" stroke="#0ea5e9" stroke-opacity="0.32" stroke-dasharray="6 6"/>',
    '<circle cx="320" cy="180" r="72" fill="none" stroke="#38bdf8" stroke-opacity="0.6"/>',
    '<circle cx="320" cy="180" r="22" fill="#0f172a" stroke="#fbbf24" stroke-width="2"/>',
    '<circle cx="392" cy="180" r="5" fill="#38bdf8"/>',
    '<circle cx="235" cy="96" r="4" fill="#f97316"/>',
    `<text x="28" y="42" fill="#38bdf8" font-family="monospace" font-size="14" letter-spacing="2">${safeTag}</text>`,
    `<text x="28" y="330" fill="#e2e8f0" font-family="sans-serif" font-size="18" font-weight="600">${safeTitle}</text>`,
    "</svg>"
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function extractImageEntries(parameters) {
  const entries = [];
  if (Array.isArray(parameters?.images)) {
    for (const item of parameters.images) {
      if (typeof item === "string" && item.trim()) {
        entries.push({ url: item.trim(), title: "", caption: "" });
      } else if (item && typeof item === "object") {
        const url = item.image_url || item.hdurl || item.url || item.src;
        if (typeof url === "string" && url.trim()) {
          entries.push({
            url: url.trim(),
            title: item.title || item.name || "",
            caption: item.caption || item.description || item.explanation || ""
          });
        }
      }
    }
  }
  const singleUrl = parameters?.image_url || parameters?.hdurl || parameters?.url;
  if (entries.length === 0 && typeof singleUrl === "string" && singleUrl.trim()) {
    entries.push({
      url: singleUrl.trim(),
      title: parameters?.image_title || parameters?.title || "",
      caption: parameters?.caption || ""
    });
  }
  return entries;
}

function buildImageFigure(doc, item, fallbackTitle, templateId) {
  const figure = createEl(doc, "figure", "ag-popup-figure");
  const frame = createEl(doc, "div", "ag-popup-image-frame");
  const img = createEl(doc, "img", "ag-popup-image");
  const altText = item.title || fallbackTitle || "Uzay görseli";

  img.src = item.url;
  img.alt = altText;
  img.setAttribute?.("src", item.url);
  img.setAttribute?.("alt", altText);
  img.addEventListener?.("error", () => {
    const fallbackUri = createFallbackSpaceImageDataUri(altText, templateId);
    if (img.src !== fallbackUri) {
      img.src = fallbackUri;
      img.setAttribute?.("src", fallbackUri);
    }
  });

  frame.appendChild(img);
  figure.appendChild(frame);
  return figure;
}

function appendInfoSection(doc, parentEl, parameters) {
  const info = createEl(doc, "div", "ag-popup-info");
  if (parameters?.description) info.appendChild(createEl(doc, "p", "ag-popup-description", parameters.description));

  const facts = Array.isArray(parameters?.facts) ? parameters.facts : Array.isArray(parameters?.metrics) ? parameters.metrics : [];
  const validFacts = facts.filter((f) => f && typeof f === "object" && (f.label ?? f.key) && f.value !== undefined && f.value !== "");
  if (validFacts.length > 0) {
    const list = createEl(doc, "dl", "ag-popup-facts");
    for (const fact of validFacts) {
      const row = createEl(doc, "div", "ag-popup-fact");
      row.appendChild(createEl(doc, "dt", "ag-popup-fact-label", fact.label ?? fact.key));
      row.appendChild(createEl(doc, "dd", "ag-popup-fact-value", fact.value));
      list.appendChild(row);
    }
    info.appendChild(list);
  }

  const sections = Array.isArray(parameters?.sections) ? parameters.sections.filter((sec) => sec && typeof sec.body === "string" && sec.body) : [];
  for (const section of sections) {
    const block = createEl(doc, "section", "ag-popup-section");
    if (section.heading) block.appendChild(createEl(doc, "h3", "ag-popup-section-title", section.heading));
    block.appendChild(createEl(doc, "p", "ag-popup-section-body", section.body));
    info.appendChild(block);
  }

  if (parameters?.image_source) info.appendChild(createEl(doc, "p", "ag-popup-credit", `Görsel: ${parameters.image_source}`));
  if (info.firstChild) parentEl.appendChild(info);
}

function appendMedia(doc, parentEl, parameters, resolvedTitle, templateId) {
  const extracted = extractImageEntries(parameters);
  const visuals = extracted.length > 0
    ? extracted
    : [{ url: createFallbackSpaceImageDataUri(resolvedTitle, templateId), title: resolvedTitle }];
  const media = createEl(doc, "div", "ag-popup-media");
  if (visuals.length === 1) {
    media.appendChild(buildImageFigure(doc, visuals[0], resolvedTitle, templateId));
  } else {
    const gallery = createEl(doc, "div", "ag-popup-gallery");
    for (const item of visuals) gallery.appendChild(buildImageFigure(doc, item, resolvedTitle, templateId));
    media.appendChild(gallery);
  }
  parentEl.appendChild(media);
}

/**
 * Pop-up penceresini görsel + niyete göre bilgiyle doldurup açar. Genel soru geniş pencerede açılır.
 */
export function renderPopup(popupElements, parameters = {}, templateId = "NONE", doc = null) {
  if (!popupElements?.container) return;

  // Animasyonun her açılışta baştan oynatılması için içeriği kurmadan önce sıfırla
  popupElements.container.classList?.add("is-hidden");

  const resolvedTitle =
    parameters?.title || parameters?.photo_title || parameters?.query || (templateId !== "NONE" ? templateId : "Bilgi");
  if (popupElements.titleEl) popupElements.titleEl.textContent = resolvedTitle;
  const isWide = parameters?.is_general_question === true;
  popupElements.dialog?.classList?.toggle?.("is-wide", isWide);
  popupElements.dialog?.classList?.remove?.("is-minimized");

  clearContainer(popupElements.contentEl);
  const elDoc = resolveDocument(popupElements.contentEl || popupElements.container, doc);
  if (popupElements.contentEl && elDoc) {
    appendMedia(elDoc, popupElements.contentEl, parameters, resolvedTitle, templateId);
    appendInfoSection(elDoc, popupElements.contentEl, parameters);
  }

  void popupElements.container.offsetWidth;
  popupElements.container.classList?.remove("is-hidden");
  popupElements.container.setAttribute?.("aria-hidden", "false");
}
