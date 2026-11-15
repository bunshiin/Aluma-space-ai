// Mars rover tekerlek ve hareket mesh ayrıştırıcısı (Perseverance, Curiosity ve Pathfinder).
// Tek mesh içindeki tekerlekler XZ düzleminde 6 kümeye ayrılır; vertex verisi kopyalanmaz, index'ler bölünür.

const CLUSTER_ITERATIONS = 12;
const MIDDLE_WHEEL_TOLERANCE_M = 0.25;

function calculateLocalPoints(threeLib, meshes, inverseRoot) {
  const v = new threeLib.Vector3();
  return meshes.map((mesh) => {
    const toLocal = new threeLib.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const pts = new Float32Array((pos?.count || 0) * 3);
    for (let i = 0; i < (pos?.count || 0); i += 1) {
      if (typeof v.fromBufferAttribute === 'function') {
        v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
      } else if (pos.array) {
        v.set(pos.array[i * 3], pos.array[i * 3 + 1], pos.array[i * 3 + 2]).applyMatrix4(toLocal);
      }
      pts[i * 3] = v.x;
      pts[i * 3 + 1] = v.y;
      pts[i * 3 + 2] = v.z;
    }
    return { mesh, pts, toLocal };
  });
}

function calculateTriangles(local, triFilter = null) {
  const tris = [];
  local.forEach(({ mesh, pts }, mi) => {
    const idx = mesh.geometry.index ? mesh.geometry.index.array : null;
    const n = idx ? idx.length : (mesh.geometry.attributes.position?.count || 0);
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx[i] : i;
      const b = idx ? idx[i + 1] : i + 1;
      const c = idx ? idx[i + 2] : i + 2;
      if (triFilter && !triFilter(a, b, c, mi)) continue;
      tris.push({
        mi, a, b, c,
        cx: (pts[a * 3] + pts[b * 3] + pts[c * 3]) / 3,
        cz: (pts[a * 3 + 2] + pts[b * 3 + 2] + pts[c * 3 + 2]) / 3,
      });
    }
  });
  return tris;
}

/**
 * Üçgen merkezlerini 6 tekere (2 yan × 3 sıra) k-means ile ayırır.
 */
export function calculateWheelClusters(tris) {
  let zmin = Infinity;
  let zmax = -Infinity;
  let xmax = 0;
  tris.forEach((t) => {
    zmin = Math.min(zmin, t.cz);
    zmax = Math.max(zmax, t.cz);
    xmax = Math.max(xmax, Math.abs(t.cx));
  });
  const zm = (zmin + zmax) / 2;
  const zr = ((zmax - zmin) / 2) * 0.8;
  let centers = [];
  [1, -1].forEach((sx) => [zm + zr, zm, zm - zr].forEach((z) => centers.push([sx * xmax * 0.85, z])));
  const labels = new Int8Array(tris.length);
  for (let it = 0; it < CLUSTER_ITERATIONS; it += 1) {
    const acc = centers.map(() => [0, 0, 0]);
    tris.forEach((t, i) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, k) => {
        const d = (t.cx - c[0]) ** 2 + (t.cz - c[1]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      labels[i] = best;
      acc[best][0] += t.cx;
      acc[best][1] += t.cz;
      acc[best][2] += 1;
    });
    centers = centers.map((c, k) => (acc[k][2] ? [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]] : c));
  }
  return { centers, labels };
}

function createWheelPivots(threeLib, wheelsNode, centers, labels, tris, local) {
  const v = new threeLib.Vector3();
  const boxes = centers.map(() => new threeLib.Box3());
  tris.forEach((t, i) => {
    const P = local[t.mi].pts;
    [t.a, t.b, t.c].forEach((j) => {
      if (typeof boxes[labels[i]].expandByPoint === 'function') {
        boxes[labels[i]].expandByPoint(v.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]));
      }
    });
  });
  return centers.map((_, k) => {
    const center = boxes[k].getCenter(new threeLib.Vector3());
    const size = boxes[k].getSize(new threeLib.Vector3());
    const steer = new threeLib.Group();
    steer.name = `wheel_${k}_steer`;
    steer.position.copy(center);
    const spin = new threeLib.Group();
    spin.name = `wheel_${k}_spin`;
    steer.add(spin);
    wheelsNode.add(steer);
    return { steer, spin, center, radius_m: Math.max(size.y, size.z) / 2 || 0.13, buckets: local.map(() => []) };
  });
}

