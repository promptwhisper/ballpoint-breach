import type * as THREE from 'three';

export type EnemyKind = 'grunt' | 'rusher' | 'heavy' | 'marksman' | 'boss';

export type RegularEnemyKind = Exclude<EnemyKind, 'boss'>;

export type EnemyCombatProfile = 'classic' | 'assault' | 'siege';

export type EnemyState = 'idle' | 'seek' | 'strafe' | 'attack' | 'stagger' | 'dead';

export type EnemyHitZone = 'head' | 'torso' | 'limb';

export type EnemyDamageType =
  | 'bullet'
  | 'shotgun'
  | 'sniper'
  | 'melee'
  | 'grapple'
  | 'reflected'
  | 'environment';

export type EnemyDeathCause = EnemyDamageType | 'fall';

export type EnemyAttackKind =
  | 'melee'
  | 'projectile'
  | 'charge'
  | 'sweep'
  | 'slam'
  | 'summon';

export interface PlayerTarget {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  radius?: number;
  alive?: boolean;
}

export interface EnemyView {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly object: THREE.Group;
  readonly position: THREE.Vector3;
  readonly state: EnemyState;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly collisionRadius: number;
}

export interface EnemyDamage {
  amount: number;
  type?: EnemyDamageType;
  hitZone?: EnemyHitZone;
  point?: THREE.Vector3;
  direction?: THREE.Vector3;
  impulse?: number;
  sourceId?: string;
}

export interface EnemyDamageResult {
  applied: number;
  killed: boolean;
  headshot: boolean;
  remainingHealth: number;
}

export interface EnemyRayHit {
  enemy: EnemyView;
  hitZone: EnemyHitZone;
  point: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
  intersection: THREE.Intersection;
}

export interface PlayerDamageEvent {
  amount: number;
  sourceEnemyId: string;
  sourceKind: EnemyKind;
  attack: EnemyAttackKind;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  projectileId?: string;
}

export type EnemyEventType =
  | 'spawn'
  | 'state-change'
  | 'attack-telegraph'
  | 'attack'
  | 'hit'
  | 'death'
  | 'cleanup'
  | 'ink-impact'
  | 'boss-phase'
  | 'boss-summon'
  | 'projectile-spawn'
  | 'projectile-impact'
  | 'projectile-reflected';

export interface EnemyEvent {
  type: EnemyEventType;
  enemyId: string;
  kind: EnemyKind;
  position: THREE.Vector3;
  state?: EnemyState;
  previousState?: EnemyState;
  attack?: EnemyAttackKind;
  telegraphDuration?: number;
  damage?: number;
  damageType?: EnemyDamageType;
  killed?: boolean;
  hitZone?: EnemyHitZone;
  headshot?: boolean;
  deathCause?: EnemyDeathCause;
  phase?: 1 | 2;
  count?: number;
  projectileId?: string;
  direction?: THREE.Vector3;
}

export interface BossSummonRequest {
  boss: EnemyView;
  count: number;
  preferredKinds: readonly RegularEnemyKind[];
}

export interface EnemyManagerCallbacks {
  getPlayer: () => PlayerTarget;
  hasLineOfSight?: (from: THREE.Vector3, to: THREE.Vector3, enemy: EnemyView) => boolean;
  resolveMovement?: (enemy: EnemyView, proposedPosition: THREE.Vector3) => THREE.Vector3;
  groundHeight?: (position: THREE.Vector3, enemy: EnemyView) => number | null;
  navigationTarget?: (enemy: EnemyView, playerPosition: THREE.Vector3) => THREE.Vector3 | null;
  isProjectileBlocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  onPlayerDamage?: (event: PlayerDamageEvent) => void;
  onEvent?: (event: EnemyEvent) => void;
  onBossSummon?: (request: BossSummonRequest) => boolean | void;
}

export interface EnemyManagerOptions extends EnemyManagerCallbacks {
  seed?: number;
  fallDeathY?: number;
  despawnDelay?: number;
  maxEnemies?: number;
  bossSummonPoints?: readonly THREE.Vector3[];
  getCombatProfile?: () => EnemyCombatProfile;
}

export interface EnemySpawnOptions {
  id?: string;
  yaw?: number;
  healthScale?: number;
  combatProfile?: EnemyCombatProfile;
}

export interface ProjectileReflectionResult {
  count: number;
  projectileIds: readonly string[];
}

export interface EnemyManagerSnapshot {
  living: number;
  projectiles: number;
  byKind: Readonly<Record<EnemyKind, number>>;
  bossHealth: number | null;
  bossMaxHealth: number | null;
}
