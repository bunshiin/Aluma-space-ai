import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculatePathfinderWheelMask, calculateWheelClusters, handleWheelPose } from '../src/three/roverWheels.js';

// 6 teker merkezi etrafında sahte üçgen merkezleri (Perseverance tek mesh tekeri gibi)
function createWheelTriangles() {
  const centers = [];
  [0.95, -0.95].forEach((x) => [1.1, 0, -1.1].forEach((z) => centers.push([x, z])));
  const tris = [];
  centers.forEach(([x, z], k) => {
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      tris.push({ cx: x + Math.cos(a) * 0.12, cz: z + Math.sin(a) * 0.25, wheel: k });
    }
  });
  return { tris, centers };
}

test('Üçgen kümeleme her tekeri ayrı kümeye koyar, küme merkezleri teker merkezine oturur', () => {
  const { tris, centers } = createWheelTriangles();
  const result = calculateWheelClusters(tris);
  assert.equal(result.centers.length, 6);
  const labelOfWheel = new Map();
  tris.forEach((t, i) => {
    const label = result.labels[i];
    if (!labelOfWheel.has(t.wheel)) labelOfWheel.set(t.wheel, label);
    assert.equal(label, labelOfWheel.get(t.wheel), 'bir tekerin üçgenleri iki kümeye bölündü');
  });
  assert.equal(new Set(labelOfWheel.values()).size, 6);
  labelOfWheel.forEach((label, wheel) => {
    const [cx, cz] = result.centers[label];
    assert.ok(Math.hypot(cx - centers[wheel][0], cz - centers[wheel][1]) < 0.02);
  });
});

test('Teker pozu direksiyonu steer.y, yuvarlanmayı spin.x eksenine yazar', () => {
  const wheel = { steer: { rotation: { y: 0 } }, spin: { rotation: { x: 0 } }, delta_rad: 0.3, angle_rad: 2.5 };
  handleWheelPose([wheel]);
  assert.equal(wheel.steer.rotation.y, 0.3);
  assert.equal(wheel.spin.rotation.x, 2.5);
});

test('Curiosity (curiosity.glb) ve Pathfinder (pathfinder.glb) modellerinde 6 tekerlek ayrıştırılır', () => {
  const readPrim = (file, pi) => {
    const b = fs.readFileSync(new URL(`../public/models/${file}`, import.meta.url));
    const len = b.readUInt32LE(12);
    const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
    const bin = b.subarray(20 + len + 8);
    const p = j.meshes[0].primitives[pi];
    const aPos = j.accessors[p.attributes.POSITION];
    const vPos = j.bufferViews[aPos.bufferView];
    const posStart = bin.byteOffset + (vPos.byteOffset || 0) + (aPos.byteOffset || 0);
    const pts = new Float32Array(bin.buffer.slice(posStart, posStart + aPos.count * 12));
    const aIdx = j.accessors[p.indices];
    const vIdx = j.bufferViews[aIdx.bufferView];
    const idxStart = bin.byteOffset + (vIdx.byteOffset || 0) + (aIdx.byteOffset || 0);
    const idx = aIdx.componentType === 5123
      ? new Uint16Array(bin.buffer.slice(idxStart, idxStart + aIdx.count * 2))
      : new Uint32Array(bin.buffer.slice(idxStart, idxStart + aIdx.count * 4));
    return { pts, idx };
  };

  // Curiosity: prim 0 (wheels) 6 eşit tekere ayrılır
  const cur = readPrim('curiosity.glb', 0);
  const curTris = [];
  for (let i = 0; i < cur.idx.length; i += 3) {
    const a = cur.idx[i], b = cur.idx[i + 1], c = cur.idx[i + 2];
    curTris.push({ cx: (cur.pts[a * 3] + cur.pts[b * 3] + cur.pts[c * 3]) / 3, cz: (cur.pts[a * 3 + 2] + cur.pts[b * 3 + 2] + cur.pts[c * 3 + 2]) / 3 });
  }
  const curClusters = calculateWheelClusters(curTris);
  assert.equal(curClusters.centers.length, 6);
  assert.equal(new Set(curClusters.labels).size, 6);

  // Pathfinder: prim 4 (tex_suspension_n) içinden süspansiyon kolları ayrılır, 6 tekerlek çıkarılır
  const pf = readPrim('pathfinder.glb', 4);
  const mask = calculatePathfinderWheelMask(pf.pts, pf.idx);
  const pfWheelTris = [];
  let pfSuspTris = 0;
  for (let i = 0; i < pf.idx.length; i += 3) {
    const a = pf.idx[i], b = pf.idx[i + 1], c = pf.idx[i + 2];
    if (mask[a]) {
      pfWheelTris.push({ cx: (pf.pts[a * 3] + pf.pts[b * 3] + pf.pts[c * 3]) / 3, cz: (pf.pts[a * 3 + 2] + pf.pts[b * 3 + 2] + pf.pts[c * 3 + 2]) / 3 });
    } else {
      pfSuspTris += 1;
    }
  }
  assert.ok(pfWheelTris.length > 4000, 'Pathfinder teker üçgenleri bulunamadı');
  assert.ok(pfSuspTris > 4000, 'Pathfinder sabit süspansiyon üçgenleri ayrılmadı');
  const pfClusters = calculateWheelClusters(pfWheelTris);
  assert.equal(pfClusters.centers.length, 6);
  assert.equal(new Set(pfClusters.labels).size, 6);
});
