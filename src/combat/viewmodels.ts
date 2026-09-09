import * as THREE from 'three';
import {
  ACTIVE_VISUAL_STYLE,
  createHandDrawnEdgesGeometry,
  DoodleMaterial,
  DOODLE_PALETTE,
} from '../render';
import type { WeaponId } from './types';
import { ACTIVE_INK_VERSION } from '../render/inkSettings';
import { getHeroInkTexture } from '../render/InkTextures';

const INK_STYLE = ACTIVE_VISUAL_STYLE === 'ink';

const BALLPOINT_PALETTE = Object.freeze({
  paper: 0xf6f0dc,
  paperShade: 0xd7d8df,
  lavender: 0xb8bbd8,
  blueInk: 0x27348f,
  darkBlue: 0x18246f,
  redInk: 0xd63b55,
  orangeInk: 0xe79a32,
});

const INK_PALETTE = Object.freeze({
  paper: DOODLE_PALETTE.paperLight,
  paperShade: 0xaaa9a2,
  lavender: 0x777b7b,
  blueInk: 0x171b1d,
  darkBlue: 0x0e1112,
  redInk: 0x9f4139,
  orangeInk: 0xb67243,
});

const PALETTE = INK_STYLE ? INK_PALETTE : BALLPOINT_PALETTE;

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
  readonly blood?: THREE.Object3D;
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

function pixelNoise(x: number, y: number, seed: number): number {
  const raw = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
}

function makeAlphaTexture(
  width: number,
  height: number,
  alphaAt: (u: number, v: number, x: number, y: number) => number,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = THREE.MathUtils.clamp(alphaAt(x / (width - 1), y / (height - 1), x, y), 0, 1);
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeKatanaBrushTexture(): THREE.DataTexture {
  return makeAlphaTexture(192, 48, (u, v, x, y) => {
    const centeredY = v - 0.5;
    const center = Math.sin(u * 15.7) * 0.018 + Math.sin(u * 37.1) * 0.008;
    const taper = 0.44 * Math.pow(1 - u, 0.3) + 0.035;
    const edge = taper * (0.88 + (pixelNoise(Math.floor(u * 34), 0, 13) - 0.5) * 0.24);
    const edgeDistance = edge - Math.abs(centeredY - center);
    if (edgeDistance <= 0) return 0;
    const edgeAlpha = THREE.MathUtils.smoothstep(edgeDistance, 0, 0.08);
    const fibre = pixelNoise(x, Math.floor(y * 0.42), 29);
    const longitudinalGap = pixelNoise(Math.floor(x * 0.18), Math.floor(y * 0.65), 43);
    const tailDryness = THREE.MathUtils.smoothstep(u, 0.38, 1);
    const dryGap = tailDryness > 0 && (fibre > 0.89 - tailDryness * 0.14 || longitudinalGap > 0.965);
    if (dryGap) return 0;
    return edgeAlpha * (0.74 + pixelNoise(x, y, 61) * 0.26);
  });
}

function makeKatanaBloodTexture(): THREE.DataTexture {
  return makeAlphaTexture(64, 64, (u, v, x, y) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const angle = Math.atan2(dy, dx);
    const radius = Math.hypot(dx, dy);
    const raggedEdge = 0.83 + Math.sin(angle * 5 + 0.7) * 0.11 + Math.sin(angle * 11 - 0.4) * 0.055;
    if (radius > raggedEdge) return 0;
    const absorption = 1 - THREE.MathUtils.smoothstep(radius, raggedEdge * 0.62, raggedEdge);
    const dryGap = radius > 0.24 && pixelNoise(Math.floor(x * 0.45), Math.floor(y * 0.2), 73) > 0.965;
    return dryGap ? 0 : 0.52 + absorption * 0.44;
  });
}

