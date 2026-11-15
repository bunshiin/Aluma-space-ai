// Jezero Krateri yüzey sahnesi: Perseverance rover'ı, görev animasyonu ve takip kamerası.
// Güneş Sistemi ile aynı renderer'ı kullanır ama kendi sahnesi/kamerası vardır (1 birim = 1 metre).
import { destroySceneResources } from './solarSystemBuilder.js';
import {
  calculateHelicopterFlightPose,
  calculateMastTrackingAnglesRad,
  calculateWrappedAngleRad,
  createHelicopterRig,
  INGENUITY_MODEL_URL,
} from './marsHelicopter.js';
import { createMarsSurfaceEnvironment } from './marsSurfaceEnvironment.js';
import { createRoverMotionState, handleRoverMotionStep } from './roverMotion.js';
import { createRoverRig, handleRoverRigPose } from './roverRig.js';

const ROVER_MODEL_URL = '/public/models/perseverance.glb';
// Kameranın rover etrafındaki varsayılan yeri ve inişin başladığı yükseklik (metre)
export const SURFACE_VIEW_OFFSET_M = { x: 5.2, y: 2.6, z: 5.6 };
const ROVER_LOOK_HEIGHT_M = 0.9;
const SURFACE_LIMITS = { minDistance: 1.8, maxDistance: 28, minPolarAngle: 0.02, maxPolarAngle: Math.PI * 0.48 };

function createSurfaceControls(OrbitControls, camera, domElement) {
  if (!OrbitControls || !domElement) return null;
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  Object.assign(controls, SURFACE_LIMITS);
  controls.enabled = false;
  return controls;
}

async function loadRoverModel(gltfLoader, modelUrl, onProgress) {
  const handleXhr = (xhr) => {
    if (typeof onProgress === 'function' && xhr?.total) {
      onProgress(Math.round((xhr.loaded / xhr.total) * 100));
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const gltf = await gltfLoader.loadAsync(modelUrl, handleXhr);
      const sceneRoot = gltf?.scene || gltf?.scenes?.[0] || null;
      if (sceneRoot) return sceneRoot;
    } catch (err) {
      if (attempt === 1) {
        console.warn(`Mars yüzeyi: rover modeli yüklenemedi (${modelUrl}):`, err);
      }
    }
  }
  return null;
}

/**
 * Yüzey sahnesini kurar. Rover yüklenemese de zeminli boş sahne döner (sahne akışı kilitlenmez).
 * isCancelled true dönerse (kullanıcı bu arada çıktıysa) yükleme sonrası kaynaklar hemen temizlenir.
 */
