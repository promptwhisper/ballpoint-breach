import * as THREE from 'three';

const P = {
  paper: 0xecebdd,
  paperLight: 0xf4f2e6,
  paperShade: 0xd9d9dc,
  ink: 0x29277f,
  inkSoft: 0x686fb2,
  lavender: 0xb8bbd8,
  orange: 0xd39b42,
  red: 0xc92f4f,
  mint: 0x74c58b,
};

type Vec3 = [number, number, number];

function makeHatchTexture(crossed: boolean, spacing: number, alpha: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  ctx.fillStyle = crossed ? '#c7c8dc' : '#e9e8dc';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `rgba(43,40,126,${alpha})`;
  ctx.lineWidth = 1;
  for (let offset = -size; offset < size * 2; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
    if (crossed) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + size, size);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(crossed ? 4.5 : 3.2, crossed ? 4.5 : 3.2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

const outlineMaterial = new THREE.LineBasicMaterial({ color: P.ink, transparent: true, opacity: 0.96 });
const softOutlineMaterial = new THREE.LineBasicMaterial({ color: P.inkSoft, transparent: true, opacity: 0.72 });
const paperMaterial = new THREE.MeshBasicMaterial({ color: P.paperLight });
const paperShadeMaterial = new THREE.MeshBasicMaterial({ color: P.paperShade });
const lavenderMaterial = new THREE.MeshBasicMaterial({ color: P.lavender });
const inkMaterial = new THREE.MeshBasicMaterial({ color: P.ink, depthTest: false, depthWrite: false });
const orangeMaterial = new THREE.MeshBasicMaterial({ color: P.orange });
const redMaterial = new THREE.MeshBasicMaterial({ color: P.red });
const mintMaterial = new THREE.MeshBasicMaterial({ color: P.mint });
const hatchMaterial = new THREE.MeshBasicMaterial({ map: makeHatchTexture(false, 8, 0.38) });
const deepHatchMaterial = new THREE.MeshBasicMaterial({ map: makeHatchTexture(true, 7, 0.42) });

function outlined(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  edgeMaterial: THREE.LineBasicMaterial = outlineMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), edgeMaterial);
  edges.renderOrder = 3;
  group.add(mesh, edges);
  group.position.set(...position);
  group.rotation.set(...rotation);
  return group;
}

function box(
  parent: THREE.Object3D,
  size: Vec3,
  position: Vec3,
  material: THREE.Material = paperMaterial,
  rotation: Vec3 = [0, 0, 0],
  edgeMaterial?: THREE.LineBasicMaterial,
): THREE.Group {
  const value = outlined(new THREE.BoxGeometry(...size), material, position, rotation, edgeMaterial);
  parent.add(value);
  return value;
}

function cylinderBetween(
  parent: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material = paperMaterial,
  segments = 6,
): THREE.Group {
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1, false);
  const value = outlined(geometry, material, [0, 0, 0]);
  value.position.copy(start).add(end).multiplyScalar(0.5);
  value.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(value);
  return value;
}

function line(parent: THREE.Object3D, points: THREE.Vector3[], material = outlineMaterial): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const value = new THREE.Line(geometry, material);
  value.renderOrder = 4;
  parent.add(value);
  return value;
}

function createRail(
  parent: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  baseY: number,
  colorMaterial: THREE.Material = paperMaterial,
  posts = 7,
): void {
  const a = start.clone();
  const b = end.clone();
  a.y = b.y = baseY + 0.72;
  cylinderBetween(parent, a, b, 0.035, colorMaterial, 6);
  const a2 = start.clone();
  const b2 = end.clone();
  a2.y = b2.y = baseY + 0.36;
  cylinderBetween(parent, a2, b2, 0.025, colorMaterial, 6);
  for (let i = 0; i <= posts; i += 1) {
    const t = i / posts;
    const p = start.clone().lerp(end, t);
    cylinderBetween(parent, new THREE.Vector3(p.x, baseY, p.z), new THREE.Vector3(p.x, baseY + 0.76, p.z), 0.028, colorMaterial, 6);
  }
}

