// TEST-ONLY(GECICI): Ertugrul / gercek UI birlestirmesinde kesinlikle kaldirilacak
// Gemini/UI hazır olmadan karşılaştırma sahnesini elle denemek için container içine iki buton koyar.
import { SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';

const REQUEST_EVENT = 'ag:planet-comparison';
const STATUS_EVENT = 'ag:planet-comparison-status';
const MIN_TEST_MASS_KG = 40;
const MAX_TEST_MASS_KG = 100;

function getRandomBodyPair() {
  const ids = SOLAR_SYSTEM_BODIES.map((cfg) => cfg.id);
  const first = ids[Math.floor(Math.random() * ids.length)];
  const rest = ids.filter((id) => id !== first);
  return [first, rest[Math.floor(Math.random() * rest.length)]];
}

function createTestButton(doc, label) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'planet-comparison-test-button';
  button.textContent = label;
  Object.assign(button.style, {
    font: '12px system-ui, sans-serif', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
    border: '1px solid #38bdf8', background: 'rgba(8, 20, 36, 0.85)', color: '#e0f2fe',
  });
  return button;
}

function handleRequestDispatch(eventTarget, detail) {
  if (typeof eventTarget.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    eventTarget.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail }));
  }
}

/**
 * TEST-ONLY(GECICI): Ertugrul / gercek UI birlestirmesinde kesinlikle kaldirilacak
 * Test çubuğunu kurar; dönen fonksiyon DOM'u ve tüm dinleyicileri temizler.
 */
export function createComparisonTestBar(container, eventTarget) {
  const doc = container?.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElement !== 'function' || typeof container.appendChild !== 'function') {
    return () => {};
  }

  const bar = doc.createElement('div');
  bar.className = 'planet-comparison-test-bar';
  Object.assign(bar.style, {
    position: 'absolute', top: '12px', left: '12px', zIndex: '10', display: 'flex', flexWrap: 'wrap',
    gap: '8px', alignItems: 'center', maxWidth: 'calc(100% - 24px)',
  });
  const compareButton = createTestButton(doc, 'Rastgele 2 Gezegen Karşılaştır');
  const gravityButton = createTestButton(doc, 'Rastgele Astronot Yerçekimi Testi');
  const label = doc.createElement('span');
  label.className = 'planet-comparison-test-label';
  Object.assign(label.style, {
    font: '12px ui-monospace, monospace', color: '#fde68a', background: 'rgba(0, 0, 0, 0.6)',
    padding: '4px 8px', borderRadius: '4px',
  });
  bar.appendChild(compareButton);
  bar.appendChild(gravityButton);
  bar.appendChild(label);
  container.appendChild(bar);

  const handleCompareClick = () => {
    const [primary_object, secondary_object] = getRandomBodyPair();
    label.textContent = `TEST: ${primary_object} vs ${secondary_object}`;
    handleRequestDispatch(eventTarget, { primary_object, secondary_object });
  };
  const handleGravityClick = () => {
    const [primary_object, secondary_object] = getRandomBodyPair();
    const mass_kg = Math.round(MIN_TEST_MASS_KG + Math.random() * (MAX_TEST_MASS_KG - MIN_TEST_MASS_KG));
    label.textContent = `TEST: ${mass_kg} kg | ${primary_object} vs ${secondary_object}`;
    handleRequestDispatch(eventTarget, { primary_object, secondary_object, mass_kg, is_gravity_test: true });
  };
  // Hesap sonucu (ağırlık, düşme süresi) etikete eklenir ki görsel fark sayıyla da kontrol edilebilsin
  const handleStatus = (event) => {
    const c = event?.detail;
    if (!c || c.primary_fall_time_s === undefined) return;
    const weights = c.mass_kg ? ` | ${c.primary_weight_kg} kg vs ${c.secondary_weight_kg} kg` : '';
    label.textContent = `TEST: ${c.mass_kg ?? '-'} kg | ${c.primary_object} ${c.primary_fall_time_s}s vs ${c.secondary_object} ${c.secondary_fall_time_s}s (${c.height_m} m)${weights}`;
  };

  compareButton.addEventListener('click', handleCompareClick);
  gravityButton.addEventListener('click', handleGravityClick);
  if (typeof eventTarget?.addEventListener === 'function') {
    eventTarget.addEventListener(STATUS_EVENT, handleStatus);
  }

  return function destroyComparisonTestBar() {
    compareButton.removeEventListener('click', handleCompareClick);
    gravityButton.removeEventListener('click', handleGravityClick);
    if (typeof eventTarget?.removeEventListener === 'function') {
      eventTarget.removeEventListener(STATUS_EVENT, handleStatus);
    }
    bar.remove();
  };
}