const katanaTrailTexture = INK_STYLE ? makeKatanaBrushTexture() : null;
const katanaBloodTexture = INK_STYLE ? makeKatanaBloodTexture() : null;

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
  opacity: INK_STYLE ? 0.32 : 0.5,
  depthTest: true,
  depthWrite: false,
  vertexColors: true,
});
const katanaTrailMaterial = new THREE.MeshBasicMaterial({
  color: PALETTE.blueInk,
  map: katanaTrailTexture,
  transparent: true,
  opacity: INK_STYLE ? 0.94 : 0.88,
  alphaTest: INK_STYLE ? 0.045 : 0,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});

function makeViewmodelMaterial(
  surfaceColor: THREE.ColorRepresentation,
  hatchScale: number,
  hatchStrength: number,
  seed: number,
  washStrength: number,
  dryBrushStrength: number,
  washBias: number,
  heroScan = false,
): DoodleMaterial {
  return new DoodleMaterial({
    surfaceColor,
    hatchScale,
    hatchStrength,
    seed,
    ...(INK_STYLE ? {
      paperColor: DOODLE_PALETTE.paper,
      inkColor: PALETTE.darkBlue,
      shadowColor: 0x111517,
      patternSpace: 'object' as const,
      ...(heroScan && ACTIVE_INK_VERSION === 'v5' ? {
        inkBrushMap: getHeroInkTexture('weapon'),
      } : {}),
      washStrength: heroScan && ACTIVE_INK_VERSION === 'v5' ? washStrength * 0.80 : washStrength,
      washBias: heroScan && ACTIVE_INK_VERSION === 'v5' ? washBias * 0.50 : washBias,
      dryBrushStrength,
      granulationStrength: 0.22,
    } : {}),
  });
}

