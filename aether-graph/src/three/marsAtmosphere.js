// Mars atmosfer görselleri: gezegen kenarındaki ince toz parıltısı, dalışta ekranı kaplayan pus
// ve krater koordinatlarına göre yerleştirilmiş yanıp sönen kırmızı alarm işaretleri.
import { calculateMarsSurfacePoint, MARS_SITES } from './marsCoordinates.js';
import { createMarsCraterBeaconsGroup } from './marsCraterBeacons.js';
import { MARS_SKY_COLOR_HEX } from './marsSurfaceEnvironment.js';

const ATMOSPHERE_SCALE = 1.045;
const SITE_MARKER_LIFT = 1.004;
const SITE_MARKER_COLOR_HEX = 0xffb27a;

const ATMOSPHERE_VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}`;

// Arka yüz kabuk: gezegen kenarının hemen dışında parlar, kabuğun dış çizgisinde sıfıra iner
// (sert halka görünmesin); MSAA'da dot > 1 olursa pow negatif tabanda NaN üretip bloom'da siyah kare
// oluşturacağı için vektörler normalize edilir ve taban [0, 1] aralığına kıstırılır
const ATMOSPHERE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float facing = clamp(abs(dot(normalize(vNormal), normalize(vViewDir))), 0.0, 1.0);
  float glow = smoothstep(0.0, 0.3, facing) * pow(clamp(1.0 - facing, 0.0, 1.0), 2.5) * uIntensity;
  gl_FragColor = vec4(uColor * glow, glow);
}`;

const HAZE_VERTEX_SHADER = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const HAZE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}`;

/**
 * Mars'ı saran toz atmosferi kabuğu (radius_units: gezegen yarıçapı).
 */
export function createMarsAtmosphereShell(threeLib, radius_units) {
  const material = new threeLib.ShaderMaterial({
    uniforms: {
      uColor: { value: new threeLib.Color(0xe08a55) },
      uIntensity: { value: 0.9 },
    },
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: threeLib.BackSide,
    blending: threeLib.AdditiveBlending,
  });
  const shell = new threeLib.Mesh(new threeLib.SphereGeometry(radius_units * ATMOSPHERE_SCALE, 64, 32), material);
  shell.name = 'MARS_ATMOSPHERE';
  return shell;
}

/**
 * Kameradan bağımsız tam ekran pus katmanı; her iki sahnede de aynı renk, geçiş dikişsiz görünür.
 */
export function createHazeOverlay(threeLib) {
  const uniforms = {
    uColor: { value: new threeLib.Color(MARS_SKY_COLOR_HEX) },
    uOpacity: { value: 0 },
  };
  const overlay = new threeLib.Mesh(
    new threeLib.PlaneGeometry(2, 2),
    new threeLib.ShaderMaterial({
      uniforms,
      vertexShader: HAZE_VERTEX_SHADER,
      fragmentShader: HAZE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  overlay.name = 'MARS_HAZE_OVERLAY';
  overlay.frustumCulled = false;
  overlay.renderOrder = 1000;
  overlay.visible = false;
  return {
    overlay,
    handleHazeOpacity(opacity) {
      const safe = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 0));
      uniforms.uOpacity.value = safe;
      overlay.visible = safe > 0.001;
    },
  };
}

/**
 * Perseverance (Jezero Crater), Curiosity (Gale Crater) ve Pathfinder (Ares Vallis) roverlarını
 * krater koordinatlarına göre Mars küresi üzerinde kırmızı alarm işaretleri ve krater etiketleriyle yerleştirir.
 */
export function createMarsRoverSiteAnchors(threeLib, radius_units, options = {}) {
  return createMarsCraterBeaconsGroup(threeLib, radius_units, options);
}

/**
 * MARS_SITES koordinat düğümü. Gezegen yüzeyinde kare piksel lekeleri görünmemesi için varsayılan olarak gizlidir.
 */
export function createMarsSiteMarkers(threeLib, radius_units) {
  const points = Object.values(MARS_SITES).map((site) => {
    const { position } = calculateMarsSurfacePoint(site.latitude_deg, site.longitude_deg, radius_units * SITE_MARKER_LIFT);
    return new threeLib.Vector3(position.x, position.y, position.z);
  });
  const markers = new threeLib.Points(
    new threeLib.BufferGeometry().setFromPoints(points),
    new threeLib.PointsMaterial({ color: SITE_MARKER_COLOR_HEX, size: 5, sizeAttenuation: false, depthWrite: false })
  );
  markers.name = 'MARS_SITE_MARKERS';
  markers.visible = false;
  return markers;
}

/**
 * Mars'ın tiltPivot'una eklenecek görseller: atmosfer kabuğu ve krater bazlı rover konum düğümleri.
 */
export function createMarsVisuals(threeLib, radius_units) {
  return [createMarsAtmosphereShell(threeLib, radius_units), createMarsRoverSiteAnchors(threeLib, radius_units)];
}
