// Kamera odaklama: olaya tepeden değil eğik açıyla bakılır ki kül sütunu/duman profilden ve ufukla görünsün
// Kamera konumu küre merkezine göre küresel olarak taşınır (doğrusal geçiş Dünya'nın içinden geçerdi)

const FOCUS_DURATION_S = 2.4;
// [normal yönü, güney yönü] bileşenleri: kasırga daha yüksekten, diğerleri alçak eğik açıyla
const FOCUS_OFFSETS = { STORM: [1.05, 0.55], VOLCANO: [0.23, 0.38], DEFAULT: [0.38, 0.5] };
const ORBIT_LIMITS = { FOCUSED: [0.12, 6], GLOBAL: [1.35, 7] };

const WORLD_UP = [0, 1, 0];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCameraFocus(THREE, camera, controls) {
  let tween = null;
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Güney yarımkürede dünya-yukarısı bakış yönüyle çakışır ve sütun ekranda ters görünür;
  // bu yüzden odakta kameranın yukarısı yüzey normali olur. OrbitControls bu dönüşümü sadece kurulumda
  // hesapladığı için (_quat) burada güncellenir
  function applyCameraUp(up) {
    camera.up.copy(up);
    controls._quat.setFromUnitVectors(camera.up, yAxis);
    controls._quatInverse.copy(controls._quat).invert();
  }

  function setOrbitLimits(limits) {
    controls.minDistance = limits[0];
    controls.maxDistance = limits[1];
  }

  function start(nowS, endPosition, endTarget, endUp, limits) {
    const fromPos = camera.position.clone();
    tween = {
      start_s: nowS,
      up_rotation: new THREE.Quaternion().setFromUnitVectors(camera.up.clone().normalize(), endUp),
      from_up: camera.up.clone().normalize(),
      from_dir: fromPos.clone().normalize(),
      rotation: new THREE.Quaternion().setFromUnitVectors(fromPos.clone().normalize(), endPosition.clone().normalize()),
      from_radius: fromPos.length(),
      to_radius: endPosition.length(),
      from_target: controls.target.clone(),
      to_target: endTarget,
      limits,
    };
    // Geçiş sırasında sınırlar kamerayı geri itmesin
    setOrbitLimits([0.01, 100]);
    controls.autoRotate = false;
  }

  return {
    // mode: "STORM" geniş, "VOLCANO" yakın ve alçak açı (dağ profili okunsun), diğerleri varsayılan
    focusOnSurface(nowS, normalArray, mode) {
      const n = new THREE.Vector3(...normalArray).normalize();
      let east = new THREE.Vector3(0, 1, 0).cross(n);
      if (east.lengthSq() < 1e-6) east = new THREE.Vector3(1, 0, 0);
      east.normalize();
      const north = n.clone().cross(east).normalize();
      const [up, back] = FOCUS_OFFSETS[mode] || FOCUS_OFFSETS.DEFAULT;
      const surfacePoint = n.clone();
      const lookTarget = surfacePoint.clone().addScaledVector(n, 0.06);
      const endPosition = surfacePoint.clone().addScaledVector(n, up).addScaledVector(north, -back);
      start(nowS, endPosition, lookTarget, n.clone(), ORBIT_LIMITS.FOCUSED);
    },
    reset(nowS, distance) {
      start(nowS, new THREE.Vector3(0, 0.26, 1).normalize().multiplyScalar(distance), new THREE.Vector3(0, 0, 0), new THREE.Vector3(...WORLD_UP), ORBIT_LIMITS.GLOBAL);
    },
    cancel() {
      if (tween) setOrbitLimits(tween.limits);
      tween = null;
    },
    update(nowS) {
      if (!tween) return;
      const t = Math.min((nowS - tween.start_s) / FOCUS_DURATION_S, 1);
      const k = easeInOutCubic(t);
      const rotation = new THREE.Quaternion().slerp(tween.rotation, k);
      const radius = THREE.MathUtils.lerp(tween.from_radius, tween.to_radius, k);
      camera.position.copy(tween.from_dir.clone().applyQuaternion(rotation).multiplyScalar(radius));
      controls.target.lerpVectors(tween.from_target, tween.to_target, k);
      applyCameraUp(tween.from_up.clone().applyQuaternion(new THREE.Quaternion().slerp(tween.up_rotation, k)));
      if (t >= 1) {
        setOrbitLimits(tween.limits);
        tween = null;
      }
    },
  };
}
