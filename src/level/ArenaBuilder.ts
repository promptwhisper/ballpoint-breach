import * as THREE from 'three';
import { DoodleMaterial } from '../render/DoodleMaterial';
import {
  createOutlinedMesh,
  type OutlinedMeshGroup,
} from '../render/OutlinedMesh';
import { DOODLE_PALETTE } from '../render/palette';
import { ACTIVE_VISUAL_STYLE } from '../render/visualStyle';
import { ACTIVE_INK_VERSION, inkUniforms } from '../render/inkSettings';
import { getInkAtmosphereTexture } from '../render/InkTextures';

export type ArenaColliderCategory =
  | 'ground'
  | 'wall'
  | 'platform'
  | 'step'
  | 'cover'
  | 'column'
  | 'breakable';

export interface ArenaCollider {
  id: string;
  /** Authoritative axis-aligned bounds. `min` and `max` below reference this Box3. */
  bounds: THREE.Box3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  category: ArenaColliderCategory;
  tags: readonly string[];
  object: THREE.Object3D;
  enabled: boolean;
}

export interface EnemySpawnPoint {
  id: string;
  position: THREE.Vector3;
  yaw: number;
  elevation: 'ground' | 'mid' | 'high';
  preferredFor: readonly ('grunt' | 'rusher' | 'heavy' | 'marksman')[];
}

export interface SupplyPoint {
  id: string;
  position: THREE.Vector3;
  kind: 'health' | 'ammo' | 'mixed';
  respawnSeconds: number;
}

export interface GrappleAnchor {
  id: string;
  position: THREE.Vector3;
  radius: number;
  strength: number;
  tags: readonly string[];
}

export interface ArenaLedge {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  outwardNormal: THREE.Vector3;
  height: number;
  lethalDrop: boolean;
}

export interface ArenaWaypoint {
  id: string;
  position: THREE.Vector3;
  neighbors: readonly string[];
  tags: readonly ('ground' | 'elevated' | 'stairs' | 'cover' | 'marksman')[];
}

type MutableWaypoint = Omit<ArenaWaypoint, 'neighbors'> & { neighbors: string[] };

export class ArenaWaypointGraph {
  readonly nodes: readonly ArenaWaypoint[];
  readonly byId: ReadonlyMap<string, ArenaWaypoint>;

  constructor(nodes: MutableWaypoint[]) {
    const frozenNodes = nodes.map((node) => ({
      ...node,
      position: node.position.clone(),
      neighbors: Object.freeze([...new Set(node.neighbors)]),
      tags: Object.freeze([...node.tags]),
    }));
    this.nodes = Object.freeze(frozenNodes);
    this.byId = new Map(frozenNodes.map((node) => [node.id, node]));
    this.assertValid();
  }

  get(id: string): ArenaWaypoint | undefined {
    return this.byId.get(id);
  }

  neighborsOf(id: string): readonly ArenaWaypoint[] {
    const node = this.byId.get(id);
    if (!node) return [];
    return node.neighbors
      .map((neighborId) => this.byId.get(neighborId))
      .filter((neighbor): neighbor is ArenaWaypoint => neighbor !== undefined);
  }

  nearest(position: THREE.Vector3, tag?: ArenaWaypoint['tags'][number]): ArenaWaypoint | undefined {
    let nearestNode: ArenaWaypoint | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.nodes) {
      if (tag && !node.tags.includes(tag)) continue;
      const distance = node.position.distanceToSquared(position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = node;
      }
    }
    return nearestNode;
  }

  private assertValid(): void {
    for (const node of this.nodes) {
      for (const neighborId of node.neighbors) {
        const neighbor = this.byId.get(neighborId);
        if (!neighbor) throw new Error(`Waypoint ${node.id} references missing neighbor ${neighborId}`);
        if (!neighbor.neighbors.includes(node.id)) {
          throw new Error(`Waypoint edge ${node.id} -> ${neighborId} is not bidirectional`);
        }
      }
    }
  }
}

export interface BreakableDamageResult {
  destroyed: boolean;
  remainingHealth: number;
  debris: readonly THREE.Object3D[];
}

type DebrisPiece = {
  visual: OutlinedMeshGroup;
  initialPosition: THREE.Vector3;
  initialQuaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
};

/** Orange, procedural wooden cover with deterministic lightweight debris motion. */
export class BreakableBarricade {
  readonly id: string;
  readonly root: THREE.Group;
  readonly collider: ArenaCollider;
  readonly raycastMeshes: readonly THREE.Mesh[];
  readonly maxHealth: number;
  health: number;
  broken = false;

  private readonly pieces: DebrisPiece[];
  private readonly activeRaycastMeshes: THREE.Mesh[];
  private brokenForSeconds = 0;

  constructor(
    id: string,
    root: THREE.Group,
    pieces: OutlinedMeshGroup[],
    collider: ArenaCollider,
    activeRaycastMeshes: THREE.Mesh[],
    maxHealth = 90,
  ) {
    this.id = id;
    this.root = root;
    this.collider = collider;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.activeRaycastMeshes = activeRaycastMeshes;
    this.raycastMeshes = Object.freeze(pieces.map((piece) => piece.mesh));
    this.pieces = pieces.map((visual) => ({
      visual,
      initialPosition: visual.position.clone(),
      initialQuaternion: visual.quaternion.clone(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
    }));
    for (const mesh of this.raycastMeshes) {
      mesh.userData.breakableId = id;
      mesh.userData.raycastDisabled = false;
    }
  }

  damage(amount: number, hitPoint?: THREE.Vector3, impulse?: THREE.Vector3): BreakableDamageResult {
    if (this.broken || amount <= 0) {
      return { destroyed: this.broken, remainingHealth: this.health, debris: this.pieces.map((piece) => piece.visual) };
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.break(hitPoint, impulse);
    return { destroyed: this.broken, remainingHealth: this.health, debris: this.pieces.map((piece) => piece.visual) };
  }

  takeDamage(amount: number, hitPoint?: THREE.Vector3, impulse?: THREE.Vector3): BreakableDamageResult {
    return this.damage(amount, hitPoint, impulse);
  }

  break(hitPoint?: THREE.Vector3, impulse = new THREE.Vector3(0, 0.4, -1)): void {
    if (this.broken) return;
    this.broken = true;
    this.health = 0;
    this.collider.enabled = false;
    this.brokenForSeconds = 0;
    const normalizedImpulse = impulse.lengthSq() > 1e-6
      ? impulse.clone().normalize()
      : new THREE.Vector3(0, 0.3, -1).normalize();
    const localHit = hitPoint ? this.root.worldToLocal(hitPoint.clone()) : new THREE.Vector3(0, 1, 0);

    this.pieces.forEach((piece, index) => {
      const away = piece.visual.position.clone().sub(localHit);
      if (away.lengthSq() < 1e-5) away.set(index % 2 ? 1 : -1, 0.35, index % 3 - 1);
      away.normalize();
      const variation = ((index * 37 + 11) % 17) / 17;
      piece.velocity.copy(normalizedImpulse).multiplyScalar(2.3 + variation * 1.7);
      piece.velocity.addScaledVector(away, 1.1 + variation);
      piece.velocity.y += 2.5 + variation * 2.1;
      piece.angularVelocity.set(
        1.8 + variation * 2.4,
        (index % 2 ? 1 : -1) * (1.1 + variation * 2.2),
        1.4 + (1 - variation) * 2.0,
      );
    });

    for (const mesh of this.raycastMeshes) {
      mesh.userData.raycastDisabled = true;
      const index = this.activeRaycastMeshes.indexOf(mesh);
      if (index >= 0) this.activeRaycastMeshes.splice(index, 1);
    }
  }

  update(deltaSeconds: number): void {
    if (!this.broken || !this.root.visible) return;
    const delta = Math.min(Math.max(deltaSeconds, 0), 1 / 20);
    this.brokenForSeconds += deltaSeconds;
    for (const piece of this.pieces) {
      piece.velocity.y -= 9.8 * delta;
      piece.velocity.multiplyScalar(Math.pow(0.985, delta * 60));
      piece.visual.position.addScaledVector(piece.velocity, delta);
      piece.visual.rotation.x += piece.angularVelocity.x * delta;
      piece.visual.rotation.y += piece.angularVelocity.y * delta;
      piece.visual.rotation.z += piece.angularVelocity.z * delta;
    }
    if (this.brokenForSeconds > 4.25) this.root.visible = false;
  }

  reset(): void {
    this.broken = false;
    this.health = this.maxHealth;
    this.collider.enabled = true;
    this.brokenForSeconds = 0;
    this.root.visible = true;
    for (const piece of this.pieces) {
      piece.visual.position.copy(piece.initialPosition);
      piece.visual.quaternion.copy(piece.initialQuaternion);
      piece.velocity.set(0, 0, 0);
      piece.angularVelocity.set(0, 0, 0);
    }
    this.root.updateWorldMatrix(true, true);
    this.collider.bounds.setFromObject(this.root, false);
    for (const mesh of this.raycastMeshes) {
      mesh.userData.raycastDisabled = false;
      if (!this.activeRaycastMeshes.includes(mesh)) this.activeRaycastMeshes.push(mesh);
    }
  }
}

export interface ArenaBuildResult {
  root: THREE.Group;
  colliders: ArenaCollider[];
  raycastMeshes: THREE.Mesh[];
  enemySpawnPoints: readonly EnemySpawnPoint[];
  /** Alias kept convenient for wave directors. */
  enemySpawns: readonly EnemySpawnPoint[];
  supplyPoints: readonly SupplyPoint[];
  grappleAnchors: readonly GrappleAnchor[];
  ledges: readonly ArenaLedge[];
  waypointGraph: ArenaWaypointGraph;
  breakables: readonly BreakableBarricade[];
  safePlayerSpawn: THREE.Vector3;
  killY: number;
  update(deltaSeconds: number): void;
  syncColliderBounds(): void;
  damageBreakable(
    id: string,
    amount: number,
    hitPoint?: THREE.Vector3,
    impulse?: THREE.Vector3,
  ): BreakableDamageResult | undefined;
  resetBreakables(): void;
  dispose(): void;
}

export interface ArenaBuilderOptions {
  outlineIrregularity?: number;
  outlineOpacity?: number;
  hatchScale?: number;
  hatchStrength?: number;
  seed?: number;
}

type ArenaMaterialName = 'paper' | 'shade' | 'lavender' | 'orange' | 'green' | 'red' | 'deep' | 'sky';

const INK_STYLE_ACTIVE = ACTIVE_VISUAL_STYLE === 'ink';

const SCOUT_PATROL_DURATION_SECONDS = 32;
const SCOUT_PATROL_PHASE = 0.26;
const SCOUT_PATROL_POINTS = [
  new THREE.Vector3(-15, 13.2, -33),
  new THREE.Vector3(-6, 14.9, -43),
  new THREE.Vector3(6, 15.5, -40),
  new THREE.Vector3(15, 13.8, -24),
  new THREE.Vector3(16, 12.8, -2),
  new THREE.Vector3(8, 14.1, 12),
  new THREE.Vector3(-6, 15, 15),
  new THREE.Vector3(-15, 13, -4),
] as const;

function deterministicNameVariant(value: string, variants = 6): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % variants;
}

type AddBoxOptions = {
  collider?: ArenaColliderCategory | false;
  raycast?: boolean;
  tags?: readonly string[];
  rotation?: THREE.Euler;
};

class ArenaAssembler {
  readonly root = new THREE.Group();
  readonly colliders: ArenaCollider[] = [];
  readonly raycastMeshes: THREE.Mesh[] = [];
  readonly enemySpawnPoints: EnemySpawnPoint[] = [];
  readonly supplyPoints: SupplyPoint[] = [];
  readonly grappleAnchors: GrappleAnchor[] = [];
  readonly ledges: ArenaLedge[] = [];
  readonly breakables: BreakableBarricade[] = [];

  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly outlinedMeshes: OutlinedMeshGroup[] = [];
  private readonly materials: Record<ArenaMaterialName, DoodleMaterial>;
  private readonly options: Required<ArenaBuilderOptions>;
  private readonly scoutPatrol = new THREE.CatmullRomCurve3(
    SCOUT_PATROL_POINTS.map((point) => point.clone()),
    true,
    'centripetal',
    0.34,
  );
  private readonly scoutPosition = new THREE.Vector3();
  private readonly scoutTangent = new THREE.Vector3();
  private readonly scoutAheadTangent = new THREE.Vector3();
  private readonly scoutLookTarget = new THREE.Vector3();
  private scoutAircraft: THREE.Group | null = null;
  private scoutFlightSeconds = 0;
  private disposed = false;
  private groundWashMaterial: THREE.MeshBasicMaterial | null = null;

