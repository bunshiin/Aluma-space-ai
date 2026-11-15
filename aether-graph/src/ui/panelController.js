// Yan panel, bilgi/karşılaştırma/zaman kartları ve pop-up kapsayıcılarını izole biçimde çizer.

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

function appendComparisonRow(doc, gridEl, labelText, valueText) {
  const row = createEl(doc, "div", "ag-comparison-row");
  row.appendChild(createEl(doc, "span", "ag-comparison-label", String(labelText ?? "-")));
  row.appendChild(createEl(doc, "span", "ag-comparison-value", String(valueText ?? "-")));
  gridEl.appendChild(row);
}

function appendLightDelayRows(doc, parentEl, lightDelay) {
  if (!lightDelay || typeof lightDelay !== "object") return;
  const grid = createEl(doc, "div", "ag-comparison-grid");
  if (lightDelay.delay_s !== undefined) appendComparisonRow(doc, grid, "delay_s", `${lightDelay.delay_s} s`);
  if (lightDelay.round_trip_s !== undefined) appendComparisonRow(doc, grid, "round_trip_s", `${lightDelay.round_trip_s} s`);
  if (lightDelay.risk_level) appendComparisonRow(doc, grid, "risk_level", lightDelay.risk_level);
  parentEl.appendChild(grid);
}

function renderComparisonContent(doc, bodyEl, templateId, parameters) {
  const grid = createEl(doc, "div", "ag-comparison-grid");
  const rows = Array.isArray(parameters?.rows)
    ? parameters.rows
    : Array.isArray(parameters?.items) ? parameters.items : [];

  if (rows.length > 0) {
    for (const item of rows) {
      if (item && typeof item === "object") {
        const label = item.label ?? item.name ?? item.title ?? item.metric ?? "-";
        const value = item.value ?? (item.left_value !== undefined && item.right_value !== undefined
          ? `${item.left_value} / ${item.right_value}`
          : item.distance_km !== undefined ? `${item.distance_km} km` : "-");
        appendComparisonRow(doc, grid, label, value);
      } else {
        appendComparisonRow(doc, grid, "-", item);
      }
    }
  } else {
    appendComparisonRow(doc, grid, "template_id", templateId || "NONE");
    if (parameters?.source) appendComparisonRow(doc, grid, "source", parameters.source);
    if (parameters?.target) appendComparisonRow(doc, grid, "target", parameters.target);
    if (parameters?.query && !parameters?.source && !parameters?.target) {
      appendComparisonRow(doc, grid, "query", parameters.query);
    }
  }
  bodyEl.appendChild(grid);
}

function renderTimelineContent(doc, bodyEl, actionType, parameters) {
  const list = createEl(doc, "ol", "ag-timeline-list");
  const steps = Array.isArray(parameters?.steps)
    ? parameters.steps
    : Array.isArray(parameters?.items) ? parameters.items : [];

  if (steps.length > 0) {
    for (const step of steps) {
      const li = createEl(doc, "li", "ag-timeline-step");
      const label = step?.title || step?.step_id || "-";
      li.appendChild(createEl(doc, "div", "ag-timeline-step-title", step?.date ? `${step.date} · ${label}` : label));
      if (step?.description) {
        li.appendChild(createEl(doc, "div", "ag-timeline-step-desc", step.description));
      }
      list.appendChild(li);
    }
  } else {
    const li = createEl(doc, "li", "ag-timeline-step");
    const fallbackTitle = parameters?.step_id || parameters?.title || parameters?.query || actionType;
    li.appendChild(createEl(doc, "div", "ag-timeline-step-title", fallbackTitle));
    list.appendChild(li);
  }
  bodyEl.appendChild(list);
}

