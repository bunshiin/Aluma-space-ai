// Karşılaştırma sahnesi kamerası: yumuşak geçiş (tween) ve sahne değişiminde kararma perdesi
import { calculateClamp01, calculateSmootherStep, calculateSmoothStep } from './planetComparisonEasing.js';

const FADE_PLANE_DISTANCE_UNITS = 0.3;

function calculateLerp(from, to, t) {
  return from + (to - from) * t;
}

/**
 * Kamera konumunu ve OrbitControls hedefini birlikte yumuşakça taşır; kararma perdesi de burada yönetilir.
 * Geçiş sırasında kullanıcı kontrolü kapatılır ki iki hareket çakışmasın.
 */
export function createComparisonCameraRig(THREE, camera, controls) {
  const fadePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
  );
  fadePlane.name = 'COMPARISON_FADE_PLANE';
  fadePlane.position.set(0, 0, -FADE_PLANE_DISTANCE_UNITS);
  fadePlane.renderOrder = 999;
  fadePlane.visible = false;
  camera.add(fadePlane);

  const lookTarget_units = [0, 0, 0];
  let tween = null;
  const fade = { value: 0, from: 0, to: 0, elapsed_s: 0, duration_s: 0.01, is_active: false };

  function handleApplyLookTarget() {
    if (controls?.target) {
      controls.target.set(...lookTarget_units);
    } else if (typeof camera.lookAt === 'function') {
      camera.lookAt(...lookTarget_units);
    }
  }

  function handleApplyFade() {
    fadePlane.material.opacity = fade.value;
    fadePlane.visible = fade.value > 0.001;
  }

  function handleCameraJump(position_units, target_units) {
    tween = null;
    camera.position.set(...position_units);
    lookTarget_units.splice(0, 3, ...target_units);
    handleApplyLookTarget();
    if (controls) controls.enabled = true;
  }

  function handleCameraTween(position_units, target_units, duration_s) {
    tween = {
      fromPos: [camera.position.x, camera.position.y, camera.position.z],
      fromTarget: [...lookTarget_units],
      toPos: position_units,
      toTarget: target_units,
      elapsed_s: 0,
      duration_s: Math.max(0.01, duration_s),
    };
    if (controls) controls.enabled = false;
  }

  /** Perdeyi anında ayarlar (animasyonu iptal eder). */
  function handleFadeOpacity(opacity) {
    fade.is_active = false;
    fade.value = calculateClamp01(opacity);
    handleApplyFade();
  }

  /** Perdeyi mevcut değerinden hedefe yumuşakça götürür. */
  function handleFadeTo(opacity, duration_s) {
    fade.from = fade.value;
    fade.to = calculateClamp01(opacity);
    fade.elapsed_s = 0;
    fade.duration_s = Math.max(0.01, duration_s);
    fade.is_active = true;
  }

  function handleFadeFrame(delta_s) {
    if (!fade.is_active) return;
    fade.elapsed_s += delta_s;
    const progress = calculateClamp01(fade.elapsed_s / fade.duration_s);
    fade.value = calculateLerp(fade.from, fade.to, calculateSmoothStep(progress));
    if (progress >= 1) fade.is_active = false;
    handleApplyFade();
  }

  /** Bir kare ilerletir; kamera geçişi bu karede bittiyse true döner. */
  function handleCameraFrame(delta_s) {
    handleFadeFrame(delta_s);
    if (!tween) return false;
    tween.elapsed_s += delta_s;
    const progress = calculateClamp01(tween.elapsed_s / tween.duration_s);
    const eased = calculateSmootherStep(progress);
    camera.position.set(
      calculateLerp(tween.fromPos[0], tween.toPos[0], eased),
      calculateLerp(tween.fromPos[1], tween.toPos[1], eased),
      calculateLerp(tween.fromPos[2], tween.toPos[2], eased)
    );
    for (let i = 0; i < 3; i += 1) {
      lookTarget_units[i] = calculateLerp(tween.fromTarget[i], tween.toTarget[i], eased);
    }
    handleApplyLookTarget();
    if (progress < 1) return false;
    tween = null;
    if (controls) controls.enabled = true;
    return true;
  }

  function getTweenProgress() {
    return tween ? calculateClamp01(tween.elapsed_s / tween.duration_s) : 1;
  }

  function getFadeOpacity() {
    return fade.value;
  }

  return {
    handleCameraJump,
    handleCameraTween,
    handleCameraFrame,
    handleFadeOpacity,
    handleFadeTo,
    getTweenProgress,
    getFadeOpacity,
  };
}
