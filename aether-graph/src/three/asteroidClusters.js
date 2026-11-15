// Tek bir asteroit kümesi: ana asteroit + çevresinde yuvarlanan küçük parçalar, Dünya etrafında yörüngede.
// Model mesh/materyaline dokunulmaz; klonlar kalıbın geometri ve materyalini paylaşır,
// tehlike çerçevesi aynı geometriyi kullanan ayrı bir mesh'tir.
import {
  ASTEROID_RADIUS_UNITS,
  calculateAsteroidLayout,
  calculateAsteroidMotionStyle,
  calculateAsteroidOrbitUnits,
  calculateDebrisLayout,
  calculateDistanceLevel,
} from './asteroidSwarmConfig.js';
import { ASTEROID_GLOW_FRAGMENT_SHADER, ASTEROID_GLOW_VERTEX_SHADER } from './asteroidGlowShaders.js';
import { calculateRadFromDeg } from './solarSystemConfig.js';
import { calculateEaseInOut } from './flareMath.js';

// Çerçeve kalınlığı geometrinin yarıçapına oranla; küçük parçalarda oran büyük olsun ki görünsün
const MAIN_GLOW_THICKNESS_RATIO = 0.09;
const DEBRIS_GLOW_THICKNESS_RATIO = 0.18;
const DEBRIS_GLOW_DIM = 0.6;
const APPEAR_DURATION_S = 1.4;
const SMOOTHING_PER_S = 2.5;
const SECONDARY_TUMBLE_RATIO = 0.35;
const LABEL_HEIGHT_RATIO = 0.032;
const LABEL_CANVAS_H_PX = 192;
// Yörünge çizgisi tehlike renginin sönük hali: mesafe halkalardan okunsun ama bloom'a girmesin
const ORBIT_PATH_SEGMENTS = 160;
const ORBIT_PATH_OPACITY = 0.22;
const ORBIT_PATH_COLOR_DIM = 0.55;
// Yakın planda çerçeve ekranda geniş yer kaplar ve bloom gövdeyi örter; bu mesafenin altında kısılır
const CLOSE_GLOW_DISTANCE_UNITS = 4;
const CLOSE_GLOW_MIN_FACTOR = 0.25;

function createGlowMaterial(THREE, thickness_units) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uIntensity: { value: 1 },
      uOpacity: { value: 0 },
      uThickness: { value: thickness_units },
    },
    vertexShader: ASTEROID_GLOW_VERTEX_SHADER,
    fragmentShader: ASTEROID_GLOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Kalıp modeli klonlar, istenen yarıçapa ölçekler ve her mesh'e tehlike çerçevesini çocuk olarak ekler.
 */
function createAsteroidBody(THREE, template, radius_units, glowMaterial) {
  const clone = template.modelRoot.clone(true);
  // Önce topla sonra ekle: gezinirken eklenen çerçeve mesh'i tekrar gezilip sonsuz döngü kurmasın
  const meshes = [];
  clone.traverse((node) => {
    if (node.isMesh && node.geometry) meshes.push(node);
  });
  meshes.forEach((node) => {
    const glow = new THREE.Mesh(node.geometry, glowMaterial);
    glow.name = 'ASTEROID_GLOW';
    glow.renderOrder = 2;
    node.add(glow);
  });
  const sizeGroup = new THREE.Group();
  sizeGroup.scale.set(radius_units, radius_units, radius_units);
  sizeGroup.add(clone);
  return sizeGroup;
}

function createTumble(THREE, pivot, axis, speed_deg_s) {
  const primaryAxis = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  // İkinci eksen birinciye dik: iki dönüş üst üste binince düz dönme değil takla görünür
  const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const secondaryAxis = new THREE.Vector3().crossVectors(primaryAxis, helper).normalize();
  const step = new THREE.Quaternion();
  return function handleTumbleFrame(delta_s) {
    step.setFromAxisAngle(primaryAxis, calculateRadFromDeg(speed_deg_s * delta_s));
    pivot.quaternion.premultiply(step);
    step.setFromAxisAngle(secondaryAxis, calculateRadFromDeg(speed_deg_s * SECONDARY_TUMBLE_RATIO * delta_s));
    pivot.quaternion.multiply(step);
  };
}

