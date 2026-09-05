import * as THREE from 'three';
import {
  applyDeathInkToDoodleRig,
  createDoodleRig,
  flashDeathInkOnDoodleRig,
  type DoodleRig,
} from './doodleRig';
import type {
  EnemyAttackKind,
  EnemyDamage,
  EnemyDamageResult,
  EnemyDeathCause,
  EnemyEvent,
  EnemyHitZone,
  EnemyKind,
  EnemySpawnOptions,
  EnemyState,
  EnemyView,
  PlayerTarget,
  RegularEnemyKind,
} from './types';

export interface EnemyStats {
  maxHealth: number;
  speed: number;
  preferredMinRange: number;
  attackRange: number;
  attackCooldown: number;
  attackWindup: number;
  attackRecovery: number;
  damage: number;
  projectileSpeed: number;
  collisionRadius: number;
  staggerThreshold: number;
}

export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
  grunt: {
    maxHealth: 90,
    speed: 2.35,
    preferredMinRange: 5,
    attackRange: 14,
    attackCooldown: 1.35,
    attackWindup: 0.38,
    attackRecovery: 0.32,
    damage: 9,
    projectileSpeed: 18,
    collisionRadius: 0.42,
    staggerThreshold: 24,
  },
  rusher: {
    maxHealth: 58,
    speed: 4.5,
    preferredMinRange: 0,
    attackRange: 1.7,
    attackCooldown: 0.95,
    attackWindup: 0.24,
    attackRecovery: 0.4,
    damage: 14,
    projectileSpeed: 0,
    collisionRadius: 0.36,
    staggerThreshold: 15,
  },
  heavy: {
    maxHealth: 260,
    speed: 1.45,
    preferredMinRange: 3.8,
    attackRange: 10,
    attackCooldown: 2.35,
    attackWindup: 0.72,
    attackRecovery: 0.66,
    damage: 8,
    projectileSpeed: 15,
    collisionRadius: 0.58,
    staggerThreshold: 52,
  },
  marksman: {
    maxHealth: 70,
    speed: 1.7,
    preferredMinRange: 11,
    attackRange: 31,
    attackCooldown: 2.4,
    attackWindup: 0.92,
    attackRecovery: 0.5,
    damage: 19,
    projectileSpeed: 30,
    collisionRadius: 0.4,
    staggerThreshold: 20,
  },
  boss: {
    maxHealth: 1800,
    speed: 2.1,
    preferredMinRange: 2.5,
    attackRange: 24,
    attackCooldown: 2.8,
    attackWindup: 0.8,
    attackRecovery: 0.6,
    damage: 24,
    projectileSpeed: 18,
    collisionRadius: 0.72,
    staggerThreshold: 95,
  },
};

export type EnemyAction =
  | {
    type: 'damage-player';
    enemy: DoodleEnemy;
    amount: number;
    attack: EnemyAttackKind;
    range: number;
    origin: THREE.Vector3;
  }
  | {
    type: 'projectile';
    enemy: DoodleEnemy;
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    speed: number;
    damage: number;
    radius?: number;
    attack?: EnemyAttackKind;
  }
  | {
    type: 'summon';
    enemy: DoodleEnemy;
    count: number;
    preferredKinds: readonly RegularEnemyKind[];
  };

export interface EnemyRuntimeContext {
  elapsed: number;
  player: PlayerTarget;
  separation: THREE.Vector3;
  fallDeathY: number;
  hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3, enemy: EnemyView) => boolean;
  resolveMovement: (enemy: EnemyView, proposedPosition: THREE.Vector3) => THREE.Vector3;
  groundHeight?: (position: THREE.Vector3, enemy: EnemyView) => number | null;
  navigationTarget: (enemy: EnemyView, playerPosition: THREE.Vector3) => THREE.Vector3 | null;
  emitAction: (action: EnemyAction) => void;
}

type EventSink = (event: EnemyEvent) => void;

