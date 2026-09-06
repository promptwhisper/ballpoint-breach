import * as THREE from 'three';
import type {
  AmmoSnapshot,
  IncomingProjectile,
  MotionInput,
  ScopeState,
  Vec3Tuple,
  ViewmodelOffsetsSnapshot,
  WeaponCallbacks,
  WeaponDefinition,
  WeaponEffectKind,
  WeaponId,
  WeaponPhase,
  WeaponSlot,
  WeaponStateSnapshot,
  WeaponSystemOptions,
} from './types';
import { WEAPON_IDS } from './types';
import { createWeaponViewmodels, type WeaponViewmodel } from './viewmodels';
import { WEAPON_DEFINITIONS, weaponIdForSlot } from './weaponDefinitions';

interface WeaponRuntime {
  magazine: number | null;
  reserve: number | null;
  nextFireAt: number;
  shotsFired: number;
}

interface StoredTransform {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: THREE.Vector3;
}

interface SwitchState {
  readonly from: WeaponId;
  readonly to: WeaponId;
  readonly duration: number;
  elapsed: number;
  changedModel: boolean;
}

const KATANA_MAX_STAMINA = 100;
const KATANA_BLOCK_DRAIN_PER_SECOND = 18;
const KATANA_REFLECT_COST = 14;
const KATANA_STAMINA_REGEN_PER_SECOND = 30;
const KATANA_REGEN_DELAY = 0.68;
const KATANA_PERFECT_WINDOW = 0.2;
const KATANA_ARC_RADIANS = THREE.MathUtils.degToRad(104);
export const KATANA_CONTACT_PROGRESS = 0.2;
const EPSILON = 1e-7;

function clampInput(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, -1, 1);
}

function asTuple(value: THREE.Vector3): Vec3Tuple {
  return [value.x, value.y, value.z];
}

function immutableAmmo(runtime: WeaponRuntime, definition: WeaponDefinition): AmmoSnapshot {
  return Object.freeze({
    magazine: runtime.magazine,
    reserve: runtime.reserve,
    capacity: definition.magazineSize,
    infinite: definition.magazineSize === null,
  });
}

function easeOutCubic(value: number): number {
  const inverse = 1 - THREE.MathUtils.clamp(value, 0, 1);
  return 1 - inverse * inverse * inverse;
}

