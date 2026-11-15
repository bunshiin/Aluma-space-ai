// EONET olay listesinden kullanıcının sorduğu olayı seçer (saf fonksiyonlar).
// Kural: soruya uyan olay yoksa HİÇBİR olay seçilmez; küre rastgele bir yeri afet varmış gibi işaretlemez.
// Seçimi önce Gemini yapar (aday listesi + "NONE" seçeneği), Gemini yoksa yerel seçici çalışır.

const MAX_ROUTE_EVENTS = 12;
const MAX_GEMINI_CANDIDATES = 20;
const MIN_TOKEN_LENGTH = 4;
const ACTIVE_HINTS = ["aktif", "su an", "suan", "devam eden", "suren", "guncel", "simdi"];
export const NO_EVENT_MATCH_ID = "NONE";

// Türkçe yer adı → EONET başlıklarındaki (İngilizce) karşılıkları. Kök eşleşir: "türkiye'de" → "turkiye"
const PLACE_ALIASES = Object.freeze({
  turkiye: ["turkey", "turkiye"], endonezya: ["indonesia"], japonya: ["japan"], italya: ["italy"], sicilya: ["sicily"],
  yunanistan: ["greece"], kibris: ["cyprus"], sili: ["chile"], meksika: ["mexico"], amerika: ["united states", "usa", "u.s."],
  abd: ["united states", "usa", "u.s."], kaliforniya: ["california"], teksas: ["texas"], florida: ["florida"], alaska: ["alaska"],
  havai: ["hawaii"], kanada: ["canada"], avustralya: ["australia"], izlanda: ["iceland"], filipin: ["philippines"],
  hindistan: ["india"], cin: ["china"], rusya: ["russia"], kamcatka: ["kamchatka"], brezilya: ["brazil"], arjantin: ["argentina"],
  peru: ["peru"], ekvador: ["ecuador"], kolombiya: ["colombia"], guatemala: ["guatemala"], nikaragua: ["nicaragua"],
  "yeni zelanda": ["new zealand"], ispanya: ["spain"], fransa: ["france"], almanya: ["germany"], portekiz: ["portugal"],
  kongo: ["congo"], etiyopya: ["ethiopia"], papua: ["papua"], afrika: ["africa"], avrupa: ["europe"], antarktika: ["antarctica"],
  gronland: ["greenland"], pakistan: ["pakistan"], iran: ["iran"], irak: ["iraq"], suriye: ["syria"], misir: ["egypt"],
});

// Türkçe karakterler başlıklarla (İngilizce) karşılaştırma için sadeleştirilir
function foldText(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

function getTokens(foldedText) {
  return foldedText.split(/[^a-z0-9]+/).filter((w) => w.length >= MIN_TOKEN_LENGTH);
}

// Sorudaki bilinen yer adları; her biri için başlıkta aranacak İngilizce karşılıklar
function getMentionedPlaces(foldedPrompt) {
  return Object.entries(PLACE_ALIASES)
    .filter(([stem]) => new RegExp(`(^|[^a-z0-9])${stem}`).test(foldedPrompt))
    .map(([, names]) => names);
}

/**
 * Soruya uyan olayı seçer; soruda bilinen bir yer adı geçip hiçbir olaya uymuyorsa null döner.
 * Yer/isim belirtilmemiş genel sorularda ("en son volkan") en güncel olay seçilir.
 */
export function selectFocusEvent(events, promptText) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const folded = foldText(promptText);
  // "şu an aktif" sorusunda sona ermiş olay gösterilmez (açık olay varsa)
  const wantsActive = ACTIVE_HINTS.some((hint) => folded.includes(hint));
  const openEvents = events.filter((e) => e?.status === "OPEN");
  const pool = wantsActive && openEvents.length > 0 ? openEvents : events;

  const places = getMentionedPlaces(folded);
  if (places.length > 0) {
    const inPlace = pool.find((e) => {
      const haystack = foldText(`${e?.title || ""} ${e?.description || ""}`);
      return places.some((names) => names.some((name) => haystack.includes(name)));
    });
    return inPlace || null;
  }

  // Soru kelimesi başlıktaki bir kelimeyle başlıyorsa ("Etna'nın" → "etna") o olay seçilir
  const tokens = getTokens(folded);
  const named = pool.find((e) => {
    const titleWords = getTokens(foldText(`${e?.title || ""} ${e?.description || ""}`));
    return tokens.some((tok) => titleWords.some((w) => tok.startsWith(w)));
  });
  return named || pool[0];
}

/**
 * Gemini'ye aday olaylar, tüm telemetri verileri ve seçim kuralı verilir; konuşma metni ekranda seçilen olayla aynı olsun diye.
 */
