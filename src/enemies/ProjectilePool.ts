import * as THREE from 'three';
import { ACTIVE_VISUAL_STYLE } from '../render';
import { createInkStamp } from '../render/InkSplat';
import type { EnemyAttackKind, EnemyKind, PlayerTarget } from './types';

const INK_STYLE = ACTIVE_VISUAL_STYLE === 'ink';

export interface EnemyProjectileSpawn {
  ownerId: string;
  ownerKind: EnemyKind;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  damage: number;
  radius?: number;
  maxAge?: number;
  attack?: EnemyAttackKind;
}

export interface EnemyProjectileView {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerKind: EnemyKind;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly damage: number;
  readonly radius: number;
  readonly reflected: boolean;
  readonly attack: EnemyAttackKind;
}

export interface ProjectilePlayerImpact {
  projectile: EnemyProjectileView;
  point: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface ProjectileWorldImpact {
  projectile: EnemyProjectileView;
  point: THREE.Vector3;
}

export interface ProjectileUpdateContext {
  player: PlayerTarget;
  isBlocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  hitReflectedEnemy?: (from: THREE.Vector3, to: THREE.Vector3, projectile: EnemyProjectileView) => boolean;
  onPlayerImpact?: (impact: ProjectilePlayerImpact) => void;
  onWorldImpact?: (impact: ProjectileWorldImpact) => void;
}

interface PooledProjectile extends EnemyProjectileView {
  id: string;
  ownerId: string;
  ownerKind: EnemyKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  reflected: boolean;
  attack: EnemyAttackKind;
  age: number;
  maxAge: number;
  active: boolean;
  object: THREE.Group;
  body: THREE.Mesh;
  inkSprites: THREE.Sprite[];
}

const PROJECTILE_GEOMETRY = new THREE.SphereGeometry(0.075, 7, 5);
const PROJECTILE_EDGES = new THREE.EdgesGeometry(PROJECTILE_GEOMETRY, 12);
const HOSTILE_MATERIAL = new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x9f4139 : 0xd63b55 });
const REFLECTED_MATERIAL = new THREE.MeshBasicMaterial({ color: INK_STYLE ? 0x526b70 : 0x69b887 });
const OUTLINE_MATERIAL = new THREE.LineBasicMaterial({
  color: INK_STYLE ? 0x171b1d : 0x27348f,
  transparent: true,
  opacity: INK_STYLE ? 0.96 : 0.9,
});

const INK_MATERIALS = INK_STYLE ? Array.from({ length: 4 }, (_, index) => {
  const pixels = createInkStamp(128, 91 + index * 37, [255, 255, 255]);
  const map = new THREE.DataTexture(new Uint8Array(pixels.buffer), 128, 128);
  map.needsUpdate = true;
  map.minFilter = map.magFilter = THREE.LinearFilter;
  const hostile = new THREE.SpriteMaterial({ map, color: 0x101916, depthWrite: false, transparent: true,
    opacity: index === 0 ? .96 : .7 - index * .1, rotation: index * 1.7 });
  const reflected = hostile.clone();
  reflected.color.setHex(0x426d76);
  return { hostile, reflected };
}) : [];
const FORWARD = new THREE.Vector3(0, 0, 1);
const travelDirection = new THREE.Vector3();

function createProjectileObject(): { object: THREE.Group; body: THREE.Mesh; inkSprites: THREE.Sprite[] } {
  const object = new THREE.Group();
  object.visible = false;
  const body = new THREE.Mesh(PROJECTILE_GEOMETRY, HOSTILE_MATERIAL);
  const outline = new THREE.LineSegments(PROJECTILE_EDGES, OUTLINE_MATERIAL);
  outline.scale.setScalar(1.06);
  object.add(body, outline);
  const inkSprites = INK_MATERIALS.map((materials, index) => {
    const sprite = new THREE.Sprite(materials.hostile);
    sprite.name = index === 0 ? 'wet-ink-core' : 'trailing-ink-droplet';
    sprite.scale.setScalar(index === 0 ? .62 : .26 - index * .035);
    sprite.position.set(index === 0 ? 0 : Math.sin(index * 4) * .045, index === 0 ? 0 : Math.cos(index * 3) * .04, -index * .15);
    object.add(sprite);
    return sprite;
  });
  if (INK_STYLE) { body.visible = false; outline.visible = false; }
  return { object, body, inkSprites };
}

function segmentDistanceSquared(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): number {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared <= Number.EPSILON) return point.distanceToSquared(start);
  const amount = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return point.distanceToSquared(start.clone().addScaledVector(segment, amount));
}

export class ProjectilePool {
  readonly object = new THREE.Group();

  private readonly projectiles: PooledProjectile[] = [];
  private serial = 0;

  constructor(capacity = 72) {
    this.object.name = 'enemy-projectile-pool';
    for (let index = 0; index < capacity; index += 1) {
      const visual = createProjectileObject();
      this.object.add(visual.object);
      this.projectiles.push({
        id: '',
        ownerId: '',
        ownerKind: 'grunt',
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        damage: 0,
        radius: 0.075,
        reflected: false,
        attack: 'projectile',
        age: 0,
        maxAge: 5,
        active: false,
        object: visual.object,
        body: visual.body,
        inkSprites: visual.inkSprites,
      });
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const projectile of this.projectiles) if (projectile.active) count += 1;
    return count;
  }

