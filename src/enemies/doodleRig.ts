import * as THREE from 'three';
import { ACTIVE_VISUAL_STYLE, DoodleMaterial, DOODLE_PALETTE } from '../render';
import type { EnemyHitZone, EnemyKind } from './types';
import { ACTIVE_INK_VERSION } from '../render/inkSettings';
import { getHeroInkTexture } from '../render/InkTextures';

const INK_STYLE = ACTIVE_VISUAL_STYLE === 'ink';

const BALLPOINT_COLORS = {
  paper: 0xf0eae0,
  cream: 0xe8ded3,
  red: 0xcf3f5a,
  redOutline: 0xb63a56,
  graphite: 0x3c3848,
  graphiteSoft: 0x555064,
};

const INK_COLORS = {
  paper: 0x747672,
  cream: 0x9b9991,
  red: 0x9f4139,
  redOutline: 0x171b1d,
  graphite: 0x202426,
  graphiteSoft: 0x555a59,
};

const COLORS = INK_STYLE ? INK_COLORS : BALLPOINT_COLORS;

function makeRigMaterial(
  surfaceColor: THREE.ColorRepresentation,
  inkColor: THREE.ColorRepresentation,
  hatchScale: number,
  hatchStrength: number,
  seed: number,
  washStrength: number,
  dryBrushStrength: number,
  granulationStrength = 0.3,
  washBias = 0,
): DoodleMaterial {
  return new DoodleMaterial({
    surfaceColor,
    paperColor: DOODLE_PALETTE.paper,
    inkColor,
    hatchScale,
    hatchStrength,
    seed,
    ...(INK_STYLE ? {
      shadowColor: 0x111416,
      patternSpace: 'object' as const,
      ...(ACTIVE_INK_VERSION === 'v5' ? {
        inkBrushMap: getHeroInkTexture('npc'),
      } : {}),
      washStrength: ACTIVE_INK_VERSION === 'v5' ? washStrength * 0.78 : washStrength,
      washBias: ACTIVE_INK_VERSION === 'v5' ? washBias * 0.45 : washBias,
      dryBrushStrength,
      granulationStrength,
    } : {}),
  });
}

const MATERIALS = {
  paper: makeRigMaterial(COLORS.paper, COLORS.redOutline, 8.2, 0.2, 21.1, 0.62, 0.16),
  cream: makeRigMaterial(COLORS.cream, COLORS.redOutline, 8, 0.28, 22.3, 0.52, 0.13),
  red: makeRigMaterial(COLORS.red, COLORS.redOutline, 7.5, 0.34, 23.7, 0.86, 0.2),
  graphite: makeRigMaterial(COLORS.graphite, COLORS.graphite, 7.1, 0.38, 24.9, 1.06, 0.29),
  enemyWash: makeRigMaterial(0x646a6a, COLORS.graphite, 7.7, 0.72, 25.7, 0.88, 0.24, 0.34, 0.22),
  enemyInk: makeRigMaterial(0x383f41, COLORS.graphite, 7.2, 0.88, 26.3, 1.08, 0.34, 0.4, 0.34),
  bossWash: makeRigMaterial(0x4b5253, COLORS.graphite, 7.4, 0.82, 27.1, 1.02, 0.29, 0.38, 0.28),
  paperBreak: makeRigMaterial(DOODLE_PALETTE.paperLight, COLORS.graphiteSoft, 8.4, 0.08, 28.3, 0.12, 0.06, 0.12),
  faceInk: new THREE.MeshBasicMaterial({ color: COLORS.graphite }),
  redFaceInk: new THREE.MeshBasicMaterial({ color: INK_STYLE ? COLORS.red : COLORS.redOutline }),
  redOutline: new THREE.LineBasicMaterial({ color: COLORS.redOutline, transparent: true, opacity: 0.98 }),
  redEcho: new THREE.LineBasicMaterial({ color: INK_STYLE ? COLORS.graphiteSoft : COLORS.red, transparent: true, opacity: INK_STYLE ? 0.24 : 0.42 }),
  graphiteOutline: new THREE.LineBasicMaterial({ color: COLORS.graphite, transparent: true, opacity: 0.98 }),
  graphiteEcho: new THREE.LineBasicMaterial({ color: COLORS.graphiteSoft, transparent: true, opacity: INK_STYLE ? 0.22 : 0.34 }),
  redShell: new THREE.MeshBasicMaterial({ color: COLORS.redOutline, side: THREE.BackSide }),
  redShellEcho: new THREE.MeshBasicMaterial({ color: INK_STYLE ? COLORS.graphiteSoft : COLORS.red, side: THREE.BackSide, transparent: true, opacity: INK_STYLE ? 0.2 : 0.34 }),
  graphiteShell: new THREE.MeshBasicMaterial({ color: COLORS.graphite, side: THREE.BackSide }),
  graphiteShellEcho: new THREE.MeshBasicMaterial({ color: COLORS.graphiteSoft, side: THREE.BackSide, transparent: true, opacity: INK_STYLE ? 0.2 : 0.3 }),
  deathInk: new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x252a2c : COLORS.red }),
  deathInkShell: new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x141719 : COLORS.redOutline, side: THREE.BackSide }),
  deathInkLine: new THREE.LineBasicMaterial({ color: INK_STYLE ? 0x141719 : COLORS.redOutline, transparent: true, opacity: 0.98 }),
};

