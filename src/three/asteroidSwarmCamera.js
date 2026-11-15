// Asteroit sahnesinin kamera kontrolcüsü: gezegen sahnesindeki gibi tıkla/zoomla odaklan,
// odaktaki asteroidi yörüngesinde takip et, uzaklaşınca Dünya merkezli görünüme dön.
import { ASTEROID_CAMERA, getAsteroidFocusTarget } from './asteroidSwarmConfig.js';
import { getBodyAtPointer } from './solarSystemCamera.js';

const CLICK_MOVE_TOLERANCE_PX = 6;
const ZOOM_LERP = 0.08;
const TARGET_LERP = 0.12;
const ARRIVE_THRESHOLD_UNITS = 0.05;
const FOCUS_CHANGED_EVENT = 'ag:focus-changed';

/**
 * Odak noktasında kameranın duracağı yer: asteroidin dış tarafından, biraz yukarıdan bakar;
 * böylece Dünya arka planda kalır. Saf hesap, testte doğrulanır.
 */
export function calculateFocusCameraPosition(target, distance_units) {
  const radial_len = Math.hypot(target.x, target.z) || 1;
  return {
    x: target.x + (target.x / radial_len) * distance_units,
    y: target.y + distance_units * 0.45,
    z: target.z + (target.z / radial_len) * distance_units,
  };
}

function dispatchFocusChanged(target) {
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(FOCUS_CHANGED_EVENT, { detail: { target } }));
  }
}

export function createAsteroidCameraController(THREE, camera, controls, domElement, getFocusNodes) {
  let focus_name = ASTEROID_CAMERA.OVERVIEW_TARGET;
  let is_zooming = false;
  let is_returning = false;
  let has_prev_pos = false;
  let pointerDownX_px = 0;
  let pointerDownY_px = 0;

  const overviewCamPos = new THREE.Vector3(...ASTEROID_CAMERA.overview_position_units);
  const desiredCamPos = new THREE.Vector3();
  const desiredLookAt = new THREE.Vector3(0, 0, 0);
  const nodePos = new THREE.Vector3();
  const prevNodePos = new THREE.Vector3();

  function handleMinDistance(distance_units) {
    if (controls) controls.minDistance = distance_units;
  }

  /**
   * Odak hedefini değiştirir. Bilinmeyen ad hata fırlatmaz, genel görünüme döner.
   * move_camera false ise (zoom out ile çıkış) kamera yerinde kalır, sadece bakış Dünya'ya kayar.
   */
  function handleFocusTarget(targetName, move_camera = true) {
    const nodes = getFocusNodes();
    const resolved = getAsteroidFocusTarget(targetName, nodes);
    const changed = resolved !== focus_name;
    focus_name = resolved;
    has_prev_pos = false;
    if (resolved === ASTEROID_CAMERA.OVERVIEW_TARGET) {
      is_zooming = false;
      is_returning = move_camera;
      desiredLookAt.set(0, 0, 0);
      handleMinDistance(ASTEROID_CAMERA.overview_min_distance_units);
    } else {
      is_zooming = true;
      is_returning = false;
      handleMinDistance(ASTEROID_CAMERA.focus_min_distance_units);
    }
    if (changed) dispatchFocusChanged(resolved);
    return resolved;
  }

  function handlePointerDown(event) {
    pointerDownX_px = event.clientX || 0;
    pointerDownY_px = event.clientY || 0;
    is_returning = false;
  }

  function handlePointerUp(event) {
    const move_px = Math.hypot((event.clientX || 0) - pointerDownX_px, (event.clientY || 0) - pointerDownY_px);
    if (move_px > CLICK_MOVE_TOLERANCE_PX) return;
    const picked = getBodyAtPointer(THREE, event, domElement, camera, getFocusNodes());
    if (picked) handleFocusTarget(picked);
  }

  function getCameraDistance() {
    const target = controls ? controls.target : desiredLookAt;
    return Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z);
  }

  function handleWheelEvent(event) {
    const is_zoom_in = event.deltaY < 0;
    is_zooming = false;
    is_returning = false;
    if (is_zoom_in && focus_name === ASTEROID_CAMERA.OVERVIEW_TARGET) {
      const hovered = getBodyAtPointer(THREE, event, domElement, camera, getFocusNodes());
      if (hovered) handleFocusTarget(hovered);
      return;
    }
    if (!is_zoom_in && focus_name !== ASTEROID_CAMERA.OVERVIEW_TARGET && getCameraDistance() >= ASTEROID_CAMERA.focus_exit_distance_units) {
      handleFocusTarget(ASTEROID_CAMERA.OVERVIEW_TARGET, false);
    }
  }

  if (domElement && typeof domElement.addEventListener === 'function') {
    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('wheel', handleWheelEvent, { passive: true });
  }

  function handleFollowFocus(node) {
    node.getWorldPosition(nodePos);
    // Asteroit yörüngede ilerledikçe kamerayı ve bakış noktasını aynı miktar taşı
    if (has_prev_pos) {
      const dx = nodePos.x - prevNodePos.x;
      const dy = nodePos.y - prevNodePos.y;
      const dz = nodePos.z - prevNodePos.z;
      camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
      if (controls) controls.target.set(controls.target.x + dx, controls.target.y + dy, controls.target.z + dz);
    }
    prevNodePos.copy(nodePos);
    has_prev_pos = true;
    desiredLookAt.copy(nodePos);
    if (is_zooming) {
      const pos = calculateFocusCameraPosition(nodePos, ASTEROID_CAMERA.focus_distance_units);
      desiredCamPos.set(pos.x, pos.y, pos.z);
      camera.position.lerp(desiredCamPos, ZOOM_LERP);
      const remaining = Math.hypot(camera.position.x - pos.x, camera.position.y - pos.y, camera.position.z - pos.z);
      if (remaining < ARRIVE_THRESHOLD_UNITS) is_zooming = false;
    }
  }

  function handleCameraFrameUpdate() {
    if (focus_name !== ASTEROID_CAMERA.OVERVIEW_TARGET) {
      const node = getFocusNodes().get(focus_name);
      // Odaktaki asteroit veriden çıktıysa genel görünüme yumuşakça dön
      if (node) handleFollowFocus(node);
      else handleFocusTarget(ASTEROID_CAMERA.OVERVIEW_TARGET);
    } else if (is_returning) {
      camera.position.lerp(overviewCamPos, ZOOM_LERP);
      const remaining = Math.hypot(
        camera.position.x - overviewCamPos.x,
        camera.position.y - overviewCamPos.y,
        camera.position.z - overviewCamPos.z
      );
      if (remaining < ARRIVE_THRESHOLD_UNITS) is_returning = false;
    }
    if (controls) {
      controls.target.lerp(desiredLookAt, TARGET_LERP);
      controls.update?.();
    } else {
      camera.lookAt(desiredLookAt);
    }
  }

  function destroyCameraController() {
    if (domElement && typeof domElement.removeEventListener === 'function') {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('wheel', handleWheelEvent);
    }
  }

  return {
    handleFocusTarget,
    handleCameraFrameUpdate,
    destroyCameraController,
    getActiveFocus: () => focus_name,
  };
}
