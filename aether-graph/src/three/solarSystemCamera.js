import { CAMERA_TARGETS, getCameraTarget, SOLAR_SYSTEM_BODIES } from './solarSystemConfig.js';
import { calculateFollowedPoint, calculateSatelliteCameraPos } from './cameraFollow.js';
import { calculateSmootherstep, calculateTransitionDuration_s, calculateTransitionPoint } from './cameraTransition.js';

const PICK_RADIUS_PX = 32;
const ZOOM_OUT_MULTIPLIER = 3.5;
const MIN_ZOOM_OUT_UNITS = 20;
const DEFAULT_FRAME_DELTA_S = 1 / 60;
const MAX_FRAME_DELTA_S = 0.1;
// Geçiş yolunun kaçınacağı küre yarıçapları (id → sahne birimi)
const BODY_RADIUS_UNITS = new Map(SOLAR_SYSTEM_BODIES.map((cfg) => [cfg.id, cfg.target_radius_units]));

const calculateDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Fare/imleç konumuna en yakın gezegen veya uyduyu ekran izdüşümüyle bulur.
 * Gezegenlerin arkasında kalan uyduları/araçları örter (occlusion), ön plandaki nesnelere ve araçlara öncelik verir.
 */
export function getBodyAtPointer(threeLib, event, domElement, camera, bodyMap) {
  if (!domElement || typeof domElement.getBoundingClientRect !== 'function' || !bodyMap) {
    return null;
  }
  const rect = domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const clientX = typeof event?.clientX === 'number'
    ? event.clientX
    : (event?.touches?.[0]?.clientX ?? event?.changedTouches?.[0]?.clientX ?? 0);
  const clientY = typeof event?.clientY === 'number'
    ? event.clientY
    : (event?.touches?.[0]?.clientY ?? event?.changedTouches?.[0]?.clientY ?? 0);
  const mouseX_px = clientX - rect.left;
  const mouseY_px = clientY - rect.top;
  const worldVec = new threeLib.Vector3();
  const projectedVec = new threeLib.Vector3();

  const fov_deg = typeof camera?.fov === 'number' && Number.isFinite(camera.fov) ? camera.fov : 45;
  const tanHalfFov = Math.tan(((fov_deg * Math.PI) / 180) / 2);

  const candidates = [];
  const occluders = [];

  bodyMap.forEach((node, bodyId) => {
    if (!node || typeof node.getWorldPosition !== 'function') return;
    if (node.visible === false) return;
    if (node.parent && node.parent.visible === false) return;

    node.getWorldPosition(worldVec);
    projectedVec.copy(worldVec);
    if (typeof projectedVec.project === 'function') {
      projectedVec.project(camera);
    }
    // Kameranın arkasında kalan gövdeleri yok say
    if (projectedVec.z > 1) {
      return;
    }
    const screenX_px = (projectedVec.x * 0.5 + 0.5) * rect.width;
    const screenY_px = (-projectedVec.y * 0.5 + 0.5) * rect.height;
    const dist_px = Math.hypot(mouseX_px - screenX_px, mouseY_px - screenY_px);

    const camDist = Math.hypot(
      (camera?.position?.x || 0) - worldVec.x,
      (camera?.position?.y || 0) - worldVec.y,
      (camera?.position?.z || 0) - worldVec.z
    );

    const visibleH = 2 * camDist * tanHalfFov;
    const pxPerUnit = visibleH > 0 ? rect.height / visibleH : 1;
    const bodyRadius = BODY_RADIUS_UNITS.get(bodyId) || (node.userData?.diameter_km ? 0.08 : 0.15);
    const screenRadius_px = bodyRadius * pxPerUnit;
    const hitRadius_px = Math.max(PICK_RADIUS_PX, screenRadius_px);

    if (bodyRadius >= 0.25) {
      occluders.push({ bodyId, camDist, screenX_px, screenY_px, screenRadius_px });
    }

    if (dist_px <= hitRadius_px) {
      candidates.push({
        bodyId,
        dist_px,
        camDist,
        screenX_px,
        screenY_px,
        screenRadius_px,
        isDirectHit: dist_px <= PICK_RADIUS_PX,
      });
    }
  });

  if (candidates.length === 0) {
    return null;
  }

  // Başka bir opak gövdenin (Güneş, gezegen) diskinin arkasında kalan nesneleri filtrele
  const visibleCandidates = candidates.filter((cand) => {
    for (let i = 0; i < occluders.length; i += 1) {
      const occ = occluders[i];
      if (occ.bodyId === cand.bodyId) continue;
      // Occluder kameraya daha yakın olmalı
      if (occ.camDist < cand.camDist - 0.05) {
        // Aday nesnenin ekran izdüşümü bu occluder diskinin içinde mi?
        const candDistToOcc_px = Math.hypot(cand.screenX_px - occ.screenX_px, cand.screenY_px - occ.screenY_px);
        const mouseDistToOcc_px = Math.hypot(mouseX_px - occ.screenX_px, mouseY_px - occ.screenY_px);
        if (candDistToOcc_px <= occ.screenRadius_px * 0.95 && mouseDistToOcc_px <= occ.screenRadius_px) {
          return false; // Örtülmüş (occluded)
        }
      }
    }
    return true;
  });

  const pool = visibleCandidates.length > 0 ? visibleCandidates : candidates;

  let bestCandidate = null;
  pool.forEach((cand) => {
    if (!bestCandidate) {
      bestCandidate = cand;
      return;
    }
    // 1) Doğrudan isabet (32px piksel yarıçapı) büyük diske göre önceliklidir
    if (cand.isDirectHit && !bestCandidate.isDirectHit) {
      bestCandidate = cand;
    } else if (cand.isDirectHit === bestCandidate.isDirectHit) {
      // 2) İkisi de aynı gruptaysa kameraya daha yakın olan ön plandadır
      if (cand.camDist < bestCandidate.camDist - 0.05) {
        bestCandidate = cand;
      } else if (Math.abs(cand.camDist - bestCandidate.camDist) <= 0.05 && cand.dist_px < bestCandidate.dist_px) {
        bestCandidate = cand;
      }
    }
  });

  return bestCandidate ? bestCandidate.bodyId : null;
}

