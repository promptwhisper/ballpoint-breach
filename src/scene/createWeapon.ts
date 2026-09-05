import * as THREE from 'three';

const PAPER_WHITE = 0xf4f0e8;
const LAVENDER = 0xd2d1e6;
const DEEP_LAVENDER = 0x9998c4;
const INDIGO = 0x30235f;
const LENS_RED = 0xd54359;

type PartOptions = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
};

function createHatchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.fillStyle = '#f3f0e8';
  context.fillRect(0, 0, 64, 64);
  context.strokeStyle = 'rgba(48,35,95,.34)';
  context.lineWidth = 1;
  for (let offset = -64; offset < 128; offset += 7) {
    context.beginPath();
    context.moveTo(offset, 64);
    context.lineTo(offset + 64, 0);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  return texture;
}

function outlinedPart(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  outlineMaterial: THREE.LineBasicMaterial,
  options: PartOptions = {},
): THREE.Group {
  const part = new THREE.Group();
  part.name = name;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${name}-fill`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  part.add(mesh);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    outlineMaterial,
  );
  outline.name = `${name}-outline`;
  outline.renderOrder = 2;
  part.add(outline);

  if (options.position) part.position.fromArray(options.position);
  if (options.rotation) part.rotation.set(...options.rotation);
  if (options.scale) part.scale.fromArray(options.scale);
  return part;
}

export function createFirstPersonRifle(): THREE.Group {
  const rifle = new THREE.Group();
  rifle.name = 'first-person-rifle';
  rifle.position.set(0.7, -0.55, -1.4);

  const paper = new THREE.MeshStandardMaterial({
    color: PAPER_WHITE,
    roughness: 0.82,
    metalness: 0.03,
  });
  const hatch = createHatchTexture();
  const lavender = new THREE.MeshStandardMaterial({
    color: LAVENDER,
    map: hatch,
    roughness: 0.76,
    metalness: 0.04,
  });
  const deepLavender = new THREE.MeshStandardMaterial({
    color: DEEP_LAVENDER,
    map: hatch,
    roughness: 0.68,
    metalness: 0.06,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: LENS_RED,
    emissive: 0x8f061e,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const outline = new THREE.LineBasicMaterial({ color: INDIGO });

  const add = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options?: PartOptions,
    parent: THREE.Object3D = rifle,
  ): THREE.Group => {
    const part = outlinedPart(name, geometry, material, outline, options);
    parent.add(part);
    return part;
  };

  add('receiver', new THREE.BoxGeometry(0.38, 0.3, 0.72), paper, {
    position: [0, 0, 0.06],
  });
  add('receiver-lower', new THREE.BoxGeometry(0.31, 0.16, 0.48), lavender, {
    position: [0, -0.19, 0.1],
  });
  add('receiver-side-panel', new THREE.BoxGeometry(0.012, 0.17, 0.38), deepLavender, {
    position: [0.198, 0.015, 0.02],
  });
  add('charging-handle', new THREE.BoxGeometry(0.14, 0.06, 0.11), deepLavender, {
    position: [0.25, 0.13, 0.22],
  });

  const stock = new THREE.Group();
  stock.name = 'stock';
  stock.position.set(0, -0.07, 0.48);
  stock.rotation.x = -0.12;
  rifle.add(stock);
  add('stock-body', new THREE.BoxGeometry(0.31, 0.27, 0.58), lavender, {
    position: [0, 0, 0.12],
  }, stock);
  add('stock-cheek-rest', new THREE.BoxGeometry(0.27, 0.09, 0.38), lavender, {
    position: [0, 0.18, -0.02],
  }, stock);
  add('stock-butt-pad', new THREE.BoxGeometry(0.37, 0.42, 0.13), deepLavender, {
    position: [0, -0.04, 0.45],
  }, stock);

  add('handguard', new THREE.BoxGeometry(0.34, 0.25, 0.64), lavender, {
    position: [0, 0.01, -0.61],
  });
  add('handguard-top-rail', new THREE.BoxGeometry(0.25, 0.06, 0.66), deepLavender, {
    position: [0, 0.17, -0.61],
  });
  add('handguard-side-inset', new THREE.BoxGeometry(0.012, 0.1, 0.42), paper, {
    position: [0.178, 0, -0.61],
  });

  add('barrel', new THREE.CylinderGeometry(0.047, 0.047, 0.84, 12), deepLavender, {
    position: [0, 0.02, -1.34],
    rotation: [Math.PI / 2, 0, 0],
  });
  add('barrel-collar', new THREE.CylinderGeometry(0.075, 0.075, 0.13, 12), lavender, {
    position: [0, 0.02, -0.94],
    rotation: [Math.PI / 2, 0, 0],
  });
  add('muzzle-brake', new THREE.CylinderGeometry(0.075, 0.066, 0.18, 12), paper, {
    position: [0, 0.02, -1.79],
    rotation: [Math.PI / 2, 0, 0],
  });

  const magazine = new THREE.Group();
  magazine.name = 'vertical-magazine';
  magazine.position.set(0, -0.33, 0.03);
  magazine.rotation.x = -0.08;
  rifle.add(magazine);
  add('magazine-body', new THREE.BoxGeometry(0.24, 0.5, 0.27), lavender, {
    position: [0, -0.17, 0],
  }, magazine);
  add('magazine-floorplate', new THREE.BoxGeometry(0.28, 0.08, 0.3), deepLavender, {
    position: [0, -0.45, 0],
  }, magazine);

  const pistolGrip = new THREE.Group();
  pistolGrip.name = 'pistol-grip';
  pistolGrip.position.set(0, -0.27, 0.35);
  pistolGrip.rotation.x = -0.22;
  rifle.add(pistolGrip);
  add('pistol-grip-body', new THREE.BoxGeometry(0.2, 0.43, 0.2), deepLavender, {
    position: [0, -0.16, 0],
  }, pistolGrip);

  const frontGrip = new THREE.Group();
  frontGrip.name = 'front-grip';
  frontGrip.position.set(0, -0.21, -0.57);
  frontGrip.rotation.x = 0.08;
  rifle.add(frontGrip);
  add('front-grip-body', new THREE.BoxGeometry(0.17, 0.42, 0.19), paper, {
    position: [0, -0.17, 0],
  }, frontGrip);
  add('front-grip-cap', new THREE.BoxGeometry(0.2, 0.07, 0.22), lavender, {
    position: [0, -0.4, 0],
  }, frontGrip);

  const sight = new THREE.Group();
  sight.name = 'red-dot-sight';
  sight.position.set(0, 0.25, -0.03);
  sight.scale.setScalar(0.28);
  rifle.add(sight);
  add('sight-base', new THREE.BoxGeometry(0.25, 0.07, 0.34), deepLavender, undefined, sight);
  add('sight-left-post', new THREE.BoxGeometry(0.055, 0.2, 0.08), lavender, {
    position: [-0.11, 0.13, -0.04],
  }, sight);
  add('sight-right-post', new THREE.BoxGeometry(0.055, 0.2, 0.08), lavender, {
    position: [0.11, 0.13, -0.04],
  }, sight);
  add('sight-top', new THREE.BoxGeometry(0.27, 0.055, 0.08), paper, {
    position: [0, 0.25, -0.04],
  }, sight);
  add('sight-lens', new THREE.CircleGeometry(0.015, 20), lens, {
    position: [0, 0.14, -0.087],
  }, sight);

  add('front-sight', new THREE.BoxGeometry(0.08, 0.18, 0.07), paper, {
    position: [0, 0.22, -0.88],
  });

  return rifle;
}