  spawn(spec: EnemyProjectileSpawn): EnemyProjectileView {
    let projectile = this.projectiles.find((candidate) => !candidate.active);
    if (!projectile) {
      projectile = this.projectiles.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest);
      this.release(projectile);
    }
    this.serial += 1;
    projectile.id = `enemy-projectile-${this.serial}`;
    projectile.ownerId = spec.ownerId;
    projectile.ownerKind = spec.ownerKind;
    projectile.position.copy(spec.origin);
    projectile.velocity.copy(spec.direction).normalize().multiplyScalar(spec.speed);
    projectile.damage = spec.damage;
    projectile.radius = spec.radius ?? 0.075;
    projectile.reflected = false;
    projectile.attack = spec.attack ?? 'projectile';
    projectile.age = 0;
    projectile.maxAge = spec.maxAge ?? 5;
    projectile.active = true;
    projectile.object.visible = true;
    projectile.object.position.copy(projectile.position);
    projectile.object.scale.setScalar(projectile.radius / 0.075);
    projectile.body.material = HOSTILE_MATERIAL;
    projectile.inkSprites.forEach((sprite, index) => { sprite.material = INK_MATERIALS[index].hostile; });
    this.syncInkVisual(projectile);
    return projectile;
  }

  update(deltaSeconds: number, context: ProjectileUpdateContext): void {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    const playerRadius = context.player.radius ?? 0.45;
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.age += delta;
      if (projectile.age >= projectile.maxAge) {
        this.release(projectile);
        continue;
      }

      const from = projectile.position.clone();
      const to = from.clone().addScaledVector(projectile.velocity, delta);
      if (context.isBlocked?.(from, to)) {
        context.onWorldImpact?.({ projectile, point: to.clone() });
        this.release(projectile);
        continue;
      }

      if (projectile.reflected) {
        if (context.hitReflectedEnemy?.(from, to, projectile)) {
          this.release(projectile);
          continue;
        }
      } else if (context.player.alive !== false) {
        const hitRadius = playerRadius + projectile.radius;
        if (segmentDistanceSquared(from, to, context.player.position) <= hitRadius * hitRadius) {
          context.onPlayerImpact?.({
            projectile,
            point: context.player.position.clone(),
            direction: projectile.velocity.clone().normalize(),
          });
          this.release(projectile);
          continue;
        }
      }

      projectile.position.copy(to);
      projectile.object.position.copy(to);
      if (INK_STYLE) this.syncInkVisual(projectile);
      else {
        projectile.object.rotation.x += delta * 9;
        projectile.object.rotation.z += delta * 13;
      }
    }
  }

  reflect(
    center: THREE.Vector3,
    radius: number,
    direction?: THREE.Vector3,
    projectileId?: string,
  ): readonly EnemyProjectileView[] {
    const reflected: EnemyProjectileView[] = [];
    const radiusSquared = radius * radius;
    for (const projectile of this.projectiles) {
      if (
        !projectile.active
        || projectile.reflected
        || (projectileId !== undefined && projectile.id !== projectileId)
        || projectile.position.distanceToSquared(center) > radiusSquared
      ) continue;
      const speed = projectile.velocity.length() * 1.18;
      const reflectedDirection = direction?.lengthSq()
        ? direction.clone().normalize()
        : projectile.position.clone().sub(center).normalize();
      if (reflectedDirection.lengthSq() <= Number.EPSILON) reflectedDirection.set(0, 0, 1);
      projectile.velocity.copy(reflectedDirection).multiplyScalar(speed);
      projectile.reflected = true;
      projectile.body.material = REFLECTED_MATERIAL;
      projectile.inkSprites.forEach((sprite, index) => { sprite.material = INK_MATERIALS[index].reflected; });
      this.syncInkVisual(projectile);
      reflected.push(projectile);
    }
    return reflected;
  }

  findIncoming(center: THREE.Vector3, radius: number): EnemyProjectileView | null {
    const radiusSquared = radius * radius;
    let nearest: PooledProjectile | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const projectile of this.projectiles) {
      if (!projectile.active || projectile.reflected) continue;
      const toCenter = center.clone().sub(projectile.position);
      const distanceSquared = toCenter.lengthSq();
      if (distanceSquared > radiusSquared || distanceSquared >= nearestDistanceSquared) continue;
      if (distanceSquared > Number.EPSILON && toCenter.dot(projectile.velocity) <= 0) continue;
      nearest = projectile;
      nearestDistanceSquared = distanceSquared;
    }
    return nearest;
  }

  clear(): void {
    for (const projectile of this.projectiles) this.release(projectile);
  }

  private syncInkVisual(projectile: PooledProjectile): void {
    if (!INK_STYLE) return;
    travelDirection.copy(projectile.velocity).normalize();
    if (travelDirection.lengthSq() > 0) projectile.object.quaternion.setFromUnitVectors(FORWARD, travelDirection);
    projectile.inkSprites.forEach((sprite, index) => {
      const base = index === 0 ? .62 : .26 - index * .035;
      const pulse = 1 + Math.sin(projectile.age * 18 + index * 2) * .08;
      sprite.scale.set(base * pulse, base / pulse, 1);
      if (index > 0) sprite.position.z = -index * .15 - Math.sin(projectile.age * 14 + index) * .025;
    });
  }

  private release(projectile: PooledProjectile): void {
    projectile.active = false;
    projectile.object.visible = false;
    projectile.object.position.set(0, -1000, 0);
  }
}