function buildWheelDescriptors(pivots) {
  const zs = pivots.map((w) => w.center.z).sort((a, b) => a - b);
  const z_mid_m = (zs[2] + zs[3]) / 2;
  const wheels = pivots.map((w) => {
    const dz = w.center.z - z_mid_m;
    const position_id = Math.abs(dz) < MIDDLE_WHEEL_TOLERANCE_M ? 'MIDDLE' : dz > 0 ? 'FRONT' : 'REAR';
    return {
      steer: w.steer,
      spin: w.spin,
      side_id: w.center.x > 0 ? 'LEFT' : 'RIGHT',
      position_id,
      is_steerable: position_id !== 'MIDDLE',
      x_m: w.center.x,
      z_m: dz,
      radius_m: w.radius_m,
      delta_rad: 0,
      angle_rad: 0,
    };
  });
  return { wheels, z_mid_m };
}

function attachSplitSubmesh(threeLib, sourceMesh, indices, targetParent, offsetCenter = null, toLocal = null) {
  const g = new threeLib.BufferGeometry();
  Object.keys(sourceMesh.geometry.attributes).forEach((name) => g.setAttribute(name, sourceMesh.geometry.attributes[name]));
  g.setIndex(indices);
  if (typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
  const part = new threeLib.Mesh(g, sourceMesh.material);
  part.castShadow = true;
  part.receiveShadow = true;
  if (offsetCenter && toLocal) {
    part.matrixAutoUpdate = false;
    part.matrix.copy(new threeLib.Matrix4().makeTranslation(-offsetCenter.x, -offsetCenter.y, -offsetCenter.z).multiply(toLocal));
  }
  targetParent.add(part);
  return part;
}

/**
 * Tekerleri ayırır ve { wheels, z_mid_m, detachedGeometries } döner (Perseverance & Curiosity).
 */
export function createSplitWheels(threeLib, wheelsNode) {
  const meshes = [];
  wheelsNode.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  wheelsNode.updateMatrixWorld(true);
  const inverseRoot = new threeLib.Matrix4().copy(wheelsNode.matrixWorld).invert();
  const local = calculateLocalPoints(threeLib, meshes, inverseRoot);
  const tris = calculateTriangles(local);
  const { centers, labels } = calculateWheelClusters(tris);
  const pivots = createWheelPivots(threeLib, wheelsNode, centers, labels, tris, local);
  tris.forEach((t, i) => pivots[labels[i]].buckets[t.mi].push(t.a, t.b, t.c));

  const detachedGeometries = [];
  local.forEach(({ mesh, toLocal }, mi) => {
    pivots.forEach((w) => {
      const ids = w.buckets[mi];
      if (!ids.length) return;
      attachSplitSubmesh(threeLib, mesh, ids, w.spin, w.center, toLocal);
    });
    detachedGeometries.push(mesh.geometry);
    mesh.parent.remove(mesh);
  });

  const { wheels, z_mid_m } = buildWheelDescriptors(pivots);
  return { wheels, z_mid_m, detachedGeometries };
}

/**
 * Pathfinder'ın birleşik tex_suspension_n mesh'inde bağlı bileşen (union-find) analiziyle
 * silindirik 6 tekerlek parçasını sabit rocker-bogie süspansiyon kollarından ayırır.
 */
export function calculatePathfinderWheelMask(pts, indexArray) {
  const nVerts = Math.floor(pts.length / 3);
  const parent = new Int32Array(nVerts);
  for (let i = 0; i < nVerts; i += 1) parent[i] = i;
  const find = (x) => {
    let curr = x;
    while (parent[curr] !== curr) {
      parent[curr] = parent[parent[curr]];
      curr = parent[curr];
    }
    return curr;
  };
  for (let i = 0; i < indexArray.length; i += 3) {
    const ra = find(indexArray[i]);
    const rb = find(indexArray[i + 1]);
    const rc = find(indexArray[i + 2]);
    if (ra !== rb) parent[ra] = rb;
    if (rb !== rc) parent[find(rb)] = rc;
  }
  const bounds = new Map();
  for (let i = 0; i < nVerts; i += 1) {
    const r = find(i);
    let b = bounds.get(r);
    if (!b) {
      b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      bounds.set(r, b);
    }
    const x = pts[i * 3];
    const y = pts[i * 3 + 1];
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  }
  const mask = new Uint8Array(nVerts);
  for (let i = 0; i < nVerts; i += 1) {
    const b = bounds.get(find(i));
    const minAbsX = Math.min(Math.abs(b.minX), Math.abs(b.maxX));
    const isStrut = b.minY > 0.105 && b.maxX - b.minX > 0.035;
    if (b.maxY <= 0.251 && minAbsX >= 0.394 && !isStrut) mask[i] = 1;
  }
  return mask;
}

/**
 * Pathfinder için özel hareket mesh'i kurar: tex_suspension_n içinden 6 tekeri ayırıp süspansiyonu
 * sabit bırakır, ayrıca tex_mast ve tex_arm mesh'lerini kendi hareket pivotlarına bağlar.
 */
export function createPathfinderSplitWheels(threeLib, suspensionMesh) {
  const wheelsGroup = new threeLib.Group();
  wheelsGroup.name = 'PATHFINDER_WHEELS_GROUP';
  const parentNode = suspensionMesh.parent;
  parentNode.add(wheelsGroup);
  wheelsGroup.updateMatrixWorld(true);
  suspensionMesh.updateMatrixWorld(true);

  const inverseRoot = new threeLib.Matrix4().copy(wheelsGroup.matrixWorld).invert();
  const local = calculateLocalPoints(threeLib, [suspensionMesh], inverseRoot);
  const idx = suspensionMesh.geometry.index ? suspensionMesh.geometry.index.array : [];
  const mask = calculatePathfinderWheelMask(local[0].pts, idx);

  const suspensionIds = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (!mask[idx[i]]) suspensionIds.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const wheelTris = calculateTriangles(local, (a) => mask[a] === 1);
  const { centers, labels } = calculateWheelClusters(wheelTris);
  const pivots = createWheelPivots(threeLib, wheelsGroup, centers, labels, wheelTris, local);
  wheelTris.forEach((t, i) => pivots[labels[i]].buckets[0].push(t.a, t.b, t.c));

  pivots.forEach((w) => {
    const ids = w.buckets[0];
    if (ids.length) attachSplitSubmesh(threeLib, suspensionMesh, ids, w.spin, w.center, local[0].toLocal);
  });
  if (suspensionIds.length) {
    const fixed = attachSplitSubmesh(threeLib, suspensionMesh, suspensionIds, wheelsGroup);
    fixed.name = 'PATHFINDER_SUSPENSION_FIXED';
  }
  const detachedGeometries = [suspensionMesh.geometry];
  parentNode.remove(suspensionMesh);

  const { wheels, z_mid_m } = buildWheelDescriptors(pivots);
  return { wheels, z_mid_m, detachedGeometries };
}

/**
 * Motion durumundaki direksiyon ve yuvarlanma açılarını teker pivotlarına yazar.
 */
export function handleWheelPose(wheels) {
  wheels.forEach((wheel) => {
    wheel.steer.rotation.y = wheel.delta_rad;
    wheel.spin.rotation.x = wheel.angle_rad;
  });
}
