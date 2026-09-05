import * as THREE from 'three';
import { DOODLE_PALETTE } from './palette';

export interface OutlineOptions {
  color?: THREE.ColorRepresentation;
  opacity?: number;
  thresholdAngle?: number;
  /** World-unit displacement baked once into the line geometry. Zero keeps exact edges. */
  irregularity?: number;
  /** Deterministic phase for the static irregularity. */
  irregularitySeed?: number;
  /** Maximum local-space length of each wobbly outline segment. */
  segmentLength?: number;
  /** Adds an intermittent, pale second pen pass without another draw call. */
  doubleStroke?: boolean;
  /** Local-space separation between the primary and secondary pen passes. */
  doubleStrokeOffset?: number;
  /** Per-vertex alpha of the secondary pen pass. */
  ghostOpacity?: number;
  renderOrder?: number;
  linewidth?: number;
  scale?: number;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

type EdgeCacheEntry = {
  source: THREE.BufferGeometry;
  key: string;
  geometry: THREE.BufferGeometry;
  references: number;
};

type MaterialCacheEntry = {
  key: string;
  material: THREE.LineBasicMaterial;
  references: number;
};

const edgeCache = new WeakMap<THREE.BufferGeometry, Map<string, EdgeCacheEntry>>();
const activeEdgeEntries = new Set<EdgeCacheEntry>();
const lineMaterialCache = new Map<string, MaterialCacheEntry>();

function stableNoise(value: number): number {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export interface HandDrawnEdgesOptions {
  thresholdAngle?: number;
  irregularity?: number;
  seed?: number;
  segmentLength?: number;
  doubleStroke?: boolean;
  doubleStrokeOffset?: number;
  ghostOpacity?: number;
}

/**
 * Converts exact topology edges into a deterministic, subdivided pen line. The
 * pale second pass is stored in the same geometry with RGBA vertex colours, so
 * doubled construction lines do not add a renderer draw call.
 */
export function createHandDrawnEdgesGeometry(
  source: THREE.BufferGeometry,
  options: HandDrawnEdgesOptions = {},
): THREE.BufferGeometry {
  const thresholdAngle = options.thresholdAngle ?? 22;
  const irregularity = Math.max(options.irregularity ?? 0, 0);
  const seed = options.seed ?? 0;
  const segmentLength = Math.max(options.segmentLength ?? 0.72, 0.08);
  const doubleStroke = options.doubleStroke ?? false;
  const doubleStrokeOffset = Math.max(options.doubleStrokeOffset ?? irregularity * 0.72, 0);
  const ghostOpacity = THREE.MathUtils.clamp(options.ghostOpacity ?? 0.28, 0, 1);

  const exactEdges = new THREE.EdgesGeometry(source, thresholdAngle);
  const exactPositions = exactEdges.getAttribute('position');
  const positions: number[] = [];
  const colors: number[] = [];
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const helper = new THREE.Vector3();
  const across = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const point = new THREE.Vector3();

  const appendPoint = (value: THREE.Vector3, alpha: number): void => {
    positions.push(value.x, value.y, value.z);
    colors.push(1, 1, 1, alpha);
  };

  for (let edgeIndex = 0; edgeIndex + 1 < exactPositions.count; edgeIndex += 2) {
    start.fromBufferAttribute(exactPositions, edgeIndex);
    end.fromBufferAttribute(exactPositions, edgeIndex + 1);
    direction.copy(end).sub(start);
    const length = direction.length();
    if (length <= 1e-7) continue;
    direction.multiplyScalar(1 / length);

    // Select a stable local frame perpendicular to the edge. Both components
    // are perturbed, avoiding the flat zig-zag look of a single offset axis.
    if (Math.abs(direction.y) < 0.82) helper.set(0, 1, 0);
    else helper.set(1, 0, 0);
    across.crossVectors(direction, helper).normalize();
    lateral.crossVectors(direction, across).normalize();

    const subdivisions = THREE.MathUtils.clamp(Math.ceil(length / segmentLength), 2, 32);
    const edgeSeed = seed * 19.19 + edgeIndex * 2.713 + length * 0.317;

    const sample = (t: number, pass: 0 | 1): THREE.Vector3 => {
      point.lerpVectors(start, end, t);
      const endpointEnvelope = 0.34 + Math.sin(Math.PI * t) * 0.66;
      const sampleSeed = edgeSeed + t * 37.71 + pass * 113.17;
      const waveA = Math.sin((t * 2.2 + stableNoise(edgeSeed + 2.1)) * Math.PI * 2);
      const waveB = Math.sin((t * 3.1 + stableNoise(edgeSeed + 8.7)) * Math.PI * 2);
      const noiseA = stableNoise(sampleSeed + 1.1) * 2 - 1;
      const noiseB = stableNoise(sampleSeed + 7.7) * 2 - 1;
      const amount = irregularity * endpointEnvelope;
      point.addScaledVector(across, (waveA * 0.56 + noiseA * 0.44) * amount);
      point.addScaledVector(lateral, (waveB * 0.48 + noiseB * 0.52) * amount * 0.72);
      if (pass > 0) {
        const offsetSign = stableNoise(edgeSeed + 17.3) > 0.5 ? 1 : -1;
        const offsetPulse = 0.76 + Math.sin(t * Math.PI * 3 + edgeSeed) * 0.24;
        point.addScaledVector(across, doubleStrokeOffset * offsetSign * offsetPulse);
        point.addScaledVector(lateral, doubleStrokeOffset * 0.34 * (noiseB + 0.35));
      }
      return point;
    };

    for (let segment = 0; segment < subdivisions; segment += 1) {
      const t0 = segment / subdivisions;
      const t1 = (segment + 1) / subdivisions;
      appendPoint(sample(t0, 0), 1);
      appendPoint(sample(t1, 0), 1);

      // Skip roughly one quarter of the ghost segments, leaving the displaced
      // pass visibly hand-traced rather than a uniform vector shadow.
      if (doubleStroke && stableNoise(edgeSeed + segment * 5.73) > 0.24) {
        appendPoint(sample(t0, 1), ghostOpacity);
        appendPoint(sample(t1, 1), ghostOpacity);
      }
    }
  }

  exactEdges.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function acquireEdges(
  source: THREE.BufferGeometry,
  thresholdAngle: number,
  irregularity: number,
  seed: number,
  segmentLength: number,
  doubleStroke: boolean,
  doubleStrokeOffset: number,
  ghostOpacity: number,
): EdgeCacheEntry {
  const key = [
    thresholdAngle.toFixed(3),
    irregularity.toFixed(5),
    seed.toFixed(3),
    segmentLength.toFixed(3),
    doubleStroke ? 'double' : 'single',
    doubleStrokeOffset.toFixed(5),
    ghostOpacity.toFixed(3),
  ].join(':');
  let entries = edgeCache.get(source);
  if (!entries) {
    entries = new Map<string, EdgeCacheEntry>();
    edgeCache.set(source, entries);
  }
  const cached = entries.get(key);
  if (cached) {
    cached.references += 1;
    return cached;
  }

  const geometry = createHandDrawnEdgesGeometry(source, {
    thresholdAngle,
    irregularity,
    seed,
    segmentLength,
    doubleStroke,
    doubleStrokeOffset,
    ghostOpacity,
  });
  const entry: EdgeCacheEntry = { source, key, geometry, references: 1 };
  entries.set(key, entry);
  activeEdgeEntries.add(entry);
  return entry;
}

function releaseEdges(entry: EdgeCacheEntry): void {
  entry.references -= 1;
  if (entry.references > 0) return;
  entry.geometry.dispose();
  const entries = edgeCache.get(entry.source);
  entries?.delete(entry.key);
  if (entries?.size === 0) edgeCache.delete(entry.source);
  activeEdgeEntries.delete(entry);
}

function colorKey(color: THREE.ColorRepresentation): string {
  return new THREE.Color(color).getHexString();
}

function acquireLineMaterial(
  color: THREE.ColorRepresentation,
  opacity: number,
  linewidth: number,
): MaterialCacheEntry {
  const key = `${colorKey(color)}:${opacity.toFixed(4)}:${linewidth.toFixed(2)}`;
  const cached = lineMaterialCache.get(key);
  if (cached) {
    cached.references += 1;
    return cached;
  }
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false,
  });
  material.name = `DoodleOutline-${key}`;
  const entry: MaterialCacheEntry = { key, material, references: 1 };
  lineMaterialCache.set(key, entry);
  return entry;
}

function releaseLineMaterial(entry: MaterialCacheEntry): void {
  entry.references -= 1;
  if (entry.references > 0) return;
  entry.material.dispose();
  lineMaterialCache.delete(entry.key);
}

/** A regular mesh and its cached ink outline, kept in a single transform group. */
export class OutlinedMeshGroup extends THREE.Group {
  readonly mesh: THREE.Mesh;
  readonly outline: THREE.LineSegments;
  private readonly edgeEntry: EdgeCacheEntry;
  private readonly materialEntry: MaterialCacheEntry;
  private released = false;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    options: OutlineOptions = {},
  ) {
    super();
    const thresholdAngle = options.thresholdAngle ?? 22;
    const irregularity = Math.max(options.irregularity ?? 0, 0);
    const seed = options.irregularitySeed ?? 0;
    const segmentLength = Math.max(options.segmentLength ?? 0.72, 0.08);
    const doubleStroke = options.doubleStroke ?? false;
    const doubleStrokeOffset = Math.max(options.doubleStrokeOffset ?? irregularity * 0.72, 0);
    const ghostOpacity = THREE.MathUtils.clamp(options.ghostOpacity ?? 0.28, 0, 1);
    const opacity = THREE.MathUtils.clamp(options.opacity ?? 0.96, 0, 1);
    const linewidth = Math.max(options.linewidth ?? 1, 1);

    this.edgeEntry = acquireEdges(
      geometry,
      thresholdAngle,
      irregularity,
      seed,
      segmentLength,
      doubleStroke,
      doubleStrokeOffset,
      ghostOpacity,
    );
    this.materialEntry = acquireLineMaterial(options.color ?? DOODLE_PALETTE.ink, opacity, linewidth);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = options.castShadow ?? false;
    this.mesh.receiveShadow = options.receiveShadow ?? true;

    this.outline = new THREE.LineSegments(this.edgeEntry.geometry, this.materialEntry.material);
    this.outline.name = options.name ? `${options.name}-outline` : 'doodle-outline';
    this.outline.renderOrder = options.renderOrder ?? 3;
    this.outline.scale.setScalar(options.scale ?? 1.0015);
    this.outline.visible = options.visible ?? true;
    this.outline.frustumCulled = this.mesh.frustumCulled;

    this.name = options.name ?? 'outlined-mesh';
    this.mesh.name = options.name ? `${options.name}-surface` : 'doodle-surface';
    this.add(this.mesh, this.outline);
  }

  /** Releases shared outline-cache references. Surface geometry/material ownership stays with the caller. */
  releaseOutlineResources(): void {
    if (this.released) return;
    this.released = true;
    releaseEdges(this.edgeEntry);
    releaseLineMaterial(this.materialEntry);
  }
}

export function createOutlinedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  options: OutlineOptions = {},
): OutlinedMeshGroup {
  return new OutlinedMeshGroup(geometry, material, options);
}

export function releaseOutlinedObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof OutlinedMeshGroup) object.releaseOutlineResources();
  });
}

export function getOutlineCacheStats(): { edgeVariants: number; lineMaterials: number; references: number } {
  let references = 0;
  for (const entry of activeEdgeEntries) references += entry.references;
  return {
    edgeVariants: activeEdgeEntries.size,
    lineMaterials: lineMaterialCache.size,
    references,
  };
}

/** Intended for renderer teardown or tests after all outlined groups have been released. */
export function disposeOutlineCaches(): void {
  for (const entry of activeEdgeEntries) entry.geometry.dispose();
  for (const entry of lineMaterialCache.values()) entry.material.dispose();
  activeEdgeEntries.clear();
  lineMaterialCache.clear();
}
