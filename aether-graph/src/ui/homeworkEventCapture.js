// Sahnelerin yayınladığı ag:*-status olaylarını ve odak değişimlerini dinler: aktif sahnenin ödev özetini
// ve kullanıcının o an baktığı yeri (bağlam) yakalar.

const FOCUS_TARGET_EVENT = "ag:focus-target";
const EARTH_EVENTS_EVENT = "ag:earth-events";
const CONTEXT_TARGET_FIELDS = ["target", "primary_object", "id"];

/**
 * Bir olay detail'inin öğrenciye "ödeve ekle" sorusu sorulacak aşamada olup olmadığını döner.
 * Işık gecikmesi gibi sahneler her fazda olay yayınlar; sonuç belli olmadan soru sorulmasın diye.
 */
export function isPromptPhase(step, detail) {
  const phases = Array.isArray(step?.prompt_phases) ? step.prompt_phases : null;
  if (!phases) return true;
  return phases.includes(detail?.phase);
}

function toTargetId(value) {
  return typeof value === "string" && /^[A-Za-z0-9 _-]{1,40}$/.test(value.trim()) ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : null;
}

function getDetail(event) {
  return event && typeof event === "object" && "detail" in event && event.detail && typeof event.detail === "object" ? event.detail : null;
}

/**
 * Sahne olaylarını dinleyen yakalayıcı kurar.
 * onCapture(item, { should_prompt }) her sahne özetinde, onContextChange(context) her bağlam değişiminde çağrılır.
 */
export function createHomeworkEventCapture({ eventTarget = globalThis, machine, onCapture, onContextChange } = {}) {
  const listeners = [];
  const promptedIds = new Set();
  let lastItem = null;
  // Son olay sahne özeti mi yoksa çıplak bir odak mı: "bunu ödevime ekle" hangisini kastettiğini buradan anlar
  let context = { target: null, scene_id: null, scene_item: null };

  function updateContext(next) {
    context = next;
    onContextChange?.(getContext());
  }

  function handleStatusEvent(eventName, event) {
    const sceneId = machine.getSceneIdForEvent(eventName);
    const detail = getDetail(event);
    const item = sceneId ? machine.createHomeworkItem(sceneId, detail) : null;
    if (!item) return;
    lastItem = item;
    machine.handleTransition(sceneId);
    const step = machine.getStep(sceneId);
    const fieldTarget = CONTEXT_TARGET_FIELDS.map((key) => toTargetId(detail?.[key])).find(Boolean);
    updateContext({ target: fieldTarget || toTargetId(step?.camera_target), scene_id: sceneId, scene_item: item });
    // Aynı konu için soru bir kez sorulur; sepette olan konu tekrar sorulmaz
    const shouldPrompt = isPromptPhase(step, detail) && !promptedIds.has(item.id) && !machine.hasHomeworkItem(item.id);
    if (shouldPrompt) promptedIds.add(item.id);
    onCapture?.(item, { should_prompt: shouldPrompt });
  }

  function handleFocusEvent(event) {
    const detail = getDetail(event);
    const target = toTargetId(detail?.target) || toTargetId(detail?.id);
    if (target) updateContext({ target, scene_id: null, scene_item: null });
  }

  function handleEarthEvents() {
    updateContext({ target: "EARTH", scene_id: "EARTH_EVENTS", scene_item: null });
  }

  function listen(eventName, listener) {
    eventTarget.addEventListener(eventName, listener);
    listeners.push([eventName, listener]);
  }

  function getContext() {
    return { ...context, scene_item: context.scene_item ? { ...context.scene_item, facts: context.scene_item.facts.map((f) => ({ ...f })) } : null };
  }

  if (eventTarget && typeof eventTarget.addEventListener === "function" && machine) {
    for (const eventName of machine.getStatusEventNames()) listen(eventName, (event) => handleStatusEvent(eventName, event));
    listen(FOCUS_TARGET_EVENT, handleFocusEvent);
    listen(EARTH_EVENTS_EVENT, handleEarthEvents);
  }

  return {
    getLastItem: () => (lastItem ? { ...lastItem, facts: lastItem.facts.map((f) => ({ ...f })) } : null),
    getContext,
    getListenerCount: () => listeners.length,
    destroy() {
      for (const [eventName, listener] of listeners) eventTarget.removeEventListener(eventName, listener);
      listeners.length = 0;
      lastItem = null;
      context = { target: null, scene_id: null, scene_item: null };
      promptedIds.clear();
    }
  };
}
