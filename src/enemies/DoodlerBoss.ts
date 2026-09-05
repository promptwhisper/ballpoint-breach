import * as THREE from 'three';
import { DoodleEnemy, type EnemyRuntimeContext } from './DoodleEnemy';
import type { EnemyAttackKind, EnemyEvent, EnemySpawnOptions } from './types';

type BossAttack = Exclude<EnemyAttackKind, 'melee'>;

interface BossAttackTiming {
  telegraph: number;
  active: number;
  recovery: number;
}

const ATTACK_SEQUENCE: readonly BossAttack[] = ['charge', 'sweep', 'projectile', 'slam', 'summon'];

const ATTACK_TIMINGS: Readonly<Record<BossAttack, BossAttackTiming>> = {
  projectile: { telegraph: 0.7, active: 0.18, recovery: 0.5 },
  charge: { telegraph: 0.88, active: 0.82, recovery: 0.58 },
  sweep: { telegraph: 0.72, active: 0.34, recovery: 0.62 },
  slam: { telegraph: 1.02, active: 0.2, recovery: 0.76 },
  summon: { telegraph: 0.96, active: 0.12, recovery: 0.7 },
};

export class DoodlerBoss extends DoodleEnemy {
  readonly displayName = 'THE DOODLER';

  private currentPhase: 1 | 2 = 1;
  private bossAttack: BossAttack = 'charge';
  private attackIndex = 0;
  private actionStarted = false;
  private impactApplied = false;

  constructor(
    id: string,
    position: THREE.Vector3,
    seed: number,
    emitEvent: (event: EnemyEvent) => void,
    options: EnemySpawnOptions = {},
    despawnDelay = 3.4,
  ) {
    super(id, 'boss', position, seed, emitEvent, options, despawnDelay);
  }

  get phase(): 1 | 2 {
    return this.currentPhase;
  }

  override update(deltaSeconds: number, context: EnemyRuntimeContext): void {
    if (this.state === 'dead') {
      super.update(deltaSeconds, context);
      return;
    }

    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.elapsed += delta;
    this.stateTime += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.updateKnockback(delta, context);
    this.updateGrounding(delta, context);
    if (this.object.position.y < context.fallDeathY) {
      this.forceDeath('fall');
      return;
    }

    if (this.currentPhase === 1 && this.health <= this.maxHealth * 0.5) {
      this.currentPhase = 2;
      this.emitEvent({
        type: 'boss-phase',
        enemyId: this.id,
        kind: this.kind,
        position: this.position.clone(),
        phase: 2,
      });
    }

    const toPlayer = context.player.position.clone().sub(this.position);
    const distance = Math.hypot(toPlayer.x, toPlayer.z);
    switch (this.state) {
      case 'idle':
        this.poseIdle();
        if (this.stateTime >= 0.85) this.transition('seek');
        break;
      case 'seek':
      case 'strafe':
        this.faceDirection(toPlayer, delta);
        if (this.attackCooldown <= 0 && context.player.alive !== false) {
          this.startBossAttack(distance);
        } else {
          if (distance > 3.3) this.moveToward(context.player.position, this.stats.speed * (this.currentPhase === 2 ? 1.24 : 1), delta, context);
          this.poseWalk(this.elapsed * (this.currentPhase === 2 ? 7.4 : 5.8));
        }
        break;
      case 'attack':
        this.updateBossAttack(delta, context, toPlayer, distance);
        break;
      case 'stagger':
        this.poseStagger();
        if (this.stateTime >= (this.currentPhase === 2 ? 0.25 : 0.4)) this.transition('seek');
        break;
    }
  }

  private startBossAttack(distance: number): void {
    let next = ATTACK_SEQUENCE[this.attackIndex % ATTACK_SEQUENCE.length] ?? 'charge';
    this.attackIndex += 1;
    if (distance > 13 && (next === 'sweep' || next === 'slam')) next = 'charge';
    if (distance < 3.2 && next === 'charge') next = this.attackIndex % 2 === 0 ? 'sweep' : 'slam';
    this.bossAttack = next;
    this.actionStarted = false;
    this.impactApplied = false;
    this.transition('attack');
    const timing = this.getTiming();
    this.emitEvent({
      type: 'attack-telegraph',
      enemyId: this.id,
      kind: this.kind,
      position: this.getChestPosition(),
      attack: this.bossAttack,
      telegraphDuration: timing.telegraph,
      phase: this.currentPhase,
    });
  }

  private updateBossAttack(
    delta: number,
    context: EnemyRuntimeContext,
    toPlayer: THREE.Vector3,
    distance: number,
  ): void {
    const timing = this.getTiming();
    this.faceDirection(toPlayer, delta);
    this.poseBossAttack(timing);

    if (!this.actionStarted && this.stateTime >= timing.telegraph) {
      this.actionStarted = true;
      this.emitEvent({
        type: 'attack',
        enemyId: this.id,
        kind: this.kind,
        position: this.getChestPosition(),
        attack: this.bossAttack,
        phase: this.currentPhase,
      });
      this.beginBossAction(context, distance);
    }

    if (this.actionStarted && this.bossAttack === 'charge' && this.stateTime < timing.telegraph + timing.active) {
      this.moveToward(context.player.position, this.currentPhase === 2 ? 12.5 : 10.2, delta, context);
      if (!this.impactApplied && this.position.distanceTo(context.player.position) <= 2.05 + (context.player.radius ?? 0.45)) {
        this.impactApplied = true;
        this.damagePlayer(context, 28, 'charge', 2.5);
      }
    }

    const total = timing.telegraph + timing.active + timing.recovery;
    if (this.stateTime >= total) {
      this.attackCooldown = this.stats.attackCooldown * (this.currentPhase === 2 ? 0.58 : 1);
      this.transition('seek');
    }
  }