function createLabelSprite(THREE, text) {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== 'function' || !THREE.CanvasTexture || !THREE.Sprite) {
    return null;
  }
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `600 ${Math.round(LABEL_CANVAS_H_PX * 0.42)}px system-ui, sans-serif`;
  // Tuval genişliği metne göre: uzun isimler kesilmesin. Yüksek çözünürlük: yüksek DPI'da bulanık olmasın
  ctx.font = font;
  canvas.width = Math.ceil(Math.max(ctx.measureText(text).width + LABEL_CANVAS_H_PX * 0.5, LABEL_CANVAS_H_PX));
  canvas.height = LABEL_CANVAS_H_PX;
  // Tuval boyutu değişince bağlam sıfırlanır; yazı ayarları yeniden verilir
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 14;
  // Gri ton bloom eşiğinin altında kalsın: yazı parlamasın, okunaklı kalsın
  ctx.fillStyle = '#c9d3df';
  ctx.fillText(text, canvas.width / 2, LABEL_CANVAS_H_PX / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(LABEL_HEIGHT_RATIO * (canvas.width / LABEL_CANVAS_H_PX), LABEL_HEIGHT_RATIO, 1);
  sprite.renderOrder = 3;
  return sprite;
}

/**
 * Birim yarıçaplı yörünge çizgisi; gerçek yarıçap ölçekle verilir ki mesafe değişince yumuşakça büyüsün.
 */
function createOrbitPath(THREE) {
  const points = [];
  for (let i = 0; i < ORBIT_PATH_SEGMENTS; i += 1) {
    const theta_rad = (i / ORBIT_PATH_SEGMENTS) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(theta_rad), 0, -Math.sin(theta_rad)));
  }
  const material = new THREE.LineBasicMaterial({ color: new THREE.Color(1, 1, 1), transparent: true, opacity: 0, depthWrite: false });
  const path = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  path.name = 'ASTEROID_ORBIT_PATH';
  return path;
}

function calculateSmoothFactor(delta_s) {
  return 1 - Math.exp(-delta_s * SMOOTHING_PER_S);
}

/**
 * Bir asteroit verisinden kümeyi kurar. Dönen nesne her karede güncellenir; veri değişince
 * renk, hız ve yörünge yarıçapı yumuşakça yeni değere kayar (ışınlanma yok).
 */
