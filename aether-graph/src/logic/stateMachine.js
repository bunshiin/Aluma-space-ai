// Sahne akışı (states.json) ve Küçük Kaşif ödev sepeti: adımlar, öğrenci modu metinleri, tekil ödev öğeleri.
import STATES_DATA from "../config/states.json" with { type: "json" };

const MAX_HOMEWORK_TEXT_LENGTH = 2000;
const MAX_PHOTO_URL_LENGTH = 7_000_000;
const MAX_TEXT_LENGTH = 200;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : "";
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function formatTemplate(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function cloneItem(item) {
  return { ...item, facts: item.facts.map((fact) => ({ ...fact })), photo: item.photo ? { ...item.photo } : null };
}

function normalizeFacts(facts) {
  return Array.isArray(facts)
    ? facts.filter(isPlainObject).map((f) => ({ label: toCleanText(f.label), value: toCleanText(f.value) })).filter((f) => f.label && f.value)
    : [];
}

// Fotoğraf sadece https veya data:image adresiyse kabul edilir (javascript: gibi adresler karta girmez)
function normalizePhoto(photo) {
  if (!isPlainObject(photo) || typeof photo.image_url !== "string") return null;
  const url = photo.image_url.trim();
  if (url.length > MAX_PHOTO_URL_LENGTH || !(url.startsWith("https://") || url.startsWith("data:image/"))) return null;
  return {
    image_url: url,
    image_title: toCleanText(photo.image_title),
    image_source: toCleanText(photo.image_source),
    is_fallback: photo.is_fallback === true
  };
}

/**
 * Sahne verisi (states.json) ve ödev sepeti durumunu tutar; dışarıdan gelen veriyi doğrular, hata fırlatmaz.
 */
export class MissionStateMachine {
  constructor(statesData = STATES_DATA) {
    const data = isPlainObject(statesData) ? statesData : {};
    this.scenes = isPlainObject(data.scenes) ? data.scenes : {};
    this.uiTexts = isPlainObject(data.ui_texts) ? data.ui_texts : {};
    this.bodyNames = isPlainObject(data.body_names) ? data.body_names : {};
    this.imageQueries = isPlainObject(data.image_queries) ? data.image_queries : {};
    this.exampleQuestions = isPlainObject(data.example_questions) ? data.example_questions : {};
    this.validTemplateIds = Array.isArray(data.valid_template_ids) ? [...data.valid_template_ids] : ["NONE"];
    this.currentStateId = this.scenes[data.initial_state] ? data.initial_state : Object.keys(this.scenes)[0] ?? null;
    this.is_student_mode = false;
    this.homeworkItems = [];
  }

  getStep(stateId) {
    return typeof stateId === "string" && isPlainObject(this.scenes[stateId]) ? this.scenes[stateId] : null;
  }

  getCurrentStep() {
    return this.getStep(this.currentStateId);
  }

  getCurrentStateId() {
    return this.currentStateId;
  }

  /**
   * Geçerli bir adıma geçer; bilinmeyen adımda durum değişmez.
   */
  handleTransition(targetState) {
    if (!this.getStep(targetState)) {
      console.warn("Bilinmeyen state:", targetState);
      return false;
    }
    this.currentStateId = targetState;
    return true;
  }

  getSceneIdForEvent(eventName) {
    return Object.keys(this.scenes).find((id) => this.scenes[id].status_event === eventName) ?? null;
  }

  getStatusEventNames() {
    return Object.values(this.scenes).map((scene) => scene.status_event).filter((name) => typeof name === "string");
  }

  getUiText(key, vars = {}) {
    const text = this.uiTexts[key];
    return typeof text === "string" ? formatTemplate(text, vars) : "";
  }

  /**
   * Gök cismi/araç kimliğinin Türkçe adını döner; bilinmeyen kimlik olduğu gibi kalır.
   */
  getBodyName(id) {
    return typeof id === "string" && typeof this.bodyNames[id] === "string" ? this.bodyNames[id] : String(id || "");
  }

  getImageQuery(key, fallback = "") {
    return typeof this.imageQueries[key] === "string" ? this.imageQueries[key] : toCleanText(fallback);
  }

  getExampleQuestions(key) {
    const list = this.exampleQuestions[key];
    return Array.isArray(list) ? list.filter((q) => typeof q === "string" && q.trim()) : [];
  }

  isStudentMode() {
    return this.is_student_mode;
  }

  /**
   * Öğrenci modunu ayarlar; değer gerçekten değiştiyse true döner (olay yalnızca o zaman yayınlansın diye).
   */
  setStudentMode(isStudentMode) {
    const next = isStudentMode === true;
    if (next === this.is_student_mode) return false;
    this.is_student_mode = next;
    return true;
  }

  /**
   * Öğrenci modunda student_description, değilse description döner; eksikse diğerine düşer.
   */
  getStepDescription(stateId) {
    const step = this.getStep(stateId);
    if (!step) return "";
    const plain = toCleanText(step.description, 1000);
    const simple = toCleanText(step.student_description, 1000);
    return this.is_student_mode ? simple || plain : plain || simple;
  }

  /**
   * Sahne olayının detail verisinden ödev öğesi kurar. Sadece states.json'daki data_fields alınır.
   */
  createHomeworkItem(sceneId, detail = {}) {
    const step = this.getStep(sceneId);
    if (!step) return null;
    const safeDetail = isPlainObject(detail) ? detail : {};
    const dataFields = isPlainObject(step.data_fields) ? step.data_fields : {};
    const facts = Object.entries(dataFields)
      .map(([key, label]) => ({ label: toCleanText(label), value: toCleanText(safeDetail[key]) }))
      .filter((fact) => fact.label && fact.value);
    const idFields = Array.isArray(step.id_fields) ? step.id_fields : [];
    const idParts = idFields.map((key) => toCleanText(safeDetail[key])).filter(Boolean);
    return {
      id: [sceneId, ...idParts].join("|"),
      scene_id: sceneId,
      template_id: this.validTemplateIds.includes(step.template_id) ? step.template_id : "NONE",
      title: toCleanText(step.title) || sceneId,
      description: toCleanText(step.description, 1000),
      student_description: toCleanText(step.student_description, 1000),
      facts,
      image_query: this.getImageQuery(step.camera_target, step.title),
      text: "",
      photo: null
    };
  }

  /**
   * Router/Gemini parametrelerinden ödev öğesi kurar (id veya başlık zorunlu).
   */
  createHomeworkItemFromParameters(parameters = {}) {
    const params = isPlainObject(parameters) ? parameters : {};
    const sceneId = this.getStep(params.scene_id) ? params.scene_id : null;
    if (sceneId) return this.createHomeworkItem(sceneId, params);
    const id = toCleanText(params.id) || toCleanText(params.step_id) || toCleanText(params.title);
    if (!id) return null;
    return {
      id,
      scene_id: null,
      template_id: this.validTemplateIds.includes(params.template_id) ? params.template_id : "NONE",
      title: toCleanText(params.title) || id,
      description: toCleanText(params.description, 1000),
      student_description: toCleanText(params.student_description, 1000),
      facts: normalizeFacts(params.facts),
      image_query: toCleanText(params.image_query) || toCleanText(params.title) || id,
      text: "",
      photo: null
    };
  }

  hasHomeworkItem(id) {
    return this.homeworkItems.some((item) => item.id === id);
  }

  /**
   * Öğeyi sepete ekler; aynı id ikinci kez eklenmez.
   */
  addToHomework(item) {
    if (!isPlainObject(item) || typeof item.id !== "string" || !item.id) {
      return { added: false, reason: "INVALID_ITEM", item: null };
    }
    if (this.hasHomeworkItem(item.id)) {
      return { added: false, reason: "DUPLICATE", item: cloneItem(this.homeworkItems.find((e) => e.id === item.id)) };
    }
    const stored = {
      id: item.id,
      scene_id: item.scene_id ?? null,
      template_id: item.template_id || "NONE",
      title: toCleanText(item.title) || item.id,
      description: toCleanText(item.description, 1000),
      student_description: toCleanText(item.student_description, 1000),
      facts: normalizeFacts(item.facts),
      image_query: toCleanText(item.image_query) || toCleanText(item.title),
      // Düzenlenebilir metin boşsa öğrenci moduna uygun açıklamayla başlar; sonra öğrencinin yazdığı esastır
      text: toCleanText(item.text, MAX_HOMEWORK_TEXT_LENGTH)
        || toCleanText(this.is_student_mode ? item.student_description || item.description : item.description || item.student_description, MAX_HOMEWORK_TEXT_LENGTH),
      photo: normalizePhoto(item.photo),
      added_at_utc: new Date().toISOString()
    };
    this.homeworkItems.push(stored);
    return { added: true, reason: null, item: cloneItem(stored) };
  }

  removeFromHomework(id) {
    const before = this.homeworkItems.length;
    this.homeworkItems = this.homeworkItems.filter((item) => item.id !== id);
    return this.homeworkItems.length !== before;
  }

  /**
   * Öğrencinin kartta düzenlediği metni kaydeder (PDF'e bu son hali basılır).
   */
  updateHomeworkText(id, text) {
    const item = this.homeworkItems.find((e) => e.id === id);
    if (!item || typeof text !== "string") return false;
    item.text = text.slice(0, MAX_HOMEWORK_TEXT_LENGTH);
    return true;
  }

  setHomeworkPhoto(id, photo) {
    const item = this.homeworkItems.find((e) => e.id === id);
    const normalized = normalizePhoto(photo);
    if (!item || !normalized) return false;
    item.photo = normalized;
    return true;
  }

  getHomeworkItems() {
    return this.homeworkItems.map(cloneItem);
  }
}