function renderFactOrMetadataContent(doc, bodyEl, templateId, parameters) {
  if (parameters?.description) {
    bodyEl.appendChild(createEl(doc, "p", "ag-panel-description", parameters.description));
  }
  if (parameters?.light_delay) {
    appendLightDelayRows(doc, bodyEl, parameters.light_delay);
  }

  const metrics = Array.isArray(parameters?.metrics)
    ? parameters.metrics
    : Array.isArray(parameters?.facts) ? parameters.facts : [];

  // Niyete göre Gemini'nin doldurduğu bölümler (Nasıl oluşur?, Neden önemli? ...)
  const sections = Array.isArray(parameters?.sections) ? parameters.sections.filter((sec) => sec && typeof sec.body === "string" && sec.body) : [];
  for (const section of sections) {
    if (section.heading) bodyEl.appendChild(createEl(doc, "h4", "ag-card-section-title", section.heading));
    bodyEl.appendChild(createEl(doc, "p", "ag-panel-description", section.body));
  }

  if (metrics.length > 0) {
    const grid = createEl(doc, "div", "ag-comparison-grid");
    for (const entry of metrics) {
      if (entry && typeof entry === "object") {
        appendComparisonRow(doc, grid, entry.label ?? entry.key ?? "-", entry.value ?? "-");
      } else {
        appendComparisonRow(doc, grid, "-", entry);
      }
    }
    bodyEl.appendChild(grid);
    return;
  }

  if (!parameters?.description && !parameters?.light_delay) {
    const grid = createEl(doc, "div", "ag-comparison-grid");
    const fallbackKeys = ["planet", "target", "source", "mode"];
    let appended = 0;
    for (const key of fallbackKeys) {
      if (parameters?.[key]) {
        appendComparisonRow(doc, grid, key, parameters[key]);
        appended += 1;
      }
    }
    if (appended > 0) bodyEl.appendChild(grid);
  }
}

/**
 * Sahne/şablon bilgisinden AGENTS.md Bölüm 6'ya uygun kebab-case kart ID'si üretir.
 */
