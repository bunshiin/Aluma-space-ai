// Mars yüzey araçları rig'i: Perseverance, Curiosity ve Pathfinder için tekerlek ve eklem mimarisi.
// Mesh/materyale dokunulmaz; tekerlekler index ayrıştırmasıyla kendi pivotlarında döner.
import { getSanitizedNode } from './solarSystemBuilder.js';
import { createPathfinderSplitWheels, createSplitWheels, handleWheelPose } from './roverWheels.js';

const ROVER_NODE_NAMES = {
  WHEELS: 'Wheels_objs',
  ARM_AZIMUTH: 'arm.003',
  ARM_SHOULDER: 'arm.002',
  ARM_ELBOW: 'arm',
  ARM_WRIST: 'arm.004',
  ARM_TURRET: 'turret_obj',
  DRILL: 'corring_drill',
  MAST_HEAD: 'head',
  HIGH_GAIN_ANTENNA: 'antenna_hg',
};

/**
 * Eklem: parçayı kendi orijini etrafında, rover gövde ekseninde (modelin uzayı) döndürür.
 */
class Joint {
  constructor(threeLib, node, axisInModel, modelRoot, scale = 1) {
    this.node = node;
    this.scale = scale;
    this.rest = node.quaternion.clone();
    const parentQ = new threeLib.Quaternion();
    node.parent.getWorldQuaternion(parentQ);
    const rootQ = new threeLib.Quaternion();
    modelRoot.getWorldQuaternion(rootQ);
    parentQ.premultiply(rootQ.invert());
    this.axis = axisInModel.clone().normalize().applyQuaternion(parentQ.invert()).normalize();
    this.angle_rad = 0;
    this.buffer = new threeLib.Quaternion();
  }

  handleAngle(angle_rad) {
    this.angle_rad = angle_rad * this.scale;
    this.node.quaternion.copy(this.buffer.setFromAxisAngle(this.axis, this.angle_rad)).multiply(this.rest);
  }
}

/**
 * Pan (gövde Y) ve tilt (gövde X) eksenli baş; mast kamerası ve anten için.
 */
class PanTilt {
  constructor(threeLib, node, modelRoot, tiltScale = 1) {
    this.node = node;
    this.tiltScale = tiltScale;
    this.pan = new Joint(threeLib, node, new threeLib.Vector3(0, 1, 0), modelRoot);
    this.tiltAxis = new Joint(threeLib, node, new threeLib.Vector3(1, 0, 0), modelRoot).axis;
    this.pan_rad = 0;
    this.tilt_rad = 0;
    this.panQ = new threeLib.Quaternion();
    this.tiltQ = new threeLib.Quaternion();
  }

  handleAngles(pan_rad, tilt_rad) {
    this.pan_rad = pan_rad;
    this.tilt_rad = tilt_rad * this.tiltScale;
    this.panQ.setFromAxisAngle(this.pan.axis, this.pan_rad);
    this.tiltQ.setFromAxisAngle(this.tiltAxis, this.tilt_rad);
    this.node.quaternion.copy(this.panQ).multiply(this.tiltQ).multiply(this.pan.rest);
  }
}

function calculateTurretAxis(threeLib, model, wrist, turret) {
  const wristP = new threeLib.Vector3();
  const turretP = new threeLib.Vector3();
  wrist.getWorldPosition(wristP);
  turret.getWorldPosition(turretP);
  model.worldToLocal(wristP);
  model.worldToLocal(turretP);
  return turretP.sub(wristP).normalize();
}

function findMeshByMaterialName(root, materialName) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isMesh && o.material?.name === materialName) found = o;
  });
  return found;
}

function wrapMeshesInPivot(threeLib, meshes, pivotName, pivotPos) {
  const valid = meshes.filter(Boolean);
  if (!valid.length || !valid[0].parent) return null;
  const parent = valid[0].parent;
  const pivot = new threeLib.Group();
  pivot.name = pivotName;
  pivot.position.set(pivotPos[0], pivotPos[1], pivotPos[2]);
  parent.add(pivot);
  valid.forEach((m) => {
    m.position.set(m.position.x - pivotPos[0], m.position.y - pivotPos[1], m.position.z - pivotPos[2]);
    pivot.add(m);
  });
  return pivot;
}

function createCuriosityRig(threeLib, model, roverRoot, wheelsMesh) {
  const wheelsGroup = new threeLib.Group();
  wheelsGroup.name = 'CURIOSITY_WHEELS_GROUP';
  wheelsMesh.parent.add(wheelsGroup);
  wheelsGroup.add(wheelsMesh);
  roverRoot.updateMatrixWorld(true);
  const split = createSplitWheels(threeLib, wheelsGroup);
  model.position.z = -split.z_mid_m;
  roverRoot.updateMatrixWorld(true);
  return {
    model,
    rover_type: 'CURIOSITY',
    is_articulated: true,
    has_upper_joints: false,
    wheels: split.wheels,
    detachedGeometries: split.detachedGeometries,
    armJoints: [],
    drill: null,
    mast: null,
    antenna: null,
  };
}

