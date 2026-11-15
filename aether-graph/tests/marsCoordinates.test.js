import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateMarsLatLon,
  calculateMarsSurfaceDirection,
  calculateMarsSurfaceFrame,
  calculateMarsSurfacePoint,
  calculateMarsTextureUv,
  calculateSiteOffset,
  calculateSurfaceUnitsFromKm,
  calculateWrappedLongitude_deg,
  getMarsSite,
  MARS_SITES,
} from '../src/three/marsCoordinates.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);

// mars.glb'yi bağımlılıksız okur: node matrisleri uygulanmış ve Box3 merkezine çekilmiş vertex + UV
function readMarsModelVertices() {
  const buf = fs.readFileSync(new URL('../public/models/mars.glb', import.meta.url));
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString());
  const bin = buf.subarray(20 + jsonLength + 8);
  const accessor = (i, n) => {
    const a = json.accessors[i];
    const view = json.bufferViews[a.bufferView];
    const start = bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
    return new Float32Array(bin.buffer.slice(start, start + a.count * n * 4));
  };
  const prim = json.meshes[0].primitives[0];
  const pos = accessor(prim.attributes.POSITION, 3);
  const uv = accessor(prim.attributes.TEXCOORD_0, 2);
  // Kök → mesh node zinciri (sütun öncelikli 4x4); bu modelde hepsi matrix alanıyla verilmiş
  const mul = (A, B) => {
    const C = new Array(16).fill(0);
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) for (let k = 0; k < 4; k += 1) C[j * 4 + i] += A[k * 4 + i] * B[j * 4 + k];
    return C;
  };
  let M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  json.nodes.forEach((node) => {
    if (node.matrix) M = mul(M, node.matrix);
  });
  const pts = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length / 3; i += 1) {
    const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const p = [0, 1, 2].map((r) => M[r] * x + M[4 + r] * y + M[8 + r] * z + M[12 + r]);
    p.forEach((v, k) => {
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    });
    pts.push({ p, u: uv[i * 2], v: uv[i * 2 + 1] });
  }
  const c = min.map((m, k) => (m + max[k]) / 2);
  return pts.map(({ p, u, v }) => {
    const d = { x: p[0] - c[0], y: p[1] - c[1], z: p[2] - c[2] };
    const l = len(d);
    return { dir: { x: d.x / l, y: d.y / l, z: d.z / l }, u, v };
  });
}

test('Kalibrasyon: mars.glb vertex UV\'sinden çıkan enlem/boylam, vertex yönüyle 1° içinde eşleşir', () => {
  const vertices = readMarsModelVertices();
  let checked = 0;
  vertices.forEach(({ dir, u, v }) => {
    const latitude_deg = (v - 0.5) * 180;
    // Kutuplar ve dikiş (u = 0/1) yönü belirsiz, atlanır
    if (Math.abs(latitude_deg) > 85 || u < 0.01 || u > 0.99) return;
    const longitude_deg = u * 360 - 180;
    const expected = calculateMarsSurfaceDirection(latitude_deg, longitude_deg);
    const angle_deg = (Math.acos(Math.min(1, dot(dir, expected))) * 180) / Math.PI;
    assert.ok(angle_deg < 1, `uv(${u.toFixed(3)}, ${v.toFixed(3)}) ${angle_deg.toFixed(2)}° saptı`);
    const uvBack = calculateMarsTextureUv(latitude_deg, longitude_deg);
    assert.ok(near(uvBack.u, u, 1e-6) && near(uvBack.v, v, 1e-6));
    checked += 1;
  });
  assert.ok(checked > 400, `yalnızca ${checked} vertex kontrol edildi`);
});

test('Jezero (18.38, 77.58) ve Gale doğru yarıküreye düşer: kuzey +Y, doğu −Z', () => {
  const jezero = calculateMarsSurfaceDirection(18.38, 77.58);
  assert.ok(near(len(jezero), 1));
  assert.ok(jezero.y > 0.3 && jezero.z < -0.9 && jezero.x > 0, JSON.stringify(jezero));
  const gale = calculateMarsSurfaceDirection(MARS_SITES.GALE.latitude_deg, MARS_SITES.GALE.longitude_deg);
  assert.ok(gale.y < 0 && gale.x < 0 && gale.z < 0, JSON.stringify(gale));
  const prime = calculateMarsSurfaceDirection(0, 0);
  assert.deepEqual([prime.x, prime.y, near(prime.z, 0)], [1, 0, true]);
});

test('Yüzey noktası yarıçapta durur, normal birim ve noktayla aynı yönde', () => {
  const { position, normal } = calculateMarsSurfacePoint(18.38, 77.58, 0.85);
  assert.ok(near(len(position), 0.85));
  assert.ok(near(len(normal), 1));
  assert.ok(near(dot(position, normal), 0.85));
});

