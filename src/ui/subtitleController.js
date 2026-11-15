// AI konuşma metnini filmlerdeki gibi şeffaf altyazı olarak gösterir (panel yok, sahne görünür kalır).
// Süre okuma hızına göre belirlenir; yeni metin eskisini hemen değiştirir. Link/dosya adı asla gösterilmez.

import { removeLinksAndFiles } from "../services/speechTextCleaner.js";

const MIN_VISIBLE_MS = 4000;
const MAX_VISIBLE_MS = 16000;
const READ_MS_PER_CHAR = 75;
const LEAD_MS = 1200;

/**
 * Metnin ekranda kalacağı süre (ms): okuma hızı + başlangıç payı, alt ve üst sınırlı (saf).
 */
export function calculateSubtitleDuration_ms(text) {
  const length = typeof text === "string" ? text.length : 0;
  return Math.min(MAX_VISIBLE_MS, Math.max(MIN_VISIBLE_MS, LEAD_MS + length * READ_MS_PER_CHAR));
}

/**
 * element: altyazı kutusu (#subtitle-bar). Öğe yoksa her çağrı sessizce yok sayılır.
 */
export function createSubtitleController(element, env = globalThis) {
  if (!element) return { show() {}, hide() {}, destroy() {} };
  let timer = null;

  function hide() {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
    element.classList.remove("is-visible");
    element.classList.add("is-hidden");
    element.textContent = "";
  }

  function show(rawText) {
    const text = removeLinksAndFiles(rawText);
    if (!text) {
      hide();
      return;
    }
    if (timer !== null) env.clearTimeout(timer);
    element.textContent = text;
    element.classList.remove("is-hidden");
    element.classList.add("is-visible");
    timer = env.setTimeout(hide, calculateSubtitleDuration_ms(text));
  }

  return { show, hide, destroy: hide };
}