function createPathfinderRig(threeLib, model, roverRoot, suspensionMesh) {
  const split = createPathfinderSplitWheels(threeLib, suspensionMesh);
  model.position.z = -split.z_mid_m;
  const mastMesh = findMeshByMaterialName(model, 'tex_mast');
  const foilMesh = findMeshByMaterialName(model, 'foil_silver');
  const armMesh = findMeshByMaterialName(model, 'tex_arm');
  const mastPivot = wrapMeshesInPivot(threeLib, [mastMesh, foilMesh], 'PATHFINDER_MAST_PIVOT', [-0.044, 0.68, 0.37]);
  const armPivot = wrapMeshesInPivot(threeLib, [armMesh], 'PATHFINDER_ARM_PIVOT', [0, 0.4, 0.24]);
  roverRoot.updateMatrixWorld(true);
  const X = new threeLib.Vector3(1, 0, 0);
  return {
    model,
    rover_type: 'PATHFINDER',
    is_articulated: true,
    has_upper_joints: true,
    wheels: split.wheels,
    detachedGeometries: split.detachedGeometries,
    armJoints: [
      null,
      armPivot ? new Joint(threeLib, armPivot, X, model, 0.35) : null,
      null,
      null,
      null,
    ],
    drill: null,
    mast: mastPivot ? new PanTilt(threeLib, mastPivot, model, 0.35) : null,
    antenna: null,
  };
}

/**
 * Yüklenmiş rover sahnesinden rig kurar (Perseverance, Curiosity ve Pathfinder).
 */
export function createRoverRig(threeLib, model, roverRoot) {
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  roverRoot.add(model);
  roverRoot.updateMatrixWorld(true);

  const wheelsNode = getSanitizedNode(threeLib, model, ROVER_NODE_NAMES.WHEELS);
  if (!wheelsNode) {
    const curiosityWheels = findMeshByMaterialName(model, 'wheels');
    if (curiosityWheels) return createCuriosityRig(threeLib, model, roverRoot, curiosityWheels);
    const pathfinderSusp = findMeshByMaterialName(model, 'tex_suspension_n');
    if (pathfinderSusp) return createPathfinderRig(threeLib, model, roverRoot, pathfinderSusp);
  }

  const get = (name) => getSanitizedNode(threeLib, model, name);
  const split = wheelsNode ? createSplitWheels(threeLib, wheelsNode) : { wheels: [], z_mid_m: 0, detachedGeometries: [] };
  model.position.z = -split.z_mid_m;
  roverRoot.updateMatrixWorld(true);

  const X = new threeLib.Vector3(1, 0, 0);
  const Y = new threeLib.Vector3(0, 1, 0);
  const joint = (name, axis) => {
    const node = get(name);
    return node ? new Joint(threeLib, node, axis, model) : null;
  };
  const wrist = get(ROVER_NODE_NAMES.ARM_WRIST);
  const turret = get(ROVER_NODE_NAMES.ARM_TURRET);
  const turretAxis = wrist && turret ? calculateTurretAxis(threeLib, model, wrist, turret) : X;
  const head = get(ROVER_NODE_NAMES.MAST_HEAD);
  const antenna = get(ROVER_NODE_NAMES.HIGH_GAIN_ANTENNA);

  return {
    model,
    rover_type: 'PERSEVERANCE',
    is_articulated: true,
    has_upper_joints: true,
    wheels: split.wheels,
    detachedGeometries: split.detachedGeometries,
    armJoints: [
      joint(ROVER_NODE_NAMES.ARM_AZIMUTH, Y),
      joint(ROVER_NODE_NAMES.ARM_SHOULDER, X),
      joint(ROVER_NODE_NAMES.ARM_ELBOW, X),
      wrist ? new Joint(threeLib, wrist, X, model) : null,
      turret ? new Joint(threeLib, turret, turretAxis, model) : null,
    ],
    drill: get(ROVER_NODE_NAMES.DRILL),
    mast: head ? new PanTilt(threeLib, head, model) : null,
    antenna: antenna ? new PanTilt(threeLib, antenna, model) : null,
  };
}

/**
 * roverMotion durumunu rig'e uygular: gövde konumu/yönü, 6 tekerlek, kol, matkap, mast ve anten.
 */
export function handleRoverRigPose(rig, roverRoot, state) {
  if (!rig) return;
  roverRoot.position.x = state.drive.x_m;
  roverRoot.position.z = state.drive.z_m;
  roverRoot.rotation.y = state.drive.yaw_rad;
  handleWheelPose(rig.wheels);
  rig.armJoints.forEach((j, k) => {
    if (j) j.handleAngle(state.arm_rad[k]);
  });
  if (rig.drill) rig.drill.rotation.y = state.drill_rad;
  if (rig.mast) rig.mast.handleAngles(state.mast_rad[0], state.mast_rad[1]);
  if (rig.antenna) rig.antenna.handleAngles(state.mast_rad[2], state.mast_rad[3]);
}