  constructor(options: ArenaBuilderOptions) {
    this.options = {
      outlineIrregularity: options.outlineIrregularity ?? 0.012,
      outlineOpacity: options.outlineOpacity ?? 0.93,
      hatchScale: options.hatchScale ?? 6.25,
      hatchStrength: options.hatchStrength ?? 0.86,
      seed: options.seed ?? 2095684248,
    };
    const common = {
      paperColor: DOODLE_PALETTE.paper,
      inkColor: DOODLE_PALETTE.ink,
      shadowColor: DOODLE_PALETTE.darkInk,
      hatchScale: this.options.hatchScale,
      hatchStrength: this.options.hatchStrength,
      hatchVariation: 0.92,
      grainStrength: 0.58,
      visualStyle: ACTIVE_VISUAL_STYLE,
      patternSpace: 'world' as const,
      absorptionScale: 0.26,
      dryBrushStrength: 0.34,
      granulationStrength: 0.16,
    };
    this.materials = {
      paper: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.paperLight, seed: 0.3, hatchAngle: 0.02, washStrength: 0.76 }),
      shade: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.paperShade, seed: 1.7, hatchScale: this.options.hatchScale * 0.94, hatchStrength: 0.96, hatchAngle: -0.05, washStrength: 0.92 }),
      lavender: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.lavender, seed: 2.9, hatchScale: this.options.hatchScale * 0.97, hatchStrength: 1.0, hatchAngle: 0.08, washStrength: 0.96 }),
      orange: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.orange, seed: 4.1, hatchScale: this.options.hatchScale * 1.06, hatchStrength: 0.7, hatchAngle: -0.12, washStrength: 0.82 }),
      green: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.green, seed: 5.3, hatchScale: this.options.hatchScale * 1.03, hatchStrength: 0.65, hatchAngle: 0.15, washStrength: 0.78 }),
      red: new DoodleMaterial({ ...common, surfaceColor: DOODLE_PALETTE.red, seed: 6.7, hatchScale: this.options.hatchScale * 1.02, hatchStrength: 0.64, hatchAngle: -0.16, washStrength: 0.92 }),
      deep: new DoodleMaterial({ ...common, surfaceColor: INK_STYLE_ACTIVE ? DOODLE_PALETTE.softInk : 0xc9cbe0, seed: 7.9, hatchScale: this.options.hatchScale * 0.82, hatchStrength: 1.16, hatchAngle: 0.11, washStrength: 1.14, dryBrushStrength: 0.46 }),
      sky: new DoodleMaterial({
        ...common,
        surfaceColor: INK_STYLE_ACTIVE ? DOODLE_PALETTE.lavender : 0xc7cadd,
        seed: 8.6,
        hatchScale: this.options.hatchScale * 0.74,
        hatchStrength: 1.16,
        hatchAngle: -0.07,
        washStrength: 0.72,
        dryBrushStrength: 0.24,
        patternSpace: 'object',
        side: THREE.DoubleSide,
      }),
    };
    this.root.name = 'doodle-construction-arena';
  }

  build(): ArenaBuildResult {
    this.buildGroundAndPerimeter();
    this.buildScaffold();
    this.buildWindowedBuildings();
    this.buildElevatedWalkways();
    this.buildCrane();
    this.buildScoutAircraft();
    this.buildGroundProps();
    this.buildBreakables();
    this.buildGameplayMarkers();
    const waypointGraph = this.buildWaypointGraph();
    this.root.updateWorldMatrix(true, true);

    const result: ArenaBuildResult = {
      root: this.root,
      colliders: this.colliders,
      raycastMeshes: this.raycastMeshes,
      enemySpawnPoints: Object.freeze(this.enemySpawnPoints),
      enemySpawns: Object.freeze(this.enemySpawnPoints),
      supplyPoints: Object.freeze(this.supplyPoints),
      grappleAnchors: Object.freeze(this.grappleAnchors),
      ledges: Object.freeze(this.ledges),
      waypointGraph,
      breakables: Object.freeze(this.breakables),
      safePlayerSpawn: new THREE.Vector3(2, 0.32, 4.5),
      killY: -9,
      update: (deltaSeconds) => {
        for (const breakable of this.breakables) breakable.update(deltaSeconds);
        this.updateScoutAircraft(deltaSeconds);
      },
      syncColliderBounds: () => this.syncColliderBounds(),
      damageBreakable: (id, amount, hitPoint, impulse) => {
        const breakable = this.breakables.find((candidate) => candidate.id === id);
        return breakable?.damage(amount, hitPoint, impulse);
      },
      resetBreakables: () => {
        for (const breakable of this.breakables) breakable.reset();
      },
      dispose: () => this.dispose(),
    };
    return result;
  }

  private geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const cached = this.geometries.get(key);
    if (cached) return cached;
    const geometry = create();
    geometry.name = `arena-${key}`;
    this.geometries.set(key, geometry);
    return geometry;
  }

  private addOutlined(
    parent: THREE.Object3D,
    id: string,
    geometry: THREE.BufferGeometry,
    materialName: ArenaMaterialName,
    position: THREE.Vector3,
    rotation?: THREE.Euler,
    raycast = false,
  ): OutlinedMeshGroup {
    const denseDetail = /(?:rail|step|brace|window|pillar|column|cross|accent)/.test(id);
    const majorMass = /(?:perimeter|ground|floor|roof|mass|bridge|walk|deck|wall|crate)/.test(id);
    const v4LineWeight = ACTIVE_INK_VERSION === 'v5'
      ? denseDetail ? 0.016 : majorMass ? 0.065 : 0.09
      : denseDetail ? 0.035 : majorMass ? 0.095 : 0.14;
    const textureInk = ACTIVE_INK_VERSION === 'v4' || ACTIVE_INK_VERSION === 'v5';
    const lineOpacity = INK_STYLE_ACTIVE && textureInk
      ? this.options.outlineOpacity * v4LineWeight * (inkUniforms.outlineStrength.value > 0 ? 1 : 0)
      : this.options.outlineOpacity;
    const visual = createOutlinedMesh(geometry, this.materials[materialName], {
      color: DOODLE_PALETTE.ink,
      opacity: lineOpacity,
      irregularity: this.options.outlineIrregularity,
      irregularitySeed: (this.options.seed % 997) + deterministicNameVariant(id) * 17.37,
      segmentLength: 0.58,
      doubleStroke: !(INK_STYLE_ACTIVE && textureInk),
      doubleStrokeOffset: INK_STYLE_ACTIVE
        ? Math.max(0.006, this.options.outlineIrregularity * 0.45)
        : Math.max(0.01, this.options.outlineIrregularity * 0.78),
      ghostOpacity: INK_STYLE_ACTIVE ? 0.15 : 0.4,
      visualStyle: ACTIVE_VISUAL_STYLE,
      primaryOpacityVariation: INK_STYLE_ACTIVE ? 0.36 : 0,
      primaryBreakup: INK_STYLE_ACTIVE
        ? textureInk ? (denseDetail ? 0.28 : 0.16) : 0.08
        : 0,
      thresholdAngle: INK_STYLE_ACTIVE && textureInk ? 34 : 20,
      name: id,
    });
    visual.position.copy(position);
    if (rotation) visual.rotation.copy(rotation);
    visual.mesh.userData.arenaId = id;
    visual.mesh.userData.raycastDisabled = !raycast;
    parent.add(visual);
    this.outlinedMeshes.push(visual);
    if (raycast) this.raycastMeshes.push(visual.mesh);
    return visual;
  }

  private addBox(
    parent: THREE.Object3D,
    id: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    materialName: ArenaMaterialName,
    options: AddBoxOptions = {},
  ): OutlinedMeshGroup {
    const key = `box-${size.x.toFixed(3)}-${size.y.toFixed(3)}-${size.z.toFixed(3)}`;
    const geometry = this.geometry(key, () => new THREE.BoxGeometry(size.x, size.y, size.z));
    const shouldRaycast = options.raycast ?? options.collider !== false;
    const visual = this.addOutlined(parent, id, geometry, materialName, position, options.rotation, shouldRaycast);
    if (options.collider) {
      this.addCollider(id, visual.mesh, options.collider, options.tags ?? []);
    }
    return visual;
  }

  private addCylinderBetween(
    parent: THREE.Object3D,
    id: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    materialName: ArenaMaterialName,
    raycast = false,
    collider: ArenaColliderCategory | false = false,
    segments = 8,
  ): OutlinedMeshGroup {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const key = `cylinder-${radius.toFixed(3)}-${length.toFixed(3)}-${segments}`;
    const geometry = this.geometry(key, () => new THREE.CylinderGeometry(radius, radius, length, segments, 1, false));
    const visual = this.addOutlined(
      parent,
      id,
      geometry,
      materialName,
      start.clone().add(end).multiplyScalar(0.5),
      undefined,
      raycast || collider !== false,
    );
    visual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    if (collider) this.addCollider(id, visual.mesh, collider, []);
    return visual;
  }

  private addCollider(
    id: string,
    object: THREE.Object3D,
    category: ArenaColliderCategory,
    tags: readonly string[],
  ): ArenaCollider {
    object.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(object, false);
    const collider: ArenaCollider = {
      id: `collider-${id}`,
      bounds,
      min: bounds.min,
      max: bounds.max,
      category,
      tags: Object.freeze([...tags]),
      object,
      enabled: true,
    };
    object.userData.colliderId = collider.id;
    this.colliders.push(collider);
    return collider;
  }

  private addRail(
    parent: THREE.Object3D,
    id: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    baseY: number,
    materialName: ArenaMaterialName,
    posts = 8,
  ): void {
    const lowerStart = start.clone().setY(baseY + 0.48);
    const lowerEnd = end.clone().setY(baseY + 0.48);
    const topStart = start.clone().setY(baseY + 0.96);
    const topEnd = end.clone().setY(baseY + 0.96);
    this.addCylinderBetween(parent, `${id}-lower`, lowerStart, lowerEnd, 0.035, materialName);
    this.addCylinderBetween(parent, `${id}-top`, topStart, topEnd, 0.045, materialName);
    for (let index = 0; index <= posts; index += 1) {
      const point = start.clone().lerp(end, index / posts);
      this.addCylinderBetween(
        parent,
        `${id}-post-${index}`,
        new THREE.Vector3(point.x, baseY, point.z),
        new THREE.Vector3(point.x, baseY + 1, point.z),
        0.034,
        materialName,
      );
    }
  }

  private addStairFlight(
    parent: THREE.Object3D,
    id: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    steps = 13,
    materialName: ArenaMaterialName = 'paper',
  ): void {
    const horizontal = end.clone().sub(start).setY(0);
    const runLength = horizontal.length();
    const direction = horizontal.clone().normalize();
    const yaw = Math.atan2(direction.x, direction.z);
    const treadDepth = (runLength / steps) * 1.18;
    for (let index = 0; index < steps; index += 1) {
      const horizontalT = (index + 0.5) / steps;
      const topT = (index + 1) / steps;
      const position = start.clone().lerp(end, horizontalT);
      position.y = THREE.MathUtils.lerp(start.y, end.y, topT) - 0.09;
      this.addBox(
        parent,
        `${id}-step-${index}`,
        new THREE.Vector3(width, 0.18, treadDepth),
        position,
        index % 2 === 0 ? materialName : 'shade',
        { collider: 'step', tags: ['stairs', id], rotation: new THREE.Euler(0, yaw, 0) },
      );
    }

    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(width * 0.48);
    for (const [sideIndex, sign] of [-1, 1].entries()) {
      const offset = perpendicular.clone().multiplyScalar(sign);
      const railStart = start.clone().add(offset).add(new THREE.Vector3(0, 0.88, 0));
      const railEnd = end.clone().add(offset).add(new THREE.Vector3(0, 0.88, 0));
      this.addCylinderBetween(parent, `${id}-rail-${sideIndex}`, railStart, railEnd, 0.045, 'paper');
      for (let post = 0; post <= 4; post += 1) {
        const low = start.clone().lerp(end, post / 4).add(offset);
        const high = low.clone().add(new THREE.Vector3(0, 0.9, 0));
        this.addCylinderBetween(parent, `${id}-rail-${sideIndex}-post-${post}`, low, high, 0.032, 'paper');
      }
    }
  }

  private buildGroundAndPerimeter(): void {
    const group = new THREE.Group();
    group.name = 'arena-ground-and-perimeter';
    this.root.add(group);
    const ground = this.addBox(group, 'main-ground', new THREE.Vector3(72, 0.35, 78), new THREE.Vector3(0, -0.175, -7), 'paper', {
      collider: 'ground',
      tags: ['safe-floor'],
    });
    if (INK_STYLE_ACTIVE && ACTIVE_INK_VERSION === 'v5') {
      this.groundWashMaterial = new THREE.MeshBasicMaterial({
        name: 'pale-ink-earth',
        map: getInkAtmosphereTexture('ground'),
        color: 0xffffff,
        fog: true,
      });
      ground.mesh.material = this.groundWashMaterial;
    }
    this.addBox(group, 'rear-perimeter', new THREE.Vector3(72, 7.2, 0.55), new THREE.Vector3(0, 3.6, -46), 'deep', {
      collider: 'wall',
      tags: ['perimeter'],
    });
    this.addBox(group, 'right-perimeter', new THREE.Vector3(0.55, 7.2, 78), new THREE.Vector3(35.75, 3.6, -7), 'deep', {
      collider: 'wall',
      tags: ['perimeter'],
    });
    this.addBox(group, 'left-perimeter-rear', new THREE.Vector3(0.55, 5.4, 78), new THREE.Vector3(-35.75, 2.7, -7), 'lavender', {
      collider: 'wall',
      tags: ['perimeter'],
    });
    this.addBox(group, 'front-safety-wall', new THREE.Vector3(72, 1.1, 0.55), new THREE.Vector3(0, 0.55, 31.75), 'shade', {
      collider: 'wall',
      tags: ['perimeter', 'fall-protection'],
    });
  }

  private buildScaffold(): void {
    const group = new THREE.Group();
    group.name = 'four-level-open-scaffold';
    this.root.add(group);
    const floorY = [0.1, 2.6, 5.1, 7.6];

    for (const x of [-10, -5, 0]) {
      for (const z of [-18, -13, -8]) {
        this.addBox(group, `scaffold-column-${x}-${z}`, new THREE.Vector3(0.34, 8.85, 0.34), new THREE.Vector3(x, 4.425, z), 'lavender', {
          collider: 'column',
          tags: ['scaffold'],
        });
      }
    }
    floorY.forEach((y, level) => {
      this.addBox(group, `scaffold-floor-${level}`, new THREE.Vector3(10.35, 0.22, 10.35), new THREE.Vector3(-5, y, -13), level === 0 ? 'shade' : 'paper', {
        collider: 'platform',
        tags: ['scaffold', `level-${level}`],
      });
      if (level > 0) {
        this.addRail(group, `scaffold-${level}-front-rail`, new THREE.Vector3(-9.9, y + 0.11, -7.78), new THREE.Vector3(-0.1, y + 0.11, -7.78), y + 0.11, 'paper', 12);
        this.addRail(group, `scaffold-${level}-west-rail`, new THREE.Vector3(-10.18, y + 0.11, -17.8), new THREE.Vector3(-10.18, y + 0.11, -8.1), y + 0.11, 'paper', 10);
      }
    });

    for (let level = 0; level < 3; level += 1) {
      const low = floorY[level] + 0.11;
      const high = floorY[level + 1] + 0.11;
      const starts = [
        new THREE.Vector3(-10.6, low, -6.95),
        new THREE.Vector3(-5.35, low, -6.95),
        new THREE.Vector3(-0.65, low, -6.95),
      ];
      const ends = [
        new THREE.Vector3(-5.7, high, -6.95),
        new THREE.Vector3(-0.65, high, -6.95),
        new THREE.Vector3(-5.35, high, -6.95),
      ];
      this.addStairFlight(group, `scaffold-flight-${level}`, starts[level], ends[level], 1.42, 13);
    }

    for (const z of [-18.02, -12.98, -7.98]) {
      for (let bay = 0; bay < 2; bay += 1) {
        const x0 = -9.8 + bay * 5;
        const x1 = -5.2 + bay * 5;
        this.addCylinderBetween(group, `scaffold-brace-${z}-${bay}-a`, new THREE.Vector3(x0, 0.3, z), new THREE.Vector3(x1, 7.45, z), 0.045, 'lavender');
        this.addCylinderBetween(group, `scaffold-brace-${z}-${bay}-b`, new THREE.Vector3(x1, 0.3, z), new THREE.Vector3(x0, 7.45, z), 0.045, 'lavender');
      }
    }
  }

  private buildWindowedBuilding(
    id: string,
    center: THREE.Vector3,
    width: number,
    depth: number,
    height: number,
    materialName: ArenaMaterialName,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = id;
    this.root.add(group);
    const wall = 0.3;
    const frontZ = center.z + depth / 2;
    const backZ = center.z - depth / 2;
    const leftX = center.x - width / 2;
    const rightX = center.x + width / 2;

    this.addBox(group, `${id}-floor`, new THREE.Vector3(width, 0.22, depth), new THREE.Vector3(center.x, 0.11, center.z), 'shade', {
      collider: 'platform', tags: [id, 'interior'],
    });
    this.addBox(group, `${id}-roof`, new THREE.Vector3(width + 0.3, 0.25, depth + 0.3), new THREE.Vector3(center.x, height + 0.125, center.z), 'paper', {
      collider: 'platform', tags: [id, 'roof'],
    });

    const doorWidth = Math.min(1.45, width * 0.22);
    const doorLeft = rightX - wall - doorWidth;
    const headerBottom = Math.min(2.4, height * 0.67);
    const windowZoneRight = doorLeft - 0.35;
    const windowZoneWidth = windowZoneRight - (leftX + wall);
    const centerPillarX = leftX + wall + windowZoneWidth * 0.5;
    const sillHeight = 0.72;

    this.addBox(group, `${id}-front-header`, new THREE.Vector3(width, height - headerBottom, wall), new THREE.Vector3(center.x, headerBottom + (height - headerBottom) / 2, frontZ), materialName, {
      collider: 'wall', tags: [id, 'facade'],
    });
    this.addBox(group, `${id}-front-sill`, new THREE.Vector3(windowZoneWidth, sillHeight, wall), new THREE.Vector3(leftX + wall + windowZoneWidth / 2, sillHeight / 2, frontZ), materialName, {
      collider: 'wall', tags: [id, 'window-sill'],
    });
    for (const [name, x] of [
      ['left', leftX + wall / 2],
      ['middle', centerPillarX],
      ['door', doorLeft - wall / 2],
      ['right', rightX - wall / 2],
    ] as const) {
      const bottom = name === 'middle' ? sillHeight : 0;
      this.addBox(group, `${id}-front-${name}-pillar`, new THREE.Vector3(wall, headerBottom - bottom, wall), new THREE.Vector3(x, bottom + (headerBottom - bottom) / 2, frontZ), materialName, {
        collider: 'wall', tags: [id, name === 'door' ? 'door-frame' : 'window-frame'],
      });
    }

    this.addBox(group, `${id}-back-sill`, new THREE.Vector3(width, sillHeight, wall), new THREE.Vector3(center.x, sillHeight / 2, backZ), materialName, {
      collider: 'wall', tags: [id, 'window-sill'],
    });
    this.addBox(group, `${id}-back-header`, new THREE.Vector3(width, height - headerBottom, wall), new THREE.Vector3(center.x, headerBottom + (height - headerBottom) / 2, backZ), materialName, {
      collider: 'wall', tags: [id, 'facade'],
    });
    for (const x of [leftX + wall / 2, center.x, rightX - wall / 2]) {
      this.addBox(group, `${id}-back-pillar-${x}`, new THREE.Vector3(wall, headerBottom - sillHeight, wall), new THREE.Vector3(x, sillHeight + (headerBottom - sillHeight) / 2, backZ), materialName, {
        collider: 'wall', tags: [id, 'window-frame'],
      });
    }

    for (const [side, x] of [['left', leftX], ['right', rightX]] as const) {
      this.addBox(group, `${id}-${side}-lower`, new THREE.Vector3(wall, sillHeight, depth), new THREE.Vector3(x, sillHeight / 2, center.z), materialName, {
        collider: 'wall', tags: [id, 'window-sill'],
      });
      this.addBox(group, `${id}-${side}-upper`, new THREE.Vector3(wall, height - headerBottom, depth), new THREE.Vector3(x, headerBottom + (height - headerBottom) / 2, center.z), materialName, {
        collider: 'wall', tags: [id, 'facade'],
      });
      for (const z of [frontZ - wall / 2, center.z, backZ + wall / 2]) {
        this.addBox(group, `${id}-${side}-pillar-${z}`, new THREE.Vector3(wall, headerBottom - sillHeight, wall), new THREE.Vector3(x, sillHeight + (headerBottom - sillHeight) / 2, z), materialName, {
          collider: 'wall', tags: [id, 'window-frame'],
        });
      }
    }

    this.addBox(group, `${id}-door-left-accent`, new THREE.Vector3(0.08, 2.25, 0.1), new THREE.Vector3(doorLeft, 1.125, frontZ + 0.19), 'green', { raycast: true });
    this.addBox(group, `${id}-door-right-accent`, new THREE.Vector3(0.08, 2.25, 0.1), new THREE.Vector3(rightX - wall, 1.125, frontZ + 0.19), 'green', { raycast: true });
    this.addBox(group, `${id}-door-top-accent`, new THREE.Vector3(doorWidth, 0.08, 0.1), new THREE.Vector3((doorLeft + rightX - wall) / 2, 2.25, frontZ + 0.19), 'green', { raycast: true });

    const roofY = height + 0.25;
    this.addRail(group, `${id}-roof-front-rail`, new THREE.Vector3(leftX, roofY, frontZ), new THREE.Vector3(rightX, roofY, frontZ), roofY, 'paper', 8);
    this.addRail(group, `${id}-roof-back-rail`, new THREE.Vector3(leftX, roofY, backZ), new THREE.Vector3(rightX, roofY, backZ), roofY, 'paper', 8);
    return group;
  }

  private buildWindowedBuildings(): void {
    this.buildWindowedBuilding('west-yard-building', new THREE.Vector3(-28.2, 0, -4.5), 10.4, 11.5, 5.25, 'lavender');
    this.buildUpperStorey('west-yard-upper', new THREE.Vector3(-28.2, 5.5, -9), 9.1, 3, 2.7, 'lavender');
    this.addStairFlight(
      this.root,
      'west-yard-roof-stairs',
      new THREE.Vector3(-22.45, 0.18, 0.1),
      new THREE.Vector3(-22.45, 5.5, -7.2),
      1.55,
      20,
    );

    this.buildWindowedBuilding('utility-roof-building', new THREE.Vector3(11.7, 0, -14), 7.4, 7.2, 4.95, 'deep');
    this.buildUpperStorey('utility-roof-upper', new THREE.Vector3(11.7, 5.2, -16), 6.4, 3, 2.7, 'deep');
    this.addStairFlight(
      this.root,
      'utility-exterior-stairs',
      new THREE.Vector3(15.75, 0.18, -9.6),
      new THREE.Vector3(15.75, 5.2, -15.9),
      1.55,
      18,
    );

    this.buildWindowedBuilding('site-office-building', new THREE.Vector3(22, 0, -1.8), 7.2, 6.4, 3.45, 'lavender');
    this.buildUpperStorey('site-office-upper', new THREE.Vector3(22, 3.7, -3.8), 6.4, 2.3, 4.2, 'lavender');
    this.addStairFlight(
      this.root,
      'office-roof-stairs',
      new THREE.Vector3(26.05, 0.18, 1.1),
      new THREE.Vector3(26.05, 3.72, -3.5),
      1.45,
      15,
    );
  }

  private buildUpperStorey(
    id: string,
    baseCenter: THREE.Vector3,
    width: number,
    depth: number,
    height: number,
    material: ArenaMaterialName,
  ): void {
    const group = new THREE.Group();
    group.name = id;
    this.root.add(group);
    const center = baseCenter.clone().add(new THREE.Vector3(0, height / 2, 0));
    this.addBox(group, `${id}-mass`, new THREE.Vector3(width, height, depth), center, material, {
      collider: 'wall',
      tags: ['upper-storey', 'facade'],
    });
    this.addBox(
      group,
      `${id}-roof`,
      new THREE.Vector3(width + 0.3, 0.24, depth + 0.3),
      new THREE.Vector3(baseCenter.x, baseCenter.y + height + 0.12, baseCenter.z),
      'paper',
      { collider: 'platform', tags: ['upper-storey', 'roof'] },
    );
    const frontZ = baseCenter.z + depth / 2 + 0.018;
    const windowCount = width > 8 ? 4 : 3;
    for (let index = 0; index < windowCount; index += 1) {
      const x = baseCenter.x + (index - (windowCount - 1) / 2) * (width / (windowCount + 0.6));
      this.addBox(
        group,
        `${id}-window-${index + 1}`,
        new THREE.Vector3(width / (windowCount + 2.2), Math.min(1.05, height * 0.28), 0.055),
        new THREE.Vector3(x, baseCenter.y + height * 0.54, frontZ),
        'shade',
        { raycast: true },
      );
    }
    const roofY = baseCenter.y + height + 0.24;
    this.addRail(
      group,
      `${id}-roof-rail`,
      new THREE.Vector3(baseCenter.x - width / 2, roofY, baseCenter.z + depth / 2),
      new THREE.Vector3(baseCenter.x + width / 2, roofY, baseCenter.z + depth / 2),
      roofY,
      'paper',
      Math.max(6, Math.round(width)),
    );
  }

  private buildElevatedWalkways(): void {
    const group = new THREE.Group();
    group.name = 'elevated-walkways';
    this.root.add(group);

    this.addBox(group, 'scaffold-utility-bridge', new THREE.Vector3(8.25, 0.2, 2.2), new THREE.Vector3(4.05, 5.13, -15.1), 'paper', {
      collider: 'platform', tags: ['bridge', 'level-2'],
    });
    this.addRail(group, 'scaffold-utility-bridge-north', new THREE.Vector3(-0.05, 5.23, -16.18), new THREE.Vector3(8.15, 5.23, -16.18), 5.23, 'paper', 10);

    this.addBox(group, 'far-left-orange-walk', new THREE.Vector3(24.2, 0.24, 1.55), new THREE.Vector3(-22.2, 7.62, -15.1), 'orange', {
      collider: 'platform', tags: ['bridge', 'high-route'],
    });
    this.addRail(group, 'far-left-orange-rail', new THREE.Vector3(-34.2, 7.75, -14.32), new THREE.Vector3(-10.25, 7.75, -14.32), 7.75, 'orange', 24);
    this.addStairFlight(
      group,
      'far-left-return-stairs',
      new THREE.Vector3(-34.0, 0.18, -8.2),
      new THREE.Vector3(-34.0, 7.75, -14.3),
      1.5,
      27,
      'orange',
    );

    this.addBox(group, 'office-service-catwalk', new THREE.Vector3(7.3, 0.2, 1.4), new THREE.Vector3(15.0, 3.65, -5.4), 'shade', {
      collider: 'platform', tags: ['bridge', 'mid-route'],
    });
    this.addRail(group, 'office-service-rail', new THREE.Vector3(11.4, 3.76, -6.1), new THREE.Vector3(18.6, 3.76, -6.1), 3.76, 'paper', 9);
    this.addStairFlight(
      group,
      'service-catwalk-return',
      new THREE.Vector3(11.45, 0.18, -3.4),
      new THREE.Vector3(11.45, 3.76, -5.35),
      1.35,
      16,
    );

    this.addBox(group, 'rear-transit-deck', new THREE.Vector3(58, 0.3, 6.2), new THREE.Vector3(0, 5.12, -32.2), 'deep', {
      collider: 'platform', tags: ['bridge', 'long-route', 'undercroft'],
    });
    this.addRail(group, 'rear-transit-deck-south-rail', new THREE.Vector3(-28.8, 5.28, -29.05), new THREE.Vector3(28.8, 5.28, -29.05), 5.28, 'paper', 18);
    this.addBox(group, 'scaffold-rear-link', new THREE.Vector3(1.65, 0.22, 11.2), new THREE.Vector3(-5, 5.13, -23.55), 'paper', {
      collider: 'platform', tags: ['bridge', 'level-2', 'rear-link'],
    });
    this.addRail(group, 'scaffold-rear-link-west', new THREE.Vector3(-5.82, 5.24, -18.05), new THREE.Vector3(-5.82, 5.24, -29.05), 5.24, 'paper', 8);
    this.addRail(group, 'scaffold-rear-link-east', new THREE.Vector3(-4.18, 5.24, -18.05), new THREE.Vector3(-4.18, 5.24, -29.05), 5.24, 'paper', 8);
    for (let index = 0; index < 9; index += 1) {
      const x = -28 + index * 7;
      for (const z of [-34.4, -30]) {
        this.addBox(group, `rear-transit-column-${index}-${z}`, new THREE.Vector3(0.46, 5.12, 0.46), new THREE.Vector3(x, 2.56, z), index % 2 ? 'lavender' : 'shade', {
          collider: 'column', tags: ['undercroft', 'support'],
        });
      }
    }
    this.addStairFlight(
      group,
      'rear-transit-east-stairs',
      new THREE.Vector3(29.3, 0.18, -24.9),
      new THREE.Vector3(29.3, 5.28, -29.2),
      1.55,
      20,
    );
    this.addStairFlight(
      group,
      'rear-transit-west-stairs',
      new THREE.Vector3(-29.3, 0.18, -24.9),
      new THREE.Vector3(-29.3, 5.28, -29.2),
      1.55,
      20,
    );
  }

  private buildCrane(): void {
    const group = new THREE.Group();
    group.name = 'construction-crane';
    this.root.add(group);
    const mastCenter = new THREE.Vector3(-5.8, 6.4, -22.2);
    for (const x of [-0.55, 0.55]) {
      for (const z of [-0.55, 0.55]) {
        this.addCylinderBetween(
          group,
          `crane-mast-${x}-${z}`,
          new THREE.Vector3(mastCenter.x + x, 0.2, mastCenter.z + z),
          new THREE.Vector3(mastCenter.x + x, 12.7, mastCenter.z + z),
          0.11,
          'orange',
          true,
          'column',
          8,
        );
      }
    }
    for (let level = 0; level < 7; level += 1) {
      const y0 = 0.5 + level * 1.75;
      const y1 = y0 + 1.55;
      this.addCylinderBetween(group, `crane-cross-a-${level}`, new THREE.Vector3(-6.35, y0, -21.65), new THREE.Vector3(-5.25, y1, -21.65), 0.055, 'orange');
      this.addCylinderBetween(group, `crane-cross-b-${level}`, new THREE.Vector3(-5.25, y0, -21.65), new THREE.Vector3(-6.35, y1, -21.65), 0.055, 'orange');
    }
    this.addBox(group, 'crane-boom', new THREE.Vector3(27, 0.34, 0.42), new THREE.Vector3(-0.5, 13.05, -22.2), 'orange', {
      collider: 'platform', tags: ['crane', 'grapple-only'],
    });
    this.addCylinderBetween(group, 'crane-boom-top-brace-a', new THREE.Vector3(-5.8, 14.9, -22.2), new THREE.Vector3(13, 13.25, -22.2), 0.065, 'orange');
    this.addCylinderBetween(group, 'crane-boom-top-brace-b', new THREE.Vector3(-5.8, 14.9, -22.2), new THREE.Vector3(-14, 13.25, -22.2), 0.065, 'orange');
    this.addCylinderBetween(group, 'crane-hook-cable', new THREE.Vector3(7.2, 12.9, -22.2), new THREE.Vector3(7.2, 6.2, -22.2), 0.032, 'deep', true);
    const hookGeometry = this.geometry('crane-hook-torus', () => new THREE.TorusGeometry(0.32, 0.075, 8, 18, Math.PI * 1.55));
    this.addOutlined(group, 'crane-hook', hookGeometry, 'orange', new THREE.Vector3(7.2, 5.95, -22.2), new THREE.Euler(0, 0, -0.42), true);
  }

  /**
   * A single folded-paper scout aircraft patrols above the roofs. The reference
   * reads as a cross-hatched paper dart rather than a mechanical quadcopter, so
   * the five panels below make the folds and changing bank angle do the work.
   */
  private buildScoutAircraft(): void {
    const aircraft = new THREE.Group();
    aircraft.name = 'sky-scout-aircraft';
    aircraft.userData.raycastDisabled = true;
    aircraft.userData.nonInteractive = true;
    aircraft.userData.referenceSilhouette = 'folded-paper-scout';
    aircraft.userData.patrolDirection = 'clockwise';
    aircraft.userData.patrolDurationSeconds = SCOUT_PATROL_DURATION_SECONDS;
    aircraft.userData.patrolPathLength = this.scoutPatrol.getLength();
    aircraft.userData.averageSpeed = this.scoutPatrol.getLength() / SCOUT_PATROL_DURATION_SECONDS;
    this.root.add(aircraft);
    this.scoutAircraft = aircraft;

    const nose = new THREE.Vector3(0, 0.035, 1.12);
    const leftTail = new THREE.Vector3(-0.76, -0.035, -0.75);
    const rightTail = new THREE.Vector3(0.76, -0.035, -0.75);
    const spineTail = new THREE.Vector3(0, 0.23, -0.68);
    const bellyTail = new THREE.Vector3(0, -0.13, -0.72);
    const panels: ReadonlyArray<readonly [string, THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
      ['left-upper', nose, leftTail, spineTail],
      ['right-upper', nose, spineTail, rightTail],
      ['left-underfold', nose, bellyTail, leftTail],
      ['right-underfold', nose, rightTail, bellyTail],
      ['centre-keel', nose, spineTail, bellyTail],
    ];

    for (const [name, a, b, c] of panels) {
      const geometry = this.geometry(`scout-${name}`, () => {
        const panel = new THREE.BufferGeometry();
        panel.setAttribute('position', new THREE.Float32BufferAttribute([
          a.x, a.y, a.z,
          b.x, b.y, b.z,
          c.x, c.y, c.z,
        ], 3));
        panel.computeVertexNormals();
        panel.computeBoundingSphere();
        return panel;
      });
      const visual = this.addOutlined(
        aircraft,
        `sky-scout-${name}`,
        geometry,
        'sky',
        new THREE.Vector3(),
        undefined,
        false,
      );
      visual.mesh.userData.nonInteractive = true;
      visual.outline.userData.nonInteractive = true;
      visual.outline.userData.raycastDisabled = true;
    }

    this.updateScoutAircraft(0);
  }

  private updateScoutAircraft(deltaSeconds: number): void {
    const aircraft = this.scoutAircraft;
    if (!aircraft) return;
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.scoutFlightSeconds = (
        this.scoutFlightSeconds + deltaSeconds
      ) % SCOUT_PATROL_DURATION_SECONDS;
    }

    const progress = (
      SCOUT_PATROL_PHASE + this.scoutFlightSeconds / SCOUT_PATROL_DURATION_SECONDS
    ) % 1;
    const aheadProgress = (progress + 0.012) % 1;
    this.scoutPatrol.getPointAt(progress, this.scoutPosition);
    this.scoutPatrol.getTangentAt(progress, this.scoutTangent).normalize();
    this.scoutPatrol.getTangentAt(aheadProgress, this.scoutAheadTangent).normalize();

    // Both the height flutter and bank are phase-based so one patrol returns to
    // exactly the same transform and stays deterministic in captures and tests.
    this.scoutPosition.y += Math.sin(progress * Math.PI * 4) * 0.2;
    aircraft.position.copy(this.scoutPosition);
    aircraft.up.set(0, 1, 0);
    aircraft.lookAt(this.scoutLookTarget.copy(this.scoutPosition).add(this.scoutTangent));
    const signedTurn = (
      this.scoutTangent.x * this.scoutAheadTangent.z
      - this.scoutTangent.z * this.scoutAheadTangent.x
    );
    const bank = THREE.MathUtils.clamp(
      signedTurn * 13.5 + Math.sin(progress * Math.PI * 2) * 0.045,
      -0.82,
      0.82,
    );
    aircraft.rotateZ(bank);
    aircraft.rotateX(Math.sin(progress * Math.PI * 6) * 0.025);
    aircraft.userData.patrolProgress = progress;
    aircraft.userData.bankRadians = bank;
  }

  private buildGroundProps(): void {
    const group = new THREE.Group();
    group.name = 'construction-props';
    this.root.add(group);

    const crates: Array<[string, THREE.Vector3, THREE.Vector3, ArenaMaterialName]> = [
      ['crate-center-large', new THREE.Vector3(-1.8, 0.7, -2.6), new THREE.Vector3(2.2, 1.4, 1.5), 'shade'],
      ['crate-center-small', new THREE.Vector3(1.0, 0.5, -4.2), new THREE.Vector3(1.25, 1, 1.2), 'paper'],
      ['crate-west', new THREE.Vector3(-15, 0.65, -4), new THREE.Vector3(1.5, 1.3, 1.5), 'orange'],
      ['crate-rear', new THREE.Vector3(20.6, 0.85, -23.6), new THREE.Vector3(1.7, 1.7, 1.7), 'shade'],
      ['crate-office', new THREE.Vector3(17.8, 0.55, 3.3), new THREE.Vector3(1.2, 1.1, 1.2), 'paper'],
      ['crate-south-west', new THREE.Vector3(-17.5, 0.8, 17), new THREE.Vector3(1.8, 1.6, 1.7), 'shade'],
      ['crate-south-east', new THREE.Vector3(24.5, 0.65, 18.5), new THREE.Vector3(1.5, 1.3, 1.5), 'orange'],
      ['crate-undercroft', new THREE.Vector3(-14, 0.7, -35.5), new THREE.Vector3(2.1, 1.4, 1.45), 'paper'],
    ];
    for (const [id, position, size, material] of crates) {
      this.addBox(group, id, size, position, material, { collider: 'cover', tags: ['crate', 'cover'] });
      this.addCylinderBetween(group, `${id}-slash-a`, position.clone().add(new THREE.Vector3(-size.x * 0.43, -size.y * 0.43, size.z * 0.51)), position.clone().add(new THREE.Vector3(size.x * 0.43, size.y * 0.43, size.z * 0.51)), 0.025, 'deep');
      this.addCylinderBetween(group, `${id}-slash-b`, position.clone().add(new THREE.Vector3(size.x * 0.43, -size.y * 0.43, size.z * 0.515)), position.clone().add(new THREE.Vector3(-size.x * 0.43, size.y * 0.43, size.z * 0.515)), 0.025, 'deep');
    }

    for (const [index, x] of [-1.4, 0, 1.4].entries()) {
      this.addCylinderBetween(group, `vertical-pipe-${index}`, new THREE.Vector3(30.5 + x, 0.15, -10), new THREE.Vector3(30.5 + x, 4.8, -10), 0.22, index === 1 ? 'orange' : 'lavender', true, 'column', 12);
    }
    this.addCylinderBetween(group, 'overhead-pipe', new THREE.Vector3(29.1, 4.75, -10), new THREE.Vector3(33.2, 4.75, -10), 0.23, 'lavender', true, 'column', 12);

    this.addBox(group, 'center-low-cover', new THREE.Vector3(4.1, 1.1, 0.55), new THREE.Vector3(-3.2, 0.55, 4.5), 'paper', {
      collider: 'cover', tags: ['cover'], rotation: new THREE.Euler(0, 0.18, 0),
    });
    this.addBox(group, 'right-low-cover', new THREE.Vector3(3.2, 0.85, 0.6), new THREE.Vector3(17.5, 0.425, -8), 'shade', {
      collider: 'cover', tags: ['cover'], rotation: new THREE.Euler(0, -0.28, 0),
    });

    const tankGeometry = this.geometry('roof-tank-cylinder', () => new THREE.CylinderGeometry(0.75, 0.82, 1.55, 14));
    this.addOutlined(group, 'utility-roof-water-tank', tankGeometry, 'shade', new THREE.Vector3(12.6, 6.0, -14.3), undefined, true);
  }

  private createBarricade(
    id: string,
    position: THREE.Vector3,
    yaw: number,
    width = 3.5,
    height = 2,
  ): void {
    const root = new THREE.Group();
    root.name = id;
    root.position.copy(position);
    root.rotation.y = yaw;
    this.root.add(root);
    const pieces: OutlinedMeshGroup[] = [];
    const plankCount = 4;
    for (let index = 0; index < plankCount; index += 1) {
      const y = 0.42 + index * (height - 0.52) / (plankCount - 1);
      const plank = this.addBox(
        root,
        `${id}-plank-${index}`,
        new THREE.Vector3(width, 0.28, 0.24),
        new THREE.Vector3(0, y, (index % 2 - 0.5) * 0.045),
        'orange',
        { collider: false, raycast: true, rotation: new THREE.Euler(0, 0, (index % 2 ? 1 : -1) * 0.025) },
      );
      pieces.push(plank);
    }
    for (const [index, x] of [-width * 0.38, width * 0.38].entries()) {
      const post = this.addBox(root, `${id}-post-${index}`, new THREE.Vector3(0.28, height + 0.25, 0.3), new THREE.Vector3(x, height * 0.5, -0.06), 'orange', {
        collider: false, raycast: true, rotation: new THREE.Euler(0, 0, index === 0 ? -0.06 : 0.06),
      });
      pieces.push(post);
    }
    root.updateWorldMatrix(true, true);
    const collider = this.addCollider(id, root, 'breakable', ['wood', 'breakable', 'cover']);
    const barricade = new BreakableBarricade(id, root, pieces, collider, this.raycastMeshes);
    this.breakables.push(barricade);
  }

  private buildBreakables(): void {
    this.createBarricade('barricade-center', new THREE.Vector3(27, 0.05, 7), -0.28, 3.8, 2.05);
    this.createBarricade('barricade-south-west', new THREE.Vector3(-12.5, 0.05, 17), 0.18, 4.4, 2.05);
    this.createBarricade('barricade-scaffold', new THREE.Vector3(-5, 0.05, -7.4), 0, 3.2, 1.9);
    this.createBarricade('barricade-utility-door', new THREE.Vector3(13.65, 0.05, -10.25), 0, 1.35, 2.2);
    this.createBarricade('barricade-office', new THREE.Vector3(23.5, 0.05, 1.45), 0, 1.45, 2.1);
    this.createBarricade('barricade-rear', new THREE.Vector3(-14.5, 0.05, -39), 0.2, 4.2, 2.15);
  }

  private addSupplyVisual(point: SupplyPoint): void {
    const group = new THREE.Group();
    group.name = point.id;
    this.root.add(group);
    this.addBox(group, `${point.id}-pedestal`, new THREE.Vector3(0.72, 0.22, 0.72), point.position.clone().add(new THREE.Vector3(0, -0.11, 0)), 'green', { raycast: true });
    const markerGeometry = this.geometry('supply-marker', () => new THREE.OctahedronGeometry(0.28, 0));
    const marker = this.addOutlined(group, `${point.id}-marker`, markerGeometry, 'green', point.position.clone().add(new THREE.Vector3(0, 0.55, 0)), new THREE.Euler(0, Math.PI / 4, 0), true);
    marker.mesh.userData.supplyPointId = point.id;
  }

  private buildGameplayMarkers(): void {
    const spawnData: Array<[number, number, number, EnemySpawnPoint['elevation'], EnemySpawnPoint['preferredFor']]> = [
      [-30, 0.25, 23, 'ground', ['rusher', 'grunt']],
      [-17, 0.25, 10, 'ground', ['grunt', 'heavy']],
      [15, 0.25, 9, 'ground', ['rusher', 'grunt']],
      [30, 0.25, 20, 'ground', ['heavy', 'grunt']],
      [-30, 0.25, -14, 'ground', ['rusher', 'grunt']],
      [0, 0.25, -1, 'ground', ['heavy', 'grunt']],
      [29, 0.25, -14, 'ground', ['grunt', 'heavy']],
      [-27, 0.25, -40, 'ground', ['grunt', 'rusher']],
      [0, 0.25, -41, 'ground', ['heavy', 'grunt']],
      [28, 0.25, -38, 'ground', ['grunt', 'marksman']],
      [-8.2, 2.85, -12, 'mid', ['grunt', 'marksman']],
      [-2.1, 2.85, -15, 'mid', ['grunt', 'marksman']],
      [-8.2, 5.35, -15.5, 'mid', ['marksman', 'grunt']],
      [-2, 5.35, -10, 'mid', ['marksman', 'grunt']],
      [-8.4, 7.85, -15, 'high', ['marksman']],
      [-29.0, 7.85, -15.1, 'high', ['marksman', 'grunt']],
      [10.3, 5.35, -14, 'mid', ['marksman', 'grunt']],
      [13.7, 5.35, -12.5, 'mid', ['marksman']],
      [20.1, 3.9, -2, 'mid', ['marksman', 'grunt']],
      [23.6, 3.9, -3.4, 'mid', ['marksman']],
      [-21, 5.35, -32, 'mid', ['marksman', 'grunt']],
      [21, 5.35, -32, 'mid', ['marksman']],
    ];
    spawnData.forEach(([x, y, z, elevation, preferredFor], index) => {
      this.enemySpawnPoints.push({
        id: `enemy-spawn-${index + 1}`,
        position: new THREE.Vector3(x, y, z),
        yaw: Math.atan2(-x, -8 - z),
        elevation,
        preferredFor: Object.freeze([...preferredFor]),
      });
    });

    const supplies: Array<[number, number, number, SupplyPoint['kind']]> = [
      [-2, 0.25, 18, 'mixed'],
      [-27, 0.25, 10, 'ammo'],
      [29, 0.25, -8, 'health'],
      [-7.8, 2.85, -10, 'ammo'],
      [-2.2, 5.35, -16, 'health'],
      [11.5, 5.35, -14, 'mixed'],
      [21.8, 3.9, -1.5, 'ammo'],
      [-27.5, 7.85, -15, 'health'],
      [0, 5.35, -32, 'mixed'],
      [25, 0.25, -39, 'ammo'],
    ];
    supplies.forEach(([x, y, z, kind], index) => {
      const point: SupplyPoint = {
        id: `supply-${index + 1}`,
        position: new THREE.Vector3(x, y, z),
        kind,
        respawnSeconds: kind === 'mixed' ? 30 : 22,
      };
      this.supplyPoints.push(point);
      this.addSupplyVisual(point);
    });

    const anchors: Array<[string, number, number, number, readonly string[]]> = [
      ['scaffold-west-l1', -9.8, 3.8, -8, ['scaffold']],
      ['scaffold-east-l2', -0.2, 6.3, -13, ['scaffold']],
      ['scaffold-roof', -5, 9.2, -13, ['scaffold', 'high']],
      ['orange-walk', -27, 9.0, -15, ['bridge', 'high']],
      ['utility-roof-west', 8.1, 6.5, -14, ['roof']],
      ['utility-roof-east', 15.3, 6.5, -14, ['roof']],
      ['office-roof', 22, 5.0, -2, ['roof']],
      ['service-catwalk', 15.5, 5.0, -5.4, ['bridge']],
      ['crane-hook', 7.2, 6.0, -22.2, ['crane', 'hook']],
      ['crane-boom-near', -1, 13.3, -22.2, ['crane', 'high']],
      ['crane-boom-far', 11.5, 13.3, -22.2, ['crane', 'high']],
      ['rear-wall', 24, 7.6, -45.5, ['perimeter']],
      ['pipe-rack', 30.5, 5.2, -10, ['pipes']],
      ['rear-deck-west', -24, 6.5, -32.2, ['bridge', 'high']],
      ['rear-deck-east', 24, 6.5, -32.2, ['bridge', 'high']],
    ];
    for (const [id, x, y, z, tags] of anchors) {
      this.grappleAnchors.push({ id: `anchor-${id}`, position: new THREE.Vector3(x, y, z), radius: 0.8, strength: tags.includes('high') ? 1.15 : 0.9, tags });
    }

    const ledge = (id: string, start: THREE.Vector3, end: THREE.Vector3, normal: THREE.Vector3, height: number): void => {
      this.ledges.push({ id, start, end, outwardNormal: normal.normalize(), height, lethalDrop: height >= 5 });
    };
    ledge('scaffold-l1-front', new THREE.Vector3(-10, 2.75, -7.75), new THREE.Vector3(0, 2.75, -7.75), new THREE.Vector3(0, 0, 1), 2.55);
    ledge('scaffold-l2-front', new THREE.Vector3(-10, 5.25, -7.75), new THREE.Vector3(0, 5.25, -7.75), new THREE.Vector3(0, 0, 1), 5.05);
    ledge('scaffold-l3-front', new THREE.Vector3(-10, 7.75, -7.75), new THREE.Vector3(0, 7.75, -7.75), new THREE.Vector3(0, 0, 1), 7.55);
    ledge('scaffold-l3-back', new THREE.Vector3(-10, 7.75, -18.25), new THREE.Vector3(0, 7.75, -18.25), new THREE.Vector3(0, 0, -1), 7.55);
    ledge('orange-walk-south', new THREE.Vector3(-34.2, 7.8, -14.3), new THREE.Vector3(-10.2, 7.8, -14.3), new THREE.Vector3(0, 0, 1), 7.6);
    ledge('orange-walk-north', new THREE.Vector3(-34.2, 7.8, -15.9), new THREE.Vector3(-10.2, 7.8, -15.9), new THREE.Vector3(0, 0, -1), 7.6);
    ledge('utility-roof-front', new THREE.Vector3(8, 5.25, -10.3), new THREE.Vector3(15.4, 5.25, -10.3), new THREE.Vector3(0, 0, 1), 5.05);
    ledge('utility-roof-back', new THREE.Vector3(8, 5.25, -17.7), new THREE.Vector3(15.4, 5.25, -17.7), new THREE.Vector3(0, 0, -1), 5.05);
    ledge('utility-roof-east', new THREE.Vector3(15.4, 5.25, -17.7), new THREE.Vector3(15.4, 5.25, -10.3), new THREE.Vector3(1, 0, 0), 5.05);
    ledge('office-roof-front', new THREE.Vector3(18.3, 3.8, 1.4), new THREE.Vector3(25.6, 3.8, 1.4), new THREE.Vector3(0, 0, 1), 3.6);
    ledge('office-roof-back', new THREE.Vector3(18.3, 3.8, -5), new THREE.Vector3(25.6, 3.8, -5), new THREE.Vector3(0, 0, -1), 3.6);
    ledge('service-catwalk-south', new THREE.Vector3(11.3, 3.8, -4.65), new THREE.Vector3(18.7, 3.8, -4.65), new THREE.Vector3(0, 0, 1), 3.6);
    ledge('rear-transit-south', new THREE.Vector3(-29, 5.42, -29.05), new THREE.Vector3(29, 5.42, -29.05), new THREE.Vector3(0, 0, 1), 5.12);
    ledge('rear-transit-north', new THREE.Vector3(-29, 5.42, -35.35), new THREE.Vector3(29, 5.42, -35.35), new THREE.Vector3(0, 0, -1), 5.12);
  }

  private buildWaypointGraph(): ArenaWaypointGraph {
    const nodes = new Map<string, MutableWaypoint>();
    const add = (id: string, x: number, y: number, z: number, tags: MutableWaypoint['tags']): void => {
      nodes.set(id, { id, position: new THREE.Vector3(x, y, z), neighbors: [], tags });
    };
    const connect = (a: string, b: string): void => {
      const nodeA = nodes.get(a);
      const nodeB = nodes.get(b);
      if (!nodeA || !nodeB) throw new Error(`Cannot connect missing waypoint ${a}/${b}`);
      nodeA.neighbors.push(b);
      nodeB.neighbors.push(a);
    };

    add('g-south', 2, 0.25, 25, ['ground']);
    add('g-front', 0, 0.25, 12, ['ground']);
    add('g-west', -17, 0.25, 11, ['ground', 'cover']);
    add('g-west-yard', -28, 0.25, 4, ['ground', 'cover', 'stairs']);
    add('g-scaffold-front', -5, 0.25, -5.5, ['ground', 'stairs']);
    add('g-scaffold-inside', -5, 0.25, -13, ['ground', 'cover']);
    add('g-far-west', -32, 0.25, -10, ['ground', 'stairs']);
    add('g-rear-west', -27, 0.25, -38, ['ground']);
    add('g-rear-west-stair', -29.3, 0.25, -24.9, ['ground', 'stairs']);
    add('g-rear', -8, 0.25, -41, ['ground']);
    add('g-rear-east', 18, 0.25, -39, ['ground']);
    add('g-utility-west', 0, 0.25, -14, ['ground']);
    add('g-utility-east', 16.5, 0.25, -13, ['ground', 'stairs']);
    add('g-pipes', 30, 0.25, -10, ['ground', 'cover']);
    add('g-office', 22, 0.25, 2.5, ['ground', 'stairs']);
    add('g-center', 2, 0.25, -3, ['ground', 'cover']);
    add('g-east', 30, 0.25, 9, ['ground']);

    add('s1-west', -8.5, 2.85, -12, ['elevated']);
    add('s1-east', -2, 2.85, -12, ['elevated', 'stairs']);
    add('s2-west', -8.5, 5.35, -12, ['elevated', 'marksman']);
    add('s2-east', -2, 5.35, -15, ['elevated', 'stairs']);
    add('s3-west', -8.5, 7.85, -15, ['elevated', 'marksman']);
    add('s3-east', -2, 7.85, -11, ['elevated', 'marksman']);
    add('orange-west', -31, 7.85, -15, ['elevated', 'marksman', 'stairs']);
    add('orange-east', -11, 7.85, -15, ['elevated']);

    add('utility-roof-west', 8.7, 5.35, -15, ['elevated', 'marksman']);
    add('utility-roof-east', 14.4, 5.35, -14, ['elevated', 'stairs']);
    add('utility-roof-front', 11.5, 5.35, -11, ['elevated']);
    add('service-west', 11.5, 3.85, -5.4, ['elevated', 'stairs']);
    add('service-east', 18.5, 3.85, -5.4, ['elevated']);
    add('office-roof-west', 19.2, 3.85, -2, ['elevated']);
    add('office-roof-east', 25, 3.85, -2, ['elevated', 'marksman', 'stairs']);
    add('rear-link', -5, 5.35, -24, ['elevated']);
    add('rear-deck-west', -24, 5.35, -32, ['elevated', 'marksman']);
    add('rear-deck-center', 0, 5.35, -32, ['elevated']);
    add('rear-deck-east', 24, 5.35, -32, ['elevated', 'marksman', 'stairs']);

    for (const [a, b] of [
      ['g-south', 'g-front'], ['g-south', 'g-west'], ['g-south', 'g-east'],
      ['g-front', 'g-west'], ['g-front', 'g-center'], ['g-front', 'g-east'],
      ['g-west', 'g-west-yard'], ['g-west', 'g-scaffold-front'],
      ['g-west-yard', 'g-far-west'], ['g-west-yard', 'g-south'],
      ['g-scaffold-front', 'g-scaffold-inside'], ['g-scaffold-front', 'g-center'],
      ['g-scaffold-inside', 'g-utility-west'], ['g-scaffold-inside', 'g-rear'],
      ['g-far-west', 'g-rear-west-stair'], ['g-rear-west-stair', 'g-rear-west'], ['g-rear-west', 'g-rear'],
      ['g-rear', 'g-rear-east'], ['g-rear', 'g-utility-west'],
      ['g-rear-east', 'g-pipes'], ['g-rear-east', 'g-utility-east'],
      ['g-utility-west', 'g-utility-east'], ['g-utility-west', 'g-center'],
      ['g-utility-east', 'g-pipes'], ['g-utility-east', 'g-center'],
      ['g-pipes', 'g-east'], ['g-east', 'g-office'], ['g-office', 'g-center'],
      ['s1-west', 's1-east'], ['s1-west', 'g-scaffold-front'],
      ['s1-east', 's2-east'], ['s2-east', 's2-west'], ['s2-west', 's3-west'],
      ['s3-west', 's3-east'], ['s3-east', 's2-east'], ['s3-west', 'orange-east'],
      ['orange-east', 'orange-west'], ['orange-west', 'g-far-west'],
      ['s2-east', 'utility-roof-west'], ['utility-roof-west', 'utility-roof-east'],
      ['utility-roof-east', 'utility-roof-front'], ['utility-roof-front', 'utility-roof-west'],
      ['utility-roof-east', 'g-utility-east'],
      ['service-west', 'service-east'], ['service-west', 'g-center'],
      ['service-east', 'office-roof-west'], ['office-roof-west', 'office-roof-east'],
      ['office-roof-east', 'g-office'], ['office-roof-west', 'g-office'],
      ['service-east', 'utility-roof-front'],
      ['s2-east', 'rear-link'], ['rear-link', 'rear-deck-center'],
      ['rear-deck-west', 'rear-deck-center'], ['rear-deck-center', 'rear-deck-east'],
      ['rear-deck-west', 'g-rear-west-stair'], ['rear-deck-east', 'g-rear-east'],
    ] as const) connect(a, b);

    return new ArenaWaypointGraph([...nodes.values()]);
  }

  private syncColliderBounds(): void {
    this.root.updateWorldMatrix(true, true);
    for (const collider of this.colliders) {
      if (!collider.enabled) continue;
      collider.bounds.setFromObject(collider.object, false);
    }
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const collider of this.colliders) collider.enabled = false;
    for (const visual of this.outlinedMeshes) visual.releaseOutlineResources();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.groundWashMaterial?.dispose();
    this.raycastMeshes.length = 0;
  }
}

export class ArenaBuilder {
  private readonly options: ArenaBuilderOptions;

  constructor(options: ArenaBuilderOptions = {}) {
    this.options = { ...options };
  }

  build(): ArenaBuildResult {
    return new ArenaAssembler(this.options).build();
  }
}

export function buildArena(options: ArenaBuilderOptions = {}): ArenaBuildResult {
  return new ArenaBuilder(options).build();
}