export async function createMarsSurfaceScene(deps, renderer, domElement, aspect, gltfLoader, options = {}) {
  const { THREE, OrbitControls } = deps;
  const scene = new THREE.Scene();
  scene.name = 'MARS_SURFACE_SCENE';
  const camera = new THREE.PerspectiveCamera(42, aspect || 1, 0.1, 20000);
  const controls = createSurfaceControls(OrbitControls, camera, domElement);
  const wasShadowEnabled = Boolean(renderer?.shadowMap?.enabled);
  if (renderer?.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const environment = createMarsSurfaceEnvironment(THREE, scene, renderer);
  const roverRoot = new THREE.Group();
  roverRoot.name = 'ROVER_ROOT';
  scene.add(roverRoot);

  const model = await loadRoverModel(gltfLoader, options.modelUrl || ROVER_MODEL_URL, options.onProgress);
  const rig = model ? createRoverRig(THREE, model, roverRoot) : null;
  const motion = createRoverMotionState();
  const anchor = new THREE.Vector3();
  const prevAnchor = new THREE.Vector3();
  let has_prev_anchor = false;
  let last_phase_id = null;
  let is_destroyed = false;
  let is_helicopter_active = false;
  let helicopter_t_s = 0;
  let helicopter_rig = null;
  let helicopter_promise = null;

  async function handleHelicopterRequest(enabled = true) {
    if (is_destroyed) return null;
    is_helicopter_active = Boolean(enabled);
    if (!is_helicopter_active) {
      if (helicopter_rig) helicopter_rig.root.visible = false;
      return helicopter_rig;
    }
    if (helicopter_rig) {
      helicopter_rig.root.visible = true;
      return helicopter_rig;
    }
    if (!helicopter_promise) {
      const heliUrl = options.helicopterModelUrl || INGENUITY_MODEL_URL;
      helicopter_promise = loadRoverModel(gltfLoader, heliUrl).then((heliModel) => {
        if (!heliModel || is_destroyed) return null;
        helicopter_rig = createHelicopterRig(THREE, heliModel, scene);
        helicopter_rig.root.visible = is_helicopter_active;
        helicopter_rig.handleHelicopterPose(calculateHelicopterFlightPose(motion.drive, helicopter_t_s));
        return helicopter_rig;
      });
    }
    return helicopter_promise;
  }

  if (options.enableHelicopter) {
    await handleHelicopterRequest(true);
  }

  function getRoverAnchor() {
    return anchor.set(roverRoot.position.x, ROVER_LOOK_HEIGHT_M, roverRoot.position.z);
  }

  // Rover sürerken kamera ve hedef onunla birlikte kayar; kullanıcının açısı korunur
  function handleFollowAnchor(is_following) {
    getRoverAnchor();
    if (is_following && has_prev_anchor && controls) {
      const dx = anchor.x - prevAnchor.x;
      const dz = anchor.z - prevAnchor.z;
      camera.position.x += dx;
      camera.position.z += dz;
      controls.target.x += dx;
      controls.target.z += dz;
    }
    prevAnchor.copy(anchor);
    has_prev_anchor = true;
  }

  function handleSurfaceFrame(delta_s, is_following) {
    if (is_destroyed) return;
    const dt_s = Number.isFinite(delta_s) && delta_s > 0 ? delta_s : 0;
    if (rig) {
      if (is_helicopter_active && helicopter_rig) {
        // Helikopter uçarken Perseverance durup Mastcam-Z kamerasıyla (head) helikopteri takip eder
        helicopter_t_s += dt_s;
        const heliPose = calculateHelicopterFlightPose(motion.drive, helicopter_t_s);
        helicopter_rig.handleHelicopterPose(heliPose);
        motion.drive.target_v_ms = 0;
        motion.drive.target_w_rads = 0;
        motion.drive.v_ms *= Math.max(0, 1 - dt_s * 3);
        motion.drive.w_rads *= Math.max(0, 1 - dt_s * 3);
        const track = calculateMastTrackingAnglesRad(motion.drive, heliPose);
        const blend = dt_s > 0 ? Math.min(1, dt_s * 6) : 1;
        motion.mast_rad[0] += calculateWrappedAngleRad(track.pan_rad - motion.mast_rad[0]) * blend;
        motion.mast_rad[1] += (track.tilt_rad - motion.mast_rad[1]) * blend;
        motion.mode = 'INGENUITY_FLIGHT';
        motion.phase_id = 'INGENUITY_FLIGHT';
      } else {
        handleRoverMotionStep(motion, rig.wheels, dt_s);
        if (rig.has_upper_joints === false && motion.mission_t_s >= 13) motion.mission_t_s %= 13;
      }
      handleRoverRigPose(rig, roverRoot, motion);
      if (motion.phase_id !== last_phase_id) {
        last_phase_id = motion.phase_id;
        if (typeof options.onPhase === 'function') options.onPhase(motion.phase_id);
      }
    }
    handleFollowAnchor(is_following);
    environment.handleEnvironmentFrame(roverRoot.position, camera.position.y);
    if (controls && controls.enabled) controls.update();
  }

  function handleSurfaceResize(nextAspect) {
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  }

  function destroyMarsSurfaceScene() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (controls && typeof controls.dispose === 'function') controls.dispose();
    environment.destroyMarsSurfaceEnvironment();
    // Tekerlerden ayrılan orijinal geometriler sahne ağacında değil; traverse onları görmez
    if (rig) rig.detachedGeometries.forEach((g) => g.dispose());
    scene.traverse((obj) => {
      if (obj.isInstancedMesh && typeof obj.dispose === 'function') obj.dispose();
    });
    destroySceneResources(scene);
    scene.clear?.();
    if (renderer?.shadowMap) renderer.shadowMap.enabled = wasShadowEnabled;
  }

  if (typeof options.isCancelled === 'function' && options.isCancelled()) {
    destroyMarsSurfaceScene();
  }

  return {
    scene,
    camera,
    controls,
    is_rover_ready: Boolean(rig),
    motion,
    getRoverAnchor,
    handleHelicopterRequest,
    isHelicopterActive: () => is_helicopter_active && Boolean(helicopter_rig?.root?.visible),
    getHelicopterRig: () => helicopter_rig,
    handleSurfaceFrame,
    handleSurfaceResize,
    destroyMarsSurfaceScene,
  };
}
