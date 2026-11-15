// Güneş Sistemi ↔ Mars yüzeyi geçişi: yörüngeden kraterlere (Jezero/Perseverance, Gale/Curiosity,
// Ares Vallis/Pathfinder) dalış, atmosferde pus, rover sahnesine iniş; çıkışta tersi.
import { createHazeOverlay } from './marsAtmosphere.js';
import {
  calculateMarsSurfaceFrame, calculateMarsSurfacePoint, getMarsSite,
} from './marsCoordinates.js';
import {
  calculateDiveDuration_s, calculateDiveHaze, calculateDivePose, calculateLandingHaze, calculateLandingPose,
  calculateNearPlane_units, calculateOrbitAscentHaze, calculateOrbitAscentPose,
  calculateSurfaceAscentHaze, calculateSurfaceAscentPose,
  DIVE_DURATION_S, DIVE_END_ALTITUDE_RATIO, LANDING_DURATION_S, ORBIT_ASCENT_DURATION_S, SURFACE_ASCENT_DURATION_S,
} from './marsDescentPath.js';
import { calculateSmootherstep } from './cameraTransition.js';
import { calculateVecMix } from './flareMath.js';
import { createMarsSurfaceScene } from './marsSurfaceScene.js';
import { isMarsHelicopterRequest } from './marsHelicopter.js';
import { CAMERA_TARGETS } from './solarSystemConfig.js';

const SURFACE_EXIT_RATIO = 0.92;
const MARS_TARGET_ID = 'MARS';
const FOCUS_DIR = { x: 0.7, y: 0.45, z: 1 };
// Dalışta bakış noktası önceki bakıştan kratere bu ilerleme oranına kadar yumuşakça kayar (ani dönüş yok)
const DIVE_LOOK_BLEND_PORTION = 0.4;
// Kraterden kratere geçişte pus açıldıktan sonra (yükseliş bu orana gelince) yeni dalış devralır
const CHAIN_DIVE_ASCENT_U = 0.6;

