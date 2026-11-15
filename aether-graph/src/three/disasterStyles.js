// Afet kategorisi → efekt türü ve renk. UI rozetleri de aynı rengi buradan alır (tek kaynak)

const DISASTER_STYLES = Object.freeze({
  volcanoes: { kind: "VOLCANO", color_hex: "#ff5a1f" },
  wildfires: { kind: "WILDFIRE", color_hex: "#ff9f1c" },
  severeStorms: { kind: "STORM", color_hex: "#7dd3fc" },
  earthquakes: { kind: "QUAKE", color_hex: "#f43f5e" },
  floods: { kind: "FLOOD", color_hex: "#38bdf8" },
  seaLakeIce: { kind: "ICE", color_hex: "#a5f3fc" },
  snow: { kind: "SNOW", color_hex: "#e0f2fe" },
  dustHaze: { kind: "HAZE", color_hex: "#d6a35c" },
  drought: { kind: "HAZE", color_hex: "#f59e0b" },
  tempExtremes: { kind: "HAZE", color_hex: "#ef4444" },
  landslides: { kind: "QUAKE", color_hex: "#c2884d" },
  waterColor: { kind: "FLOOD", color_hex: "#2dd4bf" },
  manmade: { kind: "HAZE", color_hex: "#c084fc" },
});

const DEFAULT_STYLE = DISASTER_STYLES.manmade;

export function getDisasterStyle(category) {
  return DISASTER_STYLES[category] || DEFAULT_STYLE;
}

export function getCategoryColorHex(category) {
  return getDisasterStyle(category).color_hex;
}
