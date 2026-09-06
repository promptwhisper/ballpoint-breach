import * as THREE from 'three';
import { createHandDrawnEdgesGeometry, DoodleMaterial } from '../render';
import type { WeaponId } from './types';

const PALETTE = Object.freeze({
  paper: 0xf6f0dc,
  paperShade: 0xd7d8df,
  lavender: 0xb8bbd8,
  blueInk: 0x27348f,
  darkBlue: 0x18246f,
  redInk: 0xd63b55,
  orangeInk: 0xe79a32,
});

type PartMaterial = 'paper' | 'shade' | 'hatch' | 'deepHatch' | 'ink' | 'red' | 'orange' | 'lens';
type Vec3 = readonly [number, number, number];

export interface ViewmodelPose {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: number;
}

export interface WeaponViewmodelParts {
  readonly muzzle: THREE.Object3D;
  readonly magazine?: THREE.Object3D;
  readonly pump?: THREE.Object3D;
  readonly bolt?: THREE.Object3D;
  readonly cylinder?: THREE.Object3D;
  readonly hammer?: THREE.Object3D;
  readonly blade?: THREE.Object3D;
  readonly action?: THREE.Object3D;
  readonly trail?: THREE.Object3D;
  readonly sight?: THREE.Object3D;
}

export interface WeaponViewmodel {
  readonly id: WeaponId;
  readonly root: THREE.Group;
  readonly hipPose: ViewmodelPose;
  readonly aimPose: ViewmodelPose;
  readonly parts: WeaponViewmodelParts;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false);
const unitCylinder8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false);
const unitCylinder12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false);
const unitDodecahedron = new THREE.DodecahedronGeometry(0.5, 0);
const unitSphere8 = new THREE.SphereGeometry(0.5, 8, 6);
const unitTorus = new THREE.TorusGeometry(0.5, 0.075, 6, 18);

const edgeCache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
const outlineMaterial = new THREE.LineBasicMaterial({
  color: PALETTE.blueInk,
  transparent: true,
  opacity: 0.94,
  depthTest: true,
  depthWrite: false,
  vertexColors: true,
});
const softOutlineMaterial = new THREE.LineBasicMaterial({
  color: PALETTE.blueInk,
  transparent: true,
  opacity: 0.5,
  depthTest: true,
  depthWrite: false,
  vertexColors: true,
});
const katanaTrailMaterial = new THREE.MeshBasicMaterial({
  color: PALETTE.blueInk,
  transparent: true,
  opacity: 0.34,
  depthTest: false,
  depthWrite: false,
});
const katanaTrailGhostMaterial = new THREE.MeshBasicMaterial({
  color: PALETTE.redInk,
  transparent: true,
  opacity: 0.16,
  depthTest: false,
  depthWrite: false,
});

