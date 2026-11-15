// Güneş Sistemi ↔ Ay yüzeyi geçişi (Mars yüzey kontrolcüsünün Ay karşılığı): yörüngeden Mare Tranquillitatis'e
// dalış, yüzey sahnesinde Apollo 11 Ay Modülü'ne iniş; çıkışta tersi. Ay'ın atmosferi olmadığı için
// pus yerine kısa bir karartma kullanılır (renk siyah), turuncu toz yok.
import { createHazeOverlay } from './marsAtmosphere.js';
import {
  calculateDiveDuration_s, calculateDiveHaze, calculateDivePose, calculateNearPlane_units,
  calculateOrbitAscentHaze, calculateOrbitAscentPose,
  DIVE_DURATION_S, DIVE_END_ALTITUDE_RATIO, ORBIT_ASCENT_DURATION_S,
} from './marsDescentPath.js';
import { calculateSmootherstep } from './cameraTransition.js';
import { calculateEaseInOut, calculateVecMix, calculateVecNormalize, calculateVecScale, calculateVecSum } from './flareMath.js';
import { calculateLunarSiteFrame, getLunarSite } from './lunarSiteMarker.js';
import { createLunarSurfaceScene, LUNAR_SURFACE_VIEW_OFFSET_M } from './lunarSurfaceScene.js';
import { CAMERA_TARGETS } from './solarSystemConfig.js';

export const MOON_TARGET_ID = 'MOON';
export const LUNAR_LANDING_DURATION_S = 5.0;
export const LUNAR_SURFACE_ASCENT_DURATION_S = 3.0;
// İniş bu yükseklikten (metre) başlar: önce düz ova ve modül nokta kadar görünür, sonra modüle inilir
export const LUNAR_LANDING_START_DISTANCE_M = 1400;
const LANDING_START_DIR = calculateVecNormalize({ x: 0.2, y: 1, z: 0.3 });
const SURFACE_EXIT_RATIO = 0.94;
const FOCUS_DIR = { x: 0.7, y: 0.45, z: 1 };
const DIVE_LOOK_BLEND_PORTION = 0.4;

