// Güneş Sistemi sahnesi (SOLAR_SYSTEM) içinde Dünya merkezli asteroit sürüsü (NEO_SWARM) katmanı.
// Asteroit paketi dosyalarını değiştirmeden içe aktarır, ölçeği SOLAR_SYSTEM birimlerine sıkıştırır.
import { EARTH_RADIUS_KM, ORBIT_RADIUS_KM } from '../physics/spacePhysics.js';
import { createAsteroidCluster } from './asteroidClusters.js';
import { createSceneEventInbox, getGeometryRadius, getLoadedModel } from './asteroidSceneSetup.js';
import {
  ASTEROID_MODEL_URLS,
  ASTEROID_RADIUS_UNITS,
  calculateAsteroidOrbitUnits,
  calculateMoonOrbitUnits,
  calculateRelativeSpeeds,
  EARTH_RADIUS_UNITS,
  getSanitizedAsteroids,
  isBennuAsteroid,
  MAX_ASTEROID_COUNT,
} from './asteroidSwarmConfig.js';
import { CAMERA_TARGETS, getCameraTarget } from './solarSystemConfig.js';

export const SOLAR_EARTH_RADIUS_UNITS = 1.15;
export const SOLAR_MOON_ORBIT_UNITS = 2.6;
export const SOLAR_ORBIT_MIN_UNITS = 1.55;
export const SOLAR_ORBIT_MAX_UNITS = 5.8;

const DEFAULT_EARTH_CAMERA_DISTANCE_UNITS = 5.0;
const SWARM_EARTH_CAMERA_DISTANCE_UNITS = 14.0;

export const ASTEROID_SCALE_RATIO = SOLAR_EARTH_RADIUS_UNITS / EARTH_RADIUS_UNITS;
export const SOLAR_ASTEROID_RADIUS_UNITS = ASTEROID_RADIUS_UNITS * ASTEROID_SCALE_RATIO;
export const SOLAR_ASTEROID_CAMERA_DISTANCE_UNITS = SOLAR_ASTEROID_RADIUS_UNITS * 9;

const PKG_ORBIT_MIN_UNITS = calculateAsteroidOrbitUnits(EARTH_RADIUS_KM);
const PKG_ORBIT_MOON_UNITS = calculateMoonOrbitUnits();
const PKG_ORBIT_MAX_UNITS = calculateAsteroidOrbitUnits(ORBIT_RADIUS_KM.EARTH * 0.5);

/**
 * Paket yörünge yarıçapını (2.15..20) SOLAR_SYSTEM ölçeğine (1.55..5.8) log sırayı koruyarak sıkıştırır.
 */
export function calculateSolarOrbitFromPackageUnits(pkg_units) {
  if (typeof pkg_units !== 'number' || !Number.isFinite(pkg_units) || pkg_units <= PKG_ORBIT_MIN_UNITS) {
    return SOLAR_ORBIT_MIN_UNITS;
  }
  if (pkg_units >= PKG_ORBIT_MAX_UNITS) {
    return SOLAR_ORBIT_MAX_UNITS;
  }
  if (pkg_units <= PKG_ORBIT_MOON_UNITS) {
    const t = (pkg_units - PKG_ORBIT_MIN_UNITS) / (PKG_ORBIT_MOON_UNITS - PKG_ORBIT_MIN_UNITS);
    return SOLAR_ORBIT_MIN_UNITS + t * (SOLAR_MOON_ORBIT_UNITS - SOLAR_ORBIT_MIN_UNITS);
  }
  const t = (pkg_units - PKG_ORBIT_MOON_UNITS) / (PKG_ORBIT_MAX_UNITS - PKG_ORBIT_MOON_UNITS);
  return SOLAR_MOON_ORBIT_UNITS + t * (SOLAR_ORBIT_MAX_UNITS - SOLAR_MOON_ORBIT_UNITS);
}

/**
 * Kilometre cinsinden yaklaşma mesafesini SOLAR_SYSTEM içi Dünya merkezli yörünge yarıçapına çevirir.
 */
