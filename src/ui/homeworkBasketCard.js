// Ödev sepetindeki tek kart: başlık, fotoğraf (değiştirilebilir), düzenlenebilir metin kutusu, veriler ve silme.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function createElement(doc, tag, className, text) {
  const el = doc.createElement(tag);
  el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

/**
 * Dosyanın karta eklenebilir bir resim olup olmadığını döner (tür ve boyut kontrolü).
 */
export function isAcceptedImageFile(file) {
  return Boolean(file) && typeof file.type === "string" && file.type.startsWith("image/") && Number(file.size) > 0 && Number(file.size) <= MAX_UPLOAD_BYTES;
}

/**
 * Öğrencinin seçtiği resim dosyasını karta ve PDF'e basılabilen data URL'e çevirir.
 */
export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Kartı kurar. listen(el, type, handler) dinleyiciyi panelin temizlik listesine kaydeder.
 * callbacks: onTextChange(id, text), onRemove(id), onNextPhoto(id), onPhotoFile(id, file).
 */
export function createHomeworkBasketCard({ doc, item, getText, listen, callbacks = {} }) {
  const card = createElement(doc, "li", "homework-basket-card");
  card.setAttribute("data-homework-id", item.id);
  card.append(createElement(doc, "h3", "homework-basket-card-title", item.title));

  const figure = createElement(doc, "figure", "homework-basket-photo");
  const image = createElement(doc, "img", "homework-basket-photo-img");
  image.setAttribute("alt", getText("photo_alt", { topic: item.title }));
  image.setAttribute("loading", "lazy");
  const caption = createElement(doc, "figcaption", "homework-basket-photo-caption");
  figure.append(image, caption);

  const photoActions = createElement(doc, "div", "homework-basket-photo-actions");
  const nextButton = createElement(doc, "button", "student-mode-panel-btn homework-basket-photo-next", getText("photo_next_button"));
  nextButton.setAttribute("type", "button");
  listen(nextButton, "click", () => callbacks.onNextPhoto?.(item.id));
  const uploadLabel = createElement(doc, "label", "student-mode-panel-btn homework-basket-photo-upload", getText("photo_upload_button"));
  const fileInput = createElement(doc, "input", "homework-basket-file-input");
  fileInput.setAttribute("type", "file");
  fileInput.setAttribute("accept", "image/*");
  listen(fileInput, "change", () => {
    const file = fileInput.files?.[0];
    if (file) callbacks.onPhotoFile?.(item.id, file);
    fileInput.value = "";
  });
  uploadLabel.append(fileInput);
  photoActions.append(nextButton, uploadLabel);

  const textArea = createElement(doc, "textarea", "homework-basket-text");
  textArea.setAttribute("rows", "4");
  textArea.setAttribute("maxlength", "2000");
  textArea.setAttribute("placeholder", getText("text_placeholder"));
  textArea.setAttribute("aria-label", item.title);
  textArea.value = item.text || "";
  listen(textArea, "input", () => callbacks.onTextChange?.(item.id, textArea.value));

  card.append(figure, photoActions, textArea);
  if (item.facts.length > 0) {
    const facts = createElement(doc, "dl", "homework-basket-facts");
    for (const fact of item.facts) {
      facts.append(createElement(doc, "dt", "homework-basket-fact-label", fact.label), createElement(doc, "dd", "homework-basket-fact-value", fact.value));
    }
    card.append(facts);
  }
  const removeButton = createElement(doc, "button", "student-mode-panel-btn homework-basket-remove", getText("remove_button"));
  removeButton.setAttribute("type", "button");
  listen(removeButton, "click", () => callbacks.onRemove?.(item.id));
  card.append(removeButton);

  function setPhoto(photo) {
    if (photo?.image_url) {
      image.setAttribute("src", photo.image_url);
      figure.classList.remove("homework-basket-photo-loading");
      caption.textContent = [photo.image_title, photo.image_source].filter(Boolean).join(" · ");
    } else {
      figure.classList.add("homework-basket-photo-loading");
      caption.textContent = getText("photo_loading");
    }
  }
  setPhoto(item.photo);

  return { element: card, setPhoto };
}