export function createAsteroidCluster(THREE, template, asteroid, relative_speed) {
  const layout = calculateAsteroidLayout(asteroid.name);
  const root = new THREE.Group();
  root.name = `ASTEROID_${asteroid.name}`;
  root.rotation.x = calculateRadFromDeg(layout.inclination_deg);
  root.rotation.y = calculateRadFromDeg(layout.node_deg);

  const spin = new THREE.Group();
  spin.rotation.y = calculateRadFromDeg(layout.phase_deg);
  root.add(spin);
  // Çizgi eğik yörünge düzleminde (root) durur, asteroitle birlikte dönmez
  const orbitPath = createOrbitPath(THREE);
  root.add(orbitPath);

  const anchor = new THREE.Group();
  anchor.position.set(calculateAsteroidOrbitUnits(asteroid.distance_km), 0, 0);
  spin.add(anchor);

  const appearGroup = new THREE.Group();
  appearGroup.scale.set(0.001, 0.001, 0.001);
  anchor.add(appearGroup);

  const geometryRadius = template.geometry_radius;
  const mainGlow = createGlowMaterial(THREE, geometryRadius * MAIN_GLOW_THICKNESS_RATIO);
  const debrisGlow = createGlowMaterial(THREE, geometryRadius * DEBRIS_GLOW_THICKNESS_RATIO);

  const mainPivot = new THREE.Group();
  mainPivot.add(createAsteroidBody(THREE, template, ASTEROID_RADIUS_UNITS, mainGlow));
  appearGroup.add(mainPivot);
  const tumbles = [createTumble(THREE, mainPivot, layout.tumble_axis, layout.tumble_speed_deg_s)];

  // Parçalar ana asteroidin etrafında yavaşça döner, her biri kendi ekseninde de yuvarlanır
  const debrisSwirl = new THREE.Group();
  appearGroup.add(debrisSwirl);
  for (let i = 0; i < layout.debris_count; i += 1) {
    const debris = calculateDebrisLayout(asteroid.name, i);
    const debrisPivot = new THREE.Group();
    debrisPivot.position.set(debris.offset_units.x, debris.offset_units.y, debris.offset_units.z);
    debrisPivot.add(createAsteroidBody(THREE, template, debris.radius_units, debrisGlow));
    debrisSwirl.add(debrisPivot);
    tumbles.push(createTumble(THREE, debrisPivot, debris.tumble_axis, debris.tumble_speed_deg_s));
  }

  const label = createLabelSprite(THREE, asteroid.name);
  if (label) {
    label.position.set(0, ASTEROID_RADIUS_UNITS * 4, 0);
    anchor.add(label);
  }

  const style = calculateAsteroidMotionStyle(calculateDistanceLevel(asteroid.distance_km), relative_speed);
  const current = { ...style, color_rgb: [...style.color_rgb], orbit_units: anchor.position.x };
  let target = { ...style, orbit_units: anchor.position.x };
  let appear_t = 0;
  let is_removing = false;
  let pulse_phase = 0;

  function handleClusterData(nextAsteroid, nextRelativeSpeed) {
    // Kaybolmakta olan asteroit yeniden gelirse geri büyür, yeniden yaratılmaz
    is_removing = false;
    target = {
      ...calculateAsteroidMotionStyle(calculateDistanceLevel(nextAsteroid.distance_km), nextRelativeSpeed),
      orbit_units: calculateAsteroidOrbitUnits(nextAsteroid.distance_km),
    };
  }

  const worldPos = new THREE.Vector3();

  function calculateCloseGlowFactor(cameraPosition) {
    if (!cameraPosition || typeof anchor.getWorldPosition !== 'function') return 1;
    anchor.getWorldPosition(worldPos);
    const dist_units = Math.hypot(worldPos.x - cameraPosition.x, worldPos.y - cameraPosition.y, worldPos.z - cameraPosition.z);
    return Math.min(Math.max(dist_units / CLOSE_GLOW_DISTANCE_UNITS, CLOSE_GLOW_MIN_FACTOR), 1);
  }

  function handleClusterFrame(delta_s, cameraPosition = null) {
    const k = calculateSmoothFactor(delta_s);
    for (let c = 0; c < 3; c += 1) {
      current.color_rgb[c] += (target.color_rgb[c] - current.color_rgb[c]) * k;
    }
    ['glow_intensity', 'pulse_hz', 'pulse_depth', 'orbit_speed_deg_s', 'orbit_units'].forEach((key) => {
      current[key] += (target[key] - current[key]) * k;
    });

    appear_t += (is_removing ? -delta_s : delta_s) / APPEAR_DURATION_S;
    appear_t = Math.min(Math.max(appear_t, 0), 1);
    const appear = Math.max(calculateEaseInOut(appear_t), 0.001);
    appearGroup.scale.set(appear, appear, appear);
    if (label) label.material.opacity = appear;

    spin.rotation.y += calculateRadFromDeg(current.orbit_speed_deg_s * delta_s);
    anchor.position.x = current.orbit_units;
    orbitPath.scale.set(current.orbit_units, current.orbit_units, current.orbit_units);
    orbitPath.material.color.setRGB(...current.color_rgb.map((c) => c * ORBIT_PATH_COLOR_DIM));
    orbitPath.material.opacity = ORBIT_PATH_OPACITY * appear;
    debrisSwirl.rotation.y += calculateRadFromDeg(current.orbit_speed_deg_s * 1.6 * delta_s);
    tumbles.forEach((handleTumbleFrame) => handleTumbleFrame(delta_s));

    // Faz birikimli tutulur: hız değişince nabız sıçramasın
    pulse_phase += current.pulse_hz * delta_s * Math.PI * 2;
    // 0..1 arası yumuşak dalga; derinlik kadar söner. Kırmızıda neredeyse tamamen söner (alarm gibi)
    const wave = 0.5 + 0.5 * Math.sin(pulse_phase);
    const pulse = (1 - current.pulse_depth + current.pulse_depth * wave) * calculateCloseGlowFactor(cameraPosition);
    [mainGlow, debrisGlow].forEach((material, idx) => {
      material.uniforms.uColor.value.setRGB(...current.color_rgb);
      material.uniforms.uIntensity.value = current.glow_intensity * pulse * (idx === 0 ? 1 : DEBRIS_GLOW_DIM);
      material.uniforms.uOpacity.value = appear;
    });
  }

  function destroyCluster() {
    if (root.parent) root.parent.remove(root);
    mainGlow.dispose();
    debrisGlow.dispose();
    orbitPath.geometry.dispose();
    orbitPath.material.dispose();
    if (label) {
      label.material.map?.dispose();
      label.material.dispose();
    }
  }

  return {
    name: asteroid.name,
    root,
    // Kamera bu düğümü izler: yörüngede döner ama yuvarlanmaz, takip sarsıntısız olur
    focusNode: anchor,
    handleClusterData,
    handleClusterFrame,
    handleClusterRemoval() {
      is_removing = true;
    },
    isClusterRemoving: () => is_removing,
    isClusterGone: () => is_removing && appear_t <= 0,
    destroyCluster,
  };
}
