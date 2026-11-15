// Sahnenin globalThis olay dinleyicilerini tek yerden bağlar; destroy'da biri unutulup sızmasın diye.

/**
 * `{ 'ag:olay': handler }` tablosunu globalThis'e bağlar, kaldırma fonksiyonunu içeren nesneyi döner.
 */
export function createGlobalEventBindings(listeners) {
  const entries = Object.entries(listeners);
  if (typeof globalThis.addEventListener === 'function') {
    entries.forEach(([type, handler]) => globalThis.addEventListener(type, handler));
  }

  function destroyGlobalEventBindings() {
    if (typeof globalThis.removeEventListener === 'function') {
      entries.forEach(([type, handler]) => globalThis.removeEventListener(type, handler));
    }
  }

  return { destroyGlobalEventBindings };
}