function seededUnit(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export class DoodleEnemy implements EnemyView {
  readonly object = new THREE.Group();
  readonly rig: DoodleRig;
  readonly stats: EnemyStats;
  readonly collisionRadius: number;
  readonly maxHealth: number;

  health: number;
  state: EnemyState = 'idle';

  protected stateTime = 0;
  protected attackCooldown = 0;
  protected attackFired = false;
  protected elapsed = 0;
  protected deathTime = 0;
  protected verticalVelocity = 0;
  protected readonly knockbackVelocity = new THREE.Vector3();
  protected readonly lastDamageDirection = new THREE.Vector3(0, 0.12, 1).normalize();
  protected readonly random: () => number;
  protected strafeSign = 1;
  protected strafeDuration = 0.8;
  protected deathCause: EnemyDeathCause = 'bullet';

  private cleanupReady = false;
  private airbornePeakY: number | null = null;
  private readonly despawnDelay: number;
  private blockedMovementTime = 0;
  private forcedNavigationTime = 0;
  private navigationCommitTime = 0;
  private escapeSign = 1;
  private readonly trackedMovementTarget = new THREE.Vector3(Number.NaN, 0, Number.NaN);
  private bestMovementTargetDistance = Number.POSITIVE_INFINITY;
  private movementTargetStalledFor = 0;
  private hitInkTime = 0;
  private restoreHitInk: (() => void) | null = null;

  constructor(
    readonly id: string,
    readonly kind: EnemyKind,
    position: THREE.Vector3,
    seed: number,
    protected readonly emitEvent: EventSink,
    options: EnemySpawnOptions = {},
    despawnDelay = 2.6,
  ) {
    this.stats = ENEMY_STATS[kind];
    this.maxHealth = this.stats.maxHealth * Math.max(0.1, options.healthScale ?? 1);
    this.health = this.maxHealth;
    this.collisionRadius = this.stats.collisionRadius;
    this.despawnDelay = despawnDelay;
    this.random = seededUnit(seed);
    this.strafeSign = this.random() < 0.5 ? -1 : 1;
    this.escapeSign = this.strafeSign;
    this.rig = createDoodleRig(kind, seed);
    this.object.name = `enemy:${id}`;
    this.object.position.copy(position);
    this.object.rotation.y = options.yaw ?? this.random() * Math.PI * 2;
    this.object.userData.enemyId = id;
    this.object.userData.enemyKind = kind;
    this.object.add(this.rig.root);
    for (const hit of this.rig.hitMeshes) {
      hit.mesh.userData.enemyId = id;
      hit.mesh.userData.enemyKind = kind;
      hit.mesh.userData.hitZone = hit.zone;
    }
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get shouldCleanup(): boolean {
    return this.cleanupReady;
  }

  get hitMeshes(): readonly THREE.Mesh[] {
    return this.rig.hitMeshes.map((hit) => hit.mesh);
  }

  getHitZone(mesh: THREE.Object3D): EnemyHitZone | null {
    const match = this.rig.hitMeshes.find((hit) => hit.mesh === mesh);
    return match?.zone ?? null;
  }

  update(deltaSeconds: number, context: EnemyRuntimeContext): void {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.elapsed += delta;
    this.stateTime += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.forcedNavigationTime = Math.max(0, this.forcedNavigationTime - delta);
    this.navigationCommitTime = Math.max(0, this.navigationCommitTime - delta);
    if (this.hitInkTime > 0) {
      this.hitInkTime = Math.max(0, this.hitInkTime - delta);
      if (this.hitInkTime === 0 && this.restoreHitInk) {
        this.restoreHitInk();
        this.restoreHitInk = null;
      }
    }

    if (this.state === 'dead') {
      this.updateDeath(delta, context);
      return;
    }

    this.updateKnockback(delta, context);
    this.updateGrounding(delta, context);
    if (this.object.position.y < context.fallDeathY) {
      this.die('fall');
      return;
    }

    const toPlayer = context.player.position.clone().sub(this.object.position);
    const flatDistance = Math.hypot(toPlayer.x, toPlayer.z);
    const eye = this.getEyePosition();
    const hasSight = context.player.alive !== false && context.hasLineOfSight(eye, context.player.position, this);
    if (!hasSight) this.navigationCommitTime = Math.max(this.navigationCommitTime, 5);
    if (this.forcedNavigationTime > 0 && this.state === 'strafe') this.transition('seek');

    switch (this.state) {
      case 'idle':
        this.poseIdle();
        if (this.stateTime >= 0.18 + this.random() * 0.22) this.transition('seek');
        break;
      case 'seek':
        this.updateSeek(delta, context, toPlayer, flatDistance, hasSight);
        break;
      case 'strafe':
        this.updateStrafe(delta, context, toPlayer, flatDistance, hasSight);
        break;
      case 'attack':
        this.updateAttack(context, toPlayer);
        break;
      case 'stagger':
        this.poseStagger();
        if (this.stateTime >= 0.28) this.transition('seek');
        break;
    }
  }

  applyDamage(damage: EnemyDamage): EnemyDamageResult {
    if (!this.alive || damage.amount <= 0) {
      return { applied: 0, killed: false, headshot: false, remainingHealth: this.health };
    }
    const zone = damage.hitZone ?? 'torso';
    const headshot = zone === 'head';
    let multiplier = headshot ? (this.kind === 'heavy' ? 2.55 : this.kind === 'boss' ? 1.35 : 2) : zone === 'limb' ? 0.82 : 1;
    if (this.kind === 'heavy' && damage.type === 'shotgun') multiplier *= 1.4;
    if (this.kind === 'rusher' && damage.type === 'melee') multiplier *= 1.2;
    const applied = Math.min(this.health, damage.amount * multiplier);
    this.health = Math.max(0, this.health - damage.amount * multiplier);
    const killed = this.health <= 0;
    if (!killed && damage.type === 'melee') {
      this.restoreHitInk?.();
      this.restoreHitInk = flashDeathInkOnDoodleRig(this.rig);
      this.hitInkTime = 0.125;
    }

    if (damage.direction && (damage.impulse ?? 0) > 0) {
      const push = damage.direction.clone().normalize().multiplyScalar(damage.impulse ?? 0);
      this.knockbackVelocity.add(push);
      this.verticalVelocity += Math.max(0, push.y) + (damage.impulse ?? 0) * 0.08;
    }
    if (damage.direction && damage.direction.lengthSq() > 0.001) this.lastDamageDirection.copy(damage.direction).normalize();

    const point = damage.point?.clone() ?? this.getChestPosition();
    this.emitEvent({
      type: 'hit',
      enemyId: this.id,
      kind: this.kind,
      position: point,
      damage: applied,
      damageType: damage.type,
      killed,
      hitZone: zone,
      headshot,
      direction: damage.direction?.clone(),
    });
    if (this.health > 0) {
      this.emitEvent({ type: 'ink-impact', enemyId: this.id, kind: this.kind, position: point, hitZone: zone, headshot });
    }

    if (this.health <= 0) {
      this.die(damage.type ?? 'bullet');
    } else if (headshot || applied >= this.stats.staggerThreshold) {
      this.transition('stagger');
    }
    return { applied, killed: !this.alive, headshot, remainingHealth: this.health };
  }

  addKnockback(direction: THREE.Vector3, strength: number): void {
    if (!this.alive || strength <= 0) return;
    this.knockbackVelocity.addScaledVector(direction.clone().normalize(), strength);
    this.verticalVelocity += Math.max(0.4, strength * 0.08);
    if (strength >= 5) this.transition('stagger');
  }

  forceDeath(cause: EnemyDeathCause = 'environment'): void {
    this.die(cause);
  }

  protected updateSeek(
    delta: number,
    context: EnemyRuntimeContext,
    toPlayer: THREE.Vector3,
    distance: number,
    hasSight: boolean,
  ): void {
    if (hasSight) this.faceDirection(toPlayer, delta);
    if (this.kind === 'rusher') {
      if (hasSight && distance <= this.stats.attackRange) {
        if (this.attackCooldown <= 0) this.beginAttack();
        else this.poseIdle();
        return;
      }
      const useNavigation = !hasSight || this.navigationCommitTime > 0 || this.forcedNavigationTime > 0;
      const target = useNavigation
        ? context.navigationTarget(this, context.player.position) ?? context.player.position
        : context.player.position;
      this.moveToward(target, this.stats.speed, delta, context, this.forcedNavigationTime > 0);
      this.poseWalk(this.elapsed * 10);
      return;
    }

    if (hasSight && distance <= this.stats.attackRange) {
      if (distance >= this.stats.preferredMinRange && this.attackCooldown <= 0) {
        this.beginAttack();
      } else {
        this.strafeDuration = 0.55 + this.random() * 0.55;
        this.transition('strafe');
      }
      return;
    }
    const useNavigation = !hasSight || this.navigationCommitTime > 0 || this.forcedNavigationTime > 0;
    const target = useNavigation
      ? context.navigationTarget(this, context.player.position) ?? context.player.position
      : context.player.position;
    this.moveToward(target, this.stats.speed, delta, context, this.forcedNavigationTime > 0);
    this.poseWalk(this.elapsed * 7.5);
  }

  protected updateStrafe(
    delta: number,
    context: EnemyRuntimeContext,
    toPlayer: THREE.Vector3,
    distance: number,
    hasSight: boolean,
  ): void {
    if (!hasSight) {
      this.transition('seek');
      return;
    }
    this.faceDirection(toPlayer, delta);
    const radial = toPlayer.clone().setY(0).normalize();
    const tangent = new THREE.Vector3(radial.z * this.strafeSign, 0, -radial.x * this.strafeSign);
    if (distance < this.stats.preferredMinRange * 0.82) tangent.addScaledVector(radial, -0.85);
    if (distance > this.stats.attackRange * 0.9) tangent.addScaledVector(radial, 0.65);
    this.moveDirection(tangent, this.stats.speed * 0.72, delta, context);
    this.poseWalk(this.elapsed * 8.5);
    this.rig.torso.rotation.z = THREE.MathUtils.lerp(this.rig.torso.rotation.z, -this.strafeSign * 0.09, delta * 8);
    if (this.attackCooldown <= 0 && distance <= this.stats.attackRange) {
      this.beginAttack();
    } else if (this.stateTime >= this.strafeDuration) {
      this.strafeSign *= -1;
      this.transition('seek');
    }
  }

  protected updateAttack(context: EnemyRuntimeContext, toPlayer: THREE.Vector3): void {
    this.faceDirection(toPlayer, 0.12);
    this.poseAim();
    if (!this.attackFired && this.stateTime >= this.stats.attackWindup) {
      this.attackFired = true;
      this.performAttack(context);
      this.attackCooldown = this.stats.attackCooldown;
    }
    if (this.stateTime >= this.stats.attackWindup + this.stats.attackRecovery) {
      this.strafeDuration = 0.45 + this.random() * 0.45;
      this.transition(this.kind === 'rusher' ? 'seek' : 'strafe');
    }
  }

  protected beginAttack(): void {
    this.attackFired = false;
    this.transition('attack');
    this.emitEvent({
      type: 'attack-telegraph',
      enemyId: this.id,
      kind: this.kind,
      position: this.getChestPosition(),
      attack: this.kind === 'rusher' ? 'melee' : 'projectile',
      telegraphDuration: this.stats.attackWindup,
    });
  }

  protected performAttack(context: EnemyRuntimeContext): void {
    const attack: EnemyAttackKind = this.kind === 'rusher' ? 'melee' : 'projectile';
    this.emitEvent({ type: 'attack', enemyId: this.id, kind: this.kind, position: this.getChestPosition(), attack });
    if (this.kind === 'rusher') {
      context.emitAction({
        type: 'damage-player',
        enemy: this,
        amount: this.stats.damage,
        attack: 'melee',
        range: this.stats.attackRange + (context.player.radius ?? 0.45),
        origin: this.getChestPosition(),
      });
      return;
    }

    const origin = this.getMuzzlePosition();
    const target = context.player.position.clone();
    target.y += 0.25;
    if (context.player.velocity) {
      const leadTime = origin.distanceTo(target) / Math.max(1, this.stats.projectileSpeed);
      target.addScaledVector(context.player.velocity, Math.min(0.35, leadTime) * (this.kind === 'marksman' ? 0.75 : 0.35));
    }
    const baseDirection = target.sub(origin).normalize();
    const count = this.kind === 'heavy' ? 3 : 1;
    for (let index = 0; index < count; index += 1) {
      const direction = baseDirection.clone();
      if (count > 1) {
        direction.x += (this.random() - 0.5) * 0.14;
        direction.y += (this.random() - 0.5) * 0.09;
        direction.z += (this.random() - 0.5) * 0.14;
        direction.normalize();
      }
      context.emitAction({
        type: 'projectile',
        enemy: this,
        origin,
        direction,
        speed: this.stats.projectileSpeed,
        damage: this.stats.damage,
        radius: this.kind === 'marksman' ? 0.09 : 0.075,
      });
    }
  }

  protected transition(next: EnemyState): void {
    if (next === this.state) return;
    const previousState = this.state;
    this.state = next;
    this.stateTime = 0;
    this.emitEvent({
      type: 'state-change',
      enemyId: this.id,
      kind: this.kind,
      position: this.object.position.clone(),
      state: next,
      previousState,
    });
  }

  protected faceDirection(direction: THREE.Vector3, delta: number): void {
    if (Math.abs(direction.x) + Math.abs(direction.z) < 0.001) return;
    const targetYaw = Math.atan2(direction.x, direction.z);
    const angle = Math.atan2(Math.sin(targetYaw - this.object.rotation.y), Math.cos(targetYaw - this.object.rotation.y));
    this.object.rotation.y += angle * Math.min(1, Math.max(0.2, delta * 9));
  }

  protected moveToward(
    target: THREE.Vector3,
    speed: number,
    delta: number,
    context: EnemyRuntimeContext,
    escape = false,
  ): void {
    const direction = target.clone().sub(this.object.position).setY(0);
    if (direction.lengthSq() <= 0.18 * 0.18) {
      this.blockedMovementTime = 0;
      this.resetMovementTargetTracking();
      return;
    }
    if (escape && direction.lengthSq() > 0.0001) {
      direction.normalize();
      const tangent = new THREE.Vector3(direction.z * this.escapeSign, 0, -direction.x * this.escapeSign);
      direction.addScaledVector(tangent, 0.7);
    }
    this.moveDirection(direction, speed, delta, context, target);
  }

  protected moveDirection(
    direction: THREE.Vector3,
    speed: number,
    delta: number,
    context: EnemyRuntimeContext,
    progressTarget?: THREE.Vector3,
  ): void {
    if (direction.lengthSq() <= 0.0001) return;
    direction.normalize();
    const intendedDirection = direction.clone();
    if (context.separation.lengthSq() > 0.0001) {
      const separation = context.separation.clone();
      if (separation.lengthSq() > 1) separation.normalize();
      const opposing = intendedDirection.dot(separation) < -0.55;
      direction.addScaledVector(separation, opposing ? 0.5 : 0.82);
      if (direction.lengthSq() < 0.04) direction.copy(intendedDirection);
      direction.normalize();
    }
    const before = this.object.position.clone();
    const proposed = this.object.position.clone().addScaledVector(direction, speed * delta);
    proposed.y = this.object.position.y;
    this.object.position.copy(context.resolveMovement(this, proposed));
    const actualDisplacement = this.object.position.clone().sub(before).setY(0);
    const forwardProgress = Math.max(0, actualDisplacement.dot(direction));
    const requestedDistance = speed * delta;
    if (forwardProgress < Math.max(0.001, requestedDistance * 0.15)) {
      this.blockedMovementTime += delta;
      if (this.blockedMovementTime >= 0.45) {
        this.beginStuckRecovery();
      }
    } else {
      this.blockedMovementTime = Math.max(0, this.blockedMovementTime - delta * 2.5);
    }
    if (progressTarget) this.trackMovementTarget(progressTarget, requestedDistance, delta);
    else this.resetMovementTargetTracking();
  }

  private trackMovementTarget(target: THREE.Vector3, requestedDistance: number, delta: number): void {
    const targetChanged = !Number.isFinite(this.trackedMovementTarget.x)
      || Math.hypot(target.x - this.trackedMovementTarget.x, target.z - this.trackedMovementTarget.z) > 0.8;
    const distance = Math.hypot(target.x - this.object.position.x, target.z - this.object.position.z);
    if (targetChanged) {
      this.trackedMovementTarget.copy(target);
      this.bestMovementTargetDistance = distance;
      this.movementTargetStalledFor = 0;
      return;
    }
    const meaningfulProgress = Math.max(0.012, requestedDistance * 0.12);
    if (distance <= this.bestMovementTargetDistance - meaningfulProgress) {
      this.bestMovementTargetDistance = distance;
      this.movementTargetStalledFor = 0;
      return;
    }
    this.movementTargetStalledFor += delta;
    if (this.movementTargetStalledFor >= 0.45) this.beginStuckRecovery();
  }

  private resetMovementTargetTracking(): void {
    this.trackedMovementTarget.set(Number.NaN, 0, Number.NaN);
    this.bestMovementTargetDistance = Number.POSITIVE_INFINITY;
    this.movementTargetStalledFor = 0;
  }

  private beginStuckRecovery(): void {
    if (this.forcedNavigationTime <= 0) {
      const revision = Number(this.object.userData.navigationRevision ?? 0);
      this.object.userData.navigationRevision = revision + 1;
    }
    this.blockedMovementTime = 0;
    this.movementTargetStalledFor = 0;
    this.bestMovementTargetDistance = Number.POSITIVE_INFINITY;
    this.forcedNavigationTime = Math.max(this.forcedNavigationTime, 5);
  }

  protected getEyePosition(): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return this.rig.head.getWorldPosition(new THREE.Vector3());
  }

  protected getChestPosition(): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return this.rig.torso.getWorldPosition(new THREE.Vector3());
  }

  protected getMuzzlePosition(): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return this.rig.muzzle.getWorldPosition(new THREE.Vector3());
  }

  protected poseIdle(): void {
    const breathe = Math.sin(this.elapsed * 2.4) * 0.025;
    this.rig.torso.position.y = (this.kind === 'boss' ? 1.15 : 1.2) + breathe;
    this.rig.leftArm.rotation.x = THREE.MathUtils.lerp(this.rig.leftArm.rotation.x, 0.08, 0.1);
    this.rig.rightArm.rotation.x = THREE.MathUtils.lerp(this.rig.rightArm.rotation.x, -0.08, 0.1);
    if (this.kind !== 'boss') this.rig.weaponPivot.rotation.x = THREE.MathUtils.lerp(this.rig.weaponPivot.rotation.x, 0, 0.16);
  }

  protected poseWalk(cycle: number): void {
    const swing = Math.sin(cycle) * 0.58;
    this.rig.leftLeg.rotation.x = swing;
    this.rig.rightLeg.rotation.x = -swing;
    this.rig.leftArm.rotation.x = -swing * 0.65;
    this.rig.rightArm.rotation.x = swing * 0.65;
    this.rig.torso.rotation.z *= 0.84;
    this.rig.head.rotation.z = Math.sin(cycle * 0.5) * 0.035;
    if (this.kind !== 'boss') this.rig.weaponPivot.rotation.x = THREE.MathUtils.lerp(this.rig.weaponPivot.rotation.x, 0, 0.18);
  }

  protected poseAim(): void {
    const recoil = this.attackFired ? Math.sin(Math.min(1, (this.stateTime - this.stats.attackWindup) * 18)) * 0.13 : 0;
    this.rig.leftArm.rotation.x = THREE.MathUtils.lerp(this.rig.leftArm.rotation.x, -1.16 + recoil, 0.3);
    this.rig.rightArm.rotation.x = THREE.MathUtils.lerp(this.rig.rightArm.rotation.x, -1.32 + recoil, 0.3);
    this.rig.leftLeg.rotation.x *= 0.8;
    this.rig.rightLeg.rotation.x *= 0.8;
    if (this.kind !== 'boss') this.rig.weaponPivot.rotation.x = THREE.MathUtils.lerp(this.rig.weaponPivot.rotation.x, recoil * 0.45, 0.3);
  }

  protected poseStagger(): void {
    const kick = Math.sin((this.stateTime / 0.28) * Math.PI);
    this.rig.torso.rotation.z = kick * 0.28 * this.strafeSign;
    this.rig.head.rotation.x = -kick * 0.22;
    this.rig.leftArm.rotation.x = kick * 0.8;
    this.rig.rightArm.rotation.x = kick * 0.65;
  }

  protected updateKnockback(delta: number, context: EnemyRuntimeContext): void {
    if (this.knockbackVelocity.lengthSq() <= 0.001) return;
    const proposed = this.object.position.clone().addScaledVector(this.knockbackVelocity, delta);
    proposed.y = this.object.position.y;
    this.object.position.copy(context.resolveMovement(this, proposed));
    this.knockbackVelocity.multiplyScalar(Math.exp(-4.1 * delta));
  }

  protected updateGrounding(delta: number, context: EnemyRuntimeContext): void {
    if (!context.groundHeight) return;
    const ground = context.groundHeight(this.object.position, this);
    if (ground === null || this.object.position.y > ground + 0.04 || this.verticalVelocity > 0) {
      this.airbornePeakY = Math.max(this.airbornePeakY ?? this.object.position.y, this.object.position.y);
      this.verticalVelocity -= 16 * delta;
      this.object.position.y += this.verticalVelocity * delta;
    } else {
      const fallDistance = this.airbornePeakY === null ? 0 : this.airbornePeakY - ground;
      this.object.position.y = ground;
      this.verticalVelocity = 0;
      this.airbornePeakY = null;
      if (fallDistance >= 3.6) this.die('fall');
    }
  }

  private updateDeath(delta: number, context: EnemyRuntimeContext): void {
    this.deathTime += delta;
    if (this.deathTime >= 0.05) this.rig.root.visible = false;
    this.knockbackVelocity.y = this.verticalVelocity;
    const proposed = this.object.position.clone().addScaledVector(this.knockbackVelocity, delta);
    this.object.position.copy(context.resolveMovement(this, proposed));
    this.verticalVelocity -= 13 * delta;
    const ground = context.groundHeight?.(this.object.position, this);
    if (ground !== undefined && ground !== null && this.object.position.y <= ground) {
      this.object.position.y = ground;
      this.verticalVelocity = 0;
    }
    this.knockbackVelocity.y = this.verticalVelocity;
    this.knockbackVelocity.x *= Math.exp(-2.2 * delta);
    this.knockbackVelocity.z *= Math.exp(-2.2 * delta);
    this.rig.root.rotation.z = THREE.MathUtils.lerp(this.rig.root.rotation.z, this.strafeSign * 1.38, delta * 4.5);
    this.rig.root.rotation.x += delta * 0.22;
    if (this.object.position.y < context.fallDeathY - 4 || this.deathTime >= this.despawnDelay) this.cleanupReady = true;
  }

  private die(cause: EnemyDeathCause): void {
    if (!this.alive) return;
    this.health = 0;
    this.deathCause = cause;
    this.verticalVelocity = Math.max(this.verticalVelocity, 1.4);
    this.knockbackVelocity.y = this.verticalVelocity;
    this.restoreHitInk?.();
    this.restoreHitInk = null;
    this.hitInkTime = 0;
    applyDeathInkToDoodleRig(this.rig);
    this.transition('dead');
    this.emitEvent({
      type: 'death',
      enemyId: this.id,
      kind: this.kind,
      position: this.object.position.clone(),
      deathCause: cause,
      direction: this.lastDamageDirection.clone(),
    });
  }
}