const unitSphere = new THREE.SphereGeometry(1, 14, 10);
const unitSphereLow = new THREE.SphereGeometry(1, 10, 8);
const unitCylinder = new THREE.CylinderGeometry(1, 0.9, 1, 8, 1);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitDodecahedron = new THREE.DodecahedronGeometry(1, 0);
const unitCone = new THREE.ConeGeometry(1, 1, 6, 1);

const REGULAR_VARIATION_COUNT = 8;

function hashUnit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

function normalizeGeometryBounds(geometry: THREE.BufferGeometry, axes: 'xyz' | 'y' = 'xyz'): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(
    axes === 'xyz' ? 2 / Math.max(size.x, 0.0001) : 1,
    axes === 'xyz' ? 2 / Math.max(size.y, 0.0001) : 1 / Math.max(size.y, 0.0001),
    axes === 'xyz' ? 2 / Math.max(size.z, 0.0001) : 1,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}

/** A bounded, low-amplitude contour wobble: irregular ink, not random body proportions. */
function makeWobblySphereGeometry(seed: number, amplitude: number): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(1, 18, 12);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radius = Math.max(Math.hypot(x, y, z), 0.0001);
    const longitude = Math.atan2(z, x);
    const latitude = Math.asin(THREE.MathUtils.clamp(y / radius, -1, 1));
    const wobble = 1 + amplitude * (
      Math.sin(longitude * 3 + seed * 0.71) * 0.52
      + Math.sin(longitude * 5 - latitude * 2 + seed * 1.13) * 0.31
      + Math.cos(latitude * 4 + seed * 0.37) * 0.17
    );
    const sideBias = amplitude * 0.3 * Math.sin(latitude * 2.4 + seed) * (1 - y * y);
    positions.setXYZ(index, x * wobble + sideBias, y * wobble, z * (1 + (wobble - 1) * 0.55));
  }
  positions.needsUpdate = true;
  normalizeGeometryBounds(geometry);
  geometry.userData.doodleSilhouette = true;
  geometry.userData.handDrawnIrregularity = amplitude;
  return geometry;
}

function makeBentLimbGeometry(seed: number): THREE.TubeGeometry {
  const bow = (hashUnit(seed, 1) - 0.5) * 1.08;
  const lean = (hashUnit(seed, 2) - 0.5) * 0.48;
  const depthBow = (hashUnit(seed, 3) - 0.5) * 0.32;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.5, 0),
    new THREE.Vector3(bow * 0.34, 0.2, depthBow * 0.2),
    new THREE.Vector3(bow * 0.7, -0.14, depthBow),
    new THREE.Vector3(bow * 0.5 + lean, -0.5, depthBow * 0.35),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 7, 0.78, 6, false);
  normalizeGeometryBounds(geometry, 'y');
  geometry.userData.doodleSilhouette = true;
  geometry.userData.handDrawnLimb = true;
  return geometry;
}

function makeIrregularBlobGeometry(seed: number): THREE.DodecahedronGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radial = 0.94 + hashUnit(seed + Math.round(x * 31 + y * 47 + z * 59), index % 7) * 0.12;
    positions.setXYZ(index, x * radial, y * radial, z * radial);
  }
  positions.needsUpdate = true;
  normalizeGeometryBounds(geometry);
  geometry.userData.doodleSilhouette = true;
  geometry.userData.handDrawnBlob = true;
  return geometry;
}

function makeSkewedBoxGeometry(seed: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const positions = geometry.getAttribute('position');
  const shear = (hashUnit(seed, 4) - 0.5) * 0.1;
  const taper = (hashUnit(seed, 5) - 0.5) * 0.08;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    positions.setXYZ(index, x * (1 + taper * y) + y * shear, y, z * (1 - taper * y * 0.6));
  }
  positions.needsUpdate = true;
  normalizeGeometryBounds(geometry);
  geometry.scale(0.5, 0.5, 0.5);
  geometry.computeBoundingBox();
  geometry.userData.doodleSilhouette = true;
  geometry.userData.handCutPrism = true;
  return geometry;
}

function makeScribbleLoopGeometry(
  radiusX: number,
  radiusY: number,
  depth: number,
  seed: number,
  echo = false,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const phase = seed * 0.73 + (echo ? 1.91 : 0);
  const xOffset = (hashUnit(seed, echo ? 9 : 7) - 0.5) * radiusX * 0.045;
  const yOffset = (hashUnit(seed, echo ? 10 : 8) - 0.5) * radiusY * 0.035;
  for (let index = 0; index < 42; index += 1) {
    const angle = index / 42 * Math.PI * 2;
    const wobble = 1
      + Math.sin(angle * 3 + phase) * (echo ? 0.024 : 0.018)
      + Math.sin(angle * 7 - phase * 0.6) * (echo ? 0.012 : 0.008);
    points.push(new THREE.Vector3(
      Math.cos(angle) * radiusX * wobble + xOffset,
      Math.sin(angle) * radiusY * wobble + yOffset,
      depth + Math.sin(angle * 5 + phase) * 0.002,
    ));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.userData.handDrawnContour = true;
  return geometry;
}

const REGULAR_GEOMETRIES = {
  heads: Array.from({ length: REGULAR_VARIATION_COUNT }, (_, index) => makeWobblySphereGeometry(110 + index, 0.038)),
  torsos: Array.from({ length: REGULAR_VARIATION_COUNT }, (_, index) => makeWobblySphereGeometry(210 + index, 0.052)),
  limbs: Array.from({ length: REGULAR_VARIATION_COUNT * 4 }, (_, index) => makeBentLimbGeometry(310 + index)),
  blobs: Array.from({ length: REGULAR_VARIATION_COUNT * 4 }, (_, index) => makeIrregularBlobGeometry(410 + index)),
  mittens: Array.from({ length: REGULAR_VARIATION_COUNT * 2 }, (_, index) => makeWobblySphereGeometry(470 + index, 0.065)),
  prisms: Array.from({ length: REGULAR_VARIATION_COUNT * 3 }, (_, index) => makeSkewedBoxGeometry(510 + index)),
};

function makeMouthGeometry(width: number, depth: number): THREE.TubeGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-width / 2, -0.045, 0),
    new THREE.Vector3(0, 0.07, 0),
    new THREE.Vector3(width / 2, -0.045, 0),
  );
  return new THREE.TubeGeometry(curve, 10, depth, 5, false);
}