function createLeftScaffold(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'left-construction-frame';
  scene.add(root);

  const xs = [-8.0, -4.0, 0.0];
  const zs = [-15.2, -12.35, -9.5];
  for (const x of xs) {
    for (const z of zs) box(root, [0.32, 4.85, 0.32], [x, 2.425, z], lavenderMaterial);
  }

  const levels = [0.18, 1.25, 2.32, 3.39, 4.46];
  for (const [index, y] of levels.entries()) {
    box(root, [8.2, 0.18, 6.0], [-4.0, y, -12.35], index === 0 ? paperMaterial : hatchMaterial);
    if (index > 0) {
      createRail(root, new THREE.Vector3(-7.95, y + 0.1, -9.32), new THREE.Vector3(-0.05, y + 0.1, -9.32), y + 0.08, paperMaterial, 10);
    }
  }

  for (let level = 0; level < 4; level += 1) {
    const y = 0.68 + level * 1.07;
    box(root, [3.2, 0.7, 0.14], [-6.0, y, -12.47], deepHatchMaterial);
    box(root, [3.2, 0.7, 0.14], [-2.0, y, -12.47], level % 2 === 0 ? hatchMaterial : deepHatchMaterial);
  }

  for (const x of [-7.3, -5.7, -4.0, -2.3, -0.7]) {
    box(root, [0.18, 0.18, 6.25], [x, 3.43, -12.35], lavenderMaterial);
  }

  const stairRoot = new THREE.Group();
  root.add(stairRoot);
  for (let i = 0; i < 12; i += 1) {
    const t = i / 11;
    box(stairRoot, [1.25, 0.16, 0.42], [-7.1 + t * 2.35, 0.22 + t * 1.95, -8.9 - t * 2.25], i % 2 ? paperMaterial : hatchMaterial);
  }
  cylinderBetween(stairRoot, new THREE.Vector3(-7.78, 0.32, -8.68), new THREE.Vector3(-5.42, 2.46, -10.95), 0.045, paperMaterial);
  cylinderBetween(stairRoot, new THREE.Vector3(-6.5, 0.32, -8.68), new THREE.Vector3(-4.14, 2.46, -10.95), 0.045, paperMaterial);

  box(root, [1.15, 0.5, 1.1], [-5.8, 4.75, -13.45], hatchMaterial);
  box(root, [0.7, 0.3, 0.8], [-2.25, 4.66, -12.8], paperShadeMaterial);
}

function createCrane(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'construction-crane';
  scene.add(root);
  box(root, [0.25, 1.65, 0.35], [-3.25, 5.98, -14.2], lavenderMaterial);
  box(root, [4.6, 0.22, 0.34], [-0.95, 6.88, -14.2], paperMaterial, [0, 0, -0.065]);
  box(root, [2.15, 0.32, 0.42], [-4.35, 7.08, -14.2], hatchMaterial, [0, 0, -0.065]);
  cylinderBetween(root, new THREE.Vector3(-3.2, 5.92, -14.2), new THREE.Vector3(1.35, 6.71, -14.2), 0.045, lavenderMaterial);
  cylinderBetween(root, new THREE.Vector3(-3.2, 5.92, -14.2), new THREE.Vector3(-5.42, 7.15, -14.2), 0.045, lavenderMaterial);
  cylinderBetween(root, new THREE.Vector3(1.28, 6.68, -14.2), new THREE.Vector3(1.28, 5.55, -14.2), 0.026, orangeMaterial, 8);
  const hook = outlined(new THREE.TorusGeometry(0.18, 0.045, 6, 14, Math.PI * 1.5), orangeMaterial, [1.28, 5.43, -14.2], [0, 0, -0.35]);
  root.add(hook);
}

