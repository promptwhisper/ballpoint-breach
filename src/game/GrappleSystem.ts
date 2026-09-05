import * as THREE from 'three';
import { EffectPool } from '../effects/EffectPool';
import type { EnemyManager } from '../enemies';
import type { ArenaBuildResult, GrappleAnchor } from '../level';
import type { PlayerController } from '../player/PlayerController';

export type GrappleTarget =
  | { kind: 'enemy'; id: string; point: THREE.Vector3 }
  | { kind: 'anchor'; anchor: GrappleAnchor; point: THREE.Vector3 };

export interface GrappleResult {
  fired: boolean;
  target: GrappleTarget | null;
  blocked: boolean;
}

export class GrappleSystem {
  readonly cooldownSeconds = 3;
  private cooldown = 0;
  private activeFor = 0;
  private activeTarget: GrappleTarget | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly ropeStart = new THREE.Vector3();
  private readonly ropeEnd = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: PlayerController,
    private readonly arena: ArenaBuildResult,
    private readonly enemies: EnemyManager,
    private readonly effects: EffectPool,
  ) {}

  get readyRatio(): number {
    return 1 - THREE.MathUtils.clamp(this.cooldown / this.cooldownSeconds, 0, 1);
  }

  get active(): boolean {
    return this.activeFor > 0 && this.activeTarget !== null;
  }

  fire(): GrappleResult {
    if (this.cooldown > 0 || this.active) return { fired: false, target: null, blocked: false };
    this.camera.getWorldPosition(this.origin);
    this.camera.getWorldDirection(this.direction).normalize();
    this.raycaster.set(this.origin, this.direction);
    this.raycaster.far = 34;

    const worldHit = this.raycaster.intersectObjects(this.arena.raycastMeshes, false)
      .find((hit) => hit.object.userData.raycastDisabled !== true);
    const wallDistance = worldHit?.distance ?? Number.POSITIVE_INFINITY;
    const enemyHit = this.enemies.raycast(this.raycaster, 34);
    const anchorHit = this.findAnchor(this.origin, this.direction, Math.min(34, wallDistance + 0.35));

    let target: GrappleTarget | null = null;
    if (enemyHit && enemyHit.distance < wallDistance - 0.03) {
      target = { kind: 'enemy', id: enemyHit.enemy.id, point: enemyHit.point.clone() };
    }
    if (anchorHit && (!target || anchorHit.distance < this.origin.distanceTo(target.point))) {
      target = { kind: 'anchor', anchor: anchorHit.anchor, point: anchorHit.point };
    }
    if (!target) return { fired: false, target: null, blocked: Number.isFinite(wallDistance) };

    this.activeTarget = target;
    this.activeFor = target.kind === 'enemy' ? 0.64 : 0.48;
    this.cooldown = this.cooldownSeconds;
    if (target.kind === 'enemy') {
      const enemy = this.enemies.getEnemy(target.id);
      if (enemy) {
        const pull = this.player.body.position.clone().sub(enemy.position).setY(0.18).normalize();
        enemy.addKnockback(pull, 8.5);
      }
    }
    this.updateRope();
    return { fired: true, target, blocked: false };
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.activeTarget || this.activeFor <= 0) {
      this.activeTarget = null;
      this.activeFor = 0;
      this.effects.setGrapple(this.ropeStart, this.ropeEnd, false);
      return;
    }

    this.activeFor = Math.max(0, this.activeFor - dt);
    if (this.activeTarget.kind === 'enemy') {
      const enemy = this.enemies.getEnemy(this.activeTarget.id);
      if (!enemy?.alive) {
        this.activeFor = 0;
      } else {
        this.activeTarget.point.copy(enemy.position).add(new THREE.Vector3(0, enemy.kind === 'boss' ? 1.8 : 1.2, 0));
      }
    } else {
      const toAnchor = this.activeTarget.point.clone().sub(this.player.getAimOrigin(this.ropeStart));
      const distance = toAnchor.length();
      if (distance > 1.4) {
        const acceleration = 15 * this.activeTarget.anchor.strength;
        this.player.body.velocity.addScaledVector(toAnchor.normalize(), acceleration * dt);
        this.player.body.velocity.y = Math.max(this.player.body.velocity.y, 2.4 * this.activeTarget.anchor.strength);
      }
    }
    this.updateRope();
  }

  reset(): void {
    this.cooldown = 0;
    this.activeFor = 0;
    this.activeTarget = null;
    this.effects.setGrapple(this.ropeStart, this.ropeEnd, false);
  }

  private updateRope(): void {
    if (!this.activeTarget || this.activeFor <= 0) {
      this.effects.setGrapple(this.ropeStart, this.ropeEnd, false);
      return;
    }
    this.player.getAimOrigin(this.ropeStart);
    this.ropeStart.addScaledVector(this.camera.getWorldDirection(this.direction), 0.42);
    this.ropeEnd.copy(this.activeTarget.point);
    this.effects.setGrapple(this.ropeStart, this.ropeEnd, true);
  }

  private findAnchor(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { anchor: GrappleAnchor; point: THREE.Vector3; distance: number } | null {
    let result: { anchor: GrappleAnchor; point: THREE.Vector3; distance: number } | null = null;
    for (const anchor of this.arena.grappleAnchors) {
      const toCenter = anchor.position.clone().sub(origin);
      const along = toCenter.dot(direction);
      if (along <= 0 || along > maxDistance) continue;
      const closest = origin.clone().addScaledVector(direction, along);
      if (closest.distanceToSquared(anchor.position) > anchor.radius * anchor.radius) continue;
      if (!result || along < result.distance) result = { anchor, point: anchor.position.clone(), distance: along };
    }
    return result;
  }
}