function makeSmileGeometry(width: number, depth: number): THREE.TubeGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-width / 2, 0.025, 0),
    new THREE.Vector3(0.008, -0.058, 0),
    new THREE.Vector3(width / 2, 0.006, 0),
  );
  return new THREE.TubeGeometry(curve, 9, depth, 5, false);
}

function makeCrownGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, 0);
  shape.lineTo(-0.48, 0.18);
  shape.lineTo(-0.37, 0.39);
  shape.lineTo(-0.2, 0.14);
  shape.lineTo(-0.08, 0.43);
  shape.lineTo(0.08, 0.14);
  shape.lineTo(0.22, 0.42);
  shape.lineTo(0.35, 0.14);
  shape.lineTo(0.48, 0.34);
  shape.lineTo(0.52, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  geometry.translate(0, 0, -0.06);
  return geometry;
}

const GEOMETRIES = {
  sphere: unitSphere,
  sphereLow: unitSphereLow,
  cylinder: unitCylinder,
  box: unitBox,
  dodecahedron: unitDodecahedron,
  cone: unitCone,
  regularMouth: makeMouthGeometry(0.25, 0.018),
  regularSmile: makeSmileGeometry(0.235, 0.017),
  bossMouth: makeMouthGeometry(0.38, 0.024),
  crown: makeCrownGeometry(),
};

const EDGE_GEOMETRIES = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();

function edgesFor(geometry: THREE.BufferGeometry): THREE.EdgesGeometry {
  const existing = EDGE_GEOMETRIES.get(geometry);
  if (existing) return existing;
  const edges = new THREE.EdgesGeometry(geometry, 18);
  EDGE_GEOMETRIES.set(geometry, edges);
  return edges;
}

export interface DoodleRig {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponPivot: THREE.Group;
  muzzle: THREE.Object3D;
  pencilPivot: THREE.Group | null;
  hitMeshes: ReadonlyArray<{ mesh: THREE.Mesh; zone: EnemyHitZone }>;
}

interface OutlinedPartOptions {
  name: string;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  outline?: THREE.LineBasicMaterial;
  echoOutline?: THREE.LineBasicMaterial;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
  castShadow?: boolean;
}

function addOutlinedPart(parent: THREE.Object3D, options: OutlinedPartOptions): THREE.Mesh {
  const part = new THREE.Group();
  part.name = options.name;
  if (options.position) part.position.set(...options.position);
  if (options.rotation) part.rotation.set(...options.rotation);
  if (options.scale) part.scale.set(...options.scale);
  parent.add(part);

  const geometry = options.geometry ?? GEOMETRIES.box;
  const mesh = new THREE.Mesh(geometry, options.material ?? MATERIALS.paper);
  mesh.name = `${options.name}-fill`;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  part.add(mesh);

  const silhouetteOnly = geometry === GEOMETRIES.sphere
    || geometry === GEOMETRIES.sphereLow
    || geometry.userData.doodleSilhouette === true;
  if (silhouetteOnly) {
    const graphite = options.outline === MATERIALS.graphiteOutline;
    const primary = new THREE.Mesh(geometry, graphite ? MATERIALS.graphiteShell : MATERIALS.redShell);
    primary.name = `${options.name}-outline`;
    primary.scale.setScalar(1.035);
    primary.renderOrder = 4;
    part.add(primary);
    const echo = new THREE.Mesh(geometry, graphite ? MATERIALS.graphiteShellEcho : MATERIALS.redShellEcho);
    echo.name = `${options.name}-echo-outline`;
    echo.position.set(0.006, -0.004, 0.004);
    echo.scale.setScalar(1.052);
    echo.renderOrder = 3;
    part.add(echo);
  } else {
    const primary = new THREE.LineSegments(edgesFor(geometry), options.outline ?? MATERIALS.redOutline);
    primary.name = `${options.name}-outline`;
    primary.renderOrder = 5;
    part.add(primary);
    const echo = new THREE.LineSegments(edgesFor(geometry), options.echoOutline ?? MATERIALS.redEcho);
    echo.name = `${options.name}-echo-outline`;
    echo.position.set(0.006, -0.004, 0.004);
    echo.scale.setScalar(1.038);
    echo.renderOrder = 4;
    part.add(echo);
  }
  return mesh;
}

function addHitPart(
  parent: THREE.Object3D,
  options: OutlinedPartOptions,
  zone: EnemyHitZone,
  hitMeshes: Array<{ mesh: THREE.Mesh; zone: EnemyHitZone }>,
): THREE.Mesh {
  const mesh = addOutlinedPart(parent, options);
  if (mesh.parent) mesh.parent.name = `${options.name}-part`;
  mesh.name = options.name;
  mesh.userData.hitPart = options.name;
  hitMeshes.push({ mesh, zone });
  return mesh;
}

