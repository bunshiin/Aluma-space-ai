// Panelin üstündeki görsel alanı: uydu karesi her zaman, NASA arşiv fotoğrafı bulunursa ikinci sekme

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createImageViewer(container, texts, satellite) {
  const figure = createElement("figure", "eonet-figure eonet-figure-loading");
  const frame = createElement("div", "eonet-figure-frame");
  const image = createElement("img", "eonet-figure-img");
  image.alt = "";
  image.decoding = "async";
  const placeholder = createElement("div", "eonet-figure-placeholder", texts.image_loading);
  const tabs = createElement("div", "eonet-figure-tabs");
  const caption = createElement("figcaption", "eonet-figure-caption");
  frame.append(image, placeholder, tabs);
  figure.append(frame, caption);
  container.append(figure);

  const sources = [{ key: "satellite", label: texts.image_tab_satellite, ...satellite }];
  let activeKey = "satellite";

  function showSource(key) {
    const source = sources.find((s) => s.key === key);
    if (!source) return;
    activeKey = key;
    figure.classList.add("eonet-figure-loading");
    figure.classList.remove("eonet-figure-failed");
    placeholder.textContent = texts.image_loading;
    caption.textContent = source.caption;
    image.src = source.url;
    tabs.querySelectorAll(".eonet-figure-tab").forEach((tab) => {
      tab.classList.toggle("eonet-figure-tab-active", tab.dataset.key === key);
    });
  }

  function renderTabs() {
    tabs.replaceChildren();
    if (sources.length < 2) return;
    sources.forEach((source) => {
      const tab = createElement("button", "eonet-figure-tab", source.label);
      tab.type = "button";
      tab.dataset.key = source.key;
      tab.classList.toggle("eonet-figure-tab-active", source.key === activeKey);
      tab.addEventListener("click", () => showSource(source.key));
      tabs.append(tab);
    });
  }

  image.addEventListener("load", () => figure.classList.remove("eonet-figure-loading"));
  image.addEventListener("error", () => {
    figure.classList.remove("eonet-figure-loading");
    figure.classList.add("eonet-figure-failed");
    placeholder.textContent = texts.image_unavailable;
  });

  showSource("satellite");

  return {
    addArchive(archive) {
      if (sources.some((s) => s.key === "archive")) return;
      sources.push({ key: "archive", label: texts.image_tab_archive, ...archive });
      renderTabs();
    },
    destroy() {
      image.removeAttribute("src");
      figure.remove();
    },
  };
}
