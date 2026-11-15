import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCraterAlarmPulse,
  calculateCraterHorizonVisibility,
  createMarsCraterBeaconsGroup,
  DEFAULT_ALARM_COLOR_HEX,
  getMarsCraterBeaconParams,
  MARS_CRATER_BEACON_PARAMS,
} from '../src/three/marsCraterBeacons.js';
import { createMockThreeDeps, createZeroCounters } from './mockThree.js';

test('getMarsCraterBeaconParams: Jezero, Gale ve Ares Vallis krater bilgilerini ve ozelliklerini doner', () => {
  const jezero = getMarsCraterBeaconParams('JEZERO');
  const gale = getMarsCraterBeaconParams('CURIOSITY');
  const ares = getMarsCraterBeaconParams('PATHFINDER');

  assert.equal(jezero.crater_name, 'Jezero Crater');
  assert.equal(jezero.rover_id, 'PERSEVERANCE');
  assert.equal(jezero.alarm_color_hex, DEFAULT_ALARM_COLOR_HEX);
  assert.ok(Array.isArray(jezero.features) && jezero.features.length > 0);

  assert.equal(gale.crater_name, 'Gale Crater');
  assert.equal(gale.rover_id, 'CURIOSITY');
  assert.equal(ares.crater_name, 'Ares Vallis');
  assert.equal(ares.rover_id, 'PATHFINDER');
  assert.ok(Object.keys(MARS_CRATER_BEACON_PARAMS).length >= 3);
});

test('calculateCraterAlarmPulse ve calculateCraterHorizonVisibility: cift cakmali alarm, geometri ve ufuk gizleme', () => {
  const pulses = [];
  for (let t = 0; t <= 1.2; t += 0.08) {
    pulses.push(calculateCraterAlarmPulse(t, 1.5, 0));
  }
  const minBlink = Math.min(...pulses.map((p) => p.blink_opacity));
  const maxBlink = Math.max(...pulses.map((p) => p.blink_opacity));
  assert.ok(minBlink < 0.35, 'alarm sonuk fazina inmeli');
  assert.ok(maxBlink > 0.9, 'alarm parlak fazina cikmali');
  assert.ok(pulses.some((p) => p.is_alarm_lit) && pulses.some((p) => !p.is_alarm_lit));
  assert.ok(pulses[2].outer_ring_scale !== pulses[2].ring_scale, 'iki sok halkasi faz farkli genislemeli');

  // Ön yarıküredeki krater kameraya görünür, arka yarıküredeki krater gizlenir
  const marsCenter = { x: 35, y: 0, z: 0 };
  const frontCrater = { x: 35, y: 0, z: 0.85 };
  const backCrater = { x: 35, y: 0, z: -0.85 };
  const camPos = { x: 35, y: 0, z: 4.5 };
  assert.equal(calculateCraterHorizonVisibility(frontCrater, marsCenter, camPos), 1);
  assert.equal(calculateCraterHorizonVisibility(backCrater, marsCenter, camPos), 0);
});

test('createMarsCraterBeaconsGroup: geometrik alarm katmanlarini, Sprite bilgi kartini ve arka plan tetiklemesini kurar', () => {
  const counters = createZeroCounters();
  const { THREE } = createMockThreeDeps(counters);
  const events = [];
  const mockTarget = {
    listeners: new Map(),
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    },
    removeEventListener(type) {
      this.listeners.delete(type);
    },
    dispatchEvent(evt) {
      events.push(evt);
      const fn = this.listeners.get(evt.type);
      if (fn) fn(evt);
    },
  };

  const group = createMarsCraterBeaconsGroup(THREE, 0.85, { eventTarget: mockTarget });
  const jezeroCore = group.getObjectByName('MARS_BEACON_CORE_JEZERO');
  const jezeroCrystal = group.getObjectByName('MARS_BEACON_CRYSTAL_JEZERO');
  const jezeroReticle = group.getObjectByName('MARS_BEACON_RETICLE_JEZERO');
  const jezeroRing = group.getObjectByName('MARS_BEACON_RING_JEZERO');
  const jezeroOuterRing = group.getObjectByName('MARS_BEACON_RING_OUTER_JEZERO');
  const jezeroStem = group.getObjectByName('MARS_BEACON_STEM_JEZERO');
  const jezeroLabel = group.getObjectByName('MARS_BEACON_LABEL_JEZERO');
  const galeBeacon = group.getObjectByName('MARS_BEACON_GALE');

  assert.ok(
    jezeroCore && jezeroCrystal && jezeroReticle && jezeroRing && jezeroOuterRing && jezeroStem && jezeroLabel,
    'tum geometrik alarm katmanlari kurulmali'
  );
  assert.equal(jezeroLabel.isSprite, true, 'bilgi karti uydu takibinde donmemesi icin Sprite olmali');
  assert.equal(jezeroLabel.userData.crater_name, 'Jezero Crater');
  assert.ok(jezeroLabel.userData.rover_label.includes('Perseverance'));

  // Zaman adımıyla alarm yanıp sönmeli, kristal ve nişangah dönmeli, halkalar büyümeli
  group.userData.handleCraterBeaconsFrame(0.15);
  const scaleA = jezeroRing.scale.x;
  const rotA = jezeroCrystal.rotation.z;
  group.userData.handleCraterBeaconsFrame(0.45);
  assert.notEqual(scaleA, jezeroRing.scale.x, 'alarm halkasi zamanla genislemeli');
  assert.notEqual(rotA, jezeroCrystal.rotation.z, 'taktik kristal donmeli');

  // Arka plan parametresiyle sadece GALE krateri tetiklendiğinde diğerleri gizlenmeli
  const state = group.userData.handleTriggerCraterBeacons({
    enabled: true,
    site_id: 'CURIOSITY',
    show_labels: false,
    pulse_frequency_hz: 2.2,
  });
  assert.equal(state.active_site_id, 'GALE');
  assert.equal(galeBeacon.visible, true);
  assert.equal(group.getObjectByName('MARS_BEACON_JEZERO').visible, false);
  assert.equal(jezeroLabel.visible, false);

  mockTarget.dispatchEvent({
    type: 'ag:mars-crater-beacons',
    detail: { enabled: false, site_id: 'ALL', show_labels: true },
  });
  assert.equal(galeBeacon.visible, false);
  group.userData.destroyCraterBeaconsListener();
  assert.equal(mockTarget.listeners.size, 0);
});
