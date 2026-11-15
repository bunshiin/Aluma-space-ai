// İzin verilen sahne şablonları ve UI aksiyon sabitleri (AGENTS.md Bölüm 4 Sözleşmesi)

export const VALID_TEMPLATE_IDS = Object.freeze([
  "LIGHT_DELAY",
  "GRAVITY_SIM",
  "NEO_SWARM",
  "SOLAR_FLARE",
  "APOLLO_11",
  "NONE",
]);

export const VALID_ACTION_TYPES = Object.freeze([
  "OPEN_POPUP",
  "SPLIT_SCREEN",
  "OPEN_SIDE_PANEL",
  "CLOSE_PANEL",
  "EXPAND_HUD",
  "MINIMIZE_HUD",
  "FOCUS_OBJECT",
  "PAN_TO",
  "RESET_VIEW",
  "HIGHLIGHT_OBJECT",
  "SHOW_COMPARISON",
  "SHOW_TIMELINE",
  "SHOW_FACT_CARD",
  "PLAY_ANIMATION",
  "PAUSE_ANIMATION",
  "SIMPLIFY_TEXT",
  "ADD_TO_HOMEWORK",
  "SHOW_HOMEWORK_BASKET",
  "EXPORT_PDF",
]);

export const DEFAULT_FALLBACK_SPEECH =
  "Sinyal işlenirken geçici bir sorun oluştu, ana görünüme dönüldü.";

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
