// Diğer EONET olayları için kategori renkli, nabız atan küçük işaretler ve ekran üzerinden seçim

import { GLOBE_RADIUS, calculateScenePosition } from "./geoMath.js";
import { getCategoryColorHex } from "./disasterStyles.js";
import { MARKER_FRAGMENT, MARKER_VERTEX } from "./surfaceShaders.js";
import { disposeObjectTree } from "./effectLayers.js";

const MARKER_ALTITUDE = 1.012;
const PICK_RADIUS_PX = 16;

export function createEventMarkers(THREE, shared, events) {
  const list = Array.isArray(events) ? events : [];
  const positions = new Float32Array(list.length * 3);
  const colors = new Float32Array(list.length * 3);
  const seeds = new Float32Array(list.length);
  const color = new THREE.Color();
  const worldPoints = list.map((event, i) => {
    const p = calculateScenePosition(
      event.coordinates.latitude_deg, event.coordinates.longitude_deg, GLOBE_RADIUS * MARKER_ALTITUDE
    );
    positions.set([p.x, p.y, p.z], i * 3);
    color.set(getCategoryColorHex(event.category));
    colors.set([color.r, color.g, color.b], i * 3);
    seeds[i] = Math.random();
    return new THREE.Vector3(p.x, p.y, p.z);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: MARKER_VERTEX,
    fragmentShader: MARKER_FRAGMENT,
    uniforms: { uTime: shared.uTime, uPixelRatio: shared.uPixelRatio, uSize: { value: 30 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  points.renderOrder = 7;

  const projected = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  // Kürenin arkasında kalan işaret seçilmesin diye yüzey normali kameraya bakmalı
  function pickEvent(clientX, clientY, camera, rect) {
    let best = null;
    let bestDist = PICK_RADIUS_PX;
    worldPoints.forEach((point, i) => {
      toCamera.copy(camera.position).sub(point);
      if (toCamera.dot(point) <= 0) return;
      projected.copy(point).project(camera);
      const x = rect.left + ((projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - projected.y) / 2) * rect.height;
      const dist = Math.hypot(x - clientX, y - clientY);
      if (dist < bestDist) {
        bestDist = dist;
        best = list[i];
      }
    });
    return best;
  }

  return {
    object: points,
    pickEvent,
    destroy() {
      points.removeFromParent();
      disposeObjectTree(points);
    },
  };
}
