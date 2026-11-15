// Sağ bilgi paneli: afetin uydu/arşiv görseli, yapay zekâ özeti, okunabilir bilgi kartı ve diğer olaylar
// API verisi textContent ile yazılır (innerHTML değil) ki dış veri sayfaya kod olarak girmesin

import { getCategoryColorHex } from "../three/disasterStyles.js";
import { createWorldviewSnapshotUrl, getNasaArchivePhoto } from "./eonetImagery.js";
import { createImageViewer } from "./eonetImageViewer.js";
import {
  fillTemplate, formatCoordinates, formatDateTr, formatMagnitude, formatRelativeDay, getCategoryLabel,
} from "./eonetFormat.js";

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createChip(label, colorHex, modifier) {
  const chip = createElement("span", `eonet-chip ${modifier || ""}`.trim());
  const dot = createElement("span", "eonet-chip-dot");
  dot.style.background = colorHex;
  chip.append(dot, createElement("span", "", label));
  return chip;
}

function createFactRow(label, value, sub) {
  const row = createElement("div", "eonet-fact");
  row.append(createElement("dt", "eonet-fact-label", label));
  const dd = createElement("dd", "eonet-fact-value", value);
  if (sub) dd.append(createElement("span", "eonet-fact-sub", sub));
  row.append(dd);
  return row;
}

function createLink(href, label) {
  const link = createElement("a", "eonet-link", `${label} ↗`);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createFacts(event, texts) {
  const facts = createElement("dl", "eonet-facts");
  facts.append(
    createFactRow(texts.field_last_seen, formatDateTr(event.timestamp_utc), formatRelativeDay(event.timestamp_utc, texts)),
    createFactRow(texts.field_location, formatCoordinates(event.coordinates)),
    createFactRow(texts.field_magnitude, formatMagnitude(event, texts)),
    createFactRow(texts.field_first_seen, formatDateTr(event.first_seen_utc)),
    createFactRow(texts.field_track_points, String(event.track_point_count || 1)),
    createFactRow(texts.field_source, event.source_id || texts.field_unknown),
  );
  return facts;
}

function createOtherEvents(events, focusEvent, texts, onSelect) {
  const others = events.filter((e) => e !== focusEvent);
  const section = createElement("section", "eonet-others");
  if (others.length === 0) return section;
  section.append(createElement("h3", "eonet-section-title", texts.other_events_title));
  const list = createElement("ul", "eonet-others-list");
  others.forEach((event) => {
    const item = createElement("li");
    const row = createElement("button", "eonet-other");
    row.type = "button";
    const dot = createElement("span", "eonet-chip-dot");
    dot.style.background = getCategoryColorHex(event.category);
    const text = createElement("span", "eonet-other-text");
    text.append(
      createElement("span", "eonet-other-title", event.title),
      createElement("span", "eonet-other-meta", `${getCategoryLabel(event.category, texts)} · ${formatRelativeDay(event.timestamp_utc, texts)}`),
    );
    row.append(dot, text);
    row.addEventListener("click", () => onSelect(event));
    item.append(row);
    list.append(item);
  });
  section.append(list);
  return section;
}

export function createInfoPanel(container, texts, callbacks) {
  const panel = createElement("aside", "eonet-panel");
  panel.setAttribute("aria-hidden", "true");
  const closeButton = createElement("button", "eonet-panel-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", texts.panel_close_label);
  closeButton.addEventListener("click", () => callbacks.onClose?.());
  const body = createElement("div", "eonet-panel-body");
  panel.append(closeButton, body);
  container.append(panel);

  let viewer = null;
  let renderToken = 0;

  function open() {
    panel.classList.add("eonet-panel-open");
    panel.setAttribute("aria-hidden", "false");
  }

  return {
    showEvent({ events, focus_event: event, speech_text: speechText, data_source: dataSource }) {
      renderToken += 1;
      const token = renderToken;
      viewer?.destroy();
      body.replaceChildren();
      body.scrollTop = 0;

      const satellite = createWorldviewSnapshotUrl(event);
      viewer = createImageViewer(body, texts, {
        url: satellite.url,
        caption: fillTemplate(texts.image_caption_satellite, { layer: satellite.layer_name, date: satellite.date }),
      });
      getNasaArchivePhoto(event).then((photo) => {
        if (photo && token === renderToken) {
          viewer.addArchive({ url: photo.url, caption: fillTemplate(texts.image_caption_archive, { title: photo.title }) });
        }
      });

      const header = createElement("header", "eonet-panel-header");
      const chips = createElement("div", "eonet-chips");
      chips.append(
        createChip(getCategoryLabel(event.category, texts), getCategoryColorHex(event.category)),
        createChip(event.status === "CLOSED" ? texts.status_closed : texts.status_open,
          event.status === "CLOSED" ? "#94a3b8" : "#4ade80", "eonet-chip-status"),
      );
      header.append(chips, createElement("h2", "eonet-panel-title", event.title));
      body.append(header);

      if (dataSource === "FALLBACK" || event.source_id === "FALLBACK") {
        body.append(createElement("p", "eonet-note", texts.fallback_data_note));
      }
      if (speechText) {
        const summary = createElement("section", "eonet-summary");
        summary.append(createElement("h3", "eonet-section-title", texts.ai_summary_label), createElement("p", "eonet-summary-text", speechText));
        body.append(summary);
      }

      body.append(createFacts(event, texts));
      const links = createElement("div", "eonet-links");
      if (event.eonet_url) links.append(createLink(event.eonet_url, texts.link_eonet));
      if (event.source_url) links.append(createLink(event.source_url, texts.link_source));
      body.append(links, createOtherEvents(events, event, texts, (e) => callbacks.onSelectEvent?.(e)));
      open();
    },
    close() {
      panel.classList.remove("eonet-panel-open");
      panel.setAttribute("aria-hidden", "true");
    },
    // offset* değerleri açılış animasyonundaki transform'dan etkilenmez, panelin son yerini verir
    getOpenRect() {
      if (!panel.classList.contains("eonet-panel-open")) return null;
      return { left: panel.offsetLeft, top: panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight };
    },
    destroy() {
      viewer?.destroy();
      panel.remove();
    },
  };
}
