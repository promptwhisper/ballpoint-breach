import type * as THREE from 'three';

export const WEAPON_IDS = ['rifle', 'shotgun', 'revolver', 'sniper', 'katana'] as const;

export type WeaponId = (typeof WEAPON_IDS)[number];
export type WeaponSlot = 1 | 2 | 3 | 4 | 5;
export type FireMode = 'automatic' | 'semi' | 'melee';
export type WeaponPhase =
  | 'idle'
  | 'firing'
  | 'reloading'
  | 'pumping'
  | 'bolting'
  | 'slashing'
  | 'blocking'
  | 'switching';
export type ScopeState = 'hidden' | 'entering' | 'active' | 'cycling' | 'exiting';
export type Vec3Tuple = readonly [number, number, number];

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly slot: WeaponSlot;
  readonly label: string;
  readonly hint: string;
  readonly fireMode: FireMode;
  readonly fireInterval: number;
  readonly damage: number;
  readonly spread: number;
  readonly magazineSize: number | null;
  readonly initialReserve: number | null;
  readonly reloadDuration: number;
  readonly recoil: number;
  readonly range: number;
  readonly adsFov: number;
  readonly knockback: number;
  readonly pellets?: number;
  readonly actionDuration?: number;
  readonly switchDuration: number;
}

export interface HitscanRequest {
  readonly shotId: number;
  readonly weaponId: 'rifle' | 'revolver' | 'sniper';
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly damage: number;
  readonly range: number;
  readonly knockback: number;
  readonly spread: number;
  readonly timestamp: number;
}

export interface PelletRay {
  readonly direction: THREE.Vector3;
  readonly damage: number;
}

export interface PelletsRequest {
  readonly shotId: number;
  readonly weaponId: 'shotgun';
  readonly origin: THREE.Vector3;
  readonly rays: readonly PelletRay[];
  readonly range: number;
  readonly knockback: number;
  readonly spread: number;
  readonly timestamp: number;
}

export interface MeleeRequest {
  readonly attackId: number;
  readonly weaponId: 'katana';
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly damage: number;
  readonly range: number;
  readonly arcRadians: number;
  readonly knockback: number;
  readonly timestamp: number;
}

export interface IncomingProjectile {
  readonly projectileId?: string | number;
  readonly sourcePosition?: THREE.Vector3;
  readonly incomingDirection?: THREE.Vector3;
  readonly staminaCost?: number;
}

export interface ReflectRequest {
  readonly weaponId: 'katana';
  readonly projectileId?: string | number;
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly sourcePosition?: THREE.Vector3;
  readonly incomingDirection?: THREE.Vector3;
  readonly perfect: boolean;
  readonly timestamp: number;
}

export interface MuzzleRequest {
  readonly shotId: number;
  readonly weaponId: Exclude<WeaponId, 'katana'>;
  readonly anchor: THREE.Object3D;
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly intensity: number;
  readonly timestamp: number;
}

export type WeaponEffectKind =
  | 'dry-fire'
  | 'fire'
  | 'reload-start'
  | 'reload-complete'
  | 'reload-cancel'
  | 'pump'
  | 'bolt'
  | 'slash'
  | 'block-start'
  | 'block-end'
  | 'block-break'
  | 'reflect'
  | 'switch-start'
  | 'switch-complete';

export interface WeaponEffect {
  readonly kind: WeaponEffectKind;
  readonly weaponId: WeaponId;
  readonly position?: THREE.Vector3;
  readonly direction?: THREE.Vector3;
  readonly strength?: number;
  readonly perfect?: boolean;
  readonly timestamp: number;
}

export interface WeaponCallbacks {
  readonly onHitscan?: (request: HitscanRequest) => void;
  readonly onPellets?: (request: PelletsRequest) => void;
  readonly onMelee?: (request: MeleeRequest) => void;
  readonly onReflect?: (request: ReflectRequest) => void;
  readonly onMuzzle?: (request: MuzzleRequest) => void;
  readonly onEffect?: (effect: WeaponEffect) => void;
  readonly onWeaponChanged?: (weaponId: WeaponId, slot: WeaponSlot) => void;
  readonly onAmmoChanged?: (weaponId: WeaponId, magazine: number | null, reserve: number | null) => void;
}

export interface MotionInput {
  /** Signed local strafe input in the -1..1 range. */
  readonly strafe: number;
  /** Signed local forward input in the -1..1 range. */
  readonly forward: number;
  /** Horizontal player speed in world units per second. */
  readonly speed: number;
  readonly grounded: boolean;
  readonly sprinting?: boolean;
  /** Shared full-stride phase supplied by the player controller. */
  readonly gaitPhase?: number;
  /** Smoothed 0..1+ movement weight supplied by the player controller. */
  readonly gaitWeight?: number;
}

export interface AmmoSnapshot {
  readonly magazine: number | null;
  readonly reserve: number | null;
  readonly capacity: number | null;
  readonly infinite: boolean;
}

export interface ViewmodelOffsetsSnapshot {
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly recoilPosition: Vec3Tuple;
  readonly recoilRotation: Vec3Tuple;
  readonly swayPosition: Vec3Tuple;
  readonly swayRotation: Vec3Tuple;
  readonly headbobPosition: Vec3Tuple;
  readonly headbobRotation: Vec3Tuple;
  /** Apply this small rotation to the host camera if camera kick is desired. */
  readonly cameraRotation: Vec3Tuple;
}

export interface WeaponStateSnapshot {
  readonly time: number;
  readonly activeWeapon: WeaponId;
  readonly activeSlot: WeaponSlot;
  readonly pendingWeapon: WeaponId | null;
  readonly phase: WeaponPhase;
  readonly phaseProgress: number;
  readonly phaseRemaining: number;
  readonly triggerHeld: boolean;
  readonly aimHeld: boolean;
  readonly aiming: boolean;
  readonly aimAlpha: number;
  readonly desiredFov: number;
  readonly scopeState: ScopeState;
  readonly ammo: Readonly<Record<WeaponId, AmmoSnapshot>>;
  readonly katana: {
    readonly blocking: boolean;
    readonly stamina: number;
    readonly maxStamina: number;
    readonly perfectWindowOpen: boolean;
  };
  readonly offsets: ViewmodelOffsetsSnapshot;
}

export interface WeaponSystemOptions {
  readonly callbacks?: WeaponCallbacks;
  readonly baseFov?: number;
  /** Injectable for deterministic tests; values are expected in the [0, 1) range. */
  readonly random?: () => number;
  readonly initialWeapon?: WeaponId;
}