export function calculateSolarAsteroidOrbitUnits(distance_km) {
  return calculateSolarOrbitFromPackageUnits(calculateAsteroidOrbitUnits(distance_km));
}

function applyClusterSolarScale(cluster) {
  const anchor = cluster?.focusNode;
  if (!anchor) return;
  const solarOrbit_units = calculateSolarOrbitFromPackageUnits(anchor.position.x);
  anchor.position.x = solarOrbit_units;

  const orbitPath = cluster.root?.children?.find((child) => child?.name === 'ASTEROID_ORBIT_PATH');
  if (orbitPath?.scale) {
    orbitPath.scale.set(solarOrbit_units, solarOrbit_units, solarOrbit_units);
  }

  // Parçalar ve ana gövde appearGroup altında olduğu için tek çarpan ikisini birlikte Dünya oranına indirir
  const appearGroup = anchor.children?.[0];
  if (appearGroup?.scale) {
    appearGroup.scale.multiplyScalar(ASTEROID_SCALE_RATIO);
  }

  const label = anchor.children?.[1];
  if (label?.position) {
    label.position.y = ASTEROID_RADIUS_UNITS * 4 * ASTEROID_SCALE_RATIO;
  }
}

/**
 * SOLAR_SYSTEM içinde asteroit sürüsünü Dünya düğümüne bağlayan kontrolcüyü kurar.
 */