function createRearWalkways(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'rear-walkways';
  scene.add(root);
  box(root, [15.4, 0.22, 1.1], [-1.9, 3.58, -16.15], hatchMaterial);
  createRail(root, new THREE.Vector3(-9.55, 3.68, -15.55), new THREE.Vector3(5.75, 3.68, -15.55), 3.65, paperMaterial, 18);
  box(root, [9.4, 0.18, 0.9], [-12.0, 4.22, -15.1], orangeMaterial, [0, 0.04, 0]);
  createRail(root, new THREE.Vector3(-16.7, 4.3, -14.65), new THREE.Vector3(-7.35, 4.3, -14.65), 4.3, orangeMaterial, 12);
}

function addFacadeOpening(parent: THREE.Object3D, x: number, y: number, w: number, h: number, z: number): void {
  box(parent, [w, h, 0.09], [x, y, z], paperMaterial);
  const frame = 0.085;
  box(parent, [w + frame * 2, frame, 0.12], [x, y + h / 2 + frame / 2, z + 0.03], lavenderMaterial);
  box(parent, [w + frame * 2, frame, 0.12], [x, y - h / 2 - frame / 2, z + 0.03], lavenderMaterial);
  box(parent, [frame, h, 0.12], [x - w / 2 - frame / 2, y, z + 0.03], lavenderMaterial);
  box(parent, [frame, h, 0.12], [x + w / 2 + frame / 2, y, z + 0.03], lavenderMaterial);
}

function createUtilityBlock(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'utility-block';
  scene.add(root);
  box(root, [5.1, 3.15, 5.2], [3.45, 1.575, -11.1], deepHatchMaterial);
  addFacadeOpening(root, 1.85, 2.12, 0.78, 0.72, -8.45);
  addFacadeOpening(root, 4.28, 2.47, 0.88, 0.68, -8.45);
  addFacadeOpening(root, 4.65, 0.85, 1.18, 1.5, -8.44);
  box(root, [1.35, 0.18, 1.35], [5.65, 2.08, -9.15], hatchMaterial);
  cylinderBetween(root, new THREE.Vector3(5.02, 2.16, -8.55), new THREE.Vector3(6.28, 2.16, -8.55), 0.04, paperMaterial);

  createRail(root, new THREE.Vector3(0.95, 3.18, -8.45), new THREE.Vector3(5.95, 3.18, -8.45), 3.17, paperMaterial, 8);
  createRail(root, new THREE.Vector3(5.95, 3.18, -8.45), new THREE.Vector3(5.95, 3.18, -13.7), 3.17, paperMaterial, 7);

  const stairRoot = new THREE.Group();
  root.add(stairRoot);
  const steps = 14;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    box(stairRoot, [1.0, 0.17, 0.44], [5.75 + t * 1.72, 1.97 - t * 1.75, -9.45 + t * 3.35], i % 2 ? paperMaterial : hatchMaterial);
  }
  cylinderBetween(stairRoot, new THREE.Vector3(5.23, 2.42, -9.58), new THREE.Vector3(6.95, 0.67, -6.22), 0.045, paperMaterial);
  cylinderBetween(stairRoot, new THREE.Vector3(6.25, 2.42, -9.58), new THREE.Vector3(7.97, 0.67, -6.22), 0.045, paperMaterial);
}

function createPerimeter(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'perimeter';
  scene.add(root);
  box(root, [11.0, 5.7, 0.42], [12.0, 2.85, -13.0], deepHatchMaterial, [0, -0.31, 0]);
  box(root, [25.0, 3.7, 0.35], [-5.0, 1.85, -23.5], hatchMaterial);
  box(root, [6.2, 3.4, 0.35], [-14.2, 1.7, -12.0], hatchMaterial, [0, 0.22, 0]);
}

function createGroundProps(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'ground-props';
  scene.add(root);
  box(root, [2.45, 1.0, 1.0], [-1.5, 0.5, -6.8], paperMaterial, [0, 0.08, 0]);
  box(root, [1.2, 0.72, 1.15], [1.0, 0.36, -8.0], hatchMaterial, [0, -0.12, 0]);
  box(root, [0.9, 0.55, 0.9], [-8.8, 0.275, -7.2], paperShadeMaterial);
  box(root, [0.46, 1.18, 0.16], [0.15, 0.72, -14.1], mintMaterial);
  box(root, [0.18, 0.65, 0.18], [0.15, 0.72, -14.02], paperMaterial);
  cylinderBetween(root, new THREE.Vector3(-3.0, -0.7, -4.5), new THREE.Vector3(1.3, 4.0, -9.0), 0.036, inkMaterial, 8);
}

