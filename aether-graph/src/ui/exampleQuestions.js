// Kullanıcının o an baktığı hedefe ve sahneye göre sağ panelde gösterilecek örnek soruları seçer.

const DEFAULT_LIMIT = 4;

/**
 * Bağlama göre örnek soru listesi üretir. Öncelik: bakılan hedef, sonra sahne, sonra genel liste.
 * Sepette zaten olan konunun "ödevime ekle" sorusu tekrar önerilmez.
 */
export function createExampleQuestions(context, machine, options = {}) {
  if (!machine) return [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const target = typeof context?.target === "string" ? context.target : null;
  const sceneId = typeof context?.scene_id === "string" ? context.scene_id : null;
  const keys = [target, sceneId].filter(Boolean);
  const hasSpecific = keys.some((key) => machine.getExampleQuestions(key).length > 0);
  if (!hasSpecific) keys.push("DEFAULT");

  const isAlreadyInBasket = (question) => /ödev/i.test(question) && Boolean(context?.scene_item && machine.hasHomeworkItem(context.scene_item.id));
  const seen = new Set();
  const questions = [];
  for (const key of keys) {
    for (const question of machine.getExampleQuestions(key)) {
      if (seen.has(question) || isAlreadyInBasket(question)) continue;
      seen.add(question);
      questions.push(question);
      if (questions.length >= limit) return questions;
    }
  }
  return questions;
}