function addPlainFacePart(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotationZ = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.z = rotationZ;
  mesh.renderOrder = 7;
  parent.add(mesh);
  return mesh;
}

function addScribbleContour(
  parent: THREE.Object3D,
  name: string,
  radiusX: number,
  radiusY: number,
  depth: number,
  seed: number,
  positionX = 0,
  rotationZ = 0,
): void {
  const contour = new THREE.Group();
  contour.name = name;
  contour.position.x = positionX;
  contour.rotation.z = rotationZ;
  parent.add(contour);

  const primary = new THREE.LineLoop(
    makeScribbleLoopGeometry(radiusX, radiusY, depth, seed),
    MATERIALS.redOutline,
  );
  primary.name = `${name}-primary`;
  primary.renderOrder = 8;
  contour.add(primary);

  const echo = new THREE.LineLoop(
    makeScribbleLoopGeometry(radiusX, radiusY, depth - 0.002, seed, true),
    MATERIALS.redEcho,
  );
  echo.name = `${name}-echo`;
  echo.position.set(0.004, -0.003, 0);
  echo.renderOrder = 7;
  contour.add(echo);
}

function addCurvedFaceStroke(
  parent: THREE.Object3D,
  name: string,
  points: readonly THREE.Vector3[],
  material: THREE.Material,
  radius: number,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([...points], false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, 8, radius, 5, false);
  geometry.userData.handDrawnStroke = true;
  const stroke = new THREE.Mesh(geometry, material);
  stroke.name = name;
  stroke.renderOrder = 9;
  parent.add(stroke);
  return stroke;
}

