// Ingenuity Mars Helikopteri (ingenuity.glb): yalnızca kullanıcı çağırdığında yüklenir/görünür,
// Perseverance etrafında yavaşça uçar ve Perseverance mast kamerası (head) uçuş boyunca onu takip eder.
import { getSanitizedNode } from './solarSystemBuilder.js';

export const INGENUITY_MODEL_URL = '/public/models/ingenuity.glb';

const HELICOPTER_ALIASES = new Set([
  'INGENUITY',
  'MARS_HELICOPTER',
  'HELICOPTER',
  'INGENUITY_MARS_HELICOPTER',
  'GINNY',
]);

const ROTOR_UPPER_NAME = 'rotors_01';
const ROTOR_LOWER_NAME = 'rotors_02';

// Perseverance gövdesi (~1.5 m yarıçap) ile çarpışmaması ve varsayılan kadrajda kalması için ölçülmüş yörünge
export const HELICOPTER_ORBIT_RADIUS_M = 3.2;
export const HELICOPTER_CRUISE_ALTITUDE_M = 2.25;
const HELICOPTER_GROUND_CLEARANCE_M = 0.18;
const HELICOPTER_BOB_AMP_M = 0.16;
const HELICOPTER_ORBIT_SPEED_RAD_S = 0.42;
const HELICOPTER_TAKEOFF_DURATION_S = 2.4;
const ROTOR_SPIN_SPEED_RAD_S = 42;

// Perseverance Mastcam-Z (head) düğümünün model uzayındaki konumu (docs/models.md)
const MAST_HEAD_OFFSET_X_M = -0.522;
const MAST_HEAD_HEIGHT_M = 1.922;
const MAST_HEAD_OFFSET_Z_M = 0.713;
const MAX_TILT_UP_RAD = -0.75;
const MAX_TILT_DOWN_RAD = 0.55;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Hedef kimliğinin Ingenuity Mars helikopteri çağrısı olup olmadığını döner.
 */
export function isMarsHelicopterRequest(targetOrSiteId) {
  if (typeof targetOrSiteId !== 'string' || !targetOrSiteId.trim()) {
    return false;
  }
  const normalized = targetOrSiteId.trim().toUpperCase().replace(/\s+/g, '_');
  return HELICOPTER_ALIASES.has(normalized);
}

/**
 * Açıyı (-PI, PI] aralığına sarar; kamera pan dönüşünün 180° geçişinde sıçramasını önler.
 */
export function calculateWrappedAngleRad(angle_rad) {
  if (typeof angle_rad !== 'number' || !Number.isFinite(angle_rad)) {
    return 0;
  }
  return Math.atan2(Math.sin(angle_rad), Math.cos(angle_rad));
}

/**
 * Helikopterin t_s anındaki Perseverance merkezli uçuş pozunu hesaplar.
 * İlk kalkış süresinde (2.4 sn) yerden yumuşakça yükselir, ardından dairesel yörüngede süzülür.
 */
export function calculateHelicopterFlightPose(roverPose, flight_t_s) {
  const safe_t_s = typeof flight_t_s === 'number' && Number.isFinite(flight_t_s) && flight_t_s >= 0 ? flight_t_s : 0;
  const rx_m = Number.isFinite(roverPose?.x_m) ? roverPose.x_m : 0;
  const rz_m = Number.isFinite(roverPose?.z_m) ? roverPose.z_m : 0;

  const takeoff_u = easeInOutCubic(clamp01(safe_t_s / HELICOPTER_TAKEOFF_DURATION_S));
  const orbit_angle_rad = safe_t_s * HELICOPTER_ORBIT_SPEED_RAD_S;

  const x_m = rx_m + Math.cos(orbit_angle_rad) * HELICOPTER_ORBIT_RADIUS_M;
  const z_m = rz_m + Math.sin(orbit_angle_rad) * HELICOPTER_ORBIT_RADIUS_M;
  const bob_m = Math.sin(safe_t_s * 2.1) * HELICOPTER_BOB_AMP_M;
  const y_m =
    HELICOPTER_GROUND_CLEARANCE_M +
    (HELICOPTER_CRUISE_ALTITUDE_M - HELICOPTER_GROUND_CLEARANCE_M + bob_m) * takeoff_u;

  // Teğet hız vektörü (-sin, cos) yönüne doğru baş açısı ve hafif ileri/içe yatış
  const vx = -Math.sin(orbit_angle_rad);
  const vz = Math.cos(orbit_angle_rad);
  const yaw_rad = Math.atan2(vx, vz);
  const pitch_rad = 0.085 * takeoff_u + 0.02 * Math.sin(safe_t_s * 2.8);
  const roll_rad = -0.065 * takeoff_u + 0.018 * Math.cos(safe_t_s * 2.3);
  const rotor_angle_rad = safe_t_s * ROTOR_SPIN_SPEED_RAD_S;

  return {
    x_m,
    y_m,
    z_m,
    yaw_rad,
    pitch_rad,
    roll_rad,
    rotor_angle_rad,
    orbit_angle_rad,
    takeoff_u,
  };
}