test('Enlem/boylam → yön → enlem/boylam gidiş-dönüşü kayıpsız', () => {
  Object.values(MARS_SITES).forEach((site) => {
    const back = calculateMarsLatLon(calculateMarsSurfaceDirection(site.latitude_deg, site.longitude_deg));
    assert.ok(near(back.latitude_deg, site.latitude_deg, 1e-9), site.id);
    assert.ok(near(back.longitude_deg, calculateWrappedLongitude_deg(site.longitude_deg), 1e-9), site.id);
  });
});

test('Yerel çerçeve ortonormal ve sağ elli (doğu × kuzey = yukarı)', () => {
  [[18.38, 77.58], [-4.59, 137.44], [0, -179], [90, 0], [-90, 45]].forEach(([lat, lon]) => {
    const { normal, east, north } = calculateMarsSurfaceFrame(lat, lon);
    [normal, east, north].forEach((v) => assert.ok(near(len(v), 1, 1e-9)));
    assert.ok(near(dot(normal, east), 0) && near(dot(normal, north), 0) && near(dot(east, north), 0));
    const up = { x: east.y * north.z - east.z * north.y, y: east.z * north.x - east.x * north.z, z: east.x * north.y - east.y * north.x };
    assert.ok(near(dot(up, normal), 1, 1e-9));
  });
  // Ekvatorda kuzey +Y, boylam 0'da doğu −Z
  const eq = calculateMarsSurfaceFrame(0, 0);
  assert.ok(near(eq.north.y, 1) && near(eq.east.z, -1));
});

test('Boylam sarma: 354.47°D ile −5.53° aynı nokta, 180/−180 tek değer', () => {
  assert.ok(near(calculateWrappedLongitude_deg(354.4734), -5.5266, 1e-9));
  assert.equal(calculateWrappedLongitude_deg(-180), 180);
  assert.equal(calculateWrappedLongitude_deg(540), 180);
  const a = calculateMarsSurfaceDirection(-1.9462, 354.4734);
  const b = calculateMarsSurfaceDirection(-1.9462, -5.5266);
  assert.ok(near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z));
});

test('Bozuk girdi hata fırlatmaz: NaN/undefined → 0, enlem ±90 ile sınırlanır, yarıçap yedeği 1', () => {
  assert.doesNotThrow(() => calculateMarsSurfacePoint(undefined, 'x', null));
  const p = calculateMarsSurfacePoint(NaN, undefined, -3);
  assert.ok(near(len(p.position), 1));
  assert.ok(near(calculateMarsSurfaceDirection(200, 0).y, 1));
  assert.deepEqual(calculateMarsLatLon({ x: 0, y: 0, z: 0 }), { latitude_deg: 0, longitude_deg: 0 });
  assert.deepEqual(calculateMarsLatLon(null), { latitude_deg: 0, longitude_deg: 0 });
});

test('getMarsSite: site, krater adi ve rover kimligiyle bulur (Jezero, Gale, Ares Vallis), bilinmeyen JEZERO doner', () => {
  assert.equal(getMarsSite('GALE').rover_id, 'CURIOSITY');
  assert.equal(getMarsSite('GALE').crater_name, 'Gale Crater');
  assert.equal(getMarsSite('GALE').model_url, '/public/models/curiosity.glb');
  assert.equal(getMarsSite('CURIOSITY').id, 'GALE');
  assert.equal(getMarsSite('Gale Crater').id, 'GALE');
  assert.equal(getMarsSite('PATHFINDER').id, 'ARES_VALLIS');
  assert.equal(getMarsSite('ARES_VALLIS').crater_name, 'Ares Vallis');
  assert.equal(getMarsSite('ARES_VALLIS').model_url, '/public/models/pathfinder.glb');
  assert.deepEqual([MARS_SITES.ARES_VALLIS.latitude_deg, MARS_SITES.ARES_VALLIS.longitude_deg], [19.13, -33.22]);
  assert.equal(getMarsSite('PERSEVERANCE').id, 'JEZERO');
  assert.equal(getMarsSite('UNKNOWN').id, 'JEZERO');
  assert.equal(getMarsSite(42).id, 'JEZERO');
  assert.deepEqual([MARS_SITES.JEZERO.latitude_deg, MARS_SITES.JEZERO.longitude_deg], [18.38, 77.58]);
});

test('Site ofseti metre cinsinden: 0.01° kuzey ≈ 591.6 m, iniş noktasının kendisi 0', () => {
  const site = getMarsSite('JEZERO');
  const self = calculateSiteOffset(site, site.latitude_deg, site.longitude_deg);
  assert.ok(near(self.east_units, 0) && near(self.north_units, 0));
  const north = calculateSiteOffset(site, site.latitude_deg + 0.01, site.longitude_deg);
  assert.ok(near(north.north_units, 591.6, 0.1), String(north.north_units));
  const east = calculateSiteOffset(site, site.latitude_deg, site.longitude_deg + 0.01);
  assert.ok(near(east.east_units, 591.6 * Math.cos((18.38 * Math.PI) / 180), 0.1));
  assert.equal(calculateSurfaceUnitsFromKm(1.5), 1500);
  assert.equal(calculateSurfaceUnitsFromKm('x'), 0);
});
