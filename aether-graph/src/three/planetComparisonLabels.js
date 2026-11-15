// Cisimlerin altındaki bilgi etiketleri: hangi taraf hangi gezegen, yerçekimi, düşme süresi, anlık yükseklik.
// Etiketler container içindeki kendi katmanında yaşar; 3D konum her karede ekrana izdüşürülür.
import { getSurfacePalette } from './planetComparisonConfig.js';

const SMALL_ACCENT_HEX = 0xfbbf24;
const DISTANCE_LINE_HEX = 0x38bdf8;
const LABEL_GAP_PER_CAMERA_DISTANCE = 0.025;
const SURFACE_LABEL_Y_UNITS = -1.8;

function formatRatio(value) {
  return Number(value.toPrecision(3));
}

function formatDistanceKm(distance_km) {
  if (distance_km >= 1e9) return `${(distance_km / 1e9).toFixed(2)} milyar km`;
  if (distance_km >= 1e6) return `${(distance_km / 1e6).toFixed(1)} milyon km`;
  return `${Math.round(distance_km).toLocaleString('tr-TR')} km`;
}

function toCssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * Yan yana görünümün etiketleri: ad, yarıçap ve diğer cisme göre büyüklük.
 */
export function buildBodyLabelEntries(layout, comparison) {
  const gap_units = layout.camera_distance_units * LABEL_GAP_PER_CAMERA_DISTANCE;
  const ratio = comparison.radius_ratio;
  const createEntry = (key, slot, radius_km, relative, otherId) => ({
    key,
    position_units: [slot.x_units, -slot.model_radius_units - gap_units, 0],
    lines: [slot.body_id, `${Math.round(radius_km)} km`, `${formatRatio(relative)}× ${otherId}`],
    accent_hex: slot.has_marker ? SMALL_ACCENT_HEX : getSurfacePalette(slot.body_id).ground_hex,
  });
  const entries = [
    createEntry('PRIMARY', layout.primary, comparison.primary_radius_km, ratio, comparison.secondary_object),
    createEntry('SECONDARY', layout.secondary, comparison.secondary_radius_km, 1 / ratio, comparison.primary_object),
  ];
  if (layout?.distance_line && comparison?.distance_km > 0) {
    entries.push({
      key: 'DISTANCE',
      position_units: [layout.distance_line.mid_x_units, 0.25, 0],
      lines: ['MESAFE', formatDistanceKm(comparison.distance_km)],
      accent_hex: DISTANCE_LINE_HEX,
    });
  }
  return entries;
}

/**
 * Yüzey sahnesinin etiketleri: platformun altında gezegen adı, g, düşme süresi, (varsa) ağırlık ve anlık yükseklik.
 */
export function buildSurfaceLabelEntries(sides, comparison, state) {
  return sides.map((side) => {
    const prefix = side.key === 'PRIMARY' ? 'primary' : 'secondary';
    // Etiket pencere altında kesilmesin diye 3 satıra sıkıştırılır
    const height = `h ${state[`${prefix}_height_m`].toFixed(1)} m`;
    const weight = typeof comparison.mass_kg === 'number'
      ? `${comparison.mass_kg} kg → ${comparison[`${prefix}_weight_kg`]} kg  ·  `
      : '';
    const lines = [
      side.body_id,
      `g ${comparison[`${prefix}_gravity_ms2`].toFixed(2)} m/s²  ·  ${comparison[`${prefix}_fall_time_s`].toFixed(2)} s`,
      `${weight}${height}`,
    ];
    return {
      key: side.key,
      position_units: [side.x_units, SURFACE_LABEL_Y_UNITS, 0],
      lines,
      accent_hex: getSurfacePalette(side.body_id).ground_hex,
    };
  });
}

function createLabelElement(doc, entry) {
  const element = doc.createElement('div');
  element.className = 'planet-comparison-label';
  Object.assign(element.style, {
    position: 'absolute', left: '0', top: '0', textAlign: 'center', whiteSpace: 'nowrap',
    padding: '6px 12px', borderRadius: '8px', background: 'rgba(4, 10, 22, 0.72)', color: '#e2e8f0',
    font: '12px ui-monospace, monospace', borderTop: `3px solid ${toCssColor(entry.accent_hex)}`,
  });
  return element;
}

function handleLabelLines(doc, label, lines) {
  if (label.lineElements.length !== lines.length) {
    label.lineElements.forEach((line) => line.remove());
    label.lineElements = lines.map((_, index) => {
      const line = doc.createElement('div');
      Object.assign(line.style, index === 0 ? { font: '700 16px system-ui, sans-serif', letterSpacing: '0.08em' } : {});
      label.element.appendChild(line);
      return line;
    });
  }
  lines.forEach((text, index) => {
    if (label.lineElements[index].textContent !== text) label.lineElements[index].textContent = text;
  });
}

/**
 * Etiket katmanını kurar. Belge yoksa (testte) hiçbir şey yapmayan bir nesne döner.
 */
export function createComparisonLabels(THREE, container, camera) {
  const doc = container?.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElement !== 'function' || typeof container.appendChild !== 'function') {
    return { handleLabelsSet() {}, handleLabelsFrame() {}, handleLabelsOpacity() {}, destroyComparisonLabels() {} };
  }

  const layer = doc.createElement('div');
  layer.className = 'planet-comparison-label-layer';
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', opacity: '0' });
  container.appendChild(layer);

  const labels = new Map();
  const point = new THREE.Vector3();

  function handleLabelsSet(entries) {
    const keys = new Set(entries.map((entry) => entry.key));
    labels.forEach((label, key) => {
      if (keys.has(key)) return;
      label.element.remove();
      labels.delete(key);
    });
    entries.forEach((entry) => {
      let label = labels.get(entry.key);
      if (!label) {
        label = { element: createLabelElement(doc, entry), lineElements: [], entry };
        layer.appendChild(label.element);
        labels.set(entry.key, label);
      }
      label.entry = entry;
      handleLabelLines(doc, label, entry.lines);
    });
  }

  function handleLabelsFrame() {
    if (labels.size === 0) return;
    const width_px = container.clientWidth || 800;
    const height_px = container.clientHeight || 600;
    camera.updateMatrixWorld?.(true);
    labels.forEach(({ element, entry }) => {
      point.set(...entry.position_units).project(camera);
      const isVisible = point.z > -1 && point.z < 1;
      element.style.display = isVisible ? 'block' : 'none';
      if (!isVisible) return;
      const x_px = (point.x * 0.5 + 0.5) * width_px;
      const y_px = (-point.y * 0.5 + 0.5) * height_px;
      const yOffset = entry.key === 'DISTANCE' ? '-100%' : '0';
      element.style.transform = `translate(${x_px.toFixed(1)}px, ${y_px.toFixed(1)}px) translate(-50%, ${yOffset})`;
    });
  }

  function handleLabelsOpacity(opacity) {
    layer.style.opacity = String(Math.min(1, Math.max(0, opacity)));
  }

  function destroyComparisonLabels() {
    labels.clear();
    layer.remove();
  }

  return { handleLabelsSet, handleLabelsFrame, handleLabelsOpacity, destroyComparisonLabels };
}