/**
 * Perseverance Mastcam-Z (head) kamerasının helikoptere bakması için gereken pan ve tilt açılarını (radyan) hesaplar.
 */
export function calculateMastTrackingAnglesRad(roverPose, heliPose) {
  const rx_m = Number.isFinite(roverPose?.x_m) ? roverPose.x_m : 0;
  const rz_m = Number.isFinite(roverPose?.z_m) ? roverPose.z_m : 0;
  const ryaw_rad = Number.isFinite(roverPose?.yaw_rad) ? roverPose.yaw_rad : 0;

  const hx_m = Number.isFinite(heliPose?.x_m) ? heliPose.x_m : rx_m;
  const hy_m = Number.isFinite(heliPose?.y_m) ? heliPose.y_m : MAST_HEAD_HEIGHT_M;
  const hz_m = Number.isFinite(heliPose?.z_m) ? heliPose.z_m : rz_m + 1;

  const dx_m = hx_m - rx_m;
  const dz_m = hz_m - rz_m;

  // Dünya fark vektörünü rover'ın kendi yerel çerçevesine (-yaw_rad) döndür
  const cosY = Math.cos(ryaw_rad);
  const sinY = Math.sin(ryaw_rad);
  const localX_m = dx_m * cosY - dz_m * sinY - MAST_HEAD_OFFSET_X_M;
  const localZ_m = dx_m * sinY + dz_m * cosY - MAST_HEAD_OFFSET_Z_M;
  const localY_m = hy_m - MAST_HEAD_HEIGHT_M;

  const pan_rad = Math.atan2(localX_m, localZ_m);
  const horiz_dist_m = Math.max(0.1, Math.hypot(localX_m, localZ_m));
  const elevation_rad = Math.atan2(localY_m, horiz_dist_m);
  // PanTilt sınıfında +X ekseni etrafında negatif açı kamerayı yukarı (+Y) kaldırır
  const tilt_rad = Math.max(MAX_TILT_UP_RAD, Math.min(MAX_TILT_DOWN_RAD, -elevation_rad));

  return { pan_rad, tilt_rad };
}

/**
 * Yüklenmiş ingenuity.glb modelinden eş-eksenli (coaxial) çift rotor rig'i kurar.
 */
export function createHelicopterRig(threeLib, model, parentScene) {
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const root = new threeLib.Group();
  root.name = 'INGENUITY_ROOT';
  root.add(model);
  parentScene.add(root);
  root.updateMatrixWorld(true);

  const upperRotor = getSanitizedNode(threeLib, model, ROTOR_UPPER_NAME);
  const lowerRotor = getSanitizedNode(threeLib, model, ROTOR_LOWER_NAME);
  const upperRest = upperRotor ? upperRotor.quaternion.clone() : null;
  const lowerRest = lowerRotor ? lowerRotor.quaternion.clone() : null;
  // Rotor kanatları yerel YZ düzlemindedir; yerel +X şaft eksenidir (üst rotor +Y, alt rotor -Y yönlü)
  const shaftAxis = new threeLib.Vector3(1, 0, 0);
  const spinQuat = new threeLib.Quaternion();

  function handleHelicopterPose(pose) {
    root.position.set(pose.x_m, pose.y_m, pose.z_m);
    root.rotation.x = pose.pitch_rad;
    root.rotation.y = pose.yaw_rad;
    root.rotation.z = pose.roll_rad;
    spinQuat.setFromAxisAngle(shaftAxis, pose.rotor_angle_rad);
    if (upperRotor && upperRest) {
      upperRotor.quaternion.copy(upperRest).multiply(spinQuat);
    }
    if (lowerRotor && lowerRest) {
      lowerRotor.quaternion.copy(lowerRest).multiply(spinQuat);
    }
  }

  return {
    root,
    model,
    upperRotor,
    lowerRotor,
    handleHelicopterPose,
  };
}
