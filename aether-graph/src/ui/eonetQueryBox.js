// Doğal dil sorgu kutusu (EONET tarzı): index.html'deki form'a bağlanır, örnek soruları döndürür,
// gönderim sürerken kutuyu meşgul gösterir. Ses tanıma aynı input'u kullandığı için form markup'ta durur.

const EXAMPLE_ROTATE_MS = 4200;

/**
 * form: #command-form, statusEl: #query-status, onSubmit(text) → Promise | değer
 */
export function bindQueryBox(form, statusEl, texts, onSubmit) {
  const input = form?.querySelector?.(".eonet-query-input");
  if (!form || !input) return { destroy() {} };

  const examples = Array.isArray(texts?.query_examples) ? texts.query_examples : [];
  input.placeholder = texts?.query_placeholder || "";
  input.setAttribute("aria-label", texts?.query_placeholder || "");
  form.querySelector(".eonet-query-submit")?.setAttribute("aria-label", texts?.query_submit_label || "");

  // Boş kutuda örnek sorular sırayla gösterilir ki kullanıcı ne sorabileceğini görsün
  let exampleIndex = 0;
  const rotateTimer = setInterval(() => {
    if (examples.length === 0 || document.activeElement === input || input.value) return;
    exampleIndex = (exampleIndex + 1) % examples.length;
    input.placeholder = `"${examples[exampleIndex]}"`;
  }, EXAMPLE_ROTATE_MS);

  let isBusy = false;
  async function handleSubmit(event) {
    event.preventDefault();
    // Boş gönderimde ekrandaki örnek soru sorulur
    const text = input.value.trim() || examples[exampleIndex] || "";
    if (!text || isBusy) return;
    isBusy = true;
    form.classList.add("eonet-query-busy");
    if (statusEl) statusEl.textContent = texts?.loading_text || "";
    try {
      await onSubmit(text);
    } catch (err) {
      console.warn("Sorgu işlenemedi:", err);
    } finally {
      isBusy = false;
      form.classList.remove("eonet-query-busy");
      if (statusEl) statusEl.textContent = "";
    }
  }
  form.addEventListener("submit", handleSubmit);

  return {
    destroy() {
      clearInterval(rotateTimer);
      form.removeEventListener("submit", handleSubmit);
    },
  };
}