const toPlain = (v) => ({ x: v.x, y: v.y, z: v.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export function createMarsSurfaceController(ctx) {
  const { deps, renderer, domElement, scene, camera, controls, cameraController, renderPipeline } = ctx;
  const { THREE } = deps;
  const eventTarget = ctx.eventTarget === undefined ? globalThis : ctx.eventTarget;
  const haze = createHazeOverlay(THREE);
  scene.add(haze.overlay);
  const default_near_units = camera.near;
  const vec = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  let surface_state = 'ORBIT';
  let site = getMarsSite('JEZERO');
  let elapsed_s = 0;
  let surface = null;
  let load_token = null;
  let is_load_failed = false;
  let is_destroyed = false;
  let start_offset = null;
  let exit_target_id = MARS_TARGET_ID;
  let pending_exit_id = null;
  let wants_helicopter = false;
  // Yüzeydeyken başka krater istenirse: önce yükselinir, istek burada bekler ve dalış yükselişin ortasından devralır
  let pending_site_request = null;
  // Ana kameranın son bakış noktası; bir sonraki kamera hareketi buradan başlar, bakış sıçramaz
  let last_main_look = null;
  let dive_start_look = null;
  let dive_duration_s = DIVE_DURATION_S;
  let ascent_duration_s = ORBIT_ASCENT_DURATION_S;

  function handleEmit(type, detail) {
    if (typeof eventTarget?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
    }
  }
  function handleState(next_state) {
    surface_state = next_state;
    elapsed_s = 0;
    handleEmit('ag:surface-state', { surface_state, site_id: site.id, crater_name: site.crater_name, rover_id: site.rover_id });
  }
  function getSiteWorldFrame(targetSite = site) {
    const pivot = ctx.getMarsRig()?.tiltPivot;
    if (!pivot) return null;
    if (typeof pivot.updateWorldMatrix === 'function') pivot.updateWorldMatrix(true, false);
    const local = calculateMarsSurfacePoint(targetSite.latitude_deg, targetSite.longitude_deg, ctx.mars_radius_units);
    const frame = calculateMarsSurfaceFrame(targetSite.latitude_deg, targetSite.longitude_deg);
    pivot.getWorldQuaternion(quat);
    const rotate = (d) => toPlain(vec.set(d.x, d.y, d.z).applyQuaternion(quat));
    const normal = rotate(frame.normal);
    const north = rotate(frame.north);
    const center = toPlain(pivot.getWorldPosition(vec));
    const position = toPlain(pivot.localToWorld(vec.set(local.position.x, local.position.y, local.position.z)));
    return { position, normal, north, center };
  }
  function handleMainCameraPose(pose) {
    last_main_look = toPlain(pose.look_at);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.near = calculateNearPlane_units(pose.distance_units, default_near_units);
    camera.updateProjectionMatrix();
    camera.lookAt(pose.look_at.x, pose.look_at.y, pose.look_at.z);
  }
  function handleSurfaceCameraPose(pose) {
    surface.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    surface.camera.lookAt(pose.look_at.x, pose.look_at.y, pose.look_at.z);
  }
  function destroySurface() {
    if (load_token) load_token.is_cancelled = true;
    load_token = null;
    scene.add(haze.overlay);
    if (surface) { surface.destroyMarsSurfaceScene(); surface = null; }
  }
  function handleBeginSurfaceLoad() {
    if (load_token) load_token.is_cancelled = true;
    const token = { is_cancelled: false };
    load_token = token;
    is_load_failed = false;
    createMarsSurfaceScene(deps, renderer, domElement, ctx.getAspect(), ctx.gltfLoader, {
      modelUrl: site.model_url,
      enableHelicopter: wants_helicopter,
      onProgress: ctx.onProgress,
      onPhase: (phase_id) => handleEmit('ag:rover-phase', { phase_id, site_id: site.id, rover_id: site.rover_id }),
      isCancelled: () => token.is_cancelled || is_destroyed,
    })
      .then((handle) => {
        if (token.is_cancelled || is_destroyed) handle.destroyMarsSurfaceScene();
        else {
          surface = handle;
          if (wants_helicopter) surface.handleHelicopterRequest?.(true);
        }
      })
      .catch((err) => { console.warn('Mars yüzeyi kurulamadı:', err); if (!token.is_cancelled) is_load_failed = true; });
  }

  // Yüzey girişinin tek yolu bu fonksiyon. Şu an çağıranlar: threeSceneFactory.handleFocusTarget
  // (camera_target → surface_site_id) ve testler. TEST: Asıl tetikleyici Mustafa'nın niyet sistemi
  // (geminiRouter) olmalı; kullanıcı yazarak/söyleyerek niyet belirtmeden Mars'a girilmemeli.
  // Zoom (tekerlek) bu fonksiyonu çağırmaz.
  function handleSurfaceRequest(siteOrRoverId) {
    if (is_destroyed) return false;
    const requestedSite = getMarsSite(siteOrRoverId);
    const next_helicopter = isMarsHelicopterRequest(siteOrRoverId);
    if (surface_state === 'SURFACE_ASCENT' && surface && requestedSite.id === site.id) {
      wants_helicopter = next_helicopter;
      surface.handleHelicopterRequest?.(wants_helicopter);
      pending_exit_id = null;
      handleState('LANDING');
      return true;
    }
    if (surface_state === 'SURFACE' && requestedSite.id === site.id) {
      wants_helicopter = next_helicopter;
      surface?.handleHelicopterRequest?.(wants_helicopter);
      return true;
    }
    if (surface_state === 'SURFACE' && requestedSite.id !== site.id) {
      // Kesme yok: yüzey görüntüsünden doğrudan ana sahneye atlamak yerine önce bu kraterden yükselinir
      if (!getSiteWorldFrame()) return false;
      pending_site_request = siteOrRoverId;
      handleBeginExit(MARS_TARGET_ID);
      return true;
    }
    if (surface_state === 'SURFACE_ASCENT' && requestedSite.id !== site.id) {
      pending_site_request = siteOrRoverId;
      return true;
    }
    if (surface_state !== 'ORBIT' && surface_state !== 'ORBIT_ASCENT') {
      if (requestedSite.id === site.id && next_helicopter) {
        wants_helicopter = true;
        surface?.handleHelicopterRequest?.(true);
      }
      return true;
    }
    site = requestedSite;
    wants_helicopter = next_helicopter;
    const frame = getSiteWorldFrame();
    if (!frame) return false;
    start_offset = sub(toPlain(camera.position), frame.position);
    dive_duration_s = calculateDiveDuration_s(
      frame.position, frame.normal, frame.north, start_offset, ctx.mars_radius_units * DIVE_END_ALTITUDE_RATIO
    );
    // Yükselişin ortasından devralınıyorsa bakış oradan, yörüngedeyse kullanıcının baktığı noktadan başlar
    dive_start_look = surface_state === 'ORBIT_ASCENT' && last_main_look
      ? last_main_look
      : toPlain(controls ? controls.target : frame.position);
    exit_target_id = MARS_TARGET_ID;
    pending_exit_id = null;
    pending_site_request = null;
    cameraController.handleFocusTarget(MARS_TARGET_ID);
    cameraController.handleInputEnabled(false);
    if (controls) controls.enabled = false;
    destroySurface();
    handleBeginSurfaceLoad();
    handleState('DIVE');
    return true;
  }

  function handleExitRequest(target_id) {
    const safe_id = typeof target_id === 'string' && target_id ? target_id : MARS_TARGET_ID;
    pending_site_request = null;
    if (surface_state === 'SURFACE') handleBeginExit(safe_id);
    else if (surface_state === 'SURFACE_ASCENT' || surface_state === 'ORBIT_ASCENT') exit_target_id = safe_id;
    else if (surface_state !== 'ORBIT') pending_exit_id = safe_id;
  }

  function handleBeginExit(target_id) {
    pending_exit_id = null;
    exit_target_id = target_id;
    if (surface?.controls) surface.controls.enabled = false;
    start_offset = sub(toPlain(surface.camera.position), toPlain(surface.getRoverAnchor()));
    handleState('SURFACE_ASCENT');
  }

  function handleFinishOrbitAscent() {
    const frame = getSiteWorldFrame();
    camera.near = default_near_units;
    camera.updateProjectionMatrix();
    haze.handleHazeOpacity(0);
    if (controls && frame) controls.target.set(frame.center.x, frame.center.y, frame.center.z);
    if (controls) controls.enabled = true;
    cameraController.handleInputEnabled(true);
    cameraController.handleFocusTarget(exit_target_id);
    handleState('ORBIT');
  }

  // Yükselişin vardığı yer: Mars'a bakan varsayılan odak pozu (kraterden bu noktaya göreli)
  function getOrbitFocusOffset(frame) {
    const dist = CAMERA_TARGETS.MARS.camera_distance_units;
    const focus = { x: frame.center.x + FOCUS_DIR.x * dist, y: frame.center.y + FOCUS_DIR.y * dist, z: frame.center.z + FOCUS_DIR.z * dist };
    return sub(focus, frame.position);
  }

  function handleOrbitFrames() {
    const frame = getSiteWorldFrame();
    if (!frame) return;
    const end_units = ctx.mars_radius_units * DIVE_END_ALTITUDE_RATIO;
    if (surface_state === 'DIVE' || surface_state === 'ENTRY_HOLD') {
      const u = surface_state === 'DIVE' ? Math.min(1, elapsed_s / dive_duration_s) : 1;
      const dive_pose = calculateDivePose(frame.position, frame.normal, frame.north, start_offset, end_units, u);
      if (dive_start_look) {
        dive_pose.look_at = calculateVecMix(dive_start_look, dive_pose.look_at, calculateSmootherstep(u / DIVE_LOOK_BLEND_PORTION));
      }
      handleMainCameraPose(dive_pose);
      haze.handleHazeOpacity(calculateDiveHaze(u));
      if (u < 1) return;
      if (surface) {
        // Görünüm değişmeden önce yüzey kamerası iniş başlangıç pozuna konur; ilk karede varsayılan poz görünmesin
        handleSurfaceCameraPose(calculateLandingPose(toPlain(surface.getRoverAnchor()), 0));
        renderPipeline.handleRenderView(surface.scene, surface.camera);
        surface.scene.add(haze.overlay);
        handleState('LANDING');
      } else if (is_load_failed) handleBeginOrbitAscentFromAtmosphere();
      else if (surface_state === 'DIVE') handleState('ENTRY_HOLD');
      return;
    }
    const focus_offset = getOrbitFocusOffset(frame);
    const u = Math.min(1, elapsed_s / ascent_duration_s);
    const ascent_pose = calculateOrbitAscentPose(frame.position, frame.normal, frame.north, focus_offset, end_units, u);
    // Bakış kraterden gezegen merkezine kayar; yükseliş bitince kamera kontrolcüsü tam bu bakışla devralır
    ascent_pose.look_at = calculateVecMix(frame.position, frame.center, calculateSmootherstep(u));
    handleMainCameraPose(ascent_pose);
    haze.handleHazeOpacity(calculateOrbitAscentHaze(u));
    if (pending_site_request && u >= CHAIN_DIVE_ASCENT_U) {
      const request = pending_site_request;
      pending_site_request = null;
      handleSurfaceRequest(request);
      return;
    }
    if (u >= 1) handleFinishOrbitAscent();
  }

  function handleBeginOrbitAscentFromAtmosphere() {
    destroySurface();
    renderPipeline.handleRenderView(scene, camera);
    const frame = getSiteWorldFrame();
    if (frame) {
      // Süre, kameranın gezegen etrafında süpüreceği açıya göre belirlenir; hızlı savrulma olmaz
      ascent_duration_s = calculateDiveDuration_s(
        frame.position, frame.normal, frame.north, getOrbitFocusOffset(frame),
        ctx.mars_radius_units * DIVE_END_ALTITUDE_RATIO, ORBIT_ASCENT_DURATION_S
      );
    }
    handleState('ORBIT_ASCENT');
    handleOrbitFrames();
  }

  function handleSurfaceFrames(motion_delta_s) {
    if (surface_state === 'LANDING') {
      const anchor = toPlain(surface.getRoverAnchor());
      const u = Math.min(1, elapsed_s / LANDING_DURATION_S);
      handleSurfaceCameraPose(calculateLandingPose(anchor, u));
      haze.handleHazeOpacity(calculateLandingHaze(u));
      surface.handleSurfaceFrame(motion_delta_s, false);
      if (u >= 1 && surface.controls) {
        surface.controls.target.set(anchor.x, anchor.y, anchor.z);
        surface.controls.enabled = true;
      }
      if (u >= 1) handleState('SURFACE');
      return;
    }
    if (surface_state === 'SURFACE') {
      surface.handleSurfaceFrame(motion_delta_s, true);
      const focus_id = cameraController.getActiveFocus()?.id;
      if (pending_exit_id) handleBeginExit(pending_exit_id);
      else if (focus_id && focus_id !== MARS_TARGET_ID) handleBeginExit(focus_id);
      return;
    }
    surface.handleSurfaceFrame(motion_delta_s, false);
    const u = Math.min(1, elapsed_s / SURFACE_ASCENT_DURATION_S);
    handleSurfaceCameraPose(calculateSurfaceAscentPose(toPlain(surface.getRoverAnchor()), start_offset, u));
    haze.handleHazeOpacity(calculateSurfaceAscentHaze(u));
    if (u >= 1) handleBeginOrbitAscentFromAtmosphere();
  }

  function handleMarsSurfaceFrame(delta_s, motion_delta_s) {
    if (is_destroyed) return;
    if (surface_state === 'ORBIT') return;
    elapsed_s += delta_s;
    if (['LANDING', 'SURFACE', 'SURFACE_ASCENT'].includes(surface_state) && surface) handleSurfaceFrames(motion_delta_s);
    else handleOrbitFrames();
  }

  // Tekerlek yalnızca yüzeyden uzaklaşmak için (kalkış) kullanılır; yakınlaştırma Mars'a girdirmez.
  function handleWheelEvent(event) {
    if (surface_state === 'SURFACE' && event.deltaY > 0 && surface?.controls) {
      if (surface.controls.getDistance() >= surface.controls.maxDistance * SURFACE_EXIT_RATIO) handleBeginExit(MARS_TARGET_ID);
    }
  }
  if (typeof domElement?.addEventListener === 'function') domElement.addEventListener('wheel', handleWheelEvent, { passive: true });

  function destroyMarsSurfaceController() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (typeof domElement?.removeEventListener === 'function') domElement.removeEventListener('wheel', handleWheelEvent);
    destroySurface();
    scene.remove(haze.overlay);
    haze.overlay.geometry.dispose();
    haze.overlay.material.dispose();
  }

  return {
    handleSurfaceRequest, handleExitRequest, handleMarsSurfaceFrame,
    handleMarsSurfaceResize: (aspect) => surface?.handleSurfaceResize(aspect),
    isCameraLocked: () => surface_state !== 'ORBIT',
    getSurfaceState: () => surface_state,
    getActiveSite: () => site,
    destroyMarsSurfaceController,
  };
}