  private beginBossAction(context: EnemyRuntimeContext, distance: number): void {
    switch (this.bossAttack) {
      case 'charge':
        break;
      case 'sweep':
        if (distance <= 3.7 + (context.player.radius ?? 0.45)) this.damagePlayer(context, 24, 'sweep', 4.1);
        this.impactApplied = true;
        break;
      case 'slam':
        if (distance <= 5.0 + (context.player.radius ?? 0.45)) this.damagePlayer(context, 30, 'slam', 5.3);
        this.spawnSlamRing(context);
        this.impactApplied = true;
        break;
      case 'projectile':
        this.spawnProjectileVolley(context);
        this.impactApplied = true;
        break;
      case 'summon': {
        const count = this.currentPhase === 2 ? 3 : 2;
        context.emitAction({
          type: 'summon',
          enemy: this,
          count,
          preferredKinds: this.currentPhase === 2 ? ['rusher', 'grunt', 'marksman'] : ['rusher', 'grunt'],
        });
        this.emitEvent({
          type: 'boss-summon',
          enemyId: this.id,
          kind: this.kind,
          position: this.position.clone(),
          attack: 'summon',
          count,
          phase: this.currentPhase,
        });
        this.impactApplied = true;
        break;
      }
    }
  }

  private damagePlayer(context: EnemyRuntimeContext, amount: number, attack: EnemyAttackKind, range: number): void {
    context.emitAction({
      type: 'damage-player',
      enemy: this,
      amount: amount * (this.currentPhase === 2 ? 1.12 : 1),
      attack,
      range,
      origin: this.getChestPosition(),
    });
  }

  private spawnProjectileVolley(context: EnemyRuntimeContext): void {
    const origin = this.getChestPosition().add(new THREE.Vector3(0, 0.3, 0));
    const targetDirection = context.player.position.clone().add(new THREE.Vector3(0, 0.35, 0)).sub(origin).normalize();
    const count = this.currentPhase === 2 ? 7 : 5;
    for (let index = 0; index < count; index += 1) {
      const offset = index - (count - 1) / 2;
      const direction = targetDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offset * 0.115).normalize();
      context.emitAction({
        type: 'projectile',
        enemy: this,
        origin,
        direction,
        speed: this.currentPhase === 2 ? 21 : 18,
        damage: 14,
        radius: 0.17,
        attack: 'projectile',
      });
    }
  }

  private spawnSlamRing(context: EnemyRuntimeContext): void {
    const origin = this.position.clone().add(new THREE.Vector3(0, 0.22, 0));
    const count = this.currentPhase === 2 ? 12 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      context.emitAction({
        type: 'projectile',
        enemy: this,
        origin,
        direction: new THREE.Vector3(Math.sin(angle), 0.035, Math.cos(angle)),
        speed: this.currentPhase === 2 ? 13 : 10.5,
        damage: 10,
        radius: 0.11,
        attack: 'slam',
      });
    }
  }

  private poseBossAttack(timing: BossAttackTiming): void {
    const telegraphAmount = THREE.MathUtils.clamp(this.stateTime / timing.telegraph, 0, 1);
    const pulse = Math.sin(telegraphAmount * Math.PI * 5) * 0.055;
    this.rig.torso.rotation.z = pulse;
    this.rig.head.rotation.x = -telegraphAmount * 0.16;
    this.rig.leftLeg.rotation.x *= 0.82;
    this.rig.rightLeg.rotation.x *= 0.82;
    const pencil = this.rig.pencilPivot;
    if (!pencil) return;
    switch (this.bossAttack) {
      case 'charge':
        pencil.rotation.set(-1.22, 0.1, -0.28);
        this.rig.torso.rotation.x = -telegraphAmount * 0.24;
        break;
      case 'sweep': {
        const activeAmount = THREE.MathUtils.clamp((this.stateTime - timing.telegraph) / timing.active, 0, 1);
        pencil.rotation.set(-0.18, 0, -1.75 + activeAmount * 3.25);
        break;
      }
      case 'slam': {
        const activeAmount = THREE.MathUtils.clamp((this.stateTime - timing.telegraph) / timing.active, 0, 1);
        pencil.rotation.set(-0.2 + activeAmount * 1.7, 0, -0.2 - telegraphAmount * 2.2);
        break;
      }
      case 'projectile':
        pencil.rotation.set(-0.4, Math.sin(this.stateTime * 8) * 0.22, -0.9);
        break;
      case 'summon':
        pencil.rotation.set(-0.15, 0, -Math.PI + Math.sin(this.stateTime * 9) * 0.12);
        break;
    }
  }

  private getTiming(): BossAttackTiming {
    const base = ATTACK_TIMINGS[this.bossAttack];
    const factor = this.currentPhase === 2 ? 0.7 : 1;
    return { telegraph: base.telegraph * factor, active: base.active * factor, recovery: base.recovery * factor };
  }

}