function addFace(head: THREE.Group, boss: boolean, variant = 0): void {
  if (!boss) {
    const z = 0.252;
    const leftEyeX = -0.097 + (hashUnit(variant, 11) - 0.5) * 0.018;
    const rightEyeX = 0.105 + (hashUnit(variant, 12) - 0.5) * 0.022;
    const leftEyeY = 0.038 + (hashUnit(variant, 13) - 0.5) * 0.016;
    const rightEyeY = 0.033 + (hashUnit(variant, 14) - 0.5) * 0.018;

    // A faint red pass sits behind two separately angled graphite brows, as in the source.
    addCurvedFaceStroke(head, 'regular-red-eye-line', [
      new THREE.Vector3(-0.17, 0.112, z),
      new THREE.Vector3(-0.025, 0.126 + (hashUnit(variant, 15) - 0.5) * 0.015, z + 0.002),
      new THREE.Vector3(0.165, 0.105, z),
    ], MATERIALS.redFaceInk, 0.0065);

    for (const side of [-1, 1] as const) {
      const isLeft = side === -1;
      const eyeX = isLeft ? leftEyeX : rightEyeX;
      const eyeY = isLeft ? leftEyeY : rightEyeY;
      const eyeScale = isLeft ? 0.038 : 0.043 + (hashUnit(variant, 16) - 0.5) * 0.006;
      addPlainFacePart(
        head,
        `regular-eye-${side}`,
        REGULAR_GEOMETRIES.blobs[(variant * 2 + (isLeft ? 0 : 1)) % REGULAR_GEOMETRIES.blobs.length] ?? GEOMETRIES.sphereLow,
        MATERIALS.faceInk,
        [eyeX, eyeY, z + 0.012],
        [eyeScale, eyeScale * (isLeft ? 1.12 : 0.96), 0.012],
        (isLeft ? -1 : 1) * 0.08,
      );
      addPlainFacePart(
        head,
        `regular-brow-${side}`,
        REGULAR_GEOMETRIES.prisms[(variant * 2 + (isLeft ? 0 : 1)) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box,
        MATERIALS.faceInk,
        [eyeX + (isLeft ? -0.008 : 0.006), eyeY + (isLeft ? 0.09 : 0.105), z + 0.014],
        [isLeft ? 0.105 : 0.095, isLeft ? 0.025 : 0.022, 0.018],
        isLeft ? -0.31 : 0.42,
      );
    }

    addPlainFacePart(
      head,
      'regular-nose',
      REGULAR_GEOMETRIES.prisms[(variant * 3 + 7) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box,
      MATERIALS.faceInk,
      [0.012 + (hashUnit(variant, 17) - 0.5) * 0.025, -0.012, z + 0.016],
      [0.024, 0.055, 0.014],
      -0.47 + (hashUnit(variant, 18) - 0.5) * 0.22,
    );
    const expression = variant % 3 === 1 ? 'frown' : variant % 3 === 2 ? 'crooked-smile' : 'smile';
    const mouth = new THREE.Mesh(expression === 'frown' ? GEOMETRIES.regularMouth : GEOMETRIES.regularSmile, MATERIALS.faceInk);
    mouth.name = 'regular-mouth-expression';
    mouth.userData.expression = expression;
    mouth.position.set((hashUnit(variant, 19) - 0.5) * 0.022, -0.118, z + 0.02);
    mouth.rotation.z = (hashUnit(variant, 20) - 0.5) * 0.13;
    if (expression === 'crooked-smile') mouth.scale.set(0.78, 0.86, 1);
    mouth.renderOrder = 9;
    head.add(mouth);
    return;
  }

  const z = 0.334;
  for (const side of [-1, 1] as const) {
    addPlainFacePart(head, `boss-eye-${side}`, GEOMETRIES.sphereLow, MATERIALS.redFaceInk, [side * 0.15, 0.055, z + 0.018], [0.052, 0.06, 0.016]);
    addPlainFacePart(head, `boss-brow-${side}`, GEOMETRIES.box, MATERIALS.redFaceInk, [side * 0.15, 0.17, z + 0.022], [0.205, 0.045, 0.022], side * 0.34);
  }
  addPlainFacePart(head, 'boss-nose', GEOMETRIES.box, MATERIALS.redFaceInk, [0, -0.018, z + 0.025], [0.055, 0.13, 0.022], -0.42);
  const mouth = new THREE.Mesh(GEOMETRIES.bossMouth, MATERIALS.redFaceInk);
  mouth.name = 'boss-frown';
  mouth.position.set(0, -0.16, z + 0.035);
  mouth.renderOrder = 7;
  head.add(mouth);
}

interface LimbOptions {
  name: string;
  side: -1 | 1;
  kind: 'arm' | 'leg';
  boss: boolean;
  variant?: number;
  hitMeshes: Array<{ mesh: THREE.Mesh; zone: EnemyHitZone }>;
}

function addBrokenInkBands(segment: THREE.Mesh, name: string, variant: number, lower: boolean): void {
  const parent = segment.parent;
  if (!parent) return;
  const count = lower ? 2 : 1;
  for (let index = 0; index < count; index += 1) {
    const geometry = REGULAR_GEOMETRIES.prisms[(variant * 3 + index + (lower ? 5 : 0)) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box;
    const band = new THREE.Mesh(geometry, INK_STYLE ? MATERIALS.paperBreak : MATERIALS.paper);
    band.name = `${name}-paper-break-${index + 1}`;
    band.position.set(
      (hashUnit(variant, 30 + index) - 0.5) * 0.16,
      lower ? 0.04 - index * 0.32 : -0.08,
      0.02,
    );
    band.rotation.z = (hashUnit(variant, 32 + index) - 0.5) * 0.2;
    band.scale.set(1.65, lower ? 0.075 : 0.06, 1.35);
    band.renderOrder = 6;
    parent.add(band);
  }
}

function createLimb(options: LimbOptions): THREE.Group {
  const { name, side, kind, boss, hitMeshes } = options;
  const variant = options.variant ?? 0;
  const pivot = new THREE.Group();
  pivot.name = `${name}-joint`;
  const outline = boss ? MATERIALS.graphiteOutline : MATERIALS.redOutline;
  const echo = boss ? MATERIALS.graphiteEcho : MATERIALS.redEcho;
  const material = boss
    ? (INK_STYLE ? MATERIALS.bossWash : MATERIALS.paper)
    : (INK_STYLE ? MATERIALS.enemyInk : MATERIALS.red);
  const upperBase = kind === 'arm' ? (boss ? 0.31 : 0.27) : (boss ? 0.36 : 0.34);
  const lowerBase = kind === 'arm' ? (boss ? 0.32 : 0.29) : (boss ? 0.39 : 0.38);
  const upperLength = upperBase * (boss ? 1 : 0.96 + hashUnit(variant, side === -1 ? 21 : 22) * 0.08);
  const lowerLength = lowerBase * (boss ? 1 : 0.94 + hashUnit(variant, side === -1 ? 23 : 24) * 0.12);
  const radiusBase = kind === 'arm' ? (boss ? 0.06 : 0.043) : (boss ? 0.064 : 0.045);
  const radius = radiusBase * (boss ? 1 : 0.9 + hashUnit(variant, side === -1 ? 25 : 26) * 0.2);
  const upperGeometry = boss
    ? GEOMETRIES.cylinder
    : REGULAR_GEOMETRIES.limbs[(variant * 4 + (kind === 'arm' ? 0 : 2) + (side === 1 ? 1 : 0)) % REGULAR_GEOMETRIES.limbs.length] ?? GEOMETRIES.cylinder;
  const lowerGeometry = boss
    ? GEOMETRIES.cylinder
    : REGULAR_GEOMETRIES.limbs[(variant * 4 + (kind === 'arm' ? 11 : 17) + (side === 1 ? 3 : 0)) % REGULAR_GEOMETRIES.limbs.length] ?? GEOMETRIES.cylinder;

  const upper = new THREE.Group();
  upper.name = `${name}-upper`;
  pivot.add(upper);
  const upperSegment = addHitPart(upper, {
    name: `${name}-upper-segment`,
    geometry: upperGeometry,
    material,
    outline,
    echoOutline: echo,
    position: [0, -upperLength / 2, 0],
    scale: [radius, upperLength, radius * 0.82],
  }, 'limb', hitMeshes);
  if (!boss) addBrokenInkBands(upperSegment, `${name}-upper`, variant + (side === 1 ? 3 : 0), false);

  const middle = new THREE.Group();
  middle.name = `${name}-${kind === 'arm' ? 'elbow' : 'knee'}`;
  middle.position.y = -upperLength;
  upper.add(middle);
  addOutlinedPart(middle, {
    name: `${name}-${kind === 'arm' ? 'elbow' : 'knee'}-cap`,
    geometry: boss
      ? GEOMETRIES.sphereLow
      : REGULAR_GEOMETRIES.blobs[(variant * 3 + (side === 1 ? 1 : 0)) % REGULAR_GEOMETRIES.blobs.length] ?? GEOMETRIES.sphereLow,
    material,
    outline,
    echoOutline: echo,
    scale: boss
      ? [radius * 1.18, radius * 1.12, radius]
      : [radius * 0.82, radius * 0.72, radius * 0.76],
  });

  const lower = new THREE.Group();
  lower.name = `${name}-lower`;
  middle.add(lower);
  const lowerSegment = addHitPart(lower, {
    name: `${name}-lower-segment`,
    geometry: lowerGeometry,
    material,
    outline,
    echoOutline: echo,
    position: [0, -lowerLength / 2, 0],
    scale: [radius * 0.92, lowerLength, radius * 0.78],
  }, 'limb', hitMeshes);
  if (!boss) addBrokenInkBands(lowerSegment, `${name}-lower`, variant + (side === 1 ? 7 : 1), true);

  if (kind === 'arm') {
    const inward = boss ? 0.13 : 0.12;
    middle.rotation.z = boss
      ? -side * 0.18
      : -side * (0.16 + hashUnit(variant, side === -1 ? 27 : 28) * 0.2);
    addHitPart(lower, {
      name: `${name}-mitten-hand`,
      geometry: boss
        ? GEOMETRIES.dodecahedron
        : REGULAR_GEOMETRIES.mittens[(variant * 2 + (side === 1 ? 1 : 0)) % REGULAR_GEOMETRIES.mittens.length] ?? GEOMETRIES.sphereLow,
      material: INK_STYLE ? (boss ? MATERIALS.bossWash : MATERIALS.enemyWash) : MATERIALS.paper,
      outline,
      echoOutline: echo,
      position: [
        side * -inward * (0.18 + hashUnit(variant, 35) * 0.1),
        -lowerLength - (boss ? 0.045 : 0.035),
        0.018,
      ],
      rotation: [0.12, 0, boss ? side * 0.15 : side * (0.1 + hashUnit(variant, 36) * 0.28)],
      scale: boss
        ? [0.12, 0.105, 0.082]
        : [
          side === -1 ? 0.112 : 0.096,
          side === -1 ? 0.086 : 0.104,
          side === -1 ? 0.078 : 0.072,
        ],
    }, 'limb', hitMeshes);
    pivot.rotation.z = -side * (boss ? 0.3 : 0.38);
  } else {
    addHitPart(lower, {
      name: `${name}-shoe`,
      geometry: boss
        ? GEOMETRIES.dodecahedron
        : REGULAR_GEOMETRIES.blobs[(variant * 5 + (side === 1 ? 13 : 6)) % REGULAR_GEOMETRIES.blobs.length] ?? GEOMETRIES.dodecahedron,
      material: INK_STYLE ? (boss ? MATERIALS.bossWash : MATERIALS.enemyWash) : MATERIALS.paper,
      outline,
      echoOutline: echo,
      position: [side * (boss ? 0.012 : 0.018), -lowerLength - 0.055, 0.075],
      rotation: [0.04, 0, boss ? side * 0.035 : side * (0.08 + hashUnit(variant, 38) * 0.18)],
      scale: boss
        ? [0.17, 0.095, 0.2]
        : [
          side === -1 ? 0.115 : 0.103,
          side === -1 ? 0.062 : 0.075,
          side === -1 ? 0.16 : 0.18,
        ],
    }, 'limb', hitMeshes);
  }
  return pivot;
}

function addUprightGun(rig: DoodleRig, kind: EnemyKind, variant: number): void {
  if (kind === 'rusher' || kind === 'boss') return;
  const weapon = new THREE.Group();
  weapon.name = `${kind}-upright-weapon`;
  weapon.rotation.z = (hashUnit(variant, 41) - 0.5) * 0.085;
  weapon.position.x = 0.012 + (hashUnit(variant, 42) - 0.5) * 0.025;
  weapon.userData.handDrawnOffset = true;
  rig.weaponPivot.add(weapon);

  const widthScale = kind === 'heavy' ? 1.16 : kind === 'marksman' ? 0.88 : 1;
  const barrelScale = kind === 'marksman' ? 1.18 : kind === 'heavy' ? 1.08 : 1;
  addOutlinedPart(weapon, {
    name: `${kind}-weapon-receiver`,
    geometry: REGULAR_GEOMETRIES.prisms[(variant * 3 + 2) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box,
    material: MATERIALS.cream,
    position: [0, -0.04, 0],
    rotation: [0, 0, (hashUnit(variant, 43) - 0.5) * 0.04],
    scale: [0.082 * widthScale, 0.43, 0.07 * widthScale],
  });
  addOutlinedPart(weapon, {
    name: `${kind}-weapon-lower-grip`,
    geometry: REGULAR_GEOMETRIES.prisms[(variant * 3 + 5) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box,
    material: INK_STYLE ? MATERIALS.enemyWash : MATERIALS.paper,
    position: [0.022, -0.31, 0.006],
    rotation: [0, 0, -0.12],
    scale: [0.057 * widthScale, 0.22, 0.058 * widthScale],
  });
  addOutlinedPart(weapon, {
    name: `${kind}-weapon-barrel`,
    geometry: REGULAR_GEOMETRIES.limbs[(variant * 4 + 19) % REGULAR_GEOMETRIES.limbs.length] ?? GEOMETRIES.cylinder,
    material: MATERIALS.graphite,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    position: [0, 0.43 * barrelScale, 0],
    scale: [0.027 * widthScale, 0.5 * barrelScale, 0.024 * widthScale],
  });
  addOutlinedPart(weapon, {
    name: `${kind}-weapon-red-band`,
    geometry: REGULAR_GEOMETRIES.prisms[(variant * 3 + 8) % REGULAR_GEOMETRIES.prisms.length] ?? GEOMETRIES.box,
    material: MATERIALS.red,
    position: [0, 0.14, 0.012],
    scale: [0.092 * widthScale, 0.038, 0.078 * widthScale],
  });
  rig.muzzle.position.set(0, 0.71 * barrelScale, 0);
}

function createRegularRig(kind: EnemyKind, seed: number): DoodleRig {
  const root = new THREE.Group();
  root.name = `${kind}-doodle-rig`;
  const variant = Math.abs(seed >>> 0) % REGULAR_VARIATION_COUNT;
  root.userData.doodleVariant = variant;
  root.userData.handDrawnAsymmetry = true;
  const hitMeshes: Array<{ mesh: THREE.Mesh; zone: EnemyHitZone }> = [];

  const torso = new THREE.Group();
  torso.name = 'torso-joint';
  torso.position.y = 1.2;
  const torsoDrawing = new THREE.Group();
  torsoDrawing.name = 'regular-torso-drawing';
  torsoDrawing.position.x = (hashUnit(variant, 51) < 0.5 ? -1 : 1) * (0.012 + hashUnit(variant, 63) * 0.014);
  torsoDrawing.rotation.z = (hashUnit(variant, 52) - 0.5) * 0.055;
  torso.add(torsoDrawing);
  addHitPart(torsoDrawing, {
    name: 'torso-hit-zone',
    geometry: REGULAR_GEOMETRIES.torsos[variant] ?? GEOMETRIES.sphere,
    material: INK_STYLE ? MATERIALS.enemyWash : MATERIALS.paper,
    scale: [0.35, 0.32, 0.165],
  }, 'torso', hitMeshes);
  addScribbleContour(torsoDrawing, 'regular-torso-scribble-contour', 0.349, 0.319, 0.071, 610 + variant);
  root.add(torso);

  const head = new THREE.Group();
  head.name = 'head-joint';
  head.position.y = 1.82;
  const headDrawing = new THREE.Group();
  headDrawing.name = 'regular-head-drawing';
  headDrawing.position.x = (hashUnit(variant, 53) - 0.5) * 0.025;
  headDrawing.rotation.z = (hashUnit(variant, 54) - 0.5) * 0.045;
  head.add(headDrawing);
  addHitPart(headDrawing, {
    name: 'head-hit-zone',
    geometry: REGULAR_GEOMETRIES.heads[variant] ?? GEOMETRIES.sphere,
    material: INK_STYLE ? MATERIALS.enemyWash : MATERIALS.paper,
    scale: [0.3, 0.31, 0.145],
  }, 'head', hitMeshes);
  addScribbleContour(headDrawing, 'regular-head-scribble-contour', 0.299, 0.309, 0.068, 710 + variant);
  addFace(headDrawing, false, variant);
  root.add(head);

  const leftArm = createLimb({ name: 'left-arm', side: -1, kind: 'arm', boss: false, variant, hitMeshes });
  leftArm.position.set(-0.325, 1.44 + (hashUnit(variant, 55) - 0.5) * 0.03, 0.02);
  leftArm.rotation.z = -0.48 - hashUnit(variant, 56) * 0.22;
  root.add(leftArm);
  const rightArm = createLimb({ name: 'right-arm', side: 1, kind: 'arm', boss: false, variant: variant + 2, hitMeshes });
  rightArm.position.set(0.325, 1.42 + (hashUnit(variant, 57) - 0.5) * 0.035, 0.035);
  rightArm.rotation.z = -0.43 - hashUnit(variant, 58) * 0.2;
  root.add(rightArm);
  const leftLeg = createLimb({ name: 'left-leg', side: -1, kind: 'leg', boss: false, variant: variant + 4, hitMeshes });
  leftLeg.position.set(-0.15, 0.94, 0);
  leftLeg.rotation.z = -0.025 - hashUnit(variant, 59) * 0.035;
  root.add(leftLeg);
  const rightLeg = createLimb({ name: 'right-leg', side: 1, kind: 'leg', boss: false, variant: variant + 6, hitMeshes });
  rightLeg.position.set(0.15 + (hashUnit(variant, 60) - 0.5) * 0.025, 0.94, 0.008);
  rightLeg.rotation.z = 0.018 + hashUnit(variant, 61) * 0.045;
  root.add(rightLeg);

  const weaponPivot = new THREE.Group();
  weaponPivot.name = 'weapon-socket';
  weaponPivot.position.set(0.045 + (hashUnit(variant, 62) - 0.5) * 0.035, 1.52, 0.32);
  root.add(weaponPivot);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'enemy-muzzle-socket';
  weaponPivot.add(muzzle);

  const rig: DoodleRig = {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponPivot,
    muzzle,
    pencilPivot: null,
    hitMeshes,
  };
  addUprightGun(rig, kind, variant);

  const scale = kind === 'heavy' ? 1.05 : kind === 'rusher' ? 0.95 : 1;
  root.scale.setScalar(scale);
  return rig;
}

function createBossRig(): DoodleRig {
  const root = new THREE.Group();
  root.name = 'the-doodler-rig';
  const hitMeshes: Array<{ mesh: THREE.Mesh; zone: EnemyHitZone }> = [];

  const torso = new THREE.Group();
  torso.name = 'torso-joint';
  torso.position.y = 1.15;
  addHitPart(torso, {
    name: 'boss-torso-hit-zone',
    geometry: GEOMETRIES.sphere,
    material: INK_STYLE ? MATERIALS.bossWash : MATERIALS.paper,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    scale: [0.55, 0.37, 0.38],
  }, 'torso', hitMeshes);
  root.add(torso);

  const head = new THREE.Group();
  head.name = 'head-joint';
  head.position.y = 1.91;
  addHitPart(head, {
    name: 'boss-head-hit-zone',
    geometry: GEOMETRIES.sphere,
    material: INK_STYLE ? MATERIALS.bossWash : MATERIALS.paper,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    scale: [0.44, 0.45, 0.33],
  }, 'head', hitMeshes);
  addFace(head, true);
  addOutlinedPart(head, {
    name: 'boss-flat-five-point-crown',
    geometry: GEOMETRIES.crown,
    material: MATERIALS.graphite,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    position: [0, 0.37, 0.01],
    scale: [0.94, 0.96, 1],
  });
  root.add(head);

  const leftArm = createLimb({ name: 'left-arm', side: -1, kind: 'arm', boss: true, hitMeshes });
  leftArm.position.set(-0.47, 1.38, 0.02);
  root.add(leftArm);
  const rightArm = createLimb({ name: 'right-arm', side: 1, kind: 'arm', boss: true, hitMeshes });
  rightArm.position.set(0.47, 1.38, 0.02);
  root.add(rightArm);
  const leftLeg = createLimb({ name: 'left-leg', side: -1, kind: 'leg', boss: true, hitMeshes });
  leftLeg.position.set(-0.22, 0.84, 0);
  root.add(leftLeg);
  const rightLeg = createLimb({ name: 'right-leg', side: 1, kind: 'leg', boss: true, hitMeshes });
  rightLeg.position.set(0.22, 0.84, 0);
  root.add(rightLeg);

  const weaponPivot = new THREE.Group();
  weaponPivot.name = 'weapon-socket';
  weaponPivot.position.set(0.1, 1.32, 0.37);
  root.add(weaponPivot);
  const pencilPivot = new THREE.Group();
  pencilPivot.name = 'pencil-joint';
  pencilPivot.rotation.z = -0.72;
  weaponPivot.add(pencilPivot);
  addOutlinedPart(pencilPivot, {
    name: 'giant-pencil',
    geometry: GEOMETRIES.cylinder,
    material: MATERIALS.cream,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    scale: [0.082, 1.48, 0.075],
  });
  addOutlinedPart(pencilPivot, {
    name: 'pencil-red-tip',
    geometry: GEOMETRIES.cone,
    material: MATERIALS.red,
    outline: MATERIALS.redOutline,
    echoOutline: MATERIALS.redEcho,
    position: [0, 0.86, 0],
    scale: [0.105, 0.28, 0.1],
  });
  addOutlinedPart(pencilPivot, {
    name: 'pencil-graphite-cap',
    geometry: GEOMETRIES.cylinder,
    material: MATERIALS.graphite,
    outline: MATERIALS.graphiteOutline,
    echoOutline: MATERIALS.graphiteEcho,
    position: [0, -0.79, 0],
    scale: [0.088, 0.13, 0.08],
  });
  const muzzle = new THREE.Object3D();
  muzzle.name = 'enemy-muzzle-socket';
  muzzle.position.set(0, 1.04, 0);
  pencilPivot.add(muzzle);

  return {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponPivot,
    muzzle,
    pencilPivot,
    hitMeshes,
  };
}

export function createDoodleRig(kind: EnemyKind, seed = 0): DoodleRig {
  return kind === 'boss' ? createBossRig() : createRegularRig(kind, seed);
}

function deathInkMaterialFor(object: THREE.Mesh | THREE.LineSegments): THREE.Material {
  if (object instanceof THREE.LineSegments) return MATERIALS.deathInkLine;
  const keepFaceDark = /(?:eye|brow|nose|frown|mouth|face)/.test(object.name);
  if (keepFaceDark) return object.material as THREE.Material;
  return /(?:outline|echo-outline)/.test(object.name) ? MATERIALS.deathInkShell : MATERIALS.deathInk;
}

/** Preserve the source video's one-beat red silhouette before the rig separates. */
export function applyDeathInkToDoodleRig(rig: DoodleRig): void {
  rig.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.material = deathInkMaterialFor(object);
    }
  });
}

/** Temporarily tint an intact rig red, returning a closure that restores every material. */
export function flashDeathInkOnDoodleRig(rig: DoodleRig): () => void {
  const originals: Array<{ object: THREE.Mesh | THREE.LineSegments; material: THREE.Material | THREE.Material[] }> = [];
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    originals.push({ object, material: object.material });
    object.material = deathInkMaterialFor(object);
  });
  return () => {
    for (const { object, material } of originals) object.material = material;
  };
}

export function getEnemySharedResources(): {
  geometries: ReadonlyArray<THREE.BufferGeometry>;
  materials: ReadonlyArray<THREE.Material>;
} {
  const geometries = Object.values(GEOMETRIES);
  const regularGeometries = Object.values(REGULAR_GEOMETRIES).flat();
  return {
    geometries: [...geometries, ...regularGeometries, ...geometries.map(edgesFor)],
    materials: Object.values(MATERIALS),
  };
}