function createDoodleEnemy(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'enemy';
  root.position.set(-5.15, 0, -11.7);
  root.scale.setScalar(0.32);
  scene.add(root);
  root.add(outlined(new THREE.CapsuleGeometry(0.17, 0.62, 4, 8), redMaterial, [0, 0.94, 0]));
  root.add(outlined(new THREE.SphereGeometry(0.25, 10, 8), paperMaterial, [0, 1.62, 0]));
  cylinderBetween(root, new THREE.Vector3(-0.08, 0.72, 0), new THREE.Vector3(-0.3, 0.05, 0.04), 0.055, redMaterial, 6);
  cylinderBetween(root, new THREE.Vector3(0.08, 0.72, 0), new THREE.Vector3(0.3, 0.05, -0.04), 0.055, redMaterial, 6);
  cylinderBetween(root, new THREE.Vector3(-0.12, 1.22, 0), new THREE.Vector3(-0.38, 0.8, 0.02), 0.045, redMaterial, 6);
  cylinderBetween(root, new THREE.Vector3(0.12, 1.22, 0), new THREE.Vector3(0.39, 1.0, -0.03), 0.045, redMaterial, 6);
  box(root, [0.1, 0.1, 0.05], [-0.085, 1.66, 0.24], redMaterial);
  box(root, [0.1, 0.1, 0.05], [0.085, 1.66, 0.24], redMaterial);
}

function createSunAndClouds(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'sky-doodles';
  scene.add(root);
  root.add(outlined(new THREE.TorusGeometry(0.58, 0.035, 6, 48), paperMaterial, [-6.5, 5.35, -10.0]));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const a = new THREE.Vector3(-6.5 + Math.cos(angle) * 0.76, 5.35 + Math.sin(angle) * 0.76, -10.0);
    const b = new THREE.Vector3(-6.5 + Math.cos(angle) * 1.02, 5.35 + Math.sin(angle) * 1.02, -10.0);
    line(root, [a, b]);
  }

  const cloud = (cx: number, cy: number, cz: number, scale: number): void => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const t = (i / 80) * Math.PI * 2;
      const wobble = 1 + Math.sin(t * 4) * 0.16 + Math.sin(t * 7) * 0.06;
      points.push(new THREE.Vector3(cx + Math.cos(t) * 0.85 * scale * wobble, cy + Math.sin(t) * 0.35 * scale * wobble, cz));
    }
    line(root, points, softOutlineMaterial);
  };
  cloud(-0.6, 4.95, -21.8, 0.7);
  cloud(9.1, 7.55, -22.5, 0.95);

  const plane = [
    new THREE.Vector3(5.25, 7.78, -18.0),
    new THREE.Vector3(5.95, 8.03, -18.0),
    new THREE.Vector3(5.62, 7.46, -18.0),
    new THREE.Vector3(5.25, 7.78, -18.0),
    new THREE.Vector3(5.7, 7.78, -18.0),
  ];
  line(root, plane);
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.paper);
  scene.fog = new THREE.Fog(P.paper, 30, 55);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaaa5c8, 2.8));
  const key = new THREE.DirectionalLight(0xfff8e6, 3.2);
  key.position.set(-8, 14, 10);
  scene.add(key);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 50), paperMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -7.5);
  ground.name = 'ground';
  ground.receiveShadow = true;
  scene.add(ground);

  createPerimeter(scene);
  createRearWalkways(scene);
  createLeftScaffold(scene);
  createCrane(scene);
  createUtilityBlock(scene);
  createGroundProps(scene);
  createDoodleEnemy(scene);
  createSunAndClouds(scene);

  return scene;
}