export function createSolarSystemAsteroids(THREE, gltfLoader, scene, camera, cameraController, getBodyMap) {
  // Olay dinleyicileri model yüklenmeden önce kurulur ki erken gelen veri ve odak kaybolmasın
  const inbox = createSceneEventInbox();
  const clusters = new Map();
  const activeAsteroidMap = new Map();
  const registeredTargetNames = new Set();
  const templates = {};

  let templateGroup = null;
  let is_destroyed = false;
  let has_warned_no_template = false;

  function setEarthSwarmCameraDistance(hasAsteroids) {
    if (CAMERA_TARGETS.EARTH) {
      CAMERA_TARGETS.EARTH.camera_distance_units = hasAsteroids
        ? SWARM_EARTH_CAMERA_DISTANCE_UNITS
        : DEFAULT_EARTH_CAMERA_DISTANCE_UNITS;
    }
  }

  function registerAsteroidTarget(name, focusNode) {
    const bodyMap = getBodyMap();
    if (bodyMap && typeof bodyMap.set === 'function') {
      bodyMap.set(name, focusNode);
    }
    CAMERA_TARGETS[name] = {
      id: name,
      body_id: name,
      camera_distance_units: SOLAR_ASTEROID_CAMERA_DISTANCE_UNITS,
    };
    registeredTargetNames.add(name);
  }

  function unregisterAsteroidTarget(name) {
    const bodyMap = getBodyMap();
    if (bodyMap && typeof bodyMap.delete === 'function') {
      bodyMap.delete(name);
    }
    delete CAMERA_TARGETS[name];
    registeredTargetNames.delete(name);
  }

  function handleFocusTarget(targetName) {
    // Araç takma adları (örn. "voyager 1") tabloda ham haliyle yok; çözümlemeyi camera hedef tablosu yapar
    if (typeof targetName !== 'string' || !targetName.trim() || getCameraTarget(targetName).id === 'SOLAR_SYSTEM_OVERVIEW' && targetName !== 'SOLAR_SYSTEM_OVERVIEW') {
      console.warn('solarSystemAsteroids: bilinmeyen odak hedefi, genel görünüme dönülüyor:', targetName);
      const fallbackId = registeredTargetNames.size > 0 ? 'EARTH' : 'SOLAR_SYSTEM_OVERVIEW';
      return cameraController.handleFocusTarget(fallbackId);
    }
    return cameraController.handleFocusTarget(targetName);
  }

  function handleAsteroidData(rawList, is_append = false) {
    if (is_destroyed) return;
    if (!Array.isArray(rawList)) {
      console.warn('solarSystemAsteroids: geçersiz asteroit listesi alındı, görmezden gelindi.');
      return;
    }
    if (!templates.BENNU && !templates.GENERIC) {
      if (!has_warned_no_template) console.warn('solarSystemAsteroids: asteroit modelleri yüklenemedi.');
      has_warned_no_template = true;
      return;
    }

    const incoming = getSanitizedAsteroids(rawList);
    if (!is_append) {
      activeAsteroidMap.clear();
    }
    incoming.forEach((asteroid) => activeAsteroidMap.set(asteroid.name, asteroid));

    const asteroids = Array.from(activeAsteroidMap.values()).slice(-MAX_ASTEROID_COUNT);
    const relativeSpeeds = calculateRelativeSpeeds(asteroids);
    const parentNode = getBodyMap()?.get('EARTH') || scene;
    const incomingNames = new Set();

    asteroids.forEach((asteroid, idx) => {
      incomingNames.add(asteroid.name);
      const existing = clusters.get(asteroid.name);
      if (existing) {
        existing.handleClusterData(asteroid, relativeSpeeds[idx]);
        registerAsteroidTarget(asteroid.name, existing.focusNode);
        return;
      }
      const template = (isBennuAsteroid(asteroid.name) && templates.BENNU) || templates.GENERIC || templates.BENNU;
      const cluster = createAsteroidCluster(THREE, template, asteroid, relativeSpeeds[idx]);
      applyClusterSolarScale(cluster);
      parentNode.add(cluster.root);
      clusters.set(asteroid.name, cluster);
      registerAsteroidTarget(asteroid.name, cluster.focusNode);
    });

    const activeFocusId = cameraController.getActiveFocus?.()?.id;
    let removedActiveFocus = false;
    clusters.forEach((cluster, name) => {
      if (!incomingNames.has(name)) {
        cluster.handleClusterRemoval();
        unregisterAsteroidTarget(name);
        if (activeFocusId === name) removedActiveFocus = true;
      }
    });

    setEarthSwarmCameraDistance(incomingNames.size > 0);
    if (removedActiveFocus) {
      handleFocusTarget(incomingNames.size > 0 ? 'EARTH' : 'SOLAR_SYSTEM_OVERVIEW');
    }
  }

  async function handleInitAsteroids(isParentDestroyed = () => false) {
    if (is_destroyed || isParentDestroyed()) return;
    templateGroup = new THREE.Group();
    templateGroup.name = 'ASTEROID_TEMPLATES';
    templateGroup.visible = false;
    scene.add(templateGroup);

    const loadPlan = [
      { key: 'BENNU', url: ASTEROID_MODEL_URLS.BENNU },
      { key: 'GENERIC', url: ASTEROID_MODEL_URLS.GENERIC },
    ];
    const loaded = await Promise.all(
      loadPlan.map(async (item) => ({
        key: item.key,
        modelRoot: await getLoadedModel(THREE, gltfLoader, item.url, 1),
      }))
    );

    if (is_destroyed || isParentDestroyed()) return;
    loaded.forEach(({ key, modelRoot }) => {
      if (!modelRoot) return;
      templateGroup.add(modelRoot);
      templates[key] = { modelRoot, geometry_radius: getGeometryRadius(modelRoot) };
    });

    inbox.handleInboxReady(handleAsteroidData, handleFocusTarget);
  }

  function handleAsteroidsFrameUpdate(delta_s) {
    if (is_destroyed) return;
    clusters.forEach((cluster, name) => {
      cluster.handleClusterFrame(delta_s, camera.position);
      applyClusterSolarScale(cluster);
      if (cluster.isClusterGone()) {
        cluster.destroyCluster();
        clusters.delete(name);
      }
    });
  }

  function destroyAsteroidsController() {
    if (is_destroyed) return;
    is_destroyed = true;
    inbox.destroyInbox();
    clusters.forEach((cluster) => cluster.destroyCluster());
    clusters.clear();
    activeAsteroidMap.clear();
    Array.from(registeredTargetNames).forEach((name) => unregisterAsteroidTarget(name));
    setEarthSwarmCameraDistance(false);
  }

  return {
    handleInitAsteroids,
    handleAsteroidsFrameUpdate,
    handleFocusTarget,
    destroyAsteroidsController,
  };
}
