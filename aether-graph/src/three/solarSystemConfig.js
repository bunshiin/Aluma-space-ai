// Güneş Sistemi 3D sahnesi için kamera hedefleri, yörünge sabitleri ve birim dönüşümleri
import { resolveSpacecraftAlias, SPACECRAFT_BODIES, SPACECRAFT_CAMERA_TARGETS } from './spacecraftTracker.js';

const AU_IN_KM = 149597870;
const SCENE_UNITS_PER_AU = 30;
const DEG_TO_RAD = Math.PI / 180;

// Tablodaki yörünge ve dönüş hızları (deg/s) bu çarpanla yavaşlatılır; gezegenler izlenebilir hızda
// kalsın diye tek yerde tutulur, tabloyu satır satır değiştirmek yerine
export const BODY_MOTION_SCALE = 0.06;

/**
 * Kilometre cinsinden fiziksel mesafeyi Three.js sahne birimine çevirir.
 * Ölçek çarpanı yalnızca bu fonksiyonda tanımlanır.
 */
export function calculateSceneUnitsFromKm(distance_km) {
  if (typeof distance_km !== 'number' || Number.isNaN(distance_km) || distance_km <= 0) {
    return 0;
  }
  return (distance_km / AU_IN_KM) * SCENE_UNITS_PER_AU;
}

/**
 * Derece cinsinden açıyı Three.js sınırında radyana çevirir.
 */
export function calculateRadFromDeg(angle_deg) {
  if (typeof angle_deg !== 'number' || Number.isNaN(angle_deg)) {
    return 0;
  }
  return angle_deg * DEG_TO_RAD;
}

/**
 * Tüm geçerli kamera hedefleri (UPPER_SNAKE).
 * Bilinmeyen hedef geldiğinde varsayılan olarak SOLAR_SYSTEM_OVERVIEW kullanılır.
 */
