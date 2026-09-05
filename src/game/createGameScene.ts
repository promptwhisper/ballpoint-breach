import * as THREE from 'three';

import { DOODLE_PALETTE } from '../render/palette';

export interface GameSceneOptions {
  /** Warm notebook-paper colour used by both the clear and the atmospheric haze. */
  paperColor?: THREE.ColorRepresentation;
  /** Ballpoint colour used by the distant line drawings. */
  inkColor?: THREE.ColorRepresentation;
  /** Distance at which the arena begins to blend into the paper. */
  fogNear?: number;
  /** Distance at which geometry fully disappears into the paper. */
  fogFar?: number;
  /** World-space Z position of the static sky doodles behind the rear arena wall. */
  skyDepth?: number;
  /** Add inexpensive fill and key lights for non-shader effects and pickups. */
  includeLights?: boolean;
}

const DEFAULT_FOG_NEAR = 38;
const DEFAULT_FOG_FAR = 78;
const DEFAULT_SKY_DEPTH = -44;

function makePolyline(
  points: THREE.Vector3[],
  material: THREE.LineBasicMaterial | THREE.LineDashedMaterial,
  closed = false,
): THREE.Line | THREE.LineLoop {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = closed
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  if (material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = -2;
  return line;
}

function createSun(ink: THREE.ColorRepresentation): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sky-sun';
  root.position.set(-13.5, 18.5, 0);

  const wash = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 36),
    new THREE.MeshBasicMaterial({
      color: DOODLE_PALETTE.orange,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    }),
  );
  wash.renderOrder = -3;
  root.add(wash);

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: ink,
    transparent: true,
    opacity: 0.62,
    fog: true,
    toneMapped: false,
  });
  const circle: THREE.Vector3[] = [];
  const circleSegments = 48;
  for (let index = 0; index < circleSegments; index += 1) {
    const angle = (index / circleSegments) * Math.PI * 2;
    circle.push(new THREE.Vector3(Math.cos(angle) * 1.2, Math.sin(angle) * 1.2, 0.02));
  }
  root.add(makePolyline(circle, outlineMaterial, true));

  const rayPositions = new Float32Array(16 * 3);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const inner = 1.55;
    const outer = 2.08 + (index % 2) * 0.12;
    const offset = index * 6;
    rayPositions[offset] = Math.cos(angle) * inner;
    rayPositions[offset + 1] = Math.sin(angle) * inner;
    rayPositions[offset + 2] = 0.02;
    rayPositions[offset + 3] = Math.cos(angle) * outer;
    rayPositions[offset + 4] = Math.sin(angle) * outer;
    rayPositions[offset + 5] = 0.02;
  }
  const rayGeometry = new THREE.BufferGeometry();
  rayGeometry.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
  const rays = new THREE.LineSegments(rayGeometry, outlineMaterial);
  rays.frustumCulled = false;
  rays.renderOrder = -2;
  root.add(rays);
  return root;
}

function createCloud(
  name: string,
  position: THREE.Vector3,
  scale: number,
  paper: THREE.ColorRepresentation,
  ink: THREE.ColorRepresentation,
): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  root.position.copy(position);
  root.scale.setScalar(scale);

  const shape = new THREE.Shape();
  shape.moveTo(-1.75, -0.28);
  shape.bezierCurveTo(-2.05, -0.05, -1.96, 0.43, -1.47, 0.5);
  shape.bezierCurveTo(-1.35, 1.02, -0.67, 1.18, -0.31, 0.73);
  shape.bezierCurveTo(0.02, 1.39, 1.06, 1.17, 1.14, 0.53);
  shape.bezierCurveTo(1.82, 0.52, 2.03, -0.05, 1.68, -0.35);
  shape.bezierCurveTo(0.77, -0.48, -0.38, -0.47, -1.75, -0.28);
  shape.closePath();

  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 5),
    new THREE.MeshBasicMaterial({
      color: paper,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    }),
  );
  fill.renderOrder = -3;
  root.add(fill);

  const points2D = shape.getSpacedPoints(72);
  const points = points2D.map((point) => new THREE.Vector3(point.x, point.y, 0.025));
  root.add(makePolyline(points, new THREE.LineBasicMaterial({
    color: ink,
    transparent: true,
    opacity: 0.38,
    fog: true,
    toneMapped: false,
  }), true));
  return root;
}

function createSkyDoodles(
  depth: number,
  paper: THREE.ColorRepresentation,
  ink: THREE.ColorRepresentation,
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'procedural-sky-doodles';
  root.position.z = depth;
  root.userData.raycastDisabled = true;
  root.userData.nonInteractive = true;

  root.add(createSun(ink));
  root.add(createCloud(
    'sky-cloud-west',
    new THREE.Vector3(-4.1, 15.3, -0.35),
    1.05,
    paper,
    ink,
  ));
  root.add(createCloud(
    'sky-cloud-east',
    new THREE.Vector3(14.8, 20.2, -1.4),
    1.38,
    paper,
    ink,
  ));
  root.add(createCloud(
    'sky-cloud-far-west',
    new THREE.Vector3(-20.2, 12.9, -2.2),
    0.7,
    paper,
    ink,
  ));

  return root;
}

/**
 * Creates the shared BALLPOINT BREACH world scene. Arena, enemies, effects, and the
 * first-person viewmodel can be attached directly to the returned scene.
 */
export function createGameScene(options: Readonly<GameSceneOptions> = {}): THREE.Scene {
  const paper = options.paperColor ?? DOODLE_PALETTE.paper;
  const ink = options.inkColor ?? DOODLE_PALETTE.ink;
  const fogNear = Math.max(0, options.fogNear ?? DEFAULT_FOG_NEAR);
  const fogFar = Math.max(fogNear + 1, options.fogFar ?? DEFAULT_FOG_FAR);

  const scene = new THREE.Scene();
  scene.name = 'ballpoint-breach-game-scene';
  scene.background = new THREE.Color(paper);
  scene.fog = new THREE.Fog(paper, fogNear, fogFar);
  scene.add(createSkyDoodles(options.skyDepth ?? DEFAULT_SKY_DEPTH, paper, ink));

  if (options.includeLights ?? true) {
    const fill = new THREE.HemisphereLight(0xfffcf0, 0x8f91bd, 2.15);
    fill.name = 'paper-sky-fill';
    const key = new THREE.DirectionalLight(0xfff1cc, 2.75);
    key.name = 'warm-doodle-key';
    key.position.set(-12, 19, 10);
    scene.add(fill, key);
  }

  return scene;
}