export function createEarthEventContext(events, suggestedEvent) {
  const candidates = (Array.isArray(events) ? events : []).slice(0, MAX_GEMINI_CANDIDATES).map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    category_title: e.category_title || "",
    status: e.status,
    timestamp_utc: e.timestamp_utc,
    first_seen_utc: e.first_seen_utc || e.timestamp_utc || "",
    latitude_deg: e.coordinates?.latitude_deg,
    longitude_deg: e.coordinates?.longitude_deg,
    magnitude_value: e.magnitude_value ?? null,
    magnitude_unit: e.magnitude_unit || "",
    depth_km: e.depth_km ?? null,
    description: e.description || "",
    source_id: e.source_id || "",
    source_url: e.source_url || "",
    eonet_url: e.eonet_url || "",
    track_point_count: e.track_point_count || 1,
  }));
  return {
    source: "NASA EONET v3 & USGS Sismik Telemetri",
    total_candidate_count: candidates.length,
    candidates,
    suggested_focus_event_id: suggestedEvent?.id ?? NO_EVENT_MATCH_ID,
    selection_rule:
      "parameters.focus_event_id alanına kullanıcının sorduğu yer/isim/zamana GERÇEKTEN uyan adayın id'sini yaz. " +
      `Hiçbir aday uymuyorsa (ör. sorulan ülkede kayıt yoksa) focus_event_id: "${NO_EVENT_MATCH_ID}" yaz ve speech_text'te ` +
      "bu soruya uyan güncel bir kayıt bulunmadığını söyle; başka bir yerdeki olayı o yerdeymiş gibi anlatma. " +
      "EŞLEŞEN OLAY VARSA ZORUNLU VERİ KURALI: Seçilen olayın (veya 'depremlerin tüm verilerini al' gibi genel/çoğul sorularda listedeki depremlerin) TÜM verilerini " +
      "(büyüklük/şiddet magnitude_value ve magnitude_unit, derinlik depth_km, enlem latitude_deg ve boylam longitude_deg koordinatları, " +
      "gerçekleşme tarihi/saati timestamp_utc, merkez üssü/bölge, durum status ve kaynak source_id) speech_text, parameters.description ve parameters.facts içinde EKSİKSİZ aktar. " +
      "Deprem, sismograf veya deprem şiddeti sorularını ASLA reddetme ve ASLA 'sismograf verilerini veya deprem şiddetlerini takip edemem' deme.",
  };
}

/**
 * Gemini'nin seçimini doğrular: "NONE" → eşleşme yok, geçerli id → o olay, geçersiz/eksik → yerel seçim.
 */
export function resolveEarthEventChoice(events, geminiFocusId, localFocus) {
  if (geminiFocusId === NO_EVENT_MATCH_ID) return null;
  if (typeof geminiFocusId === "string" && geminiFocusId) {
    const chosen = (events || []).find((e) => e?.id === geminiFocusId);
    if (chosen) return chosen;
  }
  return localFocus ?? null;
}

/**
 * Odak olay varsa listeyi ve küre sahnesini rotaya ekler. Yoksa küre açılmaz, hiçbir yer işaretlenmez;
 * rota bilgi kartına döner ve konuşma metni boşsa noMatchText yazılır.
 */
export function attachEarthEventsToRoute(route, events, focusEvent, categoryId, noMatchText = "") {
  if (!route || !route.parameters || !Array.isArray(events)) return route;
  if (!focusEvent) {
    delete route.parameters.events;
    delete route.parameters.focus_event_id;
    // Eşleşme yoksa başka bir yerin görseliyle "genel bilgi" penceresi de açılmaz (yanıltıcı olur)
    delete route.parameters.is_general_question;
    delete route.parameters.image_query;
    if (route.parameters.model_url === "EARTH_EVENTS") delete route.parameters.model_url;
    route.parameters.event_category = categoryId || "all";
    route.template_id = "NONE";
    if (route.action_type === "FOCUS_OBJECT" || route.action_type === "RESET_VIEW") route.action_type = "SHOW_FACT_CARD";
    if (noMatchText && (route.parameters.data_source === "FALLBACK" || !route.speech_text)) {
      route.speech_text = noMatchText;
      route.tts_text = noMatchText;
    }
    return route;
  }
  const limited = events.slice(0, MAX_ROUTE_EVENTS);
  if (!limited.includes(focusEvent)) limited.unshift(focusEvent);

  route.parameters.events = limited;
  route.parameters.event_category = categoryId || "all";
  route.parameters.data_source = "NASA_EONET";
  route.parameters.focus_event_id = focusEvent.id;
  // Sözleşmede EARTH şablonu yok: şablon NONE kalır, sahne seçimi model_url ile yapılır
  route.template_id = "NONE";
  route.parameters.model_url = "EARTH_EVENTS";
  route.action_type = "FOCUS_OBJECT";
  return route;
}