/**
 * Gezegen/uydu zoomlama, merkezleme ve zoom'dan çıkınca Güneş'e dönme kontrolcüsü.
 */
export function createCameraController(threeLib, camera, controls, domElement, getBodyMap, options = {}) {
  const overview = CAMERA_TARGETS.SOLAR_SYSTEM_OVERVIEW;
  let active_focus = overview;
  let is_zooming_to_target = false;
  let has_prev_body_pos = false;
  // Aktif odak geçişi: başlangıç pozu sabit, bitiş pozu her karede canlı hedefe göre hesaplanır
  let transition = null;

  const desiredCamPos = new threeLib.Vector3(...overview.position_units);
  const desiredLookAt = new threeLib.Vector3(...overview.look_at_units);
  const worldPosBuffer = new threeLib.Vector3();
  const prevBodyWorldPos = new threeLib.Vector3();
  const parentWorldPos = new threeLib.Vector3();
  const prevParentWorldPos = new threeLib.Vector3();

  let pointerDownX_px = 0;
  let pointerDownY_px = 0;
  // Sinematik çekim (Güneş patlaması) kamerayı her karede sürer; kullanıcı müdahale ederse bırakır
  let is_cinematic = false;
  let is_cinematic_cancelled = false;
  // Mars yüzeyindeyken tıklama/tekerlek Güneş Sistemi'nde gezegen seçmesin
  let is_input_enabled = true;
  const handleInputEnabled = (enabled) => {
    is_input_enabled = Boolean(enabled);
    if (!is_input_enabled) {
      has_prev_body_pos = false;
      handleCancelTransition();
    }
  };

  // Odağın canlı kamera pozu ve bakış noktası; gövde sahnede yoksa null (geçiş başlatılmaz)
  function getTransitionEnd(bodyMap) {
    if (active_focus.id === 'SOLAR_SYSTEM_OVERVIEW') {
      const [x, y, z] = active_focus.position_units;
      return { position: { x, y, z }, look: { x: 0, y: 0, z: 0 } };
    }
    const node = active_focus.body_id ? bodyMap.get(active_focus.body_id) : null;
    if (!node) return null;
    node.getWorldPosition(worldPosBuffer);
    const body = { x: worldPosBuffer.x, y: worldPosBuffer.y, z: worldPosBuffer.z };
    const dist_units = active_focus.camera_distance_units;
    const parentNode = active_focus.parent_body_id ? bodyMap.get(active_focus.parent_body_id) : null;
    if (parentNode) {
      parentNode.getWorldPosition(parentWorldPos);
      return { position: calculateSatelliteCameraPos(body, parentWorldPos, dist_units), look: body };
    }
    return {
      position: { x: body.x + dist_units * 0.7, y: body.y + dist_units * 0.45, z: body.z + dist_units },
      look: body,
    };
  }

  function getTransitionSpheres(bodyMap) {
    const spheres = [];
    bodyMap.forEach((node, id) => {
      const radius_units = BODY_RADIUS_UNITS.get(id);
      if (!radius_units) return;
      node.getWorldPosition(worldPosBuffer);
      spheres.push({ center: { x: worldPosBuffer.x, y: worldPosBuffer.y, z: worldPosBuffer.z }, radius_units });
    });
    return spheres;
  }

  // Kameranın şu anki konumundan ve bakışından odağa yumuşak geçiş başlatır; ışınlanma yok
  function handleBeginTransition() {
    const end = getTransitionEnd(getBodyMap());
    if (!end) {
      transition = null;
      is_zooming_to_target = false;
      return;
    }
    const look = controls ? controls.target : desiredLookAt;
    const start_position = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    transition = {
      elapsed_s: 0,
      duration_s: calculateTransitionDuration_s(calculateDistance(start_position, end.position)),
      start_position,
      start_look: { x: look.x, y: look.y, z: look.z },
    };
    is_zooming_to_target = true;
  }

  function handleCancelTransition() {
    transition = null;
    is_zooming_to_target = false;
  }

  function handleFocusTarget(targetName) {
    const next_focus = getCameraTarget(targetName);
    if (
      next_focus.id !== 'SOLAR_SYSTEM_OVERVIEW' &&
      active_focus.id === next_focus.id &&
      !is_cinematic &&
      is_input_enabled &&
      (has_prev_body_pos || is_zooming_to_target)
    ) {
      return active_focus;
    }
    active_focus = next_focus;
    has_prev_body_pos = false;
    if (is_cinematic) is_cinematic_cancelled = true;
    is_cinematic = false;
    handleBeginTransition();
    return active_focus;
  }

  function handleTransitionStep(delta_s, bodyMap) {
    const end = getTransitionEnd(bodyMap);
    if (!end) {
      handleCancelTransition();
      return;
    }
    transition.elapsed_s += delta_s;
    const progress = Math.min(1, transition.elapsed_s / transition.duration_s);
    const eased = calculateSmootherstep(progress);
    const position = calculateTransitionPoint(transition.start_position, end.position, getTransitionSpheres(bodyMap), eased);
    camera.position.set(position.x, position.y, position.z);
    const { start_look } = transition;
    desiredLookAt.set(
      start_look.x + (end.look.x - start_look.x) * eased,
      start_look.y + (end.look.y - start_look.y) * eased,
      start_look.z + (end.look.z - start_look.z) * eased
    );
    if (progress >= 1) handleCancelTransition();
    if (controls) {
      controls.target.copy(desiredLookAt);
      controls.update();
    } else {
      camera.lookAt(desiredLookAt);
    }
  }

  /**
   * Sinematik çekimi başlatır ve başlangıç karesini döner; kamera yolu buradan yumuşakça başlar.
   */
  function handleBeginCinematic() {
    is_cinematic = true;
    is_cinematic_cancelled = false;
    handleCancelTransition();
    has_prev_body_pos = false;
    active_focus = CAMERA_TARGETS.SUN;
    const target = controls ? controls.target : desiredLookAt;
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: target.x, y: target.y, z: target.z },
    };
  }

  function handleCinematicShot(position, target) {
    if (is_cinematic_cancelled) return;
    is_cinematic = true;
    desiredCamPos.set(position.x, position.y, position.z);
    desiredLookAt.set(target.x, target.y, target.z);
  }

  function handleEndCinematic() {
    const was_cancelled = is_cinematic_cancelled;
    is_cinematic = false;
    is_cinematic_cancelled = false;
    // Kullanıcı çekim sırasında başka hedefe geçtiyse onun seçimini ezme
    if (!was_cancelled) {
      active_focus = overview;
      desiredLookAt.set(0, 0, 0);
    }
  }

  function handleCenterOnSun() {
    active_focus = overview;
    has_prev_body_pos = false;
    handleCancelTransition();
    desiredLookAt.set(0, 0, 0);
  }

  function handlePointerDown(event) {
    if (!is_input_enabled) return;
    pointerDownX_px = event.clientX || 0;
    pointerDownY_px = event.clientY || 0;
    // Kullanıcı kamerayı tuttuysa otomatik geçiş onunla kavga etmesin
    handleCancelTransition();
    // Patlama kalıcı olduğu için kamera kilidi açıkta kalmasın: kullanıcı tutunca kontrol ona geçer
    if (is_cinematic) {
      is_cinematic = false;
      is_cinematic_cancelled = true;
    }
  }

  function handlePointerUp(event) {
    if (!is_input_enabled) return;
    const moveDist_px = Math.hypot(
      (event.clientX || 0) - pointerDownX_px,
      (event.clientY || 0) - pointerDownY_px
    );
    // Sürükleme değil tıklama ise gezegen/uydu/araç seç ve odaklan
    if (moveDist_px > 6) {
      return;
    }
    const pickedId = getBodyAtPointer(threeLib, event, domElement, camera, getBodyMap());
    if (pickedId) {
      if (typeof options.onFocusTarget === 'function') {
        options.onFocusTarget(pickedId);
      } else {
        handleFocusTarget(pickedId);
      }
    }
  }

  function handleWheelEvent(event) {
    if (!is_input_enabled) return;
    const bodyMap = getBodyMap();
    const isZoomIn = event.deltaY < 0;
    const isZoomOut = event.deltaY > 0;

    // Genel görünümde bir gezegen/uydu/araç üzerine doğru zoom yapılırsa onu merkezle
    if (isZoomIn && active_focus.id === 'SOLAR_SYSTEM_OVERVIEW') {
      const hoveredId = getBodyAtPointer(threeLib, event, domElement, camera, bodyMap);
      if (hoveredId && hoveredId !== 'SUN') {
        if (typeof options.onFocusTarget === 'function') {
          options.onFocusTarget(hoveredId);
        } else {
          handleFocusTarget(hoveredId);
        }
        handleCancelTransition();
        return;
      }
    }

    // Kullanıcı tekerlekle manuel zoom yaptığında otomatik kamera ve sinematik kilidini bırak
    handleCancelTransition();
    if (is_cinematic) {
      is_cinematic = false;
      is_cinematic_cancelled = true;
    }

    // Gezegen/uydudan uzaklaşılınca (zoom out) otomatik olarak Güneş'i merkezle
    if (isZoomOut && active_focus.body_id && active_focus.body_id !== 'SUN') {
      const targetPos = controls ? controls.target : desiredLookAt;
      const dist_units = Math.hypot(
        camera.position.x - targetPos.x,
        camera.position.y - targetPos.y,
        camera.position.z - targetPos.z
      );
      const exitThreshold_units = Math.max(
        active_focus.camera_distance_units * ZOOM_OUT_MULTIPLIER,
        MIN_ZOOM_OUT_UNITS
      );
      if (dist_units >= exitThreshold_units) {
        handleCenterOnSun();
      }
    }
  }

  function handlePointerMove(event) {
    if (!is_input_enabled || !domElement) return;
    const hoveredId = getBodyAtPointer(threeLib, event, domElement, camera, getBodyMap());
    if (domElement.style) {
      domElement.style.cursor = hoveredId ? 'pointer' : 'default';
    }
  }

  if (domElement && typeof domElement.addEventListener === 'function') {
    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('pointermove', handlePointerMove);
    domElement.addEventListener('wheel', handleWheelEvent, { passive: true });
  }

  function handleCameraFrameUpdate(frame_delta_s) {
    const delta_s = Number.isFinite(frame_delta_s) && frame_delta_s > 0
      ? Math.min(frame_delta_s, MAX_FRAME_DELTA_S)
      : DEFAULT_FRAME_DELTA_S;
    if (is_cinematic) {
      // Yol zaten yumuşak; lerp kare atlamalarında oluşabilecek küçük kırıkları da törpüler
      camera.position.lerp(desiredCamPos, 0.2);
      if (controls) {
        controls.target.lerp(desiredLookAt, 0.2);
        controls.update();
      } else {
        camera.lookAt(desiredLookAt);
      }
      return;
    }
    const bodyMap = getBodyMap();

    if (active_focus.body_id && bodyMap.has(active_focus.body_id)) {
      const targetNode = bodyMap.get(active_focus.body_id);
      targetNode.getWorldPosition(worldPosBuffer);
      const parentNode = active_focus.parent_body_id ? bodyMap.get(active_focus.parent_body_id) : null;
      if (parentNode) parentNode.getWorldPosition(parentWorldPos);

      // Gövde hareket ederken kamerayı onunla taşı; uydularda ebeveyn etrafında birlikte döndür.
      // Geçiş sürerken konumu geçişin kendisi her karede canlı hedeften türetir, ayrıca taşımaya gerek yok
      if (has_prev_body_pos && !transition) {
        const prevParent = parentNode ? prevParentWorldPos : null;
        const parent = parentNode ? parentWorldPos : null;
        const cam = calculateFollowedPoint(camera.position, prevBodyWorldPos, worldPosBuffer, prevParent, parent);
        camera.position.set(cam.x, cam.y, cam.z);
        if (controls) {
          const tgt = calculateFollowedPoint(controls.target, prevBodyWorldPos, worldPosBuffer, prevParent, parent);
          controls.target.set(tgt.x, tgt.y, tgt.z);
        }
      }
      prevBodyWorldPos.copy(worldPosBuffer);
      if (parentNode) prevParentWorldPos.copy(parentWorldPos);
      has_prev_body_pos = true;
      desiredLookAt.copy(worldPosBuffer);
    } else {
      // Güneş (0, 0, 0) merkezli görünüm
      desiredLookAt.set(0, 0, 0);
    }

    if (transition) {
      handleTransitionStep(delta_s, bodyMap);
      return;
    }

    if (controls) {
      controls.target.lerp(desiredLookAt, 0.12);
      controls.update();
    } else {
      camera.lookAt(desiredLookAt);
    }
  }

  function destroyCameraController() {
    if (domElement && typeof domElement.removeEventListener === 'function') {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('wheel', handleWheelEvent);
    }
    if (domElement?.style) {
      domElement.style.cursor = '';
    }
  }

  return {
    handleFocusTarget,
    handleBeginCinematic,
    handleCinematicShot,
    handleEndCinematic,
    handleCenterOnSun,
    handleInputEnabled,
    handleCameraFrameUpdate,
    destroyCameraController,
    getActiveFocus: () => active_focus,
    isZoomingToTarget: () => is_zooming_to_target,
    isInputEnabled: () => is_input_enabled,
  };
}
