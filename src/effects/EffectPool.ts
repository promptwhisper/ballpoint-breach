import * as THREE from 'three';
import { ACTIVE_VISUAL_STYLE } from '../render';

const INK_STYLE = ACTIVE_VISUAL_STYLE === 'ink';

interface SpriteSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  maxLife: number;
}

interface DebrisSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface CasingSlot {
  object: THREE.Group;
  cartridge: THREE.Group;
  shard: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  floorY: number;
  muzzleShard: boolean;
}

interface SmokeSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface ShotTrailSlot {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  tip: THREE.Sprite;
  tipMaterial: THREE.SpriteMaterial;
  tipBaseScale: number;
  positions: Float32Array;
  life: number;
  maxLife: number;
  baseOpacity: number;
  direction: THREE.Vector3;
  speed: number;
  travelRemaining: number;
}

interface GoreSlot {
  mesh: THREE.Mesh;
  face: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  delay: number;
  floorY: number;
  bounce: number;
  groundRadius: number;
}

interface DecalSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  baseOpacity: number;
}

interface PendingSplat {
  delay: number;
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly width: number;
  readonly height: number;
  readonly lifetime: number;
  readonly textureKind: SplatTextureKind;
  readonly opacity: number;
  readonly rotationRadians?: number;
}

interface PendingCasing {
  delay: number;
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly weaponId: FirearmEffectWeapon;
  readonly shotId: number;
  readonly muzzleShard?: boolean;
}

export interface EnemyDeathInkOptions {
  intensity?: number;
  boss?: boolean;
  headshot?: boolean;
}

export interface EffectPoolSnapshot {
  sprites: number;
  debris: number;
  casings: number;
  smoke: number;
  shotTrails: number;
  gore: number;
  decals: number;
}

export type InkColor = 'blue' | 'red' | 'orange' | 'green';
export type FirearmEffectWeapon = 'rifle' | 'shotgun' | 'revolver' | 'sniper';
type GoreShape = 'blob' | 'limb' | 'stroke' | 'drop';
type SplatTextureKind = 'wall-impact' | 'wall-drip' | 'floor-pool' | 'floor-streak' | 'droplet';

const GRAPPLE_DASH_WINDOWS = Object.freeze([
  [0, 0.12],
  [0.17, 0.27],
  [0.32, 0.43],
  [0.48, 0.58],
  [0.63, 0.73],
  [0.78, 0.87],
  [0.92, 1],
] as const);

/** Reference-measured composition targets used by both the renderer and tests. */
export const DEATH_INK_STYLE = Object.freeze({
  wallImpactLayers: 2,
  wallDripLayers: 3,
  wallDropletLayers: 5,
  floorPoolLayers: 2,
  floorStreakLayers: 3,
  floorSatelliteCount: 7,
  textureVariants: 4,
  decalLifetime: 58,
  opacityRange: Object.freeze([0.42, 0.94] as const),
});

export interface FirearmAftermathProfile {
  readonly muzzleShardCount: number;
  readonly casingDelay: number;
  readonly casingCount: number;
  readonly casingScale: readonly [number, number, number];
  readonly casingLifetime: number;
  readonly receiverBackOffset: number;
  readonly ejectionSpeed: number;
  readonly liftSpeed: number;
  readonly cameraSpeed: number;
  readonly smokeCount: number;
  readonly smokeScale: number;
  readonly smokeLifetime: number;
}

export interface PlayerInkTrailProfile {
  readonly trailCount: number;
  readonly strokeLength: number;
  readonly travelSpeed: number;
  readonly width: number;
  readonly lifetime: number;
  readonly opacity: number;
}

interface DeathPieceSpec {
  shape: GoreShape;
  offset: readonly [number, number, number];
  scale: readonly [number, number, number];
  velocity: readonly [number, number, number];
  delay: number;
  life: number;
  bounce: number;
  face?: boolean;
}

const BALLPOINT_COLORS: Record<InkColor, number> = {
  blue: 0x27348f,
  red: 0xd03e5a,
  orange: 0xe79a32,
  green: 0x69b887,
};

const INK_COLORS: Record<InkColor, number> = {
  blue: 0x20282d,
  red: 0x9f4139,
  orange: 0xb67243,
  green: 0x526b70,
};

const COLORS = INK_STYLE ? INK_COLORS : BALLPOINT_COLORS;

const DEATH_INK_COLORS = Object.freeze({
  dark: 0x171b1d,
  middle: 0x343a3c,
  light: 0x555a59,
  accent: 0x873a34,
});

function deathPieceColor(index: number, sequence: number): number {
  if ((index + sequence * 5) % 13 === 0) return DEATH_INK_COLORS.accent;
  if ((index + sequence) % 5 === 0) return DEATH_INK_COLORS.middle;
  return DEATH_INK_COLORS.dark;
}

function deathDecalColor(kind: SplatTextureKind, opacity: number, cursor: number, sequence: number): number {
  if (kind === 'droplet' && (cursor + sequence * 3) % 11 === 0) return DEATH_INK_COLORS.accent;
  if (opacity < 0.62) return DEATH_INK_COLORS.light;
  if (opacity < 0.82) return DEATH_INK_COLORS.middle;
  return DEATH_INK_COLORS.dark;
}

const FIREARM_AFTERMATH: Readonly<Record<FirearmEffectWeapon, FirearmAftermathProfile>> = Object.freeze({
  rifle: Object.freeze({
    muzzleShardCount: 2,
    casingDelay: 0,
    casingCount: 1,
    casingScale: [0.065, 0.235, 0.055] as const,
    casingLifetime: 0.92,
    receiverBackOffset: 1.26,
    ejectionSpeed: 4.6,
    liftSpeed: 2.9,
    cameraSpeed: 2.35,
    smokeCount: 2,
    smokeScale: 0.27,
    smokeLifetime: 0.105,
  }),
  shotgun: Object.freeze({
    muzzleShardCount: 12,
    casingDelay: 0.27,
    casingCount: 1,
    casingScale: [0.095, 0.34, 0.085] as const,
    casingLifetime: 1.18,
    receiverBackOffset: 1.16,
    ejectionSpeed: 3.75,
    liftSpeed: 2.5,
    cameraSpeed: 1.65,
    smokeCount: 3,
    smokeScale: 0.38,
    smokeLifetime: 0.16,
  }),
  revolver: Object.freeze({
    muzzleShardCount: 3,
    casingDelay: 0,
    casingCount: 0,
    casingScale: [0.065, 0.2, 0.055] as const,
    casingLifetime: 0,
    receiverBackOffset: 0.62,
    ejectionSpeed: 4.1,
    liftSpeed: 2.6,
    cameraSpeed: 2.2,
    smokeCount: 1,
    smokeScale: 0.3,
    smokeLifetime: 0.12,
  }),
  sniper: Object.freeze({
    muzzleShardCount: 4,
    casingDelay: 0.31,
    casingCount: 1,
    casingScale: [0.075, 0.29, 0.065] as const,
    casingLifetime: 1.05,
    receiverBackOffset: 1.3,
    ejectionSpeed: 4.15,
    liftSpeed: 2.85,
    cameraSpeed: 1.9,
    smokeCount: 2,
    smokeScale: 0.34,
    smokeLifetime: 0.145,
  }),
});

export function firearmAftermathProfile(weaponId: FirearmEffectWeapon): FirearmAftermathProfile {
  return FIREARM_AFTERMATH[weaponId];
}

const PLAYER_INK_TRAILS: Readonly<Record<FirearmEffectWeapon, PlayerInkTrailProfile>> = Object.freeze({
  rifle: Object.freeze({ trailCount: 1, strokeLength: 1.25, travelSpeed: 92, width: 0.095, lifetime: 0.14, opacity: 0.76 }),
  shotgun: Object.freeze({ trailCount: 3, strokeLength: 0.78, travelSpeed: 66, width: 0.1, lifetime: 0.13, opacity: 0.62 }),
  revolver: Object.freeze({ trailCount: 1, strokeLength: 1.55, travelSpeed: 78, width: 0.115, lifetime: 0.16, opacity: 0.82 }),
  sniper: Object.freeze({ trailCount: 1, strokeLength: 2.5, travelSpeed: 124, width: 0.145, lifetime: 0.18, opacity: 0.86 }),
});

export function playerInkTrailProfile(weaponId: FirearmEffectWeapon): PlayerInkTrailProfile {
  return PLAYER_INK_TRAILS[weaponId];
}