function easeInOutCubic(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export interface KatanaSlashSample {
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly trail: number;
}

export type KatanaSlashVariant = 'forward' | 'reverse';

interface KatanaSlashKeyframe {
  readonly progress: number;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
}

const KATANA_FORWARD_SLASH_KEYFRAMES: readonly KatanaSlashKeyframe[] = [
  { progress: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  { progress: 0.04, position: [-0.741, 1.415, 0], rotation: [0.296, -0.645, 0] },
  { progress: KATANA_CONTACT_PROGRESS, position: [-0.702, 1.259, 0], rotation: [0.04, -0.447, 0] },
  { progress: 0.36, position: [-0.68, 1.2, 0], rotation: [0.02, -0.42, 0] },
  { progress: 0.48, position: [-0.42, 0.601, 0], rotation: [0, -0.003, 0] },
  { progress: 0.6, position: [-1.112, 1.182, 0], rotation: [-0.775, 0.243, 0] },
  { progress: 0.83, position: [0, 0, 0], rotation: [0, 0, 0] },
  { progress: 1, position: [0, 0, 0], rotation: [0, 0, 0] },
];

const KATANA_REVERSE_SLASH_KEYFRAMES: readonly KatanaSlashKeyframe[] = [
  { progress: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  { progress: 0.04, position: [-1.02, 1, 0], rotation: [0.31, 0.15, 0] },
  { progress: KATANA_CONTACT_PROGRESS, position: [-1.02, 1.14, 0], rotation: [0.08, -0.02, 0] },
  { progress: 0.36, position: [-0.54, 0.92, 0], rotation: [-0.3, 0.12, 0] },
  { progress: 0.44, position: [0.18, 0.42, 0], rotation: [-0.66, -0.12, 0] },
  { progress: 0.52, position: [0.46, 0.22, 0], rotation: [-0.68, -0.17, 0] },
  { progress: 0.68, position: [0, 0, 0], rotation: [0, 0, 0] },
  { progress: 1, position: [0, 0, 0], rotation: [0, 0, 0] },
];

function lerpTuple(from: Vec3Tuple, to: Vec3Tuple, amount: number): Vec3Tuple {
  return [
    THREE.MathUtils.lerp(from[0], to[0], amount),
    THREE.MathUtils.lerp(from[1], to[1], amount),
    THREE.MathUtils.lerp(from[2], to[2], amount),
  ];
}

/** Deterministic authored swing used by gameplay, tests, and review captures. */
export function sampleKatanaSlash(progress: number, variant: KatanaSlashVariant = 'forward'): KatanaSlashSample {
  const clamped = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const keyframes = variant === 'reverse' ? KATANA_REVERSE_SLASH_KEYFRAMES : KATANA_FORWARD_SLASH_KEYFRAMES;
  let from = keyframes[0];
  let to = keyframes[keyframes.length - 1];
  for (let index = 1; index < keyframes.length; index += 1) {
    const candidate = keyframes[index];
    if (clamped <= candidate.progress) {
      to = candidate;
      from = keyframes[index - 1];
      break;
    }
  }
  const span = Math.max(EPSILON, to.progress - from.progress);
  const segmentProgress = (clamped - from.progress) / span;
  const amount = from.progress === 0 || (variant === 'forward' && from.progress >= 0.36 && to.progress <= 0.6)
    ? easeOutCubic(segmentProgress)
    : easeInOutCubic(segmentProgress);
  const trailStart = variant === 'reverse' ? 0.1 : 0.16;
  const trailEnd = variant === 'reverse' ? 0.46 : 0.64;
  const trailWindow = THREE.MathUtils.clamp((clamped - trailStart) / (trailEnd - trailStart), 0, 1);
  const trail = clamped < trailStart || clamped > trailEnd ? 0 : Math.sin(trailWindow * Math.PI);
  return {
    position: lerpTuple(from.position, to.position, amount),
    rotation: lerpTuple(from.rotation, to.rotation, amount),
    trail,
  };
}

/**
 * Host-neutral weapon simulation plus camera-attached procedural viewmodels.
 *
 * The host owns collision and targets. It supplies an aim ray and handles the
 * callback requests emitted by this class. `viewmodelRoot` may be attached to a
 * perspective camera directly.
 */
export class WeaponSystem {
  readonly viewmodelRoot = new THREE.Group();
  readonly definitions = WEAPON_DEFINITIONS;

  private callbacks: WeaponCallbacks;
  private readonly random: () => number;
  private readonly baseFov: number;
  private readonly viewmodels: Readonly<Record<WeaponId, WeaponViewmodel>>;
  private readonly runtimes: Record<WeaponId, WeaponRuntime>;
  private readonly partHomes = new Map<THREE.Object3D, StoredTransform>();

  private activeWeapon: WeaponId;
  private phase: WeaponPhase = 'idle';
  private phaseStartedAt = 0;
  private phaseEndsAt = 0;
  private phaseDuration = 0;
  private switchState: SwitchState | null = null;
  private enabled = true;
  private time = 0;
  private shotSequence = 0;
  private attackSequence = 0;
  private katanaPendingAttackId: number | null = null;
  private katanaReviewProgress: number | null = null;
  private katanaSlashVariant: KatanaSlashVariant = 'forward';

  private triggerHeld = false;
  private triggerPressed = false;
  private triggerArmed = true;
  private aimHeld = false;
  private aimAlpha = 0;
  private scopeState: ScopeState = 'hidden';

  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3(0, 0, -1);
  private readonly aimUp = new THREE.Vector3(0, 1, 0);

  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private motion: MotionInput = { strafe: 0, forward: 0, speed: 0, grounded: true, sprinting: false, gaitPhase: 0, gaitWeight: 0 };
  private bobPhase = 0;

  private readonly recoilPosition = new THREE.Vector3();
  private readonly recoilPositionVelocity = new THREE.Vector3();
  private readonly recoilRotation = new THREE.Vector3();
  private readonly recoilRotationVelocity = new THREE.Vector3();
  private readonly swayPosition = new THREE.Vector3();
  private readonly swayRotation = new THREE.Vector3();
  private readonly headbobPosition = new THREE.Vector3();
  private readonly headbobRotation = new THREE.Vector3();
  private readonly combinedPosition = new THREE.Vector3();
  private readonly combinedRotation = new THREE.Vector3();
  private readonly cameraRotation = new THREE.Vector3();

  private katanaStamina = KATANA_MAX_STAMINA;
  private blockStartedAt = -Infinity;
  private blockRegenAt = 0;
  private blockExhausted = false;

  constructor(options: WeaponSystemOptions = {}) {
    this.callbacks = options.callbacks ?? {};
    this.random = options.random ?? Math.random;
    this.baseFov = options.baseFov ?? 70;
    this.activeWeapon = options.initialWeapon ?? 'rifle';
    this.viewmodels = createWeaponViewmodels();
    this.runtimes = {
      rifle: this.createRuntime('rifle'),
      shotgun: this.createRuntime('shotgun'),
      revolver: this.createRuntime('revolver'),
      sniper: this.createRuntime('sniper'),
      katana: this.createRuntime('katana'),
    };

    this.viewmodelRoot.name = 'weapon-system-viewmodels';
    this.viewmodelRoot.position.set(0, 0, 0);
    this.viewmodelRoot.rotation.order = 'YXZ';
    for (const id of WEAPON_IDS) {
      const viewmodel = this.viewmodels[id];
      viewmodel.root.visible = id === this.activeWeapon;
      viewmodel.root.traverse((object) => {
        object.frustumCulled = false;
        object.renderOrder = Math.max(object.renderOrder, 20);
      });
      this.viewmodelRoot.add(viewmodel.root);
      for (const part of Object.values(viewmodel.parts)) {
        if (part) this.rememberTransform(part);
      }
    }
    this.applyViewmodelPose();
  }

  private createRuntime(id: WeaponId): WeaponRuntime {
    const definition = WEAPON_DEFINITIONS[id];
    return {
      magazine: definition.magazineSize,
      reserve: definition.initialReserve,
      nextFireAt: 0,
      shotsFired: 0,
    };
  }

  private rememberTransform(object: THREE.Object3D): void {
    this.partHomes.set(object, {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
    });
  }

  setCallbacks(callbacks: WeaponCallbacks): void {
    this.callbacks = callbacks;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.setTrigger(false);
      this.setAimHeld(false);
    }
  }

  setTrigger(held: boolean): void {
    const next = Boolean(held);
    if (next && !this.triggerHeld) this.triggerPressed = true;
    if (!next) this.triggerArmed = true;
    if (next && !this.triggerHeld) {
      const runtime = this.runtimes[this.activeWeapon];
      runtime.nextFireAt = Math.max(runtime.nextFireAt, this.time);
    }
    this.triggerHeld = next;
  }

  setAimHeld(held: boolean): void {
    const next = Boolean(held);
    if (!next && this.blockExhausted) this.blockExhausted = false;
    this.aimHeld = next;
  }

  setAimRay(origin: THREE.Vector3, direction: THREE.Vector3, up?: THREE.Vector3): void {
    this.aimOrigin.copy(origin);
    if (direction.lengthSq() > EPSILON) this.aimDirection.copy(direction).normalize();
    if (up && up.lengthSq() > EPSILON) this.aimUp.copy(up).normalize();
  }

  setLookDelta(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    this.lookDeltaX = THREE.MathUtils.clamp(this.lookDeltaX + deltaX, -180, 180);
    this.lookDeltaY = THREE.MathUtils.clamp(this.lookDeltaY + deltaY, -180, 180);
  }

  setMotion(input: MotionInput): void {
    this.motion = {
      strafe: clampInput(input.strafe),
      forward: clampInput(input.forward),
      speed: Math.max(0, Number.isFinite(input.speed) ? input.speed : 0),
      grounded: Boolean(input.grounded),
      sprinting: Boolean(input.sprinting),
      gaitPhase: Number.isFinite(input.gaitPhase) ? input.gaitPhase : undefined,
      gaitWeight: Number.isFinite(input.gaitWeight) ? Math.max(0, input.gaitWeight ?? 0) : undefined,
    };
  }

  /** Freezes the katana at an authored review keyframe. Pass null for gameplay. */
  setKatanaReviewProgress(progress: number | null): void {
    this.katanaReviewProgress = progress === null
      ? null
      : THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
    this.applyViewmodelPose();
  }

  /** Selects the deterministic slash direction used by authored review frames. */
  setKatanaReviewVariant(variant: KatanaSlashVariant): void {
    this.katanaSlashVariant = variant;
    this.applyViewmodelPose();
  }

  getDefinition(id: WeaponId = this.activeWeapon): WeaponDefinition {
    return WEAPON_DEFINITIONS[id];
  }

  getViewmodel(id: WeaponId = this.activeWeapon): WeaponViewmodel {
    return this.viewmodels[id];
  }

  getMuzzleAnchor(id: WeaponId = this.activeWeapon): THREE.Object3D {
    return this.viewmodels[id].parts.muzzle;
  }

  /** Restores a clean match-start state without replacing callback references or scene nodes. */
  reset(initialWeapon: WeaponId = 'rifle'): void {
    this.activeWeapon = initialWeapon;
    this.phase = 'idle';
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.phaseDuration = 0;
    this.switchState = null;
    this.enabled = true;
    this.time = 0;
    this.shotSequence = 0;
    this.attackSequence = 0;
    this.katanaPendingAttackId = null;
    this.katanaReviewProgress = null;
    this.katanaSlashVariant = 'forward';
    this.triggerHeld = false;
    this.triggerPressed = false;
    this.triggerArmed = true;
    this.aimHeld = false;
    this.aimAlpha = 0;
    this.scopeState = 'hidden';
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.motion = { strafe: 0, forward: 0, speed: 0, grounded: true, sprinting: false, gaitPhase: 0, gaitWeight: 0 };
    this.bobPhase = 0;
    this.katanaStamina = KATANA_MAX_STAMINA;
    this.blockStartedAt = -Infinity;
    this.blockRegenAt = 0;
    this.blockExhausted = false;

    for (const id of WEAPON_IDS) {
      const definition = WEAPON_DEFINITIONS[id];
      const runtime = this.runtimes[id];
      runtime.magazine = definition.magazineSize;
      runtime.reserve = definition.initialReserve;
      runtime.nextFireAt = 0;
      runtime.shotsFired = 0;
      this.viewmodels[id].root.visible = id === initialWeapon;
      this.restoreAnimatedParts(this.viewmodels[id]);
    }
    for (const vector of [
      this.recoilPosition,
      this.recoilPositionVelocity,
      this.recoilRotation,
      this.recoilRotationVelocity,
      this.swayPosition,
      this.swayRotation,
      this.headbobPosition,
      this.headbobRotation,
      this.combinedPosition,
      this.combinedRotation,
      this.cameraRotation,
    ]) vector.set(0, 0, 0);
    this.viewmodelRoot.position.set(0, 0, 0);
    this.viewmodelRoot.rotation.set(0, 0, 0);
    this.applyViewmodelPose();
  }

  selectSlot(slot: WeaponSlot | number): boolean {
    const id = weaponIdForSlot(slot);
    return id ? this.selectWeapon(id) : false;
  }

  selectWeapon(id: WeaponId): boolean {
    if (!this.enabled || this.switchState || id === this.activeWeapon) return false;
    if (this.phase === 'pumping' || this.phase === 'bolting' || this.phase === 'slashing' || this.phase === 'blocking') return false;
    if (this.phase === 'reloading') this.cancelReload();
    if (this.phase === 'firing') return false;

    const from = this.activeWeapon;
    const duration = Math.max(WEAPON_DEFINITIONS[from].switchDuration, WEAPON_DEFINITIONS[id].switchDuration);
    this.switchState = { from, to: id, duration, elapsed: 0, changedModel: false };
    this.startPhase('switching', duration);
    this.triggerArmed = !this.triggerHeld;
    this.triggerPressed = false;
    this.aimAlpha = 0;
    this.scopeState = 'hidden';
    this.emitEffect('switch-start', from);
    return true;
  }

  cycleWeapon(delta: number): boolean {
    if (!Number.isFinite(delta) || delta === 0) return false;
    const activeSlot = WEAPON_DEFINITIONS[this.activeWeapon].slot;
    const direction = delta > 0 ? 1 : -1;
    const nextSlot = ((((activeSlot - 1) + direction) % WEAPON_IDS.length + WEAPON_IDS.length) % WEAPON_IDS.length + 1) as WeaponSlot;
    return this.selectSlot(nextSlot);
  }

  requestReload(): boolean {
    if (!this.enabled || this.switchState || this.phase !== 'idle') return false;
    const definition = WEAPON_DEFINITIONS[this.activeWeapon];
    const runtime = this.runtimes[this.activeWeapon];
    if (definition.magazineSize === null || runtime.magazine === null || runtime.reserve === null) return false;
    if (runtime.magazine >= definition.magazineSize || runtime.reserve <= 0) return false;

    this.startPhase('reloading', definition.reloadDuration);
    if (this.triggerHeld) this.triggerArmed = false;
    this.emitEffect('reload-start', this.activeWeapon);
    return true;
  }

  private cancelReload(): void {
    if (this.phase !== 'reloading') return;
    this.emitEffect('reload-cancel', this.activeWeapon);
    this.phase = 'idle';
    this.phaseStartedAt = this.time;
    this.phaseEndsAt = this.time;
    this.phaseDuration = 0;
  }

  addReserveAmmo(id: Exclude<WeaponId, 'katana'>, amount: number): number {
    const runtime = this.runtimes[id];
    if (runtime.reserve === null || !Number.isFinite(amount) || amount <= 0) return runtime.reserve ?? 0;
    runtime.reserve += Math.floor(amount);
    this.emitAmmoChanged(id);
    return runtime.reserve;
  }

  refillAllReserve(fraction = 1): void {
    const safeFraction = THREE.MathUtils.clamp(Number.isFinite(fraction) ? fraction : 0, 0, 1);
    for (const id of WEAPON_IDS) {
      const definition = WEAPON_DEFINITIONS[id];
      const runtime = this.runtimes[id];
      if (definition.initialReserve === null || runtime.reserve === null) continue;
      runtime.reserve = Math.max(runtime.reserve, Math.round(definition.initialReserve * safeFraction));
      this.emitAmmoChanged(id);
    }
  }

  requestReflection(projectile: IncomingProjectile = {}): boolean {
    if (!this.enabled || this.activeWeapon !== 'katana' || this.phase !== 'blocking' || this.switchState) return false;
    const staminaCost = Math.max(0, projectile.staminaCost ?? KATANA_REFLECT_COST);
    if (this.katanaStamina + EPSILON < staminaCost) return false;

    this.katanaStamina = Math.max(0, this.katanaStamina - staminaCost);
    this.blockRegenAt = this.time + KATANA_REGEN_DELAY;
    const perfect = this.time - this.blockStartedAt <= KATANA_PERFECT_WINDOW;
    const direction = this.aimDirection.clone();
    this.callbacks.onReflect?.({
      weaponId: 'katana',
      projectileId: projectile.projectileId,
      origin: this.aimOrigin.clone(),
      direction,
      sourcePosition: projectile.sourcePosition?.clone(),
      incomingDirection: projectile.incomingDirection?.clone(),
      perfect,
      timestamp: this.time,
    });
    this.emitEffect('reflect', 'katana', perfect ? 1.25 : 0.8, perfect);
    this.addRecoilImpulse(perfect ? 0.45 : 0.25, -1);
    if (this.katanaStamina <= EPSILON) this.breakBlock();
    return true;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('WeaponSystem.update(deltaSeconds) requires a finite non-negative delta.');
    }
    this.time += deltaSeconds;

    // Resolve the pending katana contact before a large frame can finish and
    // clear the timed phase. This also keeps damage aligned with the blade.
    this.emitKatanaStrikeIfDue();
    if (this.switchState) this.updateSwitch(deltaSeconds);
    else this.finishTimedPhaseIfNeeded();

    this.updateBlocking(deltaSeconds);
    this.updateAim(deltaSeconds);
    if (this.enabled && !this.switchState) this.processTrigger();
    this.triggerPressed = false;

    this.updateOffsets(deltaSeconds);
    this.applyViewmodelPose();
  }

  private updateSwitch(deltaSeconds: number): void {
    const state = this.switchState;
    if (!state) return;
    state.elapsed = Math.min(state.duration, state.elapsed + deltaSeconds);
    const progress = state.duration <= EPSILON ? 1 : state.elapsed / state.duration;
    if (!state.changedModel && progress >= 0.5) {
      this.viewmodels[state.from].root.visible = false;
      this.activeWeapon = state.to;
      this.viewmodels[state.to].root.visible = true;
      state.changedModel = true;
      this.runtimes[state.to].nextFireAt = Math.max(this.runtimes[state.to].nextFireAt, this.time);
    }
    if (progress >= 1) {
      const completed = state.to;
      this.switchState = null;
      this.phase = 'idle';
      this.phaseStartedAt = this.time;
      this.phaseEndsAt = this.time;
      this.phaseDuration = 0;
      this.emitEffect('switch-complete', completed);
      this.callbacks.onWeaponChanged?.(completed, WEAPON_DEFINITIONS[completed].slot);
    }
  }

  private finishTimedPhaseIfNeeded(): void {
    if (this.phase === 'idle' || this.phase === 'blocking' || this.phase === 'switching') return;
    if (this.time + EPSILON < this.phaseEndsAt) return;
    const completedPhase = this.phase;
    if (completedPhase === 'reloading') this.completeReload();
    this.phase = 'idle';
    this.phaseStartedAt = this.time;
    this.phaseEndsAt = this.time;
    this.phaseDuration = 0;
    if (completedPhase === 'pumping') this.emitEffect('pump', 'shotgun');
    if (completedPhase === 'bolting') this.emitEffect('bolt', 'sniper');
  }

  private completeReload(): void {
    const id = this.activeWeapon;
    const definition = WEAPON_DEFINITIONS[id];
    const runtime = this.runtimes[id];
    if (definition.magazineSize === null || runtime.magazine === null || runtime.reserve === null) return;
    const transfer = Math.min(definition.magazineSize - runtime.magazine, runtime.reserve);
    runtime.magazine += transfer;
    runtime.reserve -= transfer;
    runtime.nextFireAt = Math.max(runtime.nextFireAt, this.time);
    this.emitAmmoChanged(id);
    this.emitEffect('reload-complete', id);
  }

  private updateBlocking(deltaSeconds: number): void {
    const wantsBlock = this.enabled
      && this.activeWeapon === 'katana'
      && this.aimHeld
      && !this.blockExhausted
      && !this.switchState
      && (this.phase === 'idle' || this.phase === 'blocking');

    if (wantsBlock && this.phase !== 'blocking') {
      this.phase = 'blocking';
      this.phaseStartedAt = this.time;
      this.phaseEndsAt = Infinity;
      this.phaseDuration = Infinity;
      this.blockStartedAt = this.time;
      this.emitEffect('block-start', 'katana');
    } else if (!wantsBlock && this.phase === 'blocking') {
      this.phase = 'idle';
      this.phaseStartedAt = this.time;
      this.phaseEndsAt = this.time;
      this.phaseDuration = 0;
      this.blockRegenAt = this.time + KATANA_REGEN_DELAY;
      this.emitEffect('block-end', 'katana');
    }

    if (this.phase === 'blocking') {
      this.katanaStamina = Math.max(0, this.katanaStamina - deltaSeconds * KATANA_BLOCK_DRAIN_PER_SECOND);
      this.blockRegenAt = this.time + KATANA_REGEN_DELAY;
      if (this.katanaStamina <= EPSILON) this.breakBlock();
    } else if (this.time >= this.blockRegenAt) {
      this.katanaStamina = Math.min(KATANA_MAX_STAMINA, this.katanaStamina + deltaSeconds * KATANA_STAMINA_REGEN_PER_SECOND);
    }
  }

  private breakBlock(): void {
    if (this.phase !== 'blocking') return;
    this.katanaStamina = 0;
    this.blockExhausted = true;
    this.phase = 'idle';
    this.phaseStartedAt = this.time;
    this.phaseEndsAt = this.time;
    this.phaseDuration = 0;
    this.blockRegenAt = this.time + KATANA_REGEN_DELAY;
    this.emitEffect('block-break', 'katana', 1.2);
  }

  private updateAim(deltaSeconds: number): void {
    const canAim = this.enabled
      && !this.switchState
      && this.phase !== 'reloading'
      && this.phase !== 'slashing'
      && !(this.activeWeapon === 'sniper' && this.phase === 'bolting');
    const target = this.aimHeld && canAim ? 1 : 0;
    const blend = 1 - Math.exp(-deltaSeconds * (target > this.aimAlpha ? 15 : 18));
    this.aimAlpha = THREE.MathUtils.lerp(this.aimAlpha, target, blend);
    if (Math.abs(this.aimAlpha - target) < 0.001) this.aimAlpha = target;

    if (this.activeWeapon !== 'sniper' || this.switchState) this.scopeState = 'hidden';
    else if (this.phase === 'bolting') this.scopeState = 'cycling';
    else if (target > 0 && this.aimAlpha >= 0.92) this.scopeState = 'active';
    else if (target > 0) this.scopeState = 'entering';
    else if (this.aimAlpha > 0.03) this.scopeState = 'exiting';
    else this.scopeState = 'hidden';
  }

  private processTrigger(): void {
    if (!this.triggerArmed) return;
    const definition = WEAPON_DEFINITIONS[this.activeWeapon];
    if (definition.fireMode === 'melee') {
      if (this.triggerPressed && this.phase === 'idle') this.startKatanaSlash();
      return;
    }
    if (this.phase !== 'idle' && this.phase !== 'firing') return;

    if (definition.fireMode === 'semi') {
      if (this.triggerPressed) this.fireBallisticAt(this.time);
      return;
    }

    if (!this.triggerHeld) return;
    const runtime = this.runtimes[this.activeWeapon];
    let guard = 0;
    while (runtime.nextFireAt <= this.time + EPSILON && guard < 64) {
      const scheduledTime = runtime.nextFireAt;
      const fired = this.fireBallisticAt(scheduledTime);
      guard += 1;
      if (!fired) break;
    }
  }

  private fireBallisticAt(timestamp: number): boolean {
    const id = this.activeWeapon;
    if (id === 'katana') return false;
    const definition = WEAPON_DEFINITIONS[id];
    const runtime = this.runtimes[id];
    if (timestamp + EPSILON < runtime.nextFireAt) return false;
    if (runtime.magazine === null || runtime.magazine <= 0) {
      runtime.nextFireAt = Math.max(this.time, timestamp) + 0.24;
      this.emitEffect('dry-fire', id, 0.35);
      return false;
    }

    runtime.magazine -= 1;
    runtime.shotsFired += 1;
    runtime.nextFireAt = timestamp + definition.fireInterval;
    this.shotSequence += 1;
    const shotId = this.shotSequence;
    const spread = definition.spread * THREE.MathUtils.lerp(1, 0.3, this.aimAlpha);
    const origin = this.aimOrigin.clone();

    if (id === 'shotgun') {
      const rays = Array.from({ length: definition.pellets ?? 9 }, () => ({
        direction: this.directionWithSpread(spread),
        damage: definition.damage,
      }));
      this.callbacks.onPellets?.({
        shotId,
        weaponId: 'shotgun',
        origin,
        rays,
        range: definition.range,
        knockback: definition.knockback,
        spread,
        timestamp,
      });
    } else {
      this.callbacks.onHitscan?.({
        shotId,
        weaponId: id,
        origin,
        direction: this.directionWithSpread(spread),
        damage: definition.damage,
        range: definition.range,
        knockback: definition.knockback,
        spread,
        timestamp,
      });
    }

    const muzzleDirection = this.aimDirection.clone();
    this.callbacks.onMuzzle?.({
      shotId,
      weaponId: id,
      anchor: this.viewmodels[id].parts.muzzle,
      origin: origin.clone(),
      direction: muzzleDirection,
      intensity: definition.recoil,
      timestamp,
    });
    this.emitAmmoChanged(id);
    this.emitEffect('fire', id, definition.recoil);
    this.addRecoilImpulse(definition.recoil, 1);

    if (id === 'shotgun') this.startPhase('pumping', definition.actionDuration ?? 0.58);
    else if (id === 'sniper') {
      this.startPhase('bolting', definition.actionDuration ?? 0.78);
      this.scopeState = 'cycling';
    }
    else this.startPhase('firing', id === 'revolver' ? 0.16 : 0.055);
    return true;
  }

  private startKatanaSlash(): void {
    const definition = WEAPON_DEFINITIONS.katana;
    this.attackSequence += 1;
    this.katanaSlashVariant = this.attackSequence % 2 === 1 ? 'forward' : 'reverse';
    this.katanaPendingAttackId = this.attackSequence;
    this.startPhase('slashing', definition.actionDuration ?? 0.46);
    this.emitEffect('slash', 'katana', 1);
    this.addRecoilImpulse(0.22, -1);
  }

  private emitKatanaStrikeIfDue(): void {
    if (this.phase !== 'slashing' || this.katanaPendingAttackId === null) return;
    const progress = this.getPhaseProgress();
    if (progress + EPSILON < KATANA_CONTACT_PROGRESS) return;
    const definition = WEAPON_DEFINITIONS.katana;
    const attackId = this.katanaPendingAttackId;
    this.katanaPendingAttackId = null;
    this.callbacks.onMelee?.({
      attackId,
      weaponId: 'katana',
      origin: this.aimOrigin.clone(),
      direction: this.aimDirection.clone(),
      damage: definition.damage,
      range: definition.range,
      arcRadians: KATANA_ARC_RADIANS,
      knockback: definition.knockback,
      timestamp: this.phaseStartedAt + this.phaseDuration * KATANA_CONTACT_PROGRESS,
    });
  }

  private directionWithSpread(spread: number): THREE.Vector3 {
    if (spread <= EPSILON) return this.aimDirection.clone();
    const right = new THREE.Vector3().crossVectors(this.aimDirection, this.aimUp);
    if (right.lengthSq() <= EPSILON) right.set(1, 0, 0);
    else right.normalize();
    const correctedUp = new THREE.Vector3().crossVectors(right, this.aimDirection).normalize();
    const radius = Math.sqrt(THREE.MathUtils.clamp(this.random(), 0, 0.999999)) * spread;
    const angle = THREE.MathUtils.clamp(this.random(), 0, 0.999999) * Math.PI * 2;
    return this.aimDirection.clone()
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(correctedUp, Math.sin(angle) * radius)
      .normalize();
  }

  private startPhase(phase: WeaponPhase, duration: number): void {
    this.phase = phase;
    this.phaseStartedAt = this.time;
    this.phaseDuration = Math.max(0, duration);
    this.phaseEndsAt = this.time + this.phaseDuration;
  }

  private addRecoilImpulse(strength: number, direction: 1 | -1): void {
    const randomYaw = (this.random() - 0.5) * strength;
    this.recoilPositionVelocity.z += strength * 0.48 * direction;
    this.recoilPositionVelocity.y -= strength * 0.075;
    this.recoilRotationVelocity.x += strength * 0.54 * direction;
    this.recoilRotationVelocity.y += randomYaw * 0.1;
    this.recoilRotationVelocity.z += randomYaw * 0.07;
    this.cameraRotation.x += strength * 0.0065 * direction;
    this.cameraRotation.y += randomYaw * 0.0016;
  }

  private updateOffsets(deltaSeconds: number): void {
    this.integrateRecoil(deltaSeconds);

    const swayBlend = 1 - Math.exp(-deltaSeconds * 18);
    const targetSwayX = THREE.MathUtils.clamp(-this.lookDeltaX * 0.0007, -0.035, 0.035);
    const targetSwayY = THREE.MathUtils.clamp(this.lookDeltaY * 0.00055, -0.028, 0.028);
    this.swayPosition.x = THREE.MathUtils.lerp(this.swayPosition.x, targetSwayX, swayBlend);
    this.swayPosition.y = THREE.MathUtils.lerp(this.swayPosition.y, targetSwayY, swayBlend);
    this.swayPosition.z = THREE.MathUtils.lerp(this.swayPosition.z, 0, swayBlend);
    this.swayRotation.x = THREE.MathUtils.lerp(this.swayRotation.x, -targetSwayY * 0.7, swayBlend);
    this.swayRotation.y = THREE.MathUtils.lerp(this.swayRotation.y, targetSwayX * 0.95, swayBlend);
    this.swayRotation.z = THREE.MathUtils.lerp(this.swayRotation.z, -targetSwayX * 0.42, swayBlend);
    this.lookDeltaX *= Math.exp(-deltaSeconds * 22);
    this.lookDeltaY *= Math.exp(-deltaSeconds * 22);

    const speedWeight = THREE.MathUtils.clamp(this.motion.speed / (this.motion.sprinting ? 10.2 : 8.4), 0, 1.08);
    const groundedWeight = this.motion.grounded ? 1 : 0.18;
    if (this.motion.gaitPhase === undefined) {
      const cycleDistance = this.motion.sprinting ? 5.5 : 5.0;
      this.bobPhase += (this.motion.speed * deltaSeconds / cycleDistance) * Math.PI * 2;
    } else {
      this.bobPhase = this.motion.gaitPhase;
    }
    const sharedWeight = this.motion.gaitWeight ?? speedWeight;
    const bobWeight = sharedWeight * groundedWeight * (1 - this.aimAlpha * 0.72);
    this.headbobPosition.set(
      Math.sin(this.bobPhase) * 0.059 * bobWeight,
      -Math.abs(Math.sin(this.bobPhase)) * 0.048 * bobWeight,
      Math.cos(this.bobPhase * 2) * 0.004 * bobWeight,
    );
    this.headbobPosition.x += this.motion.strafe * 0.004 * bobWeight;
    this.headbobRotation.set(
      Math.cos(this.bobPhase * 2) * 0.002 * bobWeight,
      this.motion.strafe * -0.0015 * bobWeight,
      Math.sin(this.bobPhase) * -0.0022 * bobWeight,
    );

    this.combinedPosition.copy(this.recoilPosition).add(this.swayPosition).add(this.headbobPosition);
    this.combinedRotation.copy(this.recoilRotation).add(this.swayRotation).add(this.headbobRotation);
    this.viewmodelRoot.position.copy(this.combinedPosition);
    this.viewmodelRoot.rotation.set(this.combinedRotation.x, this.combinedRotation.y, this.combinedRotation.z);
  }

  private integrateRecoil(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    let remaining = deltaSeconds;
    while (remaining > EPSILON) {
      const step = Math.min(remaining, 1 / 60);
      this.recoilPosition.addScaledVector(this.recoilPositionVelocity, step);
      this.recoilRotation.addScaledVector(this.recoilRotationVelocity, step);
      this.recoilPositionVelocity.addScaledVector(this.recoilPosition, -85 * step);
      this.recoilRotationVelocity.addScaledVector(this.recoilRotation, -105 * step);
      this.recoilPositionVelocity.multiplyScalar(Math.exp(-13 * step));
      this.recoilRotationVelocity.multiplyScalar(Math.exp(-15 * step));
      this.cameraRotation.multiplyScalar(Math.exp(-12 * step));
      remaining -= step;
    }
  }

  private applyViewmodelPose(): void {
    for (const id of WEAPON_IDS) this.restoreAnimatedParts(this.viewmodels[id]);
    const katanaTrail = this.viewmodels.katana.parts.trail;
    if (katanaTrail) katanaTrail.visible = false;
    const viewmodel = this.viewmodels[this.activeWeapon];
    const poseAlpha = this.activeWeapon === 'katana' ? (this.phase === 'blocking' ? this.aimAlpha : 0) : this.aimAlpha;
    viewmodel.root.position.lerpVectors(viewmodel.hipPose.position, viewmodel.aimPose.position, poseAlpha);
    viewmodel.root.rotation.set(
      THREE.MathUtils.lerp(viewmodel.hipPose.rotation.x, viewmodel.aimPose.rotation.x, poseAlpha),
      THREE.MathUtils.lerp(viewmodel.hipPose.rotation.y, viewmodel.aimPose.rotation.y, poseAlpha),
      THREE.MathUtils.lerp(viewmodel.hipPose.rotation.z, viewmodel.aimPose.rotation.z, poseAlpha),
    );
    viewmodel.root.scale.setScalar(THREE.MathUtils.lerp(viewmodel.hipPose.scale, viewmodel.aimPose.scale, poseAlpha));

    if (this.switchState) {
      const progress = this.switchState.duration <= EPSILON ? 1 : this.switchState.elapsed / this.switchState.duration;
      // The base pose is assigned above on every frame, so this lowering offset
      // is non-accumulating even while a switch spans many updates.
      viewmodel.root.position.y -= Math.sin(progress * Math.PI) * 0.68;
      viewmodel.root.rotation.z += Math.sin(progress * Math.PI) * 0.2;
    }

    const progress = this.getPhaseProgress();
    if (this.phase === 'reloading') this.animateReload(viewmodel, progress);
    if (this.phase === 'pumping' && viewmodel.parts.pump) this.animatePump(viewmodel.parts.pump, progress);
    if (this.phase === 'firing' && this.activeWeapon === 'revolver') this.animateRevolver(viewmodel, progress);
    if (this.phase === 'bolting' && viewmodel.parts.bolt) this.animateBolt(viewmodel.parts.bolt, progress);
    const katanaProgress = this.activeWeapon === 'katana' ? this.katanaReviewProgress : null;
    if (this.phase === 'slashing' || katanaProgress !== null) this.animateSlash(viewmodel, katanaProgress ?? progress);
    if (this.phase === 'blocking') viewmodel.root.rotation.y -= Math.sin(this.time * 3.2) * 0.006;
  }

  private restoreAnimatedParts(viewmodel: WeaponViewmodel): void {
    for (const part of Object.values(viewmodel.parts)) {
      if (!part) continue;
      const home = this.partHomes.get(part);
      if (!home) continue;
      part.position.copy(home.position);
      part.rotation.copy(home.rotation);
      part.scale.copy(home.scale);
    }
  }

  private animateReload(viewmodel: WeaponViewmodel, progress: number): void {
    const curve = Math.sin(progress * Math.PI);
    viewmodel.root.position.y -= curve * 0.18;
    viewmodel.root.rotation.z += curve * 0.34;
    viewmodel.root.rotation.x += curve * 0.08;
    const magazine = viewmodel.parts.magazine;
    if (magazine) {
      const home = this.partHomes.get(magazine);
      if (home) {
        const remove = progress < 0.48 ? easeOutCubic(progress / 0.48) : 1 - easeInOutCubic((progress - 0.48) / 0.52);
        magazine.position.y = home.position.y - remove * 0.58;
        magazine.rotation.z = home.rotation.z + remove * 0.22;
      }
    }
  }

  private animatePump(pump: THREE.Object3D, progress: number): void {
    const home = this.partHomes.get(pump);
    if (!home) return;
    const travel = progress < 0.48
      ? easeOutCubic(progress / 0.48)
      : 1 - easeInOutCubic((progress - 0.48) / 0.52);
    pump.position.z = home.position.z + travel * 0.34;
  }

  private animateRevolver(viewmodel: WeaponViewmodel, progress: number): void {
    const cylinder = viewmodel.parts.cylinder;
    if (cylinder) {
      const home = this.partHomes.get(cylinder);
      if (home) cylinder.rotation.y = home.rotation.y + this.runtimes.revolver.shotsFired * (Math.PI / 3);
    }
    const hammer = viewmodel.parts.hammer;
    if (hammer) {
      const home = this.partHomes.get(hammer);
      if (home) hammer.rotation.x = home.rotation.x - Math.sin(progress * Math.PI) * 0.75;
    }
  }

  private animateBolt(bolt: THREE.Object3D, progress: number): void {
    const home = this.partHomes.get(bolt);
    if (!home) return;
    const lifted = THREE.MathUtils.clamp(progress / 0.18, 0, 1);
    const pull = progress < 0.22
      ? 0
      : progress < 0.54
        ? easeOutCubic((progress - 0.22) / 0.32)
        : 1 - easeInOutCubic((progress - 0.54) / 0.34);
    bolt.rotation.z = home.rotation.z - lifted * 0.78 * (1 - Math.max(0, progress - 0.88) / 0.12);
    bolt.position.z = home.position.z + pull * 0.34;
  }

  private animateSlash(viewmodel: WeaponViewmodel, progress: number): void {
    const action = viewmodel.parts.action;
    if (!action) return;
    const sample = sampleKatanaSlash(progress, this.katanaSlashVariant);
    action.position.x += sample.position[0];
    action.position.y += sample.position[1];
    action.position.z += sample.position[2];
    action.rotation.x += sample.rotation[0];
    action.rotation.y += sample.rotation[1];
    action.rotation.z += sample.rotation[2];
    const trail = viewmodel.parts.trail;
    if (trail) {
      trail.visible = sample.trail > 0.04;
      const trailScale = 0.86 + sample.trail * 0.18;
      trail.scale.set(this.katanaSlashVariant === 'reverse' ? -trailScale : trailScale, trailScale, trailScale);
      trail.rotation.z = -0.08 * sample.trail;
    }
  }

  private getPhaseProgress(): number {
    if (this.phase === 'idle') return 1;
    if (this.phase === 'blocking') return 1;
    if (this.switchState) return this.switchState.duration <= EPSILON ? 1 : this.switchState.elapsed / this.switchState.duration;
    if (this.phaseDuration <= EPSILON || !Number.isFinite(this.phaseDuration)) return 0;
    return THREE.MathUtils.clamp((this.time - this.phaseStartedAt) / this.phaseDuration, 0, 1);
  }

  private emitAmmoChanged(id: WeaponId): void {
    const runtime = this.runtimes[id];
    this.callbacks.onAmmoChanged?.(id, runtime.magazine, runtime.reserve);
  }

  private emitEffect(kind: WeaponEffectKind, weaponId: WeaponId, strength?: number, perfect?: boolean): void {
    this.callbacks.onEffect?.({
      kind,
      weaponId,
      position: this.aimOrigin.clone(),
      direction: this.aimDirection.clone(),
      strength,
      perfect,
      timestamp: this.time,
    });
  }

  getOffsets(): ViewmodelOffsetsSnapshot {
    return Object.freeze({
      position: asTuple(this.combinedPosition),
      rotation: asTuple(this.combinedRotation),
      recoilPosition: asTuple(this.recoilPosition),
      recoilRotation: asTuple(this.recoilRotation),
      swayPosition: asTuple(this.swayPosition),
      swayRotation: asTuple(this.swayRotation),
      headbobPosition: asTuple(this.headbobPosition),
      headbobRotation: asTuple(this.headbobRotation),
      cameraRotation: asTuple(this.cameraRotation),
    });
  }

  getSnapshot(): WeaponStateSnapshot {
    const ammo = {} as Record<WeaponId, AmmoSnapshot>;
    for (const id of WEAPON_IDS) ammo[id] = immutableAmmo(this.runtimes[id], WEAPON_DEFINITIONS[id]);
    const activeDefinition = WEAPON_DEFINITIONS[this.activeWeapon];
    const aiming = this.aimAlpha > 0.01 && this.activeWeapon !== 'katana';
    const desiredFov = THREE.MathUtils.lerp(this.baseFov, activeDefinition.adsFov, this.activeWeapon === 'katana' ? 0 : this.aimAlpha);
    const remaining = this.switchState
      ? Math.max(0, this.switchState.duration - this.switchState.elapsed)
      : Number.isFinite(this.phaseEndsAt)
        ? Math.max(0, this.phaseEndsAt - this.time)
        : Infinity;
    return Object.freeze({
      time: this.time,
      activeWeapon: this.activeWeapon,
      activeSlot: activeDefinition.slot,
      pendingWeapon: this.switchState?.to ?? null,
      phase: this.phase,
      phaseProgress: this.getPhaseProgress(),
      phaseRemaining: remaining,
      triggerHeld: this.triggerHeld,
      aimHeld: this.aimHeld,
      aiming,
      aimAlpha: this.aimAlpha,
      desiredFov,
      scopeState: this.scopeState,
      ammo: Object.freeze(ammo),
      katana: Object.freeze({
        blocking: this.phase === 'blocking',
        stamina: this.katanaStamina,
        maxStamina: KATANA_MAX_STAMINA,
        perfectWindowOpen: this.phase === 'blocking' && this.time - this.blockStartedAt <= KATANA_PERFECT_WINDOW,
      }),
      offsets: this.getOffsets(),
    });
  }
}