const materials: Readonly<Record<PartMaterial, THREE.Material>> = Object.freeze({
  paper: new DoodleMaterial({ surfaceColor: PALETTE.paper, hatchScale: 7.2, hatchStrength: 0.46, seed: 11.2 }),
  shade: new DoodleMaterial({ surfaceColor: PALETTE.paperShade, hatchScale: 7.2, hatchStrength: 0.72, seed: 12.4 }),
  hatch: new DoodleMaterial({ surfaceColor: PALETTE.lavender, hatchScale: 7.0, hatchStrength: 0.9, seed: 13.8 }),
  deepHatch: new DoodleMaterial({ surfaceColor: PALETTE.lavender, hatchScale: 6.8, hatchStrength: 1.14, seed: 15.1 }),
  ink: new THREE.MeshBasicMaterial({ color: PALETTE.darkBlue }),
  red: new THREE.MeshBasicMaterial({ color: PALETTE.redInk }),
  orange: new THREE.MeshBasicMaterial({ color: PALETTE.orangeInk }),
  lens: new THREE.MeshBasicMaterial({
    color: PALETTE.paper,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
});

function outlineVariant(name: string): number {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 7;
}

function edgesFor(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  const variant = outlineVariant(name);
  let variants = edgeCache.get(geometry);
  if (!variants) {
    variants = new Map<number, THREE.BufferGeometry>();
    edgeCache.set(geometry, variants);
  }
  const cached = variants.get(variant);
  if (cached) return cached;
  const edges = createHandDrawnEdgesGeometry(geometry, {
    thresholdAngle: 16,
    irregularity: 0.009,
    seed: 41.7 + variant * 13.37,
    segmentLength: 0.16,
    doubleStroke: true,
    doubleStrokeOffset: 0.008,
    ghostOpacity: 0.42,
  });
  variants.set(variant, edges);
  return edges;
}

interface PartOptions {
  readonly name: string;
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: PartMaterial;
  readonly size?: Vec3;
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly outline?: boolean;
  readonly softOutline?: boolean;
}

function addPart(parent: THREE.Object3D, options: PartOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = options.name;
  const geometry = options.geometry ?? unitBox;
  const mesh = new THREE.Mesh(geometry, materials[options.material ?? 'paper']);
  mesh.name = `${options.name}-fill`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 20;
  group.add(mesh);
  if (options.outline !== false) {
    const outline = new THREE.LineSegments(
      edgesFor(geometry, options.name),
      options.softOutline ? softOutlineMaterial : outlineMaterial,
    );
    outline.name = `${options.name}-outline`;
    outline.renderOrder = 21;
    group.add(outline);
  }
  if (options.size) group.scale.set(...options.size);
  if (options.position) group.position.set(...options.position);
  if (options.rotation) group.rotation.set(...options.rotation);
  parent.add(group);
  return group;
}

function addCylinder(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  length: number,
  position: Vec3,
  material: PartMaterial = 'paper',
  segments: 6 | 8 | 12 = 8,
  rotation: Vec3 = [Math.PI / 2, 0, 0],
): THREE.Group {
  const geometry = segments === 6 ? unitCylinder6 : segments === 8 ? unitCylinder8 : unitCylinder12;
  return addPart(parent, {
    name,
    geometry,
    material,
    size: [radius * 2, length, radius * 2],
    position,
    rotation,
  });
}

/** Makes a convex side-profile prism: profile coordinates are [z, y], depth is along x. */
function profilePrism(profile: readonly (readonly [number, number])[], depth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const count = profile.length;
  for (const x of [-depth / 2, depth / 2]) {
    for (const [z, y] of profile) positions.push(x, y, z);
  }
  for (let i = 1; i < count - 1; i += 1) {
    indices.push(0, i + 1, i);
    indices.push(count, count + i, count + i + 1);
  }
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    indices.push(i, next, count + next, i, count + next, count + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makePose(position: Vec3, rotation: Vec3, scale = 1): ViewmodelPose {
  return {
    position: new THREE.Vector3(...position),
    rotation: new THREE.Euler(...rotation, 'XYZ'),
    scale,
  };
}

function addMuzzle(root: THREE.Object3D, position: Vec3): THREE.Object3D {
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle-socket';
  muzzle.position.set(...position);
  root.add(muzzle);
  return muzzle;
}

function addWrappedGrip(parent: THREE.Object3D, position: Vec3, rotation: Vec3, length: number): THREE.Group {
  const grip = addPart(parent, {
    name: 'wrapped-grip',
    material: 'shade',
    size: [0.13, length, 0.14],
    position,
    rotation,
  });
  for (let i = -2; i <= 2; i += 1) {
    addPart(grip, {
      name: `grip-wrap-${i + 2}`,
      geometry: unitBox,
      material: 'ink',
      size: [1.04, 0.018, 1.04],
      position: [0, i * 0.16, 0],
      rotation: [0, 0.12, 0.25],
      outline: false,
    });
  }
  return grip;
}

function addDoodleHand(
  parent: THREE.Object3D,
  name: string,
  position: Vec3,
  rotation: Vec3,
  scale = 1,
  showFingers = true,
): THREE.Group {
  const hand = new THREE.Group();
  hand.name = name;
  hand.position.set(...position);
  hand.rotation.set(...rotation);
  hand.scale.setScalar(scale);
  parent.add(hand);
  addPart(hand, {
    name: `${name}-palm`,
    geometry: unitDodecahedron,
    material: 'paper',
    size: [0.27, 0.34, 0.23],
  });
  for (let i = 0; showFingers && i < 3; i += 1) {
    addCylinder(
      hand,
      `${name}-finger-${i}`,
      0.035,
      0.23,
      [-0.09 + i * 0.08, 0.02, -0.12],
      'paper',
      6,
      [Math.PI / 2, 0, 0],
    );
  }
  return hand;
}

function addSquareHolo(parent: THREE.Object3D, position: Vec3, scale = 1): THREE.Group {
  const sight = new THREE.Group();
  sight.name = 'small-square-holo-sight';
  sight.position.set(...position);
  sight.scale.setScalar(scale);
  parent.add(sight);
  addPart(sight, { name: 'holo-base', material: 'deepHatch', size: [0.22, 0.045, 0.2], position: [0, 0, 0.02] });
  addPart(sight, { name: 'holo-left-post', material: 'paper', size: [0.035, 0.19, 0.035], position: [-0.092, 0.108, -0.015] });
  addPart(sight, { name: 'holo-right-post', material: 'paper', size: [0.035, 0.19, 0.035], position: [0.092, 0.108, -0.015] });
  addPart(sight, { name: 'holo-top', material: 'paper', size: [0.218, 0.035, 0.035], position: [0, 0.202, -0.015] });
  addPart(sight, {
    name: 'holo-lens',
    geometry: unitBox,
    material: 'lens',
    size: [0.145, 0.145, 0.008],
    position: [0, 0.113, 0],
    outline: false,
  });
  addPart(sight, {
    name: 'holo-red-ring',
    geometry: unitTorus,
    material: 'red',
    size: [0.07, 0.07, 0.07],
    position: [0, 0.112, 0.012],
    outline: false,
  });
  addPart(sight, {
    name: 'holo-red-dot',
    geometry: unitSphere8,
    material: 'red',
    size: [0.022, 0.022, 0.012],
    position: [0, 0.112, 0.022],
    outline: false,
  });
  return sight;
}

function createRifleViewmodel(): WeaponViewmodel {
  const root = new THREE.Group();
  root.name = 'viewmodel-rifle';

  const receiverGeometry = profilePrism([
    [-0.48, 0.105],
    [0.3, 0.105],
    [0.42, 0.04],
    [0.29, -0.105],
    [-0.38, -0.105],
    [-0.52, -0.035],
  ], 0.19);
  addPart(root, { name: 'rifle-angular-receiver', geometry: receiverGeometry, material: 'paper', position: [0, 0.015, 0.02] });
  addPart(root, { name: 'rifle-receiver-side', material: 'deepHatch', size: [0.205, 0.105, 0.36], position: [0.003, -0.025, 0.025] });

  const handguardGeometry = profilePrism([
    [-1.42, 0.075],
    [-0.46, 0.105],
    [-0.39, -0.09],
    [-1.32, -0.075],
  ], 0.15);
  addPart(root, { name: 'rifle-tapered-handguard', geometry: handguardGeometry, material: 'hatch', position: [0, 0.025, 0] });
  addPart(root, { name: 'rifle-top-rail', material: 'paper', size: [0.17, 0.035, 1.43], position: [0, 0.137, -0.47] });
  for (let i = 0; i < 6; i += 1) {
    addPart(root, {
      name: `rifle-rail-notch-${i}`,
      material: 'ink',
      size: [0.178, 0.018, 0.03],
      position: [0, 0.16, -0.1 - i * 0.18],
      outline: false,
    });
  }

  addCylinder(root, 'rifle-barrel', 0.026, 0.78, [0, 0.055, -1.79], 'paper', 8);
  addCylinder(root, 'rifle-gas-tube', 0.018, 0.56, [0, 0.12, -1.67], 'shade', 6);
  addCylinder(root, 'rifle-muzzle-brake', 0.045, 0.14, [0, 0.055, -2.22], 'ink', 8);
  addCylinder(root, 'rifle-barrel-collar', 0.052, 0.09, [0, 0.055, -1.43], 'hatch', 8);

  const stockGeometry = profilePrism([
    [0.25, 0.09],
    [0.96, 0.055],
    [1.09, -0.015],
    [1.04, -0.16],
    [0.72, -0.2],
    [0.31, -0.12],
  ], 0.145);
  addPart(root, {
    name: 'rifle-solid-angular-stock',
    geometry: stockGeometry,
    material: 'paper',
    position: [0, 0, 0],
  });
  addPart(root, {
    name: 'rifle-stock-shadow-plane',
    material: 'hatch',
    size: [0.151, 0.045, 0.42],
    position: [0, -0.105, 0.68],
    rotation: [0.08, 0, 0],
  });
  addPart(root, {
    name: 'rifle-butt-pad',
    material: 'hatch',
    size: [0.15, 0.19, 0.038],
    position: [0, -0.055, 1.075],
    rotation: [-0.03, 0, 0],
  });

  const magazineGeometry = profilePrism([
    [-0.08, 0.03],
    [0.18, 0.03],
    [0.13, -0.49],
    [-0.05, -0.53],
  ], 0.14);
  const magazine = addPart(root, { name: 'rifle-slim-magazine', geometry: magazineGeometry, material: 'deepHatch', position: [0, -0.12, 0.1], rotation: [-0.06, 0, 0] });
  addPart(root, {
    name: 'rifle-pistol-grip',
    material: 'paper',
    size: [0.12, 0.31, 0.125],
    position: [0, -0.205, 0.39],
    rotation: [-0.25, 0, 0],
  });
  addPart(root, {
    name: 'rifle-short-foregrip',
    material: 'shade',
    size: [0.1, 0.29, 0.11],
    position: [0, -0.185, -0.88],
    rotation: [0.025, 0, 0],
  });
  addDoodleHand(root, 'rifle-support-hand', [-0.12, -0.17, -0.85], [0.06, 0, 0.14], 0.91);
  addDoodleHand(root, 'rifle-trigger-hand', [-0.13, -0.2, 0.39], [-0.24, 0, -0.1], 0.84);

  const sight = addSquareHolo(root, [0, 0.158, -0.25], 0.82);
  addPart(root, { name: 'rifle-front-sight', material: 'paper', size: [0.055, 0.1, 0.035], position: [0, 0.19, -1.36] });
  const muzzle = addMuzzle(root, [0, 0.055, -2.31]);

  return {
    id: 'rifle',
    root,
    hipPose: makePose([0.6, -0.55, -1.22], [0.035, 0.115, -0.012], 1.1),
    aimPose: makePose([0, -0.29, -1.3], [0, 0, 0], 1),
    parts: { muzzle, magazine, sight },
  };
}

function createShotgunViewmodel(): WeaponViewmodel {
  const root = new THREE.Group();
  root.name = 'viewmodel-shotgun';
  const receiverGeometry = profilePrism([
    [-0.54, 0.11],
    [0.35, 0.1],
    [0.46, 0.02],
    [0.28, -0.13],
    [-0.47, -0.12],
  ], 0.22);
  addPart(root, { name: 'shotgun-angular-receiver', geometry: receiverGeometry, material: 'paper', position: [0, 0.03, 0.1] });
  addCylinder(root, 'shotgun-barrel', 0.035, 1.48, [0, 0.145, -1.16], 'ink', 8);
  addCylinder(root, 'shotgun-magazine-tube', 0.043, 1.28, [0, 0.055, -1.06], 'paper', 8);
  addCylinder(root, 'shotgun-muzzle-ring', 0.055, 0.12, [0, 0.145, -1.94], 'orange', 8);

  const pump = addPart(root, { name: 'shotgun-sliding-pump', material: 'deepHatch', size: [0.2, 0.16, 0.46], position: [0, 0.03, -0.87] });
  addWrappedGrip(pump, [0, -0.19, 0.02], [0.03, 0, 0], 0.43);
  addDoodleHand(pump, 'shotgun-pump-hand', [0, -0.2, 0.02], [0.02, 0, 0], 0.76);

  addPart(root, { name: 'shotgun-stock-neck', material: 'paper', size: [0.15, 0.12, 0.48], position: [0, -0.01, 0.63], rotation: [-0.1, 0, 0] });
  const stockGeometry = profilePrism([
    [0.38, 0.07],
    [1.08, 0.04],
    [1.18, -0.23],
    [0.66, -0.17],
  ], 0.19);
  addPart(root, { name: 'shotgun-tapered-stock', geometry: stockGeometry, material: 'hatch', position: [0, 0, 0] });
  addPart(root, { name: 'shotgun-butt-pad', material: 'deepHatch', size: [0.22, 0.34, 0.075], position: [0, -0.095, 1.16], rotation: [-0.04, 0, 0] });
  addWrappedGrip(root, [0, -0.2, 0.39], [-0.16, 0, 0], 0.38);
  addDoodleHand(root, 'shotgun-trigger-hand', [0, -0.22, 0.38], [-0.15, 0, 0], 0.7);
  addPart(root, { name: 'shotgun-bead-sight', geometry: unitSphere8, material: 'red', size: [0.035, 0.035, 0.035], position: [0, 0.19, -1.63], outline: false });
  const muzzle = addMuzzle(root, [0, 0.145, -2.04]);
  return {
    id: 'shotgun',
    root,
    hipPose: makePose([0.54, -0.5, -1.24], [0.035, 0.1, -0.012], 1),
    aimPose: makePose([0, -0.315, -1.32], [0, 0, 0], 1),
    parts: { muzzle, pump },
  };
}

function createRevolverViewmodel(): WeaponViewmodel {
  const root = new THREE.Group();
  root.name = 'viewmodel-revolver';
  const frameGeometry = profilePrism([
    [-0.5, 0.13],
    [0.25, 0.13],
    [0.37, 0.01],
    [0.16, -0.13],
    [-0.38, -0.11],
  ], 0.2);
  addPart(root, { name: 'revolver-frame', geometry: frameGeometry, material: 'paper', position: [0, 0.02, 0.13] });
  addPart(root, { name: 'revolver-top-rib', material: 'hatch', size: [0.18, 0.055, 0.93], position: [0, 0.18, -0.26] });
  addCylinder(root, 'revolver-barrel', 0.045, 0.82, [0, 0.105, -0.78], 'paper', 8);
  addCylinder(root, 'revolver-muzzle', 0.064, 0.1, [0, 0.105, -1.24], 'ink', 8);
  const cylinder = addCylinder(root, 'revolver-six-shot-cylinder', 0.23, 0.3, [0, 0.015, -0.12], 'deepHatch', 12);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    addCylinder(
      cylinder,
      `revolver-chamber-${i}`,
      0.055,
      1.02,
      [Math.cos(angle) * 0.27, 0, Math.sin(angle) * 0.27],
      'ink',
      8,
      [0, 0, Math.PI / 2],
    );
  }
  const gripGeometry = profilePrism([
    [0.2, -0.08],
    [0.48, -0.08],
    [0.72, -0.62],
    [0.45, -0.7],
    [0.1, -0.25],
  ], 0.18);
  addPart(root, { name: 'revolver-sloped-grip', geometry: gripGeometry, material: 'deepHatch', position: [0, 0, 0] });
  addPart(root, { name: 'revolver-trigger-guard', geometry: unitTorus, material: 'paper', size: [0.18, 0.22, 0.16], position: [0, -0.19, 0.03], outline: true });
  const hammer = addPart(root, { name: 'revolver-hammer', material: 'ink', size: [0.12, 0.12, 0.15], position: [0, 0.2, 0.34], rotation: [0.25, 0, 0] });
  addDoodleHand(root, 'revolver-hand', [0, -0.4, 0.45], [-0.28, 0, 0], 0.8);
  const muzzle = addMuzzle(root, [0, 0.105, -1.32]);
  return {
    id: 'revolver',
    root,
    hipPose: makePose([0.53, -0.44, -1.0], [0.015, 0.1, -0.02], 1),
    aimPose: makePose([0, -0.28, -1.08], [0, 0, 0], 1),
    parts: { muzzle, cylinder, hammer },
  };
}

function createSniperViewmodel(): WeaponViewmodel {
  const root = new THREE.Group();
  root.name = 'viewmodel-sniper';
  const receiverGeometry = profilePrism([
    [-0.58, 0.09],
    [0.38, 0.11],
    [0.48, -0.02],
    [0.26, -0.15],
    [-0.5, -0.12],
  ], 0.19);
  addPart(root, { name: 'sniper-angular-receiver', geometry: receiverGeometry, material: 'paper', position: [0, 0, 0.06] });
  addPart(root, { name: 'sniper-long-fore-end', material: 'hatch', size: [0.17, 0.13, 1.06], position: [0, 0.005, -1.02], rotation: [-0.012, 0, 0] });
  addCylinder(root, 'sniper-barrel', 0.026, 1.42, [0, 0.115, -1.48], 'ink', 8);
  addCylinder(root, 'sniper-muzzle', 0.048, 0.16, [0, 0.115, -2.24], 'ink', 8);
  addPart(root, { name: 'sniper-stock-beam', material: 'paper', size: [0.16, 0.1, 0.67], position: [0, -0.005, 0.69], rotation: [-0.08, 0, 0] });
  const stockGeometry = profilePrism([
    [0.34, 0.06],
    [1.17, 0.08],
    [1.1, -0.25],
    [0.65, -0.18],
  ], 0.19);
  addPart(root, { name: 'sniper-stock', geometry: stockGeometry, material: 'hatch', position: [0, 0, 0] });
  addPart(root, { name: 'sniper-butt-pad', material: 'deepHatch', size: [0.22, 0.36, 0.075], position: [0, -0.08, 1.15] });
  addWrappedGrip(root, [0, -0.23, 0.35], [-0.17, 0, 0], 0.43);
  addDoodleHand(root, 'sniper-trigger-hand', [0, -0.25, 0.34], [-0.18, 0, 0], 0.7);
  addWrappedGrip(root, [0, -0.23, -0.76], [0.02, 0, 0], 0.47);
  addDoodleHand(root, 'sniper-support-hand', [0, -0.22, -0.75], [0.02, 0, 0], 0.73);

  const scope = new THREE.Group();
  scope.name = 'sniper-scope';
  scope.position.set(0, 0.265, -0.16);
  root.add(scope);
  addCylinder(scope, 'scope-main-tube', 0.12, 0.72, [0, 0, 0], 'paper', 12);
  addCylinder(scope, 'scope-objective-bell', 0.175, 0.24, [0, 0, -0.45], 'hatch', 12);
  addCylinder(scope, 'scope-eye-bell', 0.155, 0.2, [0, 0, 0.42], 'deepHatch', 12);
  addCylinder(scope, 'scope-front-rim', 0.184, 0.045, [0, 0, -0.59], 'ink', 12);
  addCylinder(scope, 'scope-rear-rim', 0.164, 0.045, [0, 0, 0.54], 'ink', 12);
  addPart(scope, { name: 'scope-front-mount', material: 'deepHatch', size: [0.08, 0.16, 0.08], position: [0, -0.16, -0.25] });
  addPart(scope, { name: 'scope-rear-mount', material: 'deepHatch', size: [0.08, 0.16, 0.08], position: [0, -0.16, 0.25] });

  const bolt = new THREE.Group();
  bolt.name = 'sniper-bolt';
  bolt.position.set(0.12, 0.13, 0.22);
  root.add(bolt);
  addCylinder(bolt, 'sniper-bolt-shaft', 0.03, 0.28, [0.08, 0, 0], 'ink', 8, [0, 0, Math.PI / 2]);
  addCylinder(bolt, 'sniper-bolt-handle', 0.028, 0.2, [0.23, -0.07, 0], 'ink', 8, [0, 0, -0.55]);
  addPart(bolt, { name: 'sniper-bolt-knob', geometry: unitSphere8, material: 'ink', size: [0.075, 0.075, 0.075], position: [0.28, -0.14, 0], outline: false });
  const magazine = addPart(root, { name: 'sniper-magazine', material: 'deepHatch', size: [0.15, 0.38, 0.22], position: [0, -0.23, -0.02], rotation: [-0.04, 0, 0] });
  const muzzle = addMuzzle(root, [0, 0.115, -2.34]);
  return {
    id: 'sniper',
    root,
    hipPose: makePose([0.56, -0.5, -1.22], [0.035, 0.105, -0.015], 1),
    aimPose: makePose([0, -0.265, -1.2], [0, 0, 0], 1),
    parts: { muzzle, bolt, magazine, sight: scope },
  };
}

function createKatanaViewmodel(): WeaponViewmodel {
  const root = new THREE.Group();
  root.name = 'viewmodel-katana';

  // Everything the two hands are gripping lives below this pivot. The pivot is
  // at the rear hand, so a multi-axis rotation sweeps the blade instead of
  // merely rolling it around its own long axis.
  const actionRoot = new THREE.Group();
  actionRoot.name = 'katana-action-root';
  actionRoot.position.set(0, -0.02, 0.58);
  root.add(actionRoot);
  const assembly = new THREE.Group();
  assembly.name = 'katana-gripped-assembly';
  assembly.position.set(0, 0.02, -0.58);
  actionRoot.add(assembly);

  const bladeRoot = new THREE.Group();
  bladeRoot.name = 'katana-blade-animation-root';
  assembly.add(bladeRoot);
  const bladeGeometry = profilePrism([
    [-2.7, 0.045],
    [-2.57, 0.095],
    [-0.32, 0.105],
    [-0.24, -0.055],
    [-2.55, -0.035],
  ], 0.055);
  addPart(bladeRoot, { name: 'katana-tapered-blade', geometry: bladeGeometry, material: 'paper', position: [0, 0, 0] });
  addPart(bladeRoot, { name: 'katana-blue-spine', material: 'ink', size: [0.061, 0.016, 2.25], position: [0, 0.09, -1.42], outline: false });
  addPart(bladeRoot, { name: 'katana-red-cutting-edge', material: 'red', size: [0.063, 0.015, 2.18], position: [0, -0.041, -1.42], outline: false });
  addPart(bladeRoot, { name: 'katana-pencil-hatch', material: 'hatch', size: [0.061, 0.019, 1.92], position: [0, 0.024, -1.42], outline: false });
  const guard = addPart(assembly, { name: 'katana-diamond-guard', material: 'hatch', size: [0.29, 0.048, 0.28], position: [0, -0.005, -0.2], rotation: [0, Math.PI / 4, 0] });
  guard.rotation.y = Math.PI / 4;
  addWrappedGrip(assembly, [0, -0.02, 0.27], [Math.PI / 2, 0, 0], 0.69);
  addPart(assembly, { name: 'katana-compact-pommel', material: 'ink', size: [0.115, 0.1, 0.09], position: [0, -0.02, 0.66] });

  const mainSleeveGeometry = profilePrism([
    [0.1, 0.1],
    [0.33, 0.03],
    [0.86, -0.34],
    [0.68, -0.53],
    [0.22, -0.27],
  ], 0.31);
  const offSleeveGeometry = profilePrism([
    [0.31, 0.08],
    [0.51, 0.015],
    [0.82, -0.23],
    [0.63, -0.41],
    [0.36, -0.2],
  ], 0.28);
  addPart(assembly, { name: 'katana-main-paper-sleeve', geometry: mainSleeveGeometry, material: 'paper', position: [0.08, -0.055, 0], rotation: [0, -0.08, -0.06] });
  addPart(assembly, { name: 'katana-off-paper-sleeve', geometry: offSleeveGeometry, material: 'hatch', position: [-0.13, -0.035, 0], rotation: [0, 0.08, 0.08] });
  addDoodleHand(assembly, 'katana-main-hand', [0.025, -0.045, 0.15], [Math.PI / 2, 0, 0.08], 0.94, false);
  addDoodleHand(assembly, 'katana-off-hand', [-0.025, -0.035, 0.44], [Math.PI / 2, 0, -0.08], 0.86, false);
  const muzzle = addMuzzle(assembly, [0, 0.04, -2.72]);

  const trail = new THREE.Group();
  trail.name = 'katana-handdrawn-sweep';
  trail.visible = false;
  root.add(trail);
  const sweepPoints = [
    new THREE.Vector3(0.08, 0.47, -0.74),
    new THREE.Vector3(-0.19, 0.4, -0.77),
    new THREE.Vector3(-0.43, 0.25, -0.83),
    new THREE.Vector3(-0.61, 0.04, -0.9),
    new THREE.Vector3(-0.7, -0.2, -0.98),
    new THREE.Vector3(-0.67, -0.45, -1.06),
  ];
  const sweepCurve = new THREE.CatmullRomCurve3(sweepPoints, false, 'centripetal');
  const sweep = new THREE.Mesh(new THREE.TubeGeometry(sweepCurve, 36, 0.012, 4, false), katanaTrailMaterial);
  sweep.name = 'katana-sweep-main-stroke';
  sweep.renderOrder = 35;
  sweep.frustumCulled = false;
  trail.add(sweep);

  const ghostCurve = new THREE.CatmullRomCurve3(
    sweepPoints.map((point, index) => point.clone().add(new THREE.Vector3(0.015 + index * 0.002, -0.018, 0.012))),
    false,
    'centripetal',
  );
  const ghost = new THREE.Mesh(new THREE.TubeGeometry(ghostCurve, 36, 0.006, 4, false), katanaTrailGhostMaterial);
  ghost.name = 'katana-sweep-ghost-stroke';
  ghost.renderOrder = 34;
  ghost.frustumCulled = false;
  trail.add(ghost);
  return {
    id: 'katana',
    root,
    hipPose: makePose([0.877, -1.056, -1.5], [0.758, 0.172, -0.035], 1),
    aimPose: makePose([0.25, -0.3, -1.08], [-0.12, -0.16, -0.48], 1),
    parts: { muzzle, blade: bladeRoot, action: actionRoot, trail },
  };
}

export function createWeaponViewmodels(): Readonly<Record<WeaponId, WeaponViewmodel>> {
  return {
    rifle: createRifleViewmodel(),
    shotgun: createShotgunViewmodel(),
    revolver: createRevolverViewmodel(),
    sniper: createSniperViewmodel(),
    katana: createKatanaViewmodel(),
  };
}