const toPlain = (v) => ({ x: v.x, y: v.y, z: v.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function blendDirection(from, to, t) {
  const mixed = calculateVecMix(from, to, t);
  return Math.hypot(mixed.x, mixed.y, mixed.z) < 1e-3 ? to : calculateVecNormalize(mixed);
}

/**
 * Yüzey sahnesinde iniş (u: 0 → 1): modülün tepesinden 1400 m'den varsayılan kadraja logaritmik alçalma.
 */
export function calculateLunarLandingPose(anchor, u) {
  const e = calculateEaseInOut(Math.max(0, Math.min(1, u)));
  const endDist = Math.hypot(LUNAR_SURFACE_VIEW_OFFSET_M.x, LUNAR_SURFACE_VIEW_OFFSET_M.y, LUNAR_SURFACE_VIEW_OFFSET_M.z);
  const endDir = calculateVecScale(LUNAR_SURFACE_VIEW_OFFSET_M, 1 / endDist);
  const dir = blendDirection(LANDING_START_DIR, endDir, smoothstep(0.2, 1, e));
  const dist = LUNAR_LANDING_START_DISTANCE_M * Math.pow(endDist / LUNAR_LANDING_START_DISTANCE_M, e);
  return { position: calculateVecSum(anchor, calculateVecScale(dir, dist)), look_at: anchor };
}

/**
 * Yüzeyden kalkış (u: 0 → 1): kameranın o anki açısından modülün tepesine yükselir.
 */
export function calculateLunarSurfaceAscentPose(anchor, startOffset, u) {
  const e = calculateEaseInOut(Math.max(0, Math.min(1, u)));
  const startDist = Math.max(0.5, Math.hypot(startOffset.x, startOffset.y, startOffset.z));
  const dir = blendDirection(calculateVecScale(startOffset, 1 / startDist), LANDING_START_DIR, e);
  const dist = startDist * Math.pow(LUNAR_LANDING_START_DISTANCE_M / startDist, e);
  return { position: calculateVecSum(anchor, calculateVecScale(dir, dist)), look_at: anchor };
}

// Karartma: atmosfer olmadığı için sadece görünüm değişiminin dikişini saklayan kısa bir siyah geçiş
export const calculateLunarLandingFade = (u) => 1 - smoothstep(0, 0.3, calculateEaseInOut(u));
export const calculateLunarSurfaceAscentFade = (u) => smoothstep(0.6, 0.98, calculateEaseInOut(u));

export function createLunarSurfaceController(ctx) {
  const { deps, renderer, domElement, scene, camera, controls, cameraController, renderPipeline } = ctx;
  const { THREE } = deps;
  const eventTarget = ctx.eventTarget === undefined ? globalThis : ctx.eventTarget;
  const fade = createHazeOverlay(THREE);
  fade.overlay.name = 'LUNAR_FADE_OVERLAY';
  if (fade.overlay.material?.uniforms?.uColor) fade.overlay.material.uniforms.uColor.value = new THREE.Color(0, 0, 0);
  scene.add(fade.overlay);
  const default_near_units = camera.near;
  const vec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const site = getLunarSite();

  let surface_state = 'ORBIT';
  let elapsed_s = 0;
  let surface = null;
  let load_token = null;
  let is_load_failed = false;
  let is_destroyed = false;
  let start_offset = null;
  let exit_target_id = MOON_TARGET_ID;
  let pending_exit_id = null;
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
    handleEmit('ag:lunar-surface-state', { surface_state, site_id: site.id, module_id: site.module_id });
  }
  function getSiteWorldFrame() {
    const pivot = ctx.getMoonRig()?.tiltPivot;
    if (!pivot) return null;
    if (typeof pivot.updateWorldMatrix === 'function') pivot.updateWorldMatrix(true, false);
    const local = calculateLunarSiteFrame(site, ctx.moon_radius_units);
    pivot.getWorldQuaternion(quat);
    const rotate = (d) => toPlain(vec.set(d.x, d.y, d.z).applyQuaternion(quat));
    const normal = rotate(local.normal);
    const north = rotate(local.north);
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
    scene.add(fade.overlay);
    if (surface) { surface.destroyLunarSurfaceScene(); surface = null; }
  }
  function handleBeginSurfaceLoad() {
    if (load_token) load_token.is_cancelled = true;
    const token = { is_cancelled: false };
    load_token = token;
    is_load_failed = false;
    createLunarSurfaceScene(deps, renderer, domElement, ctx.getAspect(), ctx.gltfLoader, {
      onProgress: ctx.onProgress,
      isCancelled: () => token.is_cancelled || is_destroyed,
    })
      .then((handle) => {
        if (token.is_cancelled || is_destroyed) handle.destroyLunarSurfaceScene();
        else surface = handle;
      })
      .catch((err) => { console.warn('Ay yüzeyi kurulamadı:', err); if (!token.is_cancelled) is_load_failed = true; });
  }

  // Ay yüzeyine girişin tek yolu: solarSystemScene.handleFocusTarget (camera_target → lunar_site_id).
  function handleSurfaceRequest() {
    if (is_destroyed) return false;
    if (surface_state === 'SURFACE_ASCENT' && surface) {
      pending_exit_id = null;
      handleState('LANDING');
      return true;
    }
    if (surface_state !== 'ORBIT' && surface_state !== 'ORBIT_ASCENT') return true;
    const frame = getSiteWorldFrame();
    if (!frame) return false;
    start_offset = sub(toPlain(camera.position), frame.position);
    dive_duration_s = calculateDiveDuration_s(
      frame.position, frame.normal, frame.north, start_offset, ctx.moon_radius_units * DIVE_END_ALTITUDE_RATIO
    );
    dive_start_look = surface_state === 'ORBIT_ASCENT' && last_main_look
      ? last_main_look
      : toPlain(controls ? controls.target : frame.position);
    exit_target_id = MOON_TARGET_ID;
    pending_exit_id = null;
    cameraController.handleFocusTarget(MOON_TARGET_ID);
    cameraController.handleInputEnabled(false);
    if (controls) controls.enabled = false;
    destroySurface();
    handleBeginSurfaceLoad();
    handleState('DIVE');
    return true;
  }

  function handleExitRequest(target_id) {
    const safe_id = typeof target_id === 'string' && target_id ? target_id : MOON_TARGET_ID;
    if (surface_state === 'SURFACE') handleBeginExit(safe_id);
    else if (surface_state === 'SURFACE_ASCENT' || surface_state === 'ORBIT_ASCENT') exit_target_id = safe_id;
    else if (surface_state !== 'ORBIT') pending_exit_id = safe_id;
  }

  function handleBeginExit(target_id) {
    pending_exit_id = null;
    exit_target_id = target_id;
    if (surface?.controls) surface.controls.enabled = false;
    start_offset = sub(toPlain(surface.camera.position), toPlain(surface.getModuleAnchor()));
    handleState('SURFACE_ASCENT');
  }

  function handleFinishOrbitAscent() {
    const frame = getSiteWorldFrame();
    camera.near = default_near_units;
    camera.updateProjectionMatrix();
    fade.handleHazeOpacity(0);
    if (controls && frame) controls.target.set(frame.center.x, frame.center.y, frame.center.z);
    if (controls) controls.enabled = true;
    cameraController.handleInputEnabled(true);
    cameraController.handleFocusTarget(exit_target_id);
    handleState('ORBIT');
  }

  function getOrbitFocusOffset(frame) {
    const dist = CAMERA_TARGETS.MOON?.camera_distance_units || 1.8;
    const focus = { x: frame.center.x + FOCUS_DIR.x * dist, y: frame.center.y + FOCUS_DIR.y * dist, z: frame.center.z + FOCUS_DIR.z * dist };
    return sub(focus, frame.position);
  }

  function handleOrbitFrames() {
    const frame = getSiteWorldFrame();
    if (!frame) return;
    const end_units = ctx.moon_radius_units * DIVE_END_ALTITUDE_RATIO;
    if (surface_state === 'DIVE' || surface_state === 'ENTRY_HOLD') {
      const u = surface_state === 'DIVE' ? Math.min(1, elapsed_s / dive_duration_s) : 1;
      const pose = calculateDivePose(frame.position, frame.normal, frame.north, start_offset, end_units, u);
      if (dive_start_look) pose.look_at = calculateVecMix(dive_start_look, pose.look_at, calculateSmootherstep(u / DIVE_LOOK_BLEND_PORTION));
      handleMainCameraPose(pose);
      fade.handleHazeOpacity(calculateDiveHaze(u));
      if (u < 1) return;
      if (surface) {
        handleSurfaceCameraPose(calculateLunarLandingPose(toPlain(surface.getModuleAnchor()), 0));
        renderPipeline.handleRenderView(surface.scene, surface.camera);
        surface.scene.add(fade.overlay);
        handleState('LANDING');
      } else if (is_load_failed) handleBeginOrbitAscent();
      else if (surface_state === 'DIVE') handleState('ENTRY_HOLD');
      return;
    }
    const u = Math.min(1, elapsed_s / ascent_duration_s);
    const pose = calculateOrbitAscentPose(frame.position, frame.normal, frame.north, getOrbitFocusOffset(frame), end_units, u);
    pose.look_at = calculateVecMix(frame.position, frame.center, calculateSmootherstep(u));
    handleMainCameraPose(pose);
    fade.handleHazeOpacity(calculateOrbitAscentHaze(u));
    if (u >= 1) handleFinishOrbitAscent();
  }

  function handleBeginOrbitAscent() {
    destroySurface();
    renderPipeline.handleRenderView(scene, camera);
    const frame = getSiteWorldFrame();
    if (frame) {
      ascent_duration_s = calculateDiveDuration_s(
        frame.position, frame.normal, frame.north, getOrbitFocusOffset(frame),
        ctx.moon_radius_units * DIVE_END_ALTITUDE_RATIO, ORBIT_ASCENT_DURATION_S
      );
    }
    handleState('ORBIT_ASCENT');
    handleOrbitFrames();
  }

  function handleSurfaceFrames() {
    const anchor = toPlain(surface.getModuleAnchor());
    if (surface_state === 'LANDING') {
      const u = Math.min(1, elapsed_s / LUNAR_LANDING_DURATION_S);
      handleSurfaceCameraPose(calculateLunarLandingPose(anchor, u));
      fade.handleHazeOpacity(calculateLunarLandingFade(u));
      surface.handleSurfaceFrame();
      if (u >= 1) {
        if (surface.controls) {
          surface.controls.target.set(anchor.x, anchor.y, anchor.z);
          surface.controls.enabled = true;
        }
        handleState('SURFACE');
      }
      return;
    }
    if (surface_state === 'SURFACE') {
      surface.handleSurfaceFrame();
      const focus_id = cameraController.getActiveFocus()?.id;
      if (pending_exit_id) handleBeginExit(pending_exit_id);
      else if (focus_id && focus_id !== MOON_TARGET_ID) handleBeginExit(focus_id);
      return;
    }
    surface.handleSurfaceFrame();
    const u = Math.min(1, elapsed_s / LUNAR_SURFACE_ASCENT_DURATION_S);
    handleSurfaceCameraPose(calculateLunarSurfaceAscentPose(anchor, start_offset, u));
    fade.handleHazeOpacity(calculateLunarSurfaceAscentFade(u));
    if (u >= 1) handleBeginOrbitAscent();
  }

  function handleLunarSurfaceFrame(delta_s) {
    if (is_destroyed || surface_state === 'ORBIT') return;
    elapsed_s += Number.isFinite(delta_s) && delta_s > 0 ? delta_s : 0;
    if (['LANDING', 'SURFACE', 'SURFACE_ASCENT'].includes(surface_state) && surface) handleSurfaceFrames();
    else handleOrbitFrames();
  }

  // Tekerlek yalnızca kalkış için: yüzeyde en uzağa çekilince yörüngeye dönülür
  function handleWheelEvent(event) {
    if (surface_state === 'SURFACE' && event.deltaY > 0 && surface?.controls) {
      if (surface.controls.getDistance() >= surface.controls.maxDistance * SURFACE_EXIT_RATIO) handleBeginExit(MOON_TARGET_ID);
    }
  }
  if (typeof domElement?.addEventListener === 'function') domElement.addEventListener('wheel', handleWheelEvent, { passive: true });

  function destroyLunarSurfaceController() {
    if (is_destroyed) return;
    is_destroyed = true;
    if (typeof domElement?.removeEventListener === 'function') domElement.removeEventListener('wheel', handleWheelEvent);
    destroySurface();
    scene.remove(fade.overlay);
    fade.overlay.geometry.dispose();
    fade.overlay.material.dispose();
  }

  return {
    handleSurfaceRequest, handleExitRequest, handleLunarSurfaceFrame,
    handleLunarSurfaceResize: (aspect) => surface?.handleSurfaceResize(aspect),
    isCameraLocked: () => surface_state !== 'ORBIT',
    getSurfaceState: () => surface_state,
    getSurface: () => surface,
    destroyLunarSurfaceController,
  };
}