export const CAMERA_TARGETS = {
  SOLAR_SYSTEM_OVERVIEW: { id: 'SOLAR_SYSTEM_OVERVIEW', position_units: [0, 85, 165], look_at_units: [0, 0, 0], camera_distance_units: 185 },
  SUN: { id: 'SUN', body_id: 'SUN', camera_distance_units: 18 },
  MERCURY: { id: 'MERCURY', body_id: 'MERCURY', camera_distance_units: 3.2 },
  VENUS: { id: 'VENUS', body_id: 'VENUS', camera_distance_units: 4.5 },
  EARTH: { id: 'EARTH', body_id: 'EARTH', camera_distance_units: 5.0 },
  MOON: { id: 'MOON', body_id: 'MOON', camera_distance_units: 1.8 },
  MARS: { id: 'MARS', body_id: 'MARS', camera_distance_units: 4.0 },
  CERES: { id: 'CERES', body_id: 'CERES', camera_distance_units: 2.2 },
  JUPITER: { id: 'JUPITER', body_id: 'JUPITER', camera_distance_units: 11.5 },
  IO: { id: 'IO', body_id: 'IO', camera_distance_units: 1.6 },
  EUROPA: { id: 'EUROPA', body_id: 'EUROPA', camera_distance_units: 1.6 },
  GANYMEDE: { id: 'GANYMEDE', body_id: 'GANYMEDE', camera_distance_units: 2.0 },
  CALLISTO: { id: 'CALLISTO', body_id: 'CALLISTO', camera_distance_units: 2.0 },
  SATURN: { id: 'SATURN', body_id: 'SATURN', camera_distance_units: 12.5 },
  TITAN: { id: 'TITAN', body_id: 'TITAN', camera_distance_units: 2.0 },
  URANUS: { id: 'URANUS', body_id: 'URANUS', camera_distance_units: 7.0 },
  NEPTUNE: { id: 'NEPTUNE', body_id: 'NEPTUNE', camera_distance_units: 7.0 },
  TRITON: { id: 'TRITON', body_id: 'TRITON', camera_distance_units: 1.8 },
  PLUTO: { id: 'PLUTO', body_id: 'PLUTO', camera_distance_units: 2.2 },
  HAUMEA: { id: 'HAUMEA', body_id: 'HAUMEA', camera_distance_units: 2.2 },
  MAKEMAKE: { id: 'MAKEMAKE', body_id: 'MAKEMAKE', camera_distance_units: 2.2 },
  ERIS: { id: 'ERIS', body_id: 'ERIS', camera_distance_units: 2.2 },
  // Yüzey hedefleri: Mars'a odaklanır ve atmosferden ilgili kraterdeki rover sahnesine dalar
  PERSEVERANCE: { id: 'PERSEVERANCE', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'JEZERO' },
  JEZERO: { id: 'JEZERO', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'JEZERO' },
  JEZERO_CRATER: { id: 'JEZERO_CRATER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'JEZERO' },
  INGENUITY: { id: 'INGENUITY', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'INGENUITY' },
  MARS_HELICOPTER: { id: 'MARS_HELICOPTER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'INGENUITY' },
  HELICOPTER: { id: 'HELICOPTER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'INGENUITY' },
  CURIOSITY: { id: 'CURIOSITY', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'GALE' },
  GALE: { id: 'GALE', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'GALE' },
  GALE_CRATER: { id: 'GALE_CRATER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'GALE' },
  PATHFINDER: { id: 'PATHFINDER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'ARES_VALLIS' },
  ARES_VALLIS: { id: 'ARES_VALLIS', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'ARES_VALLIS' },
  SOJOURNER: { id: 'SOJOURNER', body_id: 'MARS', camera_distance_units: 4.0, surface_site_id: 'ARES_VALLIS' },
  // Ay yüzeyi hedefleri: Ay'a odaklanır ve yörüngeden Mare Tranquillitatis'teki Apollo 11 Ay Modülü sahnesine dalar
  APOLLO_LUNAR_MODULE: { id: 'APOLLO_LUNAR_MODULE', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  LUNAR_MODULE: { id: 'APOLLO_LUNAR_MODULE', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  AY_MODULU: { id: 'APOLLO_LUNAR_MODULE', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  EAGLE: { id: 'APOLLO_LUNAR_MODULE', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  TRANQUILITY_BASE: { id: 'TRANQUILITY_BASE', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  MARE_TRANQUILLITATIS: { id: 'MARE_TRANQUILLITATIS', body_id: 'MOON', camera_distance_units: 1.8, lunar_site_id: 'TRANQUILITY_BASE' },
  ...SPACECRAFT_CAMERA_TARGETS,
};

// Bilinmeyen camera_target gelirse hata fırlatmaz, varsayılan ana görünüme döner.
export function getCameraTarget(targetName) {
  const resolvedName = resolveSpacecraftAlias(targetName);
  if (typeof resolvedName === 'string' && Object.hasOwn(CAMERA_TARGETS, resolvedName)) {
    return CAMERA_TARGETS[resolvedName];
  }
  return CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW;
}

// docs/models.md içindeki Box3 ölçümlerine göre çarpışmasız yörünge ve ölçek tablosu.
export const SOLAR_SYSTEM_BODIES = [
  {
    id: 'SUN',
    model_url: '/public/models/sun.glb',
    target_radius_units: 6.5,
    orbit_radius_units: 0,
    orbit_speed_deg_s: 0,
    rotation_speed_deg_s: 2.5,
    axial_tilt_deg: 7.25,
    parent_id: null,
  },
  {
    id: 'MERCURY',
    model_url: '/public/models/mercury.glb',
    target_radius_units: 0.65,
    orbit_radius_units: 12,
    orbit_speed_deg_s: 8.5,
    rotation_speed_deg_s: 8.0,
    axial_tilt_deg: 0.03,
    parent_id: 'SUN',
  },
  {
    id: 'VENUS',
    model_url: '/public/models/venus.glb',
    target_radius_units: 1.05,
    orbit_radius_units: 18,
    orbit_speed_deg_s: 6.2,
    rotation_speed_deg_s: -4.0,
    axial_tilt_deg: 177.3,
    parent_id: 'SUN',
  },
  {
    id: 'EARTH',
    model_url: '/public/models/earth.glb',
    target_radius_units: 1.15,
    orbit_radius_units: 26,
    orbit_speed_deg_s: 4.8,
    rotation_speed_deg_s: 36.0,
    axial_tilt_deg: 23.4,
    parent_id: 'SUN',
  },
  {
    id: 'MOON',
    model_url: '/public/models/moon.glb',
    target_radius_units: 0.32,
    orbit_radius_units: 2.6,
    orbit_speed_deg_s: 26.0,
    rotation_speed_deg_s: 24.0,
    axial_tilt_deg: 6.7,
    parent_id: 'EARTH',
  },
  {
    id: 'MARS',
    model_url: '/public/models/mars.glb',
    target_radius_units: 0.85,
    orbit_radius_units: 35,
    orbit_speed_deg_s: 3.6,
    rotation_speed_deg_s: 34.0,
    axial_tilt_deg: 25.2,
    parent_id: 'SUN',
  },
  {
    id: 'CERES',
    model_url: '/public/models/ceres.glb',
    target_radius_units: 0.35,
    orbit_radius_units: 43,
    orbit_speed_deg_s: 2.8,
    rotation_speed_deg_s: 44.0,
    axial_tilt_deg: 4.0,
    parent_id: 'SUN',
  },
  {
    id: 'JUPITER',
    model_url: '/public/models/jupiter.glb',
    target_radius_units: 3.1,
    orbit_radius_units: 54,
    orbit_speed_deg_s: 2.0,
    rotation_speed_deg_s: 60.0,
    axial_tilt_deg: 3.1,
    parent_id: 'SUN',
  },
  {
    id: 'IO',
    model_url: '/public/models/io.glb',
    target_radius_units: 0.28,
    orbit_radius_units: 4.6,
    orbit_speed_deg_s: 32.0,
    rotation_speed_deg_s: 30.0,
    axial_tilt_deg: 0,
    parent_id: 'JUPITER',
  },
  {
    id: 'EUROPA',
    model_url: '/public/models/europa.glb',
    target_radius_units: 0.26,
    orbit_radius_units: 5.6,
    orbit_speed_deg_s: 24.0,
    rotation_speed_deg_s: 24.0,
    axial_tilt_deg: 0.1,
    parent_id: 'JUPITER',
  },
  {
    id: 'GANYMEDE',
    model_url: '/public/models/ganymede.glb',
    target_radius_units: 0.38,
    orbit_radius_units: 6.8,
    orbit_speed_deg_s: 18.0,
    rotation_speed_deg_s: 20.0,
    axial_tilt_deg: 0.2,
    parent_id: 'JUPITER',
  },
  {
    id: 'CALLISTO',
    model_url: '/public/models/callisto.glb',
    target_radius_units: 0.35,
    orbit_radius_units: 8.1,
    orbit_speed_deg_s: 12.0,
    rotation_speed_deg_s: 16.0,
    axial_tilt_deg: 0.2,
    parent_id: 'JUPITER',
  },
  {
    id: 'SATURN',
    model_url: '/public/models/saturn.glb',
    target_radius_units: 5.4,
    orbit_radius_units: 74,
    orbit_speed_deg_s: 1.4,
    rotation_speed_deg_s: 52.0,
    axial_tilt_deg: 26.7,
    parent_id: 'SUN',
  },
  {
    id: 'TITAN',
    model_url: '/public/models/titan.glb',
    target_radius_units: 0.38,
    orbit_radius_units: 7.2,
    orbit_speed_deg_s: 16.0,
    rotation_speed_deg_s: 20.0,
    axial_tilt_deg: 0.3,
    parent_id: 'SATURN',
  },
  {
    id: 'URANUS',
    model_url: '/public/models/uranus.glb',
    target_radius_units: 1.75,
    orbit_radius_units: 94,
    orbit_speed_deg_s: 0.9,
    rotation_speed_deg_s: -40.0,
    axial_tilt_deg: 97.8,
    parent_id: 'SUN',
  },
  {
    id: 'NEPTUNE',
    model_url: '/public/models/neptune.glb',
    target_radius_units: 1.7,
    orbit_radius_units: 110,
    orbit_speed_deg_s: 0.65,
    rotation_speed_deg_s: 42.0,
    axial_tilt_deg: 28.3,
    parent_id: 'SUN',
  },
  {
    id: 'TRITON',
    model_url: '/public/models/triton.glb',
    target_radius_units: 0.3,
    orbit_radius_units: 3.2,
    orbit_speed_deg_s: -20.0,
    rotation_speed_deg_s: 20.0,
    axial_tilt_deg: 156.8,
    parent_id: 'NEPTUNE',
  },
  {
    id: 'PLUTO',
    model_url: '/public/models/pluto.glb',
    target_radius_units: 0.35,
    orbit_radius_units: 124,
    orbit_speed_deg_s: 0.45,
    rotation_speed_deg_s: 16.0,
    axial_tilt_deg: 122.5,
    parent_id: 'SUN',
  },
  {
    id: 'HAUMEA',
    model_url: '/public/models/haumea.glb',
    target_radius_units: 0.34,
    orbit_radius_units: 134,
    orbit_speed_deg_s: 0.4,
    rotation_speed_deg_s: 70.0,
    axial_tilt_deg: 28.0,
    parent_id: 'SUN',
  },
  {
    id: 'MAKEMAKE',
    model_url: '/public/models/makemake.glb',
    target_radius_units: 0.33,
    orbit_radius_units: 144,
    orbit_speed_deg_s: 0.35,
    rotation_speed_deg_s: 28.0,
    axial_tilt_deg: 29.0,
    parent_id: 'SUN',
  },
  {
    id: 'ERIS',
    model_url: '/public/models/eris.glb',
    target_radius_units: 0.35,
    orbit_radius_units: 154,
    orbit_speed_deg_s: 0.3,
    rotation_speed_deg_s: 22.0,
    axial_tilt_deg: 78.0,
    parent_id: 'SUN',
  },
  ...SPACECRAFT_BODIES,
];