const katanaBloodMaterial = INK_STYLE
  ? new THREE.MeshBasicMaterial({
    color: PALETTE.redInk,
    map: katanaBloodTexture,
    transparent: true,
    alphaTest: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  : null;

const materials: Readonly<Record<PartMaterial, THREE.Material>> = Object.freeze({
  paper: makeViewmodelMaterial(PALETTE.paper, 7.2, 0.46, 11.2, 0.9, 0.16, 0.28),
  shade: makeViewmodelMaterial(PALETTE.paperShade, 7.2, 0.72, 12.4, 1.02, 0.22, 0.34),
  hatch: makeViewmodelMaterial(PALETTE.lavender, 7.0, 0.9, 13.8, 1.12, 0.28, 0.4),
  deepHatch: makeViewmodelMaterial(PALETTE.lavender, 6.8, 1.14, 15.1, 1.24, 0.34, 0.46),
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

// Firearm surfaces get scanned brushwork; hands, blade and optical marks retain
// their existing materials. All weapon instances share these four materials.
const firearmMaterials: Partial<Record<PartMaterial, THREE.Material>> =
  INK_STYLE && ACTIVE_INK_VERSION === 'v5' ? {
    paper: makeViewmodelMaterial(PALETTE.paper, 7.2, 0.46, 11.2, 0.9, 0.16, 0.28, true),
    shade: makeViewmodelMaterial(PALETTE.paperShade, 7.2, 0.72, 12.4, 1.02, 0.22, 0.34, true),
    hatch: makeViewmodelMaterial(PALETTE.lavender, 7.0, 0.9, 13.8, 1.12, 0.28, 0.4, true),
    deepHatch: makeViewmodelMaterial(PALETTE.lavender, 6.8, 1.14, 15.1, 1.24, 0.34, 0.46, true),
  } : {};

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
  const materialKey = options.material ?? 'paper';
  const firearmSurface = /^(rifle|shotgun|revolver|sniper)-/.test(options.name)
    && !options.name.includes('-hand');
  const material = firearmSurface
    ? firearmMaterials[materialKey] ?? materials[materialKey] : materials[materialKey];
  const mesh = new THREE.Mesh(geometry, material);
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
  const bladeBlood = new THREE.Group();
  bladeBlood.name = 'katana-blade-blood';
  bladeRoot.add(bladeBlood);
  const bloodMarks = [
    [-0.58, 0.014, 0.13, 0.052, -0.18],
    [-0.92, -0.012, 0.19, 0.044, 0.24],
    [-1.28, 0.026, 0.15, 0.058, -0.34],
    [-1.66, -0.005, 0.23, 0.046, 0.16],
    [-2.06, 0.022, 0.17, 0.054, -0.27],
  ] as const;
  for (let index = 0; index < bloodMarks.length; index += 1) {
    const [z, y, width, height, rotation] = bloodMarks[index];
    const stain = new THREE.Group();
    stain.name = `katana-blood-stain-${index + 1}`;
    stain.visible = false;
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 7),
        katanaBloodMaterial ?? materials.red,
      );
      mark.name = `katana-blood-stain-${index + 1}-${side < 0 ? 'back' : 'front'}`;
      mark.position.set(side * 0.032, y, z);
      mark.rotation.set(0, side * Math.PI / 2, rotation * side);
      mark.scale.set(width, height, 1);
      mark.renderOrder = 24;
      stain.add(mark);
    }
    bladeBlood.add(stain);
  }
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
  trail.name = 'katana-reference-dash-arc';
  trail.visible = false;
  root.add(trail);
  const dashGeometry = new THREE.PlaneGeometry(1, 1);
  const dashArc = [
    [0.04, 0.36, -0.98, -0.24, 0.16],
    [-0.12, 0.31, -0.99, -0.36, 0.19],
    [-0.27, 0.23, -1.0, -0.5, 0.21],
    [-0.4, 0.11, -1.01, -0.66, 0.22],
    [-0.49, -0.03, -1.02, -0.81, 0.21],
    [-0.54, -0.18, -1.03, -0.98, 0.19],
    [-0.55, -0.32, -1.04, -1.12, 0.16],
  ] as const;
  const inkTrailPoints = INK_STYLE
    ? (() => {
      const controls = dashArc.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const first = controls[0];
      const second = controls[1];
      const last = controls[controls.length - 1];
      const penultimate = controls[controls.length - 2];
      const start = first.clone().add(first.clone().sub(second).normalize().multiplyScalar(0.07));
      const end = last.clone().add(last.clone().sub(penultimate).normalize().multiplyScalar(0.07));
      return new THREE.CatmullRomCurve3([start, ...controls, end], false, 'centripetal')
        .getSpacedPoints(dashArc.length);
    })()
    : null;
  for (let index = 0; index < dashArc.length; index += 1) {
    const [x, y, z, rotationZ, length] = dashArc[index];
    const dashMaterial = INK_STYLE ? katanaTrailMaterial.clone() : katanaTrailMaterial;
    const dash = new THREE.Mesh(dashGeometry, dashMaterial);
    dash.name = `katana-reference-dash-${index + 1}`;
    if (INK_STYLE && inkTrailPoints && katanaTrailTexture) {
      const start = inkTrailPoints[index];
      const end = inkTrailPoints[index + 1];
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const segmentTexture = katanaTrailTexture.clone();
      segmentTexture.repeat.set(1 / dashArc.length, 1);
      segmentTexture.offset.set(index / dashArc.length, 0);
      segmentTexture.needsUpdate = true;
      dashMaterial.map = segmentTexture;
      dashMaterial.opacity = 0.94;
      dashMaterial.needsUpdate = true;
      dash.position.copy(start).lerp(end, 0.5);
      dash.rotation.z = Math.atan2(deltaY, deltaX);
      dash.scale.set(Math.hypot(deltaX, deltaY) * 1.1, 0.11, 1);
    } else {
      dash.position.set(x, y, z);
      dash.rotation.z = rotationZ;
      dash.scale.set(length, 0.028 + (index % 2) * 0.004, 1);
    }
    dash.renderOrder = 35;
    dash.frustumCulled = false;
    trail.add(dash);
  }
  return {
    id: 'katana',
    root,
    hipPose: makePose([0.877, -1.056, -1.5], [0.758, 0.172, -0.035], 1),
    aimPose: makePose([0.25, -0.3, -1.08], [-0.12, -0.16, -0.48], 1),
    parts: { muzzle, blade: bladeRoot, blood: bladeBlood, action: actionRoot, trail },
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