function deterministic(index: number, salt: number): number {
  const value = Math.sin(index * 91.733 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function makeBurstTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  if (INK_STYLE) {
    context.fillStyle = '#ffffff';
    drawRaggedIsland(context, 811, 63, 64, 36, 31, 0.92);
    drawRaggedIsland(context, 823, 80, 57, 21, 15, 0.64);
    drawTaperedStroke(context, 54, 65, 113, 42, 7.5, 0.6, -8, 0.74);
    drawTaperedStroke(context, 61, 70, 104, 91, 5.2, 0.4, 6, 0.58);
    for (let index = 0; index < 9; index += 1) {
      const angle = index * 2.399 + 0.3;
      const radius = 42 + deterministic(index, 827) * 16;
      drawDroplet(
        context,
        64 + Math.cos(angle) * radius,
        64 + Math.sin(angle) * radius,
        1.5 + deterministic(index, 829) * 3.3,
        1.2,
        angle,
        0.48 + deterministic(index, 839) * 0.38,
      );
    }
    cutDryBrushGaps(context, 853, 65, 64, 74, 58, 17);
  } else {
    context.translate(64, 64);
    context.fillStyle = '#ffffff';
    context.beginPath();
    const points = 26;
    for (let index = 0; index <= points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      const radius = index % 2 === 0 ? 44 : 21 + ((index * 17) % 13);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    for (let index = 0; index < 11; index += 1) {
      const angle = index * 2.399;
      const radius = 45 + (index % 3) * 8;
      context.beginPath();
      context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 2 + (index % 4), 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMuzzleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.fillStyle = '#171b1d';
  drawRaggedIsland(context, 907, 65, 64, 31, 24, 0.94);
  drawTaperedStroke(context, 57, 64, 119, 37, 9.5, 0.3, -7, 0.9);
  drawTaperedStroke(context, 57, 65, 116, 84, 7.5, 0.25, 8, 0.82);
  drawTaperedStroke(context, 55, 63, 101, 17, 5.2, 0.2, -5, 0.58);
  context.fillStyle = '#c39052';
  drawRaggedIsland(context, 919, 61, 64, 22, 17, 0.88);
  drawTaperedStroke(context, 62, 63, 102, 51, 5.8, 0.2, -3, 0.64);
  context.fillStyle = '#984138';
  drawRaggedIsland(context, 929, 55, 65, 11, 10, 0.82);
  cutDryBrushGaps(context, 937, 76, 63, 78, 54, 19);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeShotTrailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  drawTaperedStroke(context, 4, 29, 252, 32, 12, 1.2, -4, 0.88);
  drawTaperedStroke(context, 7, 30, 247, 32, 6.4, 0.75, -1.5, 0.96);
  drawTaperedStroke(context, 12, 43, 224, 39, 3.2, 0.35, 4, 0.36);
  drawTaperedStroke(context, 32, 17, 198, 22, 1.7, 0.2, -2, 0.24);
  for (let index = 0; index < 7; index += 1) {
    drawDroplet(
      context,
      38 + deterministic(index, 1061) * 194,
      18 + deterministic(index, 1063) * 31,
      0.8 + deterministic(index, 1069) * 1.8,
      1.2 + deterministic(index, 1087) * 1.6,
      deterministic(index, 1091) * Math.PI,
      0.2 + deterministic(index, 1093) * 0.32,
    );
  }
  cutDryBrushGaps(context, 1103, 130, 32, 236, 44, 38);
  drawRaggedIsland(context, 1199, 238, 32, 7.5, 4.8, 0.94);
  drawDroplet(context, 224, 23, 1.8, 1.7, -0.35, 0.72);
  drawDroplet(context, 218, 41, 1.25, 1.4, 0.42, 0.58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.clearRect(0, 0, 128, 128);
  if (INK_STYLE) {
    context.fillStyle = '#8f908b';
    drawRaggedIsland(context, 947, 52, 72, 27, 22, 0.2);
    drawRaggedIsland(context, 953, 75, 54, 31, 27, 0.16);
    drawRaggedIsland(context, 967, 84, 79, 24, 20, 0.12);
    cutDryBrushGaps(context, 971, 68, 66, 74, 60, 14);
  } else {
    context.fillStyle = '#f4f0e8';
    context.strokeStyle = '#403372';
    context.lineWidth = 3.2;
    const puffs = [
      [48, 69, 24],
      [74, 55, 27],
      [82, 79, 22],
    ] as const;
    for (const [x, y, radius] of puffs) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.globalAlpha = 0.24;
    context.lineWidth = 1.2;
    for (let offset = 28; offset < 104; offset += 9) {
      context.beginPath();
      context.moveTo(offset - 22, 102);
      context.lineTo(offset + 32, 34);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawRaggedIsland(
  context: CanvasRenderingContext2D,
  seed: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  opacity: number,
): void {
  context.save();
  context.globalAlpha = opacity;
  context.beginPath();
  const points = 31;
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const lowFrequency = 0.88 + Math.sin(angle * 3.1 + seed * 0.83) * 0.09;
    const tornEdge = (deterministic(index + seed * 17, seed + 211) - 0.5) * 0.26;
    const radius = lowFrequency + tornEdge;
    const x = centerX + Math.cos(angle) * radiusX * radius;
    const y = centerY + Math.sin(angle) * radiusY * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function drawTaperedStroke(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startWidth: number,
  endWidth: number,
  bend: number,
  opacity: number,
): void {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const middleX = (startX + endX) * 0.5 + nx * bend;
  const middleY = (startY + endY) * 0.5 + ny * bend;
  context.save();
  context.globalAlpha = opacity;
  context.beginPath();
  context.moveTo(startX + nx * startWidth, startY + ny * startWidth);
  context.quadraticCurveTo(middleX + nx * startWidth * 0.42, middleY + ny * startWidth * 0.42, endX + nx * endWidth, endY + ny * endWidth);
  context.lineTo(endX - nx * endWidth, endY - ny * endWidth);
  context.quadraticCurveTo(middleX - nx * startWidth * 0.42, middleY - ny * startWidth * 0.42, startX - nx * startWidth, startY - ny * startWidth);
  context.closePath();
  context.fill();
  context.restore();
}

function cutDryBrushGaps(
  context: CanvasRenderingContext2D,
  seed: number,
  centerX: number,
  centerY: number,
  spreadX: number,
  spreadY: number,
  count: number,
): void {
  context.save();
  context.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < count; index += 1) {
    const x = centerX + (deterministic(index, seed + 227) - 0.5) * spreadX;
    const y = centerY + (deterministic(index, seed + 229) - 0.5) * spreadY;
    const radiusX = 1.5 + deterministic(index, seed + 233) * 10.5;
    const radiusY = 0.7 + deterministic(index, seed + 239) * 4.2;
    context.globalAlpha = 0.46 + deterministic(index, seed + 241) * 0.46;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, (deterministic(index, seed + 251) - 0.5) * 0.75, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function cutPaperHoles(
  context: CanvasRenderingContext2D,
  seed: number,
  centerX: number,
  centerY: number,
  spreadX: number,
  spreadY: number,
  count: number,
): void {
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.globalAlpha = 0.9;
  for (let index = 0; index < count; index += 1) {
    const x = centerX + (deterministic(index, seed + 673) - 0.5) * spreadX;
    const y = centerY + (deterministic(index, seed + 677) - 0.5) * spreadY;
    drawRaggedIsland(
      context,
      seed + index * 7 + 701,
      x,
      y,
      4 + deterministic(index, seed + 683) * 7.5,
      2 + deterministic(index, seed + 691) * 4.8,
      0.95,
    );
  }
  context.restore();
}

function drawDroplet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stretch: number,
  rotation: number,
  opacity: number,
): void {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  context.moveTo(-radius * 0.72, 0);
  context.bezierCurveTo(-radius * 0.68, -radius, radius * 0.45, -radius * 0.92, radius * stretch, 0);
  context.bezierCurveTo(radius * 0.34, radius * 0.86, -radius * 0.74, radius * 0.78, -radius * 0.72, 0);
  context.closePath();
  context.fill();
  context.restore();
}

function makeSplatTexture(seed: number, kind: SplatTextureKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.fillStyle = '#ffffff';

  if (kind === 'wall-impact') {
    // A displaced, layered brush strike: no radial star and no single solid disc.
    drawRaggedIsland(context, seed, 99, 105, 29, 37, 1);
    drawRaggedIsland(context, seed + 1, 127, 124, 37, 24, 0.9);
    drawRaggedIsland(context, seed + 2, 91, 145, 18, 31, 0.72);
    drawRaggedIsland(context, seed + 3, 143, 91, 17, 19, 0.62);
    drawRaggedIsland(context, seed + 4, 102, 194, 29, 23, 0.68);
    drawRaggedIsland(context, seed + 5, 72, 204, 15, 12, 0.52);
    for (let index = 0; index < 6; index += 1) {
      const startX = 107 + (deterministic(index, seed + 257) - 0.5) * 45;
      const startY = 117 + (deterministic(index, seed + 263) - 0.5) * 70;
      const length = 18 + deterministic(index, seed + 269) * 49;
      const angle = -0.15 + (deterministic(index, seed + 271) - 0.5) * 0.86;
      drawTaperedStroke(
        context,
        startX,
        startY,
        startX + Math.cos(angle) * length,
        startY + Math.sin(angle) * length,
        2.2 + deterministic(index, seed + 277) * 4.3,
        0.25 + deterministic(index, seed + 281) * 1.1,
        (deterministic(index, seed + 283) - 0.5) * 11,
        0.48 + deterministic(index, seed + 293) * 0.45,
      );
    }
    for (let index = 0; index < 16; index += 1) {
      const x = 126 + deterministic(index, seed + 307) * 103;
      const y = 70 + deterministic(index, seed + 311) * 119;
      const radius = 1.4 + deterministic(index, seed + 313) * 4.4;
      drawDroplet(context, x, y, radius, 1.1 + deterministic(index, seed + 317) * 1.4, (deterministic(index, seed + 331) - 0.5) * 1.4, 0.44 + deterministic(index, seed + 337) * 0.5);
    }
    cutDryBrushGaps(context, seed, 108, 135, 104, 168, 28);
    cutPaperHoles(context, seed, 111, 132, 78, 158, 7);
  } else if (kind === 'wall-drip') {
    const top = 42 + deterministic(seed, 347) * 26;
    drawRaggedIsland(context, seed, 123, top, 27, 10, 0.66);
    for (let index = 0; index < 4; index += 1) {
      const x = 99 + index * 16 + (deterministic(index, seed + 349) - 0.5) * 7;
      const length = 64 + deterministic(index, seed + 353) * 105;
      const width = 1.5 + deterministic(index, seed + 359) * 4.2;
      drawTaperedStroke(context, x, top + 4, x + (deterministic(index, seed + 367) - 0.5) * 12, top + length, width, 0.45, (deterministic(index, seed + 373) - 0.5) * 8, 0.46 + deterministic(index, seed + 379) * 0.42);
      drawDroplet(context, x, top + length + 3, width * 1.2, 1.2, Math.PI * 0.5, 0.72);
    }
    cutDryBrushGaps(context, seed, 123, 105, 72, 132, 13);
  } else if (kind === 'floor-pool') {
    drawRaggedIsland(context, seed, 119, 132, 78, 47, 1);
    drawRaggedIsland(context, seed + 1, 161, 112, 42, 26, 0.82);
    drawRaggedIsland(context, seed + 2, 74, 153, 35, 22, 0.7);
    drawTaperedStroke(context, 67, 142, 20, 184, 12, 1.2, -8, 0.69);
    drawTaperedStroke(context, 149, 121, 229, 91, 8, 0.8, 7, 0.61);
    for (let index = 0; index < 9; index += 1) {
      const angle = -0.45 + deterministic(index, seed + 383) * 1.2;
      const distance = 62 + deterministic(index, seed + 389) * 95;
      drawDroplet(context, 124 + Math.cos(angle) * distance, 127 + Math.sin(angle) * distance, 1.5 + deterministic(index, seed + 397) * 4.2, 1.2, angle, 0.42 + deterministic(index, seed + 401) * 0.44);
    }
    cutDryBrushGaps(context, seed, 124, 132, 154, 74, 28);
    cutPaperHoles(context, seed, 124, 132, 128, 58, 7);
  } else if (kind === 'floor-streak') {
    for (let index = 0; index < 4; index += 1) {
      const x = 92 + index * 20 + (deterministic(index, seed + 409) - 0.5) * 12;
      const startY = 54 + deterministic(index, seed + 419) * 22;
      drawTaperedStroke(context, x, startY, x + (deterministic(index, seed + 421) - 0.5) * 28, 206 - index * 7, 6.5 + deterministic(index, seed + 431) * 5.5, 0.45, (deterministic(index, seed + 433) - 0.5) * 14, 0.44 + deterministic(index, seed + 439) * 0.42);
    }
    for (let index = 0; index < 10; index += 1) {
      drawDroplet(context, 65 + deterministic(index, seed + 443) * 130, 74 + deterministic(index, seed + 449) * 151, 1.3 + deterministic(index, seed + 457) * 3.2, 1.4, Math.PI * 0.5, 0.38 + deterministic(index, seed + 461) * 0.43);
    }
    cutDryBrushGaps(context, seed, 126, 128, 108, 158, 18);
  } else {
    const dropletCount = 2 + (seed % 3);
    for (let index = 0; index < dropletCount; index += 1) {
      drawDroplet(
        context,
        94 + deterministic(index, seed + 463) * 68,
        91 + deterministic(index, seed + 467) * 73,
        22 + deterministic(index, seed + 479) * 24,
        1.05 + deterministic(index, seed + 487) * 0.75,
        (deterministic(index, seed + 491) - 0.5) * 1.5,
        0.5 + deterministic(index, seed + 499) * 0.48,
      );
    }
    cutDryBrushGaps(context, seed, 128, 128, 64, 64, 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createFragmentFace(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'death-fragment-face';
  group.visible = false;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: INK_STYLE ? DEATH_INK_COLORS.dark : 0x3c2634 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(geometry, material);
    eye.position.set(side * 0.082, 0.052, 0.225);
    eye.scale.set(0.038, 0.052, 0.018);
    eye.rotation.z = side * 0.13;
    eye.renderOrder = 8;
    group.add(eye);
    const brow = new THREE.Mesh(geometry, material);
    brow.position.set(side * 0.082, 0.125, 0.224);
    brow.scale.set(0.09, 0.018, 0.018);
    brow.rotation.z = side * 0.28;
    brow.renderOrder = 8;
    group.add(brow);
  }
  const nose = new THREE.Mesh(geometry, material);
  nose.position.set(0.012, -0.008, 0.227);
  nose.scale.set(0.025, 0.075, 0.018);
  nose.rotation.z = -0.36;
  nose.renderOrder = 8;
  group.add(nose);
  const mouth = new THREE.Mesh(geometry, material);
  mouth.position.set(0, -0.088, 0.226);
  mouth.scale.set(0.12, 0.025, 0.018);
  mouth.rotation.z = -0.08;
  mouth.renderOrder = 8;
  group.add(mouth);
  return group;
}

function makeIrregularRoundGeometry(radius: number, seed: number, widthSegments: number, heightSegments: number): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const verticalBias = point.y / Math.max(0.001, radius);
    const roughness = 0.87
      + deterministic(index, seed + 641) * 0.22
      + Math.sin(verticalBias * 4.8 + seed) * 0.035;
    point.multiplyScalar(roughness);
    point.x *= 0.95 + deterministic(index, seed + 643) * 0.1;
    point.z *= 0.93 + deterministic(index, seed + 647) * 0.14;
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function makeTaperedStrokeGeometry(): THREE.ConeGeometry {
  const geometry = new THREE.ConeGeometry(0.105, 0.9, 5, 1, false);
  geometry.rotateX(Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const roughness = 0.82 + deterministic(index, 653) * 0.34;
    point.x *= roughness;
    point.y *= 0.86 + deterministic(index, 659) * 0.28;
    point.z += (deterministic(index, 661) - 0.5) * 0.035;
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Pooled transient effects plus persistent reference-style death-ink decals. */
export class EffectPool {
  readonly root = new THREE.Group();
  private readonly spriteSlots: SpriteSlot[] = [];
  private readonly debrisSlots: DebrisSlot[] = [];
  private readonly casingSlots: CasingSlot[] = [];
  private readonly smokeSlots: SmokeSlot[] = [];
  private readonly shotTrailSlots: ShotTrailSlot[] = [];
  private readonly goreSlots: GoreSlot[] = [];
  private readonly decalSlots: DecalSlot[] = [];
  private readonly pendingSplats: PendingSplat[] = [];
  private readonly pendingCasings: PendingCasing[] = [];
  private readonly burstTexture: THREE.CanvasTexture;
  private readonly muzzleTexture: THREE.CanvasTexture;
  private readonly shotTrailTexture: THREE.CanvasTexture;
  private readonly splatTextures: Readonly<Record<SplatTextureKind, readonly THREE.CanvasTexture[]>> = {
    'wall-impact': [0, 1, 2, 3].map((seed) => makeSplatTexture(seed, 'wall-impact')),
    'wall-drip': [0, 1, 2, 3].map((seed) => makeSplatTexture(seed, 'wall-drip')),
    'floor-pool': [0, 1, 2, 3].map((seed) => makeSplatTexture(seed, 'floor-pool')),
    'floor-streak': [0, 1, 2, 3].map((seed) => makeSplatTexture(seed, 'floor-streak')),
    droplet: [0, 1, 2, 3].map((seed) => makeSplatTexture(seed, 'droplet')),
  };
  private readonly goreGeometries = {
    blob: makeIrregularRoundGeometry(0.24, 17, 12, 8),
    limb: new THREE.CylinderGeometry(0.085, 0.11, 0.72, 7),
    stroke: makeTaperedStrokeGeometry(),
    drop: makeIrregularRoundGeometry(0.105, 31, 7, 5),
  } as const;
  private spriteCursor = 0;
  private debrisCursor = 0;
  private casingCursor = 0;
  private smokeCursor = 0;
  private shotTrailCursor = 0;
  private goreCursor = 0;
  private decalCursor = 0;
  private deathSequence = 0;
  private readonly grapplePositions = new Float32Array(GRAPPLE_DASH_WINDOWS.length * 6);
  private readonly grappleGeometry = new THREE.BufferGeometry();
  private readonly grappleLine: THREE.LineSegments;

  constructor(
    scene: THREE.Scene,
    spriteCapacity = 160,
    debrisCapacity = 64,
    goreCapacity = 192,
    decalCapacity = 96,
    casingCapacity = 48,
    smokeCapacity = 36,
    shotTrailCapacity = 16,
  ) {
    this.root.name = 'pooled-effects';
    scene.add(this.root);
    this.burstTexture = makeBurstTexture();
    this.muzzleTexture = makeMuzzleTexture();
    this.shotTrailTexture = INK_STYLE ? makeShotTrailTexture() : this.burstTexture;
    for (let index = 0; index < spriteCapacity; index += 1) {
      const material = new THREE.SpriteMaterial({ map: this.burstTexture, color: COLORS.blue, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 7;
      this.root.add(sprite);
      this.spriteSlots.push({ sprite, material, life: 0, maxLife: 1 });
    }

    const debrisGeometry = new THREE.BoxGeometry(0.12, 0.05, 0.26);
    for (let index = 0; index < debrisCapacity; index += 1) {
      const mesh = new THREE.Mesh(debrisGeometry, new THREE.MeshBasicMaterial({ color: COLORS.orange }));
      mesh.visible = false;
      this.root.add(mesh);
      this.debrisSlots.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, maxLife: 1 });
    }

    const casingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const casingEdges = new THREE.EdgesGeometry(casingGeometry, 12);
    const shardGeometry = INK_STYLE ? new THREE.TetrahedronGeometry(0.72, 0) : casingGeometry;
    const shardEdges = INK_STYLE ? new THREE.EdgesGeometry(shardGeometry, 8) : casingEdges;
    const casingMaterial = new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x9a7a4f : COLORS.orange });
    const casingLightMaterial = new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0xc0a26f : COLORS.orange });
    const casingDarkMaterial = new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x51483e : 0x8e6333 });
    const casingOutline = new THREE.LineBasicMaterial({ color: INK_STYLE ? 0x202426 : 0x403372, transparent: true, opacity: 0.92 });
    const cartridgeParts = (INK_STYLE ? [
      { name: 'case-body', geometry: new THREE.CylinderGeometry(0.48, 0.53, 0.68, 8), material: casingMaterial, y: -0.08 },
      { name: 'case-shoulder', geometry: new THREE.CylinderGeometry(0.34, 0.48, 0.18, 8), material: casingLightMaterial, y: 0.35 },
      { name: 'case-neck', geometry: new THREE.CylinderGeometry(0.33, 0.34, 0.12, 8), material: casingMaterial, y: 0.5 },
      { name: 'case-base-rim', geometry: new THREE.CylinderGeometry(0.59, 0.59, 0.075, 10), material: casingDarkMaterial, y: -0.46 },
      { name: 'case-primer', geometry: new THREE.CylinderGeometry(0.18, 0.18, 0.025, 10), material: casingLightMaterial, y: -0.505 },
    ] : []).map((part) => ({ ...part, edges: new THREE.EdgesGeometry(part.geometry, 14) }));
    const mouthGeometry = INK_STYLE ? new THREE.TorusGeometry(0.32, 0.045, 4, 10) : null;
    mouthGeometry?.rotateX(Math.PI / 2);
    const washBandGeometry = INK_STYLE ? new THREE.CylinderGeometry(0.505, 0.505, 0.024, 8) : null;
    for (let index = 0; index < casingCapacity; index += 1) {
      const object = new THREE.Group();
      object.name = `ejected-casing-${index}`;
      object.visible = false;
      object.frustumCulled = false;
      const shard = new THREE.Group();
      shard.name = 'muzzle-paper-shard';
      const shardBody = new THREE.Mesh(shardGeometry, casingMaterial);
      const shardOutline = new THREE.LineSegments(shardEdges, casingOutline);
      shardOutline.scale.setScalar(1.035);
      shard.add(shardBody, shardOutline);

      const cartridge = new THREE.Group();
      cartridge.name = 'spent-cartridge';
      if (INK_STYLE) {
        for (const part of cartridgeParts) {
          const body = new THREE.Mesh(part.geometry, part.material);
          body.name = part.name;
          body.position.y = part.y;
          const outline = new THREE.LineSegments(part.edges, casingOutline);
          outline.position.y = part.y;
          outline.scale.setScalar(1.018);
          cartridge.add(body, outline);
        }
        if (mouthGeometry) {
          const mouth = new THREE.Mesh(mouthGeometry, casingDarkMaterial);
          mouth.name = 'case-mouth-ring';
          mouth.position.y = 0.57;
          cartridge.add(mouth);
        }
        if (washBandGeometry) {
          for (const y of [-0.27, 0.06]) {
            const band = new THREE.Mesh(washBandGeometry, casingDarkMaterial);
            band.name = 'case-ink-wash-band';
            band.position.y = y;
            band.scale.set(1, 1, 0.985);
            cartridge.add(band);
          }
        }
      } else {
        const body = new THREE.Mesh(casingGeometry, casingMaterial);
        const outline = new THREE.LineSegments(casingEdges, casingOutline);
        outline.scale.setScalar(1.035);
        cartridge.add(body, outline);
      }
      shard.visible = false;
      cartridge.visible = true;
      object.add(shard, cartridge);
      object.traverse((part) => {
        part.layers.set(1);
        part.renderOrder = 22;
      });
      this.root.add(object);
      this.casingSlots.push({
        object,
        cartridge,
        shard,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        floorY: 0.045,
        muzzleShard: false,
      });
    }

    const smokeTexture = makeSmokeTexture();
    for (let index = 0; index < smokeCapacity; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `muzzle-smoke-${index}`;
      sprite.visible = false;
      sprite.frustumCulled = false;
      sprite.layers.set(1);
      sprite.renderOrder = 23;
      this.root.add(sprite);
      this.smokeSlots.push({
        sprite,
        material,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        baseScale: 1,
      });
    }

    for (let index = 0; index < (INK_STYLE ? shotTrailCapacity : 0); index += 1) {
      const positions = new Float32Array(18);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,
      ], 2));
      const material = new THREE.MeshBasicMaterial({
        map: this.shotTrailTexture,
        color: COLORS.blue,
        transparent: true,
        opacity: 0,
        alphaTest: 0.025,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const tipMaterial = new THREE.SpriteMaterial({
        map: this.burstTexture,
        color: COLORS.blue,
        transparent: true,
        opacity: 0,
        alphaTest: 0.035,
        depthWrite: false,
        toneMapped: false,
      });
      const tip = new THREE.Sprite(tipMaterial);
      tip.name = `player-ink-shot-tip-${index}`;
      tip.visible = false;
      tip.frustumCulled = false;
      tip.renderOrder = 9;
      mesh.add(tip);
      mesh.name = `player-ink-shot-trail-${index}`;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.root.add(mesh);
      this.shotTrailSlots.push({
        mesh,
        geometry,
        material,
        tip,
        tipMaterial,
        tipBaseScale: 0,
        positions,
        life: 0,
        maxLife: 1,
        baseOpacity: 0,
        direction: new THREE.Vector3(),
        speed: 0,
        travelRemaining: 0,
      });
    }

    for (let index = 0; index < goreCapacity; index += 1) {
      const mesh = new THREE.Mesh(this.goreGeometries.drop, new THREE.MeshBasicMaterial({ color: INK_STYLE ? DEATH_INK_COLORS.dark : COLORS.red }));
      const face = createFragmentFace();
      mesh.add(face);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.root.add(mesh);
      this.goreSlots.push({
        mesh,
        face,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        delay: 0,
        floorY: 0,
        bounce: 0.22,
        groundRadius: 0.04,
      });
    }

    const decalGeometry = new THREE.PlaneGeometry(1, 1);
    for (let index = 0; index < decalCapacity; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: this.splatTextures['floor-pool'][index % DEATH_INK_STYLE.textureVariants],
        color: INK_STYLE ? DEATH_INK_COLORS.dark : COLORS.red,
        transparent: true,
        opacity: 0,
        alphaTest: 0.035,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(decalGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.root.add(mesh);
      this.decalSlots.push({ mesh, material, life: 0, maxLife: 1, baseOpacity: 0.9 });
    }

    this.grappleGeometry.setAttribute('position', new THREE.BufferAttribute(this.grapplePositions, 3));
    this.grappleGeometry.setDrawRange(0, INK_STYLE ? GRAPPLE_DASH_WINDOWS.length * 2 : 2);
    this.grappleLine = new THREE.LineSegments(this.grappleGeometry, new THREE.LineBasicMaterial({
      color: INK_STYLE ? 0x1c252a : COLORS.blue,
      transparent: true,
      opacity: INK_STYLE ? 0.88 : 0.96,
    }));
    this.grappleLine.visible = false;
    this.grappleLine.frustumCulled = false;
    this.grappleLine.renderOrder = 10;
    this.root.add(this.grappleLine);
  }

  spawnBurst(position: THREE.Vector3, color: InkColor, scale = 0.3, lifetime = 0.24): void {
    const slot = this.spriteSlots[this.spriteCursor];
    this.spriteCursor = (this.spriteCursor + 1) % this.spriteSlots.length;
    slot.life = slot.maxLife = lifetime;
    slot.sprite.position.copy(position);
    slot.sprite.scale.setScalar(scale);
    const muzzleBurst = INK_STYLE && color === 'orange' && lifetime <= 0.11;
    slot.material.map = muzzleBurst ? this.muzzleTexture : this.burstTexture;
    slot.material.color.setHex(muzzleBurst ? 0xffffff : COLORS[color]);
    slot.material.opacity = 0.95;
    slot.sprite.visible = true;
  }

  /** A short-lived dry-brush ribbon that visualizes a hitscan without changing its rules. */
  spawnPlayerInkTrail(
    start: THREE.Vector3,
    end: THREE.Vector3,
    viewOrigin: THREE.Vector3,
    up: THREE.Vector3,
    weaponId: FirearmEffectWeapon,
    shotId: number,
  ): void {
    if (!INK_STYLE || this.shotTrailSlots.length === 0) return;
    const delta = end.clone().sub(start);
    const distance = delta.length();
    if (distance < 0.2) return;

    const profile = playerInkTrailProfile(weaponId);
    const forward = delta.multiplyScalar(1 / distance);
    const startOffset = Math.min(0.12, distance * 0.08);
    const length = Math.min(
      profile.strokeLength * (0.88 + deterministic(shotId, 1123) * 0.24),
      distance - startOffset,
    );
    if (length < 0.08) return;

    const centerStart = start.clone().addScaledVector(forward, startOffset);
    const centerEnd = centerStart.clone().addScaledVector(forward, length);
    const viewDirection = centerStart.clone().lerp(centerEnd, 0.5).sub(viewOrigin);
    const side = new THREE.Vector3().crossVectors(forward, viewDirection);
    if (side.lengthSq() < 0.0001) {
      side.copy(up).addScaledVector(forward, -up.dot(forward));
    }
    if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
    side.normalize();

    const lateralStart = (deterministic(shotId, 1129) - 0.5) * profile.width * 0.28;
    const lateralEnd = (deterministic(shotId, 1151) - 0.5) * profile.width * 0.72;
    centerStart.addScaledVector(side, lateralStart);
    centerEnd.addScaledVector(side, lateralEnd);
    const halfStart = profile.width * (0.46 + deterministic(shotId, 1153) * 0.12);
    const halfEnd = profile.width * (0.2 + deterministic(shotId, 1163) * 0.11);
    const a = centerStart.clone().addScaledVector(side, -halfStart);
    const b = centerEnd.clone().addScaledVector(side, -halfEnd);
    const c = centerEnd.clone().addScaledVector(side, halfEnd);
    const d = centerStart.clone().addScaledVector(side, halfStart);

    const slot = this.shotTrailSlots[this.shotTrailCursor];
    this.shotTrailCursor = (this.shotTrailCursor + 1) % this.shotTrailSlots.length;
    const write = (offset: number, point: THREE.Vector3): void => {
      slot.positions[offset] = point.x;
      slot.positions[offset + 1] = point.y;
      slot.positions[offset + 2] = point.z;
    };
    write(0, a); write(3, b); write(6, c);
    write(9, a); write(12, c); write(15, d);
    (slot.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    slot.life = slot.maxLife = profile.lifetime;
    slot.baseOpacity = profile.opacity * (0.9 + deterministic(shotId, 1171) * 0.16);
    const inkColor = shotId % 7 === 0 ? DEATH_INK_COLORS.middle : COLORS.blue;
    slot.material.color.setHex(inkColor);
    slot.material.opacity = slot.baseOpacity;
    slot.tipMaterial.color.setHex(inkColor);
    slot.tipMaterial.opacity = Math.min(0.96, slot.baseOpacity * 1.12);
    slot.tipBaseScale = profile.width * (1.8 + deterministic(shotId, 1181) * 0.55);
    slot.tip.position.copy(centerEnd);
    slot.tip.scale.setScalar(slot.tipBaseScale);
    slot.tip.visible = true;
    slot.mesh.position.set(0, 0, 0);
    slot.mesh.visible = true;
    slot.direction.copy(forward);
    slot.speed = profile.travelSpeed;
    slot.travelRemaining = Math.max(0, distance - startOffset - length);
  }

  /**
   * Recreates the reference's near-camera shot aftermath: a paper-white smoke
   * scribble and exaggerated orange case shards that arc down under gravity.
   * Rifle shards eject with the shot, while pump/bolt weapons queue one case.
   */
  spawnFirearmAftermath(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    up: THREE.Vector3,
    weaponId: FirearmEffectWeapon,
    shotId: number,
  ): void {
    const profile = firearmAftermathProfile(weaponId);
    const forward = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3().crossVectors(forward, up);
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const correctedUp = new THREE.Vector3().crossVectors(right, forward).normalize();

    for (let index = 0; index < profile.smokeCount; index += 1) {
      const slot = this.smokeSlots[this.smokeCursor];
      this.smokeCursor = (this.smokeCursor + 1) % this.smokeSlots.length;
      const side = deterministic(shotId * 7 + index, 109) - 0.5;
      const lift = deterministic(shotId * 11 + index, 113) - 0.42;
      const scale = profile.smokeScale * (0.82 + deterministic(shotId + index, 127) * 0.42);
      slot.life = slot.maxLife = profile.smokeLifetime * (0.88 + index * 0.09);
      slot.baseScale = scale;
      slot.sprite.visible = true;
      slot.sprite.position.copy(position)
        .addScaledVector(forward, 0.035 + index * 0.025)
        .addScaledVector(right, side * 0.085)
        .addScaledVector(correctedUp, lift * 0.07);
      slot.sprite.scale.set(scale, scale, 1);
      slot.material.opacity = 0.88;
      slot.velocity.copy(forward).multiplyScalar(0.65 + index * 0.18)
        .addScaledVector(right, side * 0.52)
        .addScaledVector(correctedUp, 0.24 + lift * 0.18);
    }

    for (let index = 0; index < profile.muzzleShardCount; index += 1) {
      this.spawnCasing({
        delay: 0,
        position: position.clone(),
        direction: forward.clone(),
        up: correctedUp.clone(),
        weaponId,
        shotId: shotId * 17 + index,
        muzzleShard: true,
      });
    }

    for (let index = 0; index < profile.casingCount; index += 1) {
      const pending: PendingCasing = {
        delay: profile.casingDelay,
        position: position.clone(),
        direction: forward.clone(),
        up: correctedUp.clone(),
        weaponId,
        shotId: shotId * 17 + profile.muzzleShardCount + index,
      };
      if (pending.delay <= 0) this.spawnCasing(pending);
      else this.pendingCasings.push(pending);
    }
  }

  private spawnCasing(pending: PendingCasing): void {
    const profile = firearmAftermathProfile(pending.weaponId);
    const slot = this.casingSlots[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casingSlots.length;
    const forward = pending.direction.lengthSq() > 0.001
      ? pending.direction.clone().normalize()
      : new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3().crossVectors(forward, pending.up);
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const correctedUp = new THREE.Vector3().crossVectors(right, forward).normalize();
    const variation = deterministic(pending.shotId, 131);
    const sideVariation = deterministic(pending.shotId, 137) - 0.5;
    const isMuzzleShard = Boolean(pending.muzzleShard);
    const shardIndex = pending.shotId % Math.max(1, profile.muzzleShardCount);
    const shardAngle = (shardIndex / Math.max(1, profile.muzzleShardCount)) * Math.PI * 2
      + deterministic(Math.floor(pending.shotId / 17), 157) * 0.46;
    const lateralSpread = isMuzzleShard ? Math.cos(shardAngle) * 1.18 : 1;
    const verticalSpread = isMuzzleShard ? Math.sin(shardAngle) * 1.18 : 1;
    const radialDirection = right.clone().multiplyScalar(lateralSpread)
      .addScaledVector(correctedUp, verticalSpread);
    if (radialDirection.lengthSq() < 0.001) radialDirection.copy(right);
    radialDirection.normalize();
    const shardScale = isMuzzleShard
      ? (pending.weaponId === 'shotgun' ? 1.8 : pending.weaponId === 'sniper' ? 1.5 : pending.weaponId === 'revolver' ? 1.4 : 1.72)
      : 1;

    slot.life = slot.maxLife = isMuzzleShard
      ? 0.16 + deterministic(pending.shotId, 151) * 0.07
      : profile.casingLifetime;
    slot.muzzleShard = isMuzzleShard;
    slot.shard.visible = isMuzzleShard;
    slot.cartridge.visible = !isMuzzleShard;
    slot.floorY = Math.max(0.045, pending.position.y - 1.45);
    slot.object.visible = true;
    slot.object.position.copy(pending.position)
      .addScaledVector(forward, isMuzzleShard ? -0.02 : -profile.receiverBackOffset)
      .addScaledVector(right, (isMuzzleShard ? 0 : 0.055) + sideVariation * 0.035)
      .addScaledVector(correctedUp, (isMuzzleShard ? 0 : 0.045) + variation * 0.035)
      .addScaledVector(radialDirection, isMuzzleShard ? profile.casingScale[1] * shardScale * 0.43 : 0);
    slot.object.scale.set(
      profile.casingScale[0] * (0.9 + variation * 0.2) * shardScale,
      profile.casingScale[1] * (0.9 + variation * 0.2) * shardScale,
      profile.casingScale[2] * (0.9 + variation * 0.2) * shardScale,
    );
    if (isMuzzleShard) {
      slot.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radialDirection);
      slot.object.rotateY(sideVariation * 0.28);
    } else {
      slot.object.rotation.set(
        variation * Math.PI,
        sideVariation * Math.PI,
        Math.PI * (0.15 + variation * 0.35),
      );
    }
    const speedMultiplier = isMuzzleShard ? 1.7 : 1;
    const cameraMultiplier = isMuzzleShard ? 2.6 : 1;
    slot.velocity.copy(right).multiplyScalar(profile.ejectionSpeed * (0.88 + variation * 0.28) * lateralSpread * speedMultiplier)
      .addScaledVector(correctedUp, profile.liftSpeed * (0.9 + variation * 0.22) * verticalSpread * speedMultiplier)
      .addScaledVector(forward, -profile.cameraSpeed * (0.84 + variation * 0.3) * cameraMultiplier);
    slot.spin.set(
      15 + variation * 9,
      11 + deterministic(pending.shotId, 139) * 12,
      17 + deterministic(pending.shotId, 149) * 10,
    );
  }

  spawnInkSplatter(position: THREE.Vector3, direction: THREE.Vector3, color: InkColor, count = 5): void {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector3(0, 0.2, 1).normalize();
    const right = new THREE.Vector3().crossVectors(normalized, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, normalized).normalize();
    for (let index = 0; index < count; index += 1) {
      const spreadX = (((index * 37) % 11) / 10 - 0.5) * 0.78;
      const spreadY = (((index * 53) % 13) / 12 - 0.5) * 0.62;
      const point = position.clone()
        .addScaledVector(normalized, (index % 4) * 0.09)
        .addScaledVector(right, spreadX)
        .addScaledVector(up, spreadY);
      this.spawnBurst(point, color, 0.07 + (index % 4) * 0.028, 0.22 + (index % 5) * 0.045);
    }
  }

  spawnDebris(position: THREE.Vector3, direction: THREE.Vector3, color: InkColor, count = 7): void {
    for (let index = 0; index < count; index += 1) {
      const slot = this.debrisSlots[this.debrisCursor];
      this.debrisCursor = (this.debrisCursor + 1) % this.debrisSlots.length;
      slot.life = slot.maxLife = 1.25 + (index % 3) * 0.18;
      slot.mesh.visible = true;
      slot.mesh.position.copy(position);
      (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(COLORS[color]);
      slot.mesh.scale.setScalar(0.72 + (index % 4) * 0.12);
      slot.velocity.copy(direction).multiplyScalar(2.2 + (index % 4) * 0.55);
      slot.velocity.x += (((index * 29) % 9) - 4) * 0.31;
      slot.velocity.y += 2.2 + (index % 5) * 0.45;
      slot.velocity.z += (((index * 43) % 11) - 5) * 0.23;
      slot.spin.set(2.2 + index * 0.17, 1.8 + index * 0.13, 2.6 + index * 0.11);
    }
  }

  spawnSurfaceSplat(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    scale = 2.8,
    lifetime = 52,
    rotationRadians?: number,
  ): void {
    const safeNormal = normal.lengthSq() > 0.001 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const verticalSurface = Math.abs(safeNormal.y) < 0.55;
    if (!verticalSurface) {
      this.spawnDecalLayer(position, safeNormal, scale * 0.78, scale * 0.64, lifetime, 'floor-pool', 0.9, rotationRadians);
      this.spawnDecalLayer(position, safeNormal, scale * 0.42, scale * 0.92, lifetime, 'floor-streak', 0.54, (rotationRadians ?? 0) + 0.24);
      return;
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(worldUp, safeNormal);
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize();
    const baseRotation = rotationRadians ?? (deterministic(this.deathSequence, 503) - 0.5) * 0.08;

    // The source stain is a broad broken strike plus a smaller translucent echo.
    for (let index = 0; index < DEATH_INK_STYLE.wallImpactLayers; index += 1) {
      const secondary = index === 1;
      const offset = position.clone()
        .addScaledVector(tangent, secondary ? -scale * 0.16 : 0)
        .addScaledVector(worldUp, secondary ? -scale * 0.13 : 0);
      this.spawnDecalLayer(
        offset,
        safeNormal,
        scale * (secondary ? 0.88 : 1.42),
        scale * (secondary ? 1.22 : 2.18),
        lifetime,
        'wall-impact',
        secondary ? 0.63 : 0.94,
        baseRotation + (secondary ? -0.055 : 0),
      );
    }

    // Gravity-readable rivulets live on independent planes so the silhouette is
    // broken and can never collapse back into one regular decal.
    for (let index = 0; index < DEATH_INK_STYLE.wallDripLayers; index += 1) {
      const lateral = (-0.38 + index * 0.36 + (deterministic(index, this.deathSequence + 509) - 0.5) * 0.12) * scale;
      const vertical = (-0.4 - deterministic(index, this.deathSequence + 521) * 0.19) * scale;
      const dripPosition = position.clone().addScaledVector(tangent, lateral).addScaledVector(worldUp, vertical);
      this.spawnDecalLayer(
        dripPosition,
        safeNormal,
        scale * (0.18 + deterministic(index, this.deathSequence + 523) * 0.09),
        scale * (0.88 + deterministic(index, this.deathSequence + 541) * 0.42),
        lifetime,
        'wall-drip',
        0.64 + deterministic(index, this.deathSequence + 547) * 0.22,
        (deterministic(index, this.deathSequence + 557) - 0.5) * 0.07,
      );
    }

    for (let index = 0; index < DEATH_INK_STYLE.wallDropletLayers; index += 1) {
      const lateral = (deterministic(index, this.deathSequence + 563) - 0.42) * scale * 1.62;
      const vertical = (deterministic(index, this.deathSequence + 569) - 0.57) * scale * 1.18;
      const dropPosition = position.clone().addScaledVector(tangent, lateral).addScaledVector(worldUp, vertical);
      const dropScale = index < 2
        ? scale * (0.22 + deterministic(index, this.deathSequence + 571) * 0.12)
        : scale * (0.11 + deterministic(index, this.deathSequence + 571) * 0.1);
      this.spawnDecalLayer(
        dropPosition,
        safeNormal,
        dropScale,
        dropScale * (0.82 + deterministic(index, this.deathSequence + 577) * 0.65),
        lifetime,
        'droplet',
        0.57 + deterministic(index, this.deathSequence + 587) * 0.34,
        (deterministic(index, this.deathSequence + 593) - 0.5) * 1.1,
      );
    }
  }

  private spawnDecalLayer(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    lifetime: number,
    textureKind: SplatTextureKind,
    opacity: number,
    rotationRadians?: number,
  ): void {
    const slot = this.decalSlots[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decalSlots.length;
    const safeNormal = normal.lengthSq() > 0.001 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    slot.life = slot.maxLife = lifetime;
    slot.mesh.visible = true;
    slot.mesh.position.copy(position).addScaledVector(safeNormal, 0.018);
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), safeNormal);
    slot.mesh.rotateZ(rotationRadians ?? deterministic(this.decalCursor, this.deathSequence) * Math.PI * 2);
    slot.mesh.scale.set(Math.max(0.025, width), Math.max(0.025, height), 1);
    const textures = this.splatTextures[textureKind];
    slot.material.map = textures[(this.decalCursor + this.deathSequence) % textures.length];
    slot.material.color.setHex(INK_STYLE
      ? deathDecalColor(textureKind, opacity, this.decalCursor, this.deathSequence)
      : COLORS.red);
    slot.baseOpacity = THREE.MathUtils.clamp(opacity, DEATH_INK_STYLE.opacityRange[0], DEATH_INK_STYLE.opacityRange[1]);
    slot.material.opacity = slot.baseOpacity;
  }

  private queueSurfaceSplat(
    delay: number,
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    lifetime: number,
    textureKind: SplatTextureKind,
    opacity: number,
    rotationRadians?: number,
  ): void {
    this.pendingSplats.push({
      delay,
      position: position.clone(),
      normal: normal.clone(),
      width,
      height,
      lifetime,
      textureKind,
      opacity,
      rotationRadians,
    });
  }

  spawnEnemyDeath(position: THREE.Vector3, direction: THREE.Vector3, options: EnemyDeathInkOptions = {}): void {
    this.deathSequence += 1;
    const intensity = Math.max(0.65, options.intensity ?? 1);
    const normalized = direction.lengthSq() > 0.001
      ? direction.clone().setY(direction.y * 0.18).normalize()
      : new THREE.Vector3(0, 0.04, 1).normalize();
    const right = new THREE.Vector3().crossVectors(normalized, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const bodyScale = options.boss ? 1.38 : 1;
    const violentSeparation = Boolean(options.boss || options.headshot || this.deathSequence % 2 === 0);
    const semanticMotion = violentSeparation ? 1 : 0.42;
    const sprayMotion = violentSeparation ? 1 : 0.9;
    const color = options.boss ? COLORS.orange : COLORS.red;
    const pieces: readonly DeathPieceSpec[] = [
      { shape: 'blob', offset: [0, 1.82, 0], scale: [1.23, 1.28, 1.12], velocity: [-5.2, 4.45, 5.3], delay: 0.04, life: 1.38, bounce: 0.22, face: true },
      { shape: 'blob', offset: [0, 1.18, 0], scale: [1.42, 1.32, 1.08], velocity: [-2.6, 1.65, -3.6], delay: 0.044, life: 1.48, bounce: 0.18 },
      { shape: 'limb', offset: [-0.32, 1.31, 0], scale: [0.62, 0.76, 0.62], velocity: [-1.4, 2.55, -3.15], delay: 0.046, life: 1.3, bounce: 0.18 },
      { shape: 'limb', offset: [0.32, 1.31, 0], scale: [0.62, 0.76, 0.62], velocity: [-0.75, 2.95, 3.55], delay: 0.047, life: 1.32, bounce: 0.18 },
      { shape: 'limb', offset: [-0.15, 0.58, 0], scale: [0.6, 0.98, 0.6], velocity: [-0.65, 1.2, -2.25], delay: 0.049, life: 1.38, bounce: 0.16 },
      { shape: 'limb', offset: [0.15, 0.58, 0], scale: [0.6, 0.98, 0.6], velocity: [-0.25, 1.35, 1.95], delay: 0.05, life: 1.38, bounce: 0.16 },
      { shape: 'stroke', offset: [0.08, 1.58, 0.16], scale: [0.82, 0.88, 1.08], velocity: [-4.25, 4.35, 5.8], delay: 0.042, life: 1.16, bounce: 0.16 },
      { shape: 'drop', offset: [-0.16, 0.15, 0.06], scale: [1.08, 0.72, 1.2], velocity: [-0.3, 1.1, -1.55], delay: 0.052, life: 1.18, bounce: 0.12 },
      { shape: 'drop', offset: [0.16, 0.15, 0.06], scale: [1.08, 0.72, 1.2], velocity: [-0.2, 1.2, 1.45], delay: 0.053, life: 1.18, bounce: 0.12 },
    ];
    pieces.forEach((piece, index) => {
      this.spawnDeathPiece(
        position,
        position.y + 0.035,
        normalized,
        right,
        index,
        { ...piece, life: piece.life * (violentSeparation ? 0.72 : 0.38) },
        intensity * semanticMotion,
        bodyScale,
        INK_STYLE ? deathPieceColor(index, this.deathSequence) : color,
      );
    });

    const strokeCount = options.boss ? 14 : 10;
    for (let index = 0; index < strokeCount; index += 1) {
      const sequenceIndex = pieces.length + index;
      const side = (deterministic(index, this.deathSequence + 7) - 0.5) * 4.5;
      const y = 0.46 + deterministic(index, this.deathSequence + 9) * (options.headshot ? 1.55 : 1.2);
      const length = 0.42 + deterministic(index, this.deathSequence + 11) * 0.52;
      this.spawnDeathPiece(position, position.y + 0.035, normalized, right, sequenceIndex, {
        shape: 'stroke',
        offset: [side * 0.08, y, deterministic(index, 12) * 0.12],
        scale: [0.42 + deterministic(index, 13) * 0.34, 0.5, length],
        velocity: [5.1 + deterministic(index, 17) * 4.2, 0.8 + deterministic(index, 19) * 3.2, side],
        delay: 0.025 + (index % 4) * 0.004,
        life: 0.56 + deterministic(index, 23) * 0.38,
        bounce: 0.08,
      }, intensity * sprayMotion, bodyScale, INK_STYLE ? deathPieceColor(sequenceIndex, this.deathSequence) : color);
    }

    const dropCount = options.boss ? 32 : options.headshot ? 28 : 24;
    for (let index = 0; index < dropCount; index += 1) {
      const sequenceIndex = pieces.length + strokeCount + index;
      const side = (deterministic(index, this.deathSequence + 31) - 0.5) * 4.8;
      const y = 0.34 + deterministic(index, this.deathSequence + 37) * (options.headshot ? 1.62 : 1.28);
      const size = 0.17 + deterministic(index, this.deathSequence + 41) * 0.42;
      this.spawnDeathPiece(position, position.y + 0.035, normalized, right, sequenceIndex, {
        shape: 'drop',
        offset: [side * 0.055, y, deterministic(index, 43) * 0.15],
        scale: [size * (0.8 + deterministic(index, 47) * 0.45), size, size],
        velocity: [4.4 + deterministic(index, 53) * 5.8, 0.45 + deterministic(index, 59) * 4.1, side],
        delay: 0.025 + (index % 6) * 0.003,
        life: 0.62 + deterministic(index, 61) * 0.52,
        bounce: 0.12,
      }, intensity * sprayMotion, bodyScale, INK_STYLE ? deathPieceColor(sequenceIndex, this.deathSequence) : color);
    }

    const floorNormal = new THREE.Vector3(0, 1, 0);
    const trailOffset = normalized.clone().setY(0);
    if (trailOffset.lengthSq() < 0.001) trailOffset.set(0, 0, 1);
    trailOffset.normalize();
    const floorRotation = Math.atan2(-right.z, right.x);
    const mainPoolPosition = position.clone().addScaledVector(trailOffset, 0.2 * intensity);
    const floorScale = intensity * (options.boss ? 1.28 : 1);
    for (let index = 0; index < DEATH_INK_STYLE.floorPoolLayers; index += 1) {
      const secondary = index === 1;
      const poolPosition = mainPoolPosition.clone()
        .addScaledVector(right, secondary ? -0.28 * floorScale : 0)
        .addScaledVector(trailOffset, secondary ? 0.18 * floorScale : 0);
      this.queueSurfaceSplat(
        (options.boss ? 0.1 : 0.16) + index * 0.025,
        poolPosition,
        floorNormal,
        (secondary ? 1.32 : 2.18) * floorScale,
        (secondary ? 0.94 : 1.52) * floorScale,
        DEATH_INK_STYLE.decalLifetime,
        'floor-pool',
        secondary ? 0.65 : 0.94,
        floorRotation + (secondary ? 0.16 : 0),
      );
    }

    for (let index = 0; index < DEATH_INK_STYLE.floorStreakLayers; index += 1) {
      const along = 0.42 + index * 0.46 + deterministic(index, this.deathSequence + 601) * 0.18;
      const lateral = (deterministic(index, this.deathSequence + 607) - 0.5) * (0.36 + index * 0.12);
      const streakPosition = position.clone().addScaledVector(trailOffset, along).addScaledVector(right, lateral);
      this.queueSurfaceSplat(
        0.17 + index * 0.02,
        streakPosition,
        floorNormal,
        (0.3 + deterministic(index, this.deathSequence + 613) * 0.22) * floorScale,
        (0.82 + deterministic(index, this.deathSequence + 617) * 0.54) * floorScale,
        DEATH_INK_STYLE.decalLifetime,
        'floor-streak',
        0.46 + deterministic(index, this.deathSequence + 619) * 0.3,
        floorRotation + (deterministic(index, this.deathSequence + 631) - 0.5) * 0.32,
      );
    }

    for (let index = 0; index < DEATH_INK_STYLE.floorSatelliteCount; index += 1) {
      const foregroundAlong = [0.72, 1.46, 2.38] as const;
      const foregroundLateral = [-0.48, 0.58, -0.2] as const;
      const along = index < foregroundAlong.length
        ? foregroundAlong[index] ?? 0.72
        : 0.78 + (index - foregroundAlong.length) * 0.41 + deterministic(index, this.deathSequence + 67) * 0.27;
      const lateral = index < foregroundLateral.length
        ? foregroundLateral[index] ?? 0
        : (deterministic(index, this.deathSequence + 71) - 0.5) * (0.78 + index * 0.13);
      const satelliteDirection = index < 3 ? -1 : 1;
      const satellite = position.clone().addScaledVector(trailOffset, along * satelliteDirection).addScaledVector(right, lateral);
      const dropWidth = (index < 3
        ? 0.4 + deterministic(index, this.deathSequence + 73) * 0.28
        : 0.16 + deterministic(index, this.deathSequence + 73) * 0.2) * floorScale;
      this.queueSurfaceSplat(
        0.2 + index * 0.014,
        satellite,
        floorNormal,
        dropWidth,
        dropWidth * (index < 3
          ? 0.52 + deterministic(index, this.deathSequence + 79) * 0.46
          : 0.72 + deterministic(index, this.deathSequence + 79) * 1.25),
        DEATH_INK_STYLE.decalLifetime,
        index < 3 ? 'floor-pool' : 'droplet',
        0.62 + deterministic(index, this.deathSequence + 83) * 0.3,
        floorRotation + lateral * 0.4,
      );
    }
  }

  private spawnDeathPiece(
    origin: THREE.Vector3,
    floorY: number,
    direction: THREE.Vector3,
    right: THREE.Vector3,
    index: number,
    spec: DeathPieceSpec,
    intensity: number,
    bodyScale: number,
    color: number,
  ): void {
    const slot = this.goreSlots[this.goreCursor];
    this.goreCursor = (this.goreCursor + 1) % this.goreSlots.length;
    slot.mesh.geometry = this.goreGeometries[spec.shape];
    slot.mesh.visible = spec.delay <= 0;
    slot.face.visible = Boolean(spec.face);
    slot.mesh.position.copy(origin)
      .addScaledVector(right, spec.offset[0] * bodyScale)
      .addScaledVector(new THREE.Vector3(0, 1, 0), spec.offset[1] * bodyScale)
      .addScaledVector(direction, spec.offset[2] * bodyScale);
    (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    slot.mesh.scale.set(spec.scale[0] * bodyScale, spec.scale[1] * bodyScale, spec.scale[2] * bodyScale);
    slot.velocity.copy(direction).multiplyScalar(spec.velocity[0] * intensity)
      .addScaledVector(right, spec.velocity[2] * intensity);
    slot.velocity.y += spec.velocity[1] * intensity;
    slot.mesh.quaternion.identity();
    if (spec.face) {
      const faceDirection = direction.clone().setY(0).multiplyScalar(-1);
      if (faceDirection.lengthSq() < 0.001) faceDirection.set(0, 0, 1);
      faceDirection.normalize();
      slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceDirection);
    } else if (spec.shape === 'stroke' && slot.velocity.lengthSq() > 0.001) {
      slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), slot.velocity.clone().normalize());
    }
    slot.spin.set(
      (deterministic(index, this.deathSequence + 79) - 0.5) * (spec.face ? 4 : 12),
      (deterministic(index, this.deathSequence + 83) - 0.5) * (spec.face ? 4 : 12),
      (deterministic(index, this.deathSequence + 89) - 0.5) * (spec.face ? 4 : 12),
    );
    slot.life = slot.maxLife = spec.life;
    slot.delay = spec.delay;
    slot.floorY = floorY;
    slot.bounce = spec.bounce;
    const radiusByShape: Record<GoreShape, number> = { blob: 0.22, limb: 0.055, stroke: 0.045, drop: 0.095 };
    slot.groundRadius = radiusByShape[spec.shape] * Math.max(slot.mesh.scale.x, slot.mesh.scale.y, slot.mesh.scale.z);
  }

  setGrapple(start: THREE.Vector3, end: THREE.Vector3, visible: boolean): void {
    this.grappleLine.visible = visible;
    if (!visible) return;
    if (INK_STYLE) {
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const deltaZ = end.z - start.z;
      for (let index = 0; index < GRAPPLE_DASH_WINDOWS.length; index += 1) {
        const window = GRAPPLE_DASH_WINDOWS[index];
        const offset = index * 6;
        this.grapplePositions[offset] = start.x + deltaX * window[0];
        this.grapplePositions[offset + 1] = start.y + deltaY * window[0];
        this.grapplePositions[offset + 2] = start.z + deltaZ * window[0];
        this.grapplePositions[offset + 3] = start.x + deltaX * window[1];
        this.grapplePositions[offset + 4] = start.y + deltaY * window[1];
        this.grapplePositions[offset + 5] = start.z + deltaZ * window[1];
      }
    } else {
      this.grapplePositions[0] = start.x;
      this.grapplePositions[1] = start.y;
      this.grapplePositions[2] = start.z;
      this.grapplePositions[3] = end.x;
      this.grapplePositions[4] = end.y;
      this.grapplePositions[5] = end.z;
    }
    (this.grappleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    for (let index = this.pendingCasings.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingCasings[index];
      pending.delay -= dt;
      if (pending.delay > 0) continue;
      this.spawnCasing(pending);
      this.pendingCasings.splice(index, 1);
    }
    for (let index = this.pendingSplats.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingSplats[index];
      pending.delay -= dt;
      if (pending.delay > 0) continue;
      this.spawnDecalLayer(
        pending.position,
        pending.normal,
        pending.width,
        pending.height,
        pending.lifetime,
        pending.textureKind,
        pending.opacity,
        pending.rotationRadians,
      );
      this.pendingSplats.splice(index, 1);
    }
    for (const slot of this.spriteSlots) {
      if (!slot.sprite.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.sprite.visible = false;
        slot.material.opacity = 0;
      } else {
        const ratio = slot.life / slot.maxLife;
        slot.material.opacity = Math.min(1, ratio * 2.5) * 0.92;
        slot.sprite.scale.multiplyScalar(1 + dt * 1.45);
      }
    }
    for (const slot of this.debrisSlots) {
      if (!slot.mesh.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        continue;
      }
      slot.velocity.y -= 12 * dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.mesh.rotation.x += slot.spin.x * dt;
      slot.mesh.rotation.y += slot.spin.y * dt;
      slot.mesh.rotation.z += slot.spin.z * dt;
      if (slot.mesh.position.y < 0.04) {
        slot.mesh.position.y = 0.04;
        slot.velocity.y *= -0.28;
        slot.velocity.x *= 0.72;
        slot.velocity.z *= 0.72;
      }
    }
    for (const slot of this.casingSlots) {
      if (!slot.object.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.object.visible = false;
        continue;
      }
      slot.velocity.y -= 13.2 * dt;
      slot.object.position.addScaledVector(slot.velocity, dt);
      slot.object.rotation.x += slot.spin.x * dt;
      slot.object.rotation.y += slot.spin.y * dt;
      slot.object.rotation.z += slot.spin.z * dt;
      const halfHeight = Math.max(0.028, slot.object.scale.y * (slot.muzzleShard ? 0.36 : 0.58));
      if (slot.object.position.y < slot.floorY + halfHeight) {
        slot.object.position.y = slot.floorY + halfHeight;
        if (Math.abs(slot.velocity.y) > 0.55) slot.velocity.y *= -0.3;
        else slot.velocity.y = 0;
        slot.velocity.x *= Math.exp(-4.8 * dt);
        slot.velocity.z *= Math.exp(-4.8 * dt);
        slot.spin.multiplyScalar(Math.exp(-3.8 * dt));
      }
    }
    for (const slot of this.smokeSlots) {
      if (!slot.sprite.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.sprite.visible = false;
        slot.material.opacity = 0;
        continue;
      }
      slot.sprite.position.addScaledVector(slot.velocity, dt);
      const progress = 1 - slot.life / slot.maxLife;
      const scale = slot.baseScale * (1 + progress * 0.62);
      slot.sprite.scale.set(scale, scale, 1);
      slot.material.opacity = Math.pow(1 - progress, 1.35) * 0.86;
    }
    for (const slot of this.shotTrailSlots) {
      if (!slot.mesh.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.material.opacity = 0;
        slot.tip.visible = false;
        slot.tipMaterial.opacity = 0;
        continue;
      }
      const travel = Math.min(slot.travelRemaining, slot.speed * dt);
      if (travel > 0) {
        slot.mesh.position.addScaledVector(slot.direction, travel);
        slot.travelRemaining -= travel;
      }
      const ratio = slot.life / slot.maxLife;
      slot.material.opacity = slot.baseOpacity * Math.min(1, ratio * 2.2);
      slot.tipMaterial.opacity = Math.min(0.96, slot.material.opacity * 1.12);
      slot.tip.scale.setScalar(slot.tipBaseScale * (0.86 + ratio * 0.14));
    }
    for (const slot of this.goreSlots) {
      if (slot.life <= 0) continue;
      if (slot.delay > 0) {
        slot.delay -= dt;
        if (slot.delay > 0) continue;
        slot.mesh.visible = true;
      }
      if (!slot.mesh.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        continue;
      }
      slot.velocity.y -= 13.5 * dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.mesh.rotation.x += slot.spin.x * dt;
      slot.mesh.rotation.y += slot.spin.y * dt;
      slot.mesh.rotation.z += slot.spin.z * dt;
      const radius = Math.max(0.025, slot.groundRadius);
      if (slot.mesh.position.y < slot.floorY + radius) {
        slot.mesh.position.y = slot.floorY + radius;
        if (Math.abs(slot.velocity.y) > 0.45) slot.velocity.y *= -slot.bounce;
        else slot.velocity.y = 0;
        slot.velocity.x *= Math.exp(-5.2 * dt);
        slot.velocity.z *= Math.exp(-5.2 * dt);
        slot.spin.multiplyScalar(Math.exp(-3.4 * dt));
      }
    }
    for (const slot of this.decalSlots) {
      if (!slot.mesh.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        slot.material.opacity = 0;
        continue;
      }
      slot.material.opacity = slot.life < 5
        ? THREE.MathUtils.clamp(slot.life / 5, 0, 1) * slot.baseOpacity
        : slot.baseOpacity;
    }
  }

  getSnapshot(): EffectPoolSnapshot {
    return {
      sprites: this.spriteSlots.filter((slot) => slot.sprite.visible).length,
      debris: this.debrisSlots.filter((slot) => slot.mesh.visible).length,
      casings: this.casingSlots.filter((slot) => slot.object.visible).length,
      smoke: this.smokeSlots.filter((slot) => slot.sprite.visible).length,
      shotTrails: this.shotTrailSlots.filter((slot) => slot.mesh.visible).length,
      gore: this.goreSlots.filter((slot) => slot.life > 0).length,
      decals: this.decalSlots.filter((slot) => slot.mesh.visible).length,
    };
  }

  clear(): void {
    this.pendingSplats.length = 0;
    this.pendingCasings.length = 0;
    for (const slot of this.spriteSlots) slot.sprite.visible = false;
    for (const slot of this.debrisSlots) slot.mesh.visible = false;
    for (const slot of this.casingSlots) {
      slot.object.visible = false;
      slot.life = 0;
    }
    for (const slot of this.smokeSlots) {
      slot.sprite.visible = false;
      slot.material.opacity = 0;
      slot.life = 0;
    }
    for (const slot of this.shotTrailSlots) {
      slot.mesh.visible = false;
      slot.material.opacity = 0;
      slot.tip.visible = false;
      slot.tipMaterial.opacity = 0;
      slot.life = 0;
    }
    for (const slot of this.goreSlots) {
      slot.mesh.visible = false;
      slot.face.visible = false;
      slot.life = 0;
      slot.delay = 0;
    }
    for (const slot of this.decalSlots) {
      slot.mesh.visible = false;
      slot.material.opacity = 0;
    }
    this.grappleLine.visible = false;
  }
}
