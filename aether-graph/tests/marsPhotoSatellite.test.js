import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMarsPhotoQuery,
  createMarsPhotoSatelliteController,
  createMarsPhotoConnection,
  MARS_PHOTO_SATELLITE_ID,
  SATELLITE_CONNECTED_MESSAGE,
} from '../src/three/marsPhotoSatellite.js';
import { calculateTerrainHeight_m } from '../src/three/marsSurfaceEnvironment.js';
import { createMarsRoverSiteAnchors } from '../src/three/marsAtmosphere.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

test('calculateMarsPhotoQuery ve createMarsPhotoConnection: bozuk girdi hata firlatmaz, uydu baglanti mesaji doner', async () => {
  assert.doesNotThrow(() => calculateMarsPhotoQuery(null));
  assert.doesNotThrow(() => calculateMarsPhotoQuery('bozuk'));

  const galeQuery = calculateMarsPhotoQuery({ site_id: 'CURIOSITY' });
  assert.equal(galeQuery.satellite_id, MARS_PHOTO_SATELLITE_ID);
  assert.equal(galeQuery.site_id, 'GALE');
  assert.equal(galeQuery.crater_name, 'Gale Crater');

  const data = createMarsPhotoConnection({ rover_id: 'PATHFINDER' });
  assert.ok(data && typeof data === 'object');
  assert.equal(data.status, 'CONNECTED');
  assert.equal(data.connection_message, SATELLITE_CONNECTED_MESSAGE);
  assert.equal(data.query.site_id, 'ARES_VALLIS');
  assert.equal(data.query.crater_name, 'Ares Vallis');
  assert.equal('photos' in data, false, 'fotoğraf verisi 3D katmanında tutulmaz');
});

test('createMarsPhotoSatelliteController: atmosferden/yuzeyden fotograf istendiginde uydu sahnesini cagirir', async () => {
  const events = new EventTarget();
  const exitCalls = [];
  const focusCalls = [];
  const connectedEvents = [];
  events.addEventListener('ag:satellite-connected', (e) => connectedEvents.push(e.detail));

  const controller = createMarsPhotoSatelliteController({
    marsSurface: {
      isCameraLocked: () => true,
      getActiveSite: () => ({ id: 'GALE' }),
      handleExitRequest: (id) => exitCalls.push(id),
    },
    spacecraftTracker: {
      handleSpacecraftFocus: (detail) => focusCalls.push(detail),
    },
    eventTarget: events,
  });

  events.dispatchEvent(new CustomEvent('ag:mars-photo-request', { detail: { camera_instrument: 'CTX' } }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exitCalls, [MARS_PHOTO_SATELLITE_ID]);
  assert.equal(focusCalls.length, 1);
  assert.equal(focusCalls[0].id, MARS_PHOTO_SATELLITE_ID);
  assert.equal(connectedEvents.length, 1);
  assert.equal(connectedEvents[0].status, 'CONNECTED');
  assert.equal(connectedEvents[0].connection_message, SATELLITE_CONNECTED_MESSAGE);
  assert.equal(connectedEvents[0].query.site_id, 'GALE');
  assert.equal(connectedEvents[0].query.camera_instrument, 'CTX');

  controller.destroyMarsPhotoSatelliteController();
});

test('Mars yuzey topografyasi: merkez rover alani duz, cevrede belirgin tepeler ve cukurlar bulunur', () => {
  assert.equal(calculateTerrainHeight_m(0, 0), 0);
  assert.equal(calculateTerrainHeight_m(3, -4), 0);
  assert.equal(calculateTerrainHeight_m(NaN, undefined), 0);

  // Krater çukuru (-13, 11) negatif yükseklikte, tepe (32, 12) pozitif yükseklikte olmalı
  const craterDepth_m = calculateTerrainHeight_m(-13, 11);
  const hillHeight_m = calculateTerrainHeight_m(32, 12);
  assert.ok(craterDepth_m < -0.5, `çukur yeterince derin değil: ${craterDepth_m}`);
  assert.ok(hillHeight_m > 2.5, `tepe yeterince yüksek değil: ${hillHeight_m}`);
});

test('createMarsRoverSiteAnchors: Jezero, Gale ve Ares Vallis krater dugumlerini Mars kuresine yerlestirir', () => {
  const { THREE } = createMockThreeDeps(createZeroCounters());
  const group = createMarsRoverSiteAnchors(THREE, 0.85);
  assert.equal(group.name, 'MARS_ROVER_SITES');
  assert.equal(group.children.length, 3);
  const names = group.children.map((c) => c.name);
  assert.deepEqual(names, ['MARS_SITE_JEZERO', 'MARS_SITE_GALE', 'MARS_SITE_ARES_VALLIS']);
  const gale = group.getObjectByName('MARS_SITE_GALE');
  assert.equal(gale.userData.rover_id, 'CURIOSITY');
  assert.equal(gale.userData.crater_name, 'Gale Crater');
  const ares = group.getObjectByName('MARS_SITE_ARES_VALLIS');
  assert.equal(ares.userData.rover_id, 'PATHFINDER');
  assert.equal(ares.userData.crater_name, 'Ares Vallis');
});