export function getSceneCardId(templateId, parameters = {}) {
  if (templateId === "LIGHT_DELAY") return "light-delay-panel";
  if (templateId === "APOLLO_11") return "apollo-11-panel";

  const hintText = [
    parameters?.card_id, parameters?.planet, parameters?.target,
    parameters?.subject, parameters?.object_id, parameters?.query, parameters?.title
  ].filter(Boolean).join(" ").toLowerCase();

  if (hintText.includes("mars")) return "mars-info-card";

  const templateMap = {
    NEO_SWARM: "neo-swarm-panel",
    SOLAR_FLARE: "solar-flare-panel",
    GRAVITY_SIM: "gravity-sim-panel"
  };
  if (templateMap[templateId]) return templateMap[templateId];

  const rawSubject = String(parameters?.planet || parameters?.target || parameters?.subject || "");
  const slug = rawSubject.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${slug}-info-card` : "scene-info-card";
}

/**
 * Yan görev panelini adım başlığı, açıklaması ve sonraki eylem düğmeleriyle günceller.
 */
export function renderSidePanel(sidePanelElements, stepData = {}, onActionSelect = null, doc = null) {
  if (!sidePanelElements?.container) return;

  sidePanelElements.container.classList?.remove("is-hidden");
  sidePanelElements.container.setAttribute?.("aria-hidden", "false");
  if (sidePanelElements.titleEl) {
    sidePanelElements.titleEl.textContent = stepData?.title || stepData?.step_id || stepData?.query || "PANEL";
  }

  const elDoc = resolveDocument(sidePanelElements.bodyEl || sidePanelElements.container, doc);
  clearContainer(sidePanelElements.bodyEl);
  clearContainer(sidePanelElements.actionsEl);

  if (sidePanelElements.bodyEl) {
    let hasBodyContent = false;
    if (elDoc) {
      if (stepData?.description) {
        sidePanelElements.bodyEl.appendChild(createEl(elDoc, "p", "ag-panel-description", stepData.description));
        hasBodyContent = true;
      } else if (stepData?.query && stepData.query !== stepData?.title) {
        sidePanelElements.bodyEl.appendChild(createEl(elDoc, "p", "ag-panel-description", stepData.query));
        hasBodyContent = true;
      }
      if (stepData?.light_delay) {
        appendLightDelayRows(elDoc, sidePanelElements.bodyEl, stepData.light_delay);
        hasBodyContent = true;
      }
      if (Array.isArray(stepData?.items) && stepData.items.length > 0) {
        renderComparisonContent(elDoc, sidePanelElements.bodyEl, stepData.template_id, stepData);
        hasBodyContent = true;
      }
    }
    sidePanelElements.bodyEl.classList?.toggle?.("is-hidden", !hasBodyContent);
  }

  const nextActions = Array.isArray(stepData?.next_actions) ? stepData.next_actions : [];
  if (sidePanelElements.actionsEl) {
    if (elDoc && nextActions.length > 0) {
      sidePanelElements.actionsEl.classList?.remove("is-hidden");
      for (const item of nextActions) {
        const label = item?.label || item?.title || item?.target_state || item?.action || "ACTION";
        const btn = createEl(elDoc, "button", "ag-node-btn ag-panel-action-btn", label);
        btn.type = "button";
        if (item?.target_state) btn.setAttribute?.("data-target-state", item.target_state);
        if (item?.action) btn.setAttribute?.("data-action", item.action);
        btn.addEventListener?.("click", () => onActionSelect?.(item));
        sidePanelElements.actionsEl.appendChild(btn);
      }
    } else {
      sidePanelElements.actionsEl.classList?.add("is-hidden");
    }
  }
}

/**
 * Bilgi kartı, karşılaştırma tablosu veya zaman çizelgesini overlay kapsayıcısında oluşturur.
 */
export function renderOverlayCard(overlayCardContainer, actionType, templateId = "NONE", parameters = {}, doc = null) {
  if (!overlayCardContainer) return null;

  clearContainer(overlayCardContainer);
  overlayCardContainer.classList?.remove("is-hidden");
  overlayCardContainer.setAttribute?.("aria-hidden", "false");

  const elDoc = resolveDocument(overlayCardContainer, doc);
  if (!elDoc) return null;

  const cardId = getSceneCardId(templateId, parameters);
  const cardEl = createEl(elDoc, "section", `ag-card ${cardId}`);
  cardEl.id = cardId;

  const headerEl = createEl(elDoc, "div", "ag-card-header");
  const tagText = templateId && templateId !== "NONE" ? templateId : actionType || "CARD";
  const titleText = parameters?.title || parameters?.planet || parameters?.target || parameters?.query || cardId;
  headerEl.appendChild(createEl(elDoc, "span", "ag-card-tag", tagText));
  headerEl.appendChild(createEl(elDoc, "h3", "ag-card-title", titleText));
  cardEl.appendChild(headerEl);

  const bodyEl = createEl(elDoc, "div", "ag-card-body");
  if (actionType === "SHOW_COMPARISON") {
    renderComparisonContent(elDoc, bodyEl, templateId, parameters);
  } else if (actionType === "SHOW_TIMELINE") {
    renderTimelineContent(elDoc, bodyEl, actionType, parameters);
  } else {
    renderFactOrMetadataContent(elDoc, bodyEl, templateId, parameters);
  }

  cardEl.appendChild(bodyEl);
  overlayCardContainer.appendChild(cardEl);
  return cardEl;
}

export { renderPopup } from "./popupController.js";

/**
 * Verilen tüm panel ve kart kapsayıcılarını kapatır.
 */
export function closeAllPanels(containers) {
  if (!containers) return;
  const list = Array.isArray(containers) ? containers : Object.values(containers);
  for (const el of list) {
    if (!el) continue;
    el.classList?.add("is-hidden");
    el.setAttribute?.("aria-hidden", "true");
  }
}
