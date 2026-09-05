import * as THREE from 'three';
import { DoodleEnemy, type EnemyAction, type EnemyRuntimeContext } from './DoodleEnemy';
import { DoodlerBoss } from './DoodlerBoss';
import { ProjectilePool, type EnemyProjectileView } from './ProjectilePool';
import type {
  EnemyDamage,
  EnemyDamageResult,
  EnemyEvent,
  EnemyHitZone,
  EnemyKind,
  EnemyManagerOptions,
  EnemyManagerSnapshot,
  EnemyRayHit,
  EnemySpawnOptions,
  EnemyView,
  PlayerDamageEvent,
  ProjectileReflectionResult,
  RegularEnemyKind,
} from './types';

interface HitOwner {
  enemy: DoodleEnemy;
  zone: EnemyHitZone;
}

const DEFAULT_MAX_ENEMIES = 28;

export class EnemyManager {
  readonly object = new THREE.Group();
  readonly projectilePool = new ProjectilePool();

  private readonly enemies = new Map<string, DoodleEnemy>();
  private readonly hitOwners = new WeakMap<THREE.Object3D, HitOwner>();
  private readonly raycaster = new THREE.Raycaster();
  private serial = 0;
  private elapsed = 0;
  private summonCursor = 0;

  constructor(parent: THREE.Object3D, private readonly options: EnemyManagerOptions) {
    this.object.name = 'enemy-manager';
    this.object.add(this.projectilePool.object);
    parent.add(this.object);
  }

  get livingCount(): number {
    let count = 0;
    for (const enemy of this.enemies.values()) if (enemy.alive) count += 1;
    return count;
  }

  get totalCount(): number {
    return this.enemies.size;
  }

  spawn(kind: EnemyKind, position: THREE.Vector3, spawnOptions: EnemySpawnOptions = {}): DoodleEnemy {
    this.serial += 1;
    const id = spawnOptions.id ?? `${kind}-${this.serial}`;
    if (this.enemies.has(id)) throw new Error(`Enemy id already exists: ${id}`);
    const seed = ((this.options.seed ?? 0x51cbb1e5) + this.serial * 0x9e3779b1) >>> 0;
    const eventSink = (event: EnemyEvent): void => this.options.onEvent?.(event);
    const enemy = kind === 'boss'
      ? new DoodlerBoss(id, position, seed, eventSink, spawnOptions, this.options.despawnDelay ?? 3.4)
      : new DoodleEnemy(id, kind, position, seed, eventSink, spawnOptions, this.options.despawnDelay ?? 2.6);
    this.enemies.set(id, enemy);
    this.object.add(enemy.object);
    for (const tagged of enemy.rig.hitMeshes) this.hitOwners.set(tagged.mesh, { enemy, zone: tagged.zone });
    this.emit({ type: 'spawn', enemyId: id, kind, position: position.clone(), state: enemy.state });
    return enemy;
  }

  getEnemy(id: string): DoodleEnemy | null {
    return this.enemies.get(id) ?? null;
  }

  getLivingEnemies(): readonly EnemyView[] {
    return [...this.enemies.values()].filter((enemy) => enemy.alive);
  }

  getHitMeshes(): readonly THREE.Mesh[] {
    const result: THREE.Mesh[] = [];
    for (const enemy of this.enemies.values()) {
      if (enemy.alive) result.push(...enemy.hitMeshes);
    }
    return result;
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.elapsed += delta;
    const player = this.options.getPlayer();
    const living = [...this.enemies.values()].filter((enemy) => enemy.alive);
    const separation = this.computeSeparation(living);
    const actions: EnemyAction[] = [];

    for (const enemy of this.enemies.values()) {
      const context: EnemyRuntimeContext = {
        elapsed: this.elapsed,
        player,
        separation: separation.get(enemy.id) ?? new THREE.Vector3(),
        fallDeathY: this.options.fallDeathY ?? -7,
        hasLineOfSight: (from, to, view) => this.options.hasLineOfSight?.(from, to, view) ?? true,
        resolveMovement: (view, proposed) => this.options.resolveMovement?.(view, proposed) ?? proposed,
        groundHeight: this.options.groundHeight,
        navigationTarget: (view, target) => this.options.navigationTarget?.(view, target) ?? target.clone(),
        emitAction: (action) => actions.push(action),
      };
      enemy.update(delta, context);
    }

    for (const action of actions) this.processAction(action, player);

    this.projectilePool.update(delta, {
      player,
      isBlocked: this.options.isProjectileBlocked,
      hitReflectedEnemy: (from, to, projectile) => this.hitEnemyAlongSegment(from, to, projectile),
      onPlayerImpact: ({ projectile, point, direction }) => {
        const event: PlayerDamageEvent = {
          amount: projectile.damage,
          sourceEnemyId: projectile.ownerId,
          sourceKind: projectile.ownerKind,
          attack: projectile.attack,
          origin: point.clone(),
          direction: direction.clone(),
          projectileId: projectile.id,
        };
        this.options.onPlayerDamage?.(event);
        this.emit({
          type: 'projectile-impact',
          enemyId: projectile.ownerId,
          kind: projectile.ownerKind,
          position: point.clone(),
          attack: projectile.attack,
          damage: projectile.damage,
          projectileId: projectile.id,
        });
      },
      onWorldImpact: ({ projectile, point }) => {
        this.emit({
          type: 'projectile-impact',
          enemyId: projectile.ownerId,
          kind: projectile.ownerKind,
          position: point.clone(),
          attack: projectile.attack,
          projectileId: projectile.id,
        });
      },
    });

    for (const enemy of [...this.enemies.values()]) {
      if (enemy.shouldCleanup) this.remove(enemy.id);
    }
  }

  raycast(raycaster: THREE.Raycaster, maxDistance = raycaster.far): EnemyRayHit | null {
    const meshes = this.getHitMeshes();
    if (meshes.length === 0) return null;
    this.object.updateMatrixWorld(true);
    const previousFar = raycaster.far;
    raycaster.far = Math.min(previousFar, maxDistance);
    const intersections = raycaster.intersectObjects([...meshes], false);
    raycaster.far = previousFar;
    for (const intersection of intersections) {
      const owner = this.hitOwners.get(intersection.object);
      if (!owner?.enemy.alive) continue;
      return {
        enemy: owner.enemy,
        hitZone: owner.zone,
        point: intersection.point.clone(),
        distance: intersection.distance,
        object: intersection.object,
        intersection,
      };
    }
    return null;
  }

  applyDamage(target: string | THREE.Object3D | EnemyRayHit, damage: EnemyDamage): EnemyDamageResult | null {
    const resolved = this.resolveDamageTarget(target);
    if (!resolved) return null;
    return resolved.enemy.applyDamage({ ...damage, hitZone: damage.hitZone ?? resolved.zone });
  }

  applyDamageFromRay(raycaster: THREE.Raycaster, damage: EnemyDamage, maxDistance = raycaster.far): EnemyRayHit | null {
    const hit = this.raycast(raycaster, maxDistance);
    if (!hit) return null;
    this.applyDamage(hit, { ...damage, point: damage.point ?? hit.point, hitZone: damage.hitZone ?? hit.hitZone });
    return hit;
  }

  reflectProjectiles(
    center: THREE.Vector3,
    radius: number,
    direction?: THREE.Vector3,
    projectileId?: string,
  ): ProjectileReflectionResult {
    const projectiles = this.projectilePool.reflect(center, radius, direction, projectileId);
    for (const projectile of projectiles) {
      this.emit({
        type: 'projectile-reflected',
        enemyId: projectile.ownerId,
        kind: projectile.ownerKind,
        position: projectile.position.clone(),
        attack: projectile.attack,
        projectileId: projectile.id,
      });
    }
    return { count: projectiles.length, projectileIds: projectiles.map((projectile) => projectile.id) };
  }

  findIncomingProjectile(center: THREE.Vector3, radius: number): EnemyProjectileView | null {
    return this.projectilePool.findIncoming(center, radius);
  }

  addKnockback(enemyId: string, direction: THREE.Vector3, strength: number): boolean {
    const enemy = this.enemies.get(enemyId);
    if (!enemy?.alive) return false;
    enemy.addKnockback(direction, strength);
    return true;
  }

  remove(id: string): boolean {
    const enemy = this.enemies.get(id);
    if (!enemy) return false;
    enemy.object.removeFromParent();
    this.enemies.delete(id);
    this.emit({ type: 'cleanup', enemyId: enemy.id, kind: enemy.kind, position: enemy.position.clone(), state: enemy.state });
    return true;
  }

  reset(): void {
    for (const enemy of [...this.enemies.values()]) this.remove(enemy.id);
    this.projectilePool.clear();
    this.elapsed = 0;
    this.serial = 0;
    this.summonCursor = 0;
  }

  getSnapshot(): EnemyManagerSnapshot {
    const byKind: Record<EnemyKind, number> = { grunt: 0, rusher: 0, heavy: 0, marksman: 0, boss: 0 };
    let bossHealth: number | null = null;
    let bossMaxHealth: number | null = null;
    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) continue;
      byKind[enemy.kind] += 1;
      if (enemy.kind === 'boss') {
        bossHealth = enemy.health;
        bossMaxHealth = enemy.maxHealth;
      }
    }
    return {
      living: Object.values(byKind).reduce((sum, count) => sum + count, 0),
      projectiles: this.projectilePool.activeCount,
      byKind,
      bossHealth,
      bossMaxHealth,
    };
  }

  private processAction(action: EnemyAction, player: ReturnType<EnemyManagerOptions['getPlayer']>): void {
    if (!action.enemy.alive) return;
    if (action.type === 'damage-player') {
      if (player.alive === false || action.origin.distanceTo(player.position) > action.range) return;
      if (this.options.hasLineOfSight && !this.options.hasLineOfSight(action.origin, player.position, action.enemy)) return;
      const direction = player.position.clone().sub(action.origin).normalize();
      this.options.onPlayerDamage?.({
        amount: action.amount,
        sourceEnemyId: action.enemy.id,
        sourceKind: action.enemy.kind,
        attack: action.attack,
        origin: action.origin.clone(),
        direction,
      });
      return;
    }
    if (action.type === 'projectile') {
      const projectile = this.projectilePool.spawn({
        ownerId: action.enemy.id,
        ownerKind: action.enemy.kind,
        origin: action.origin,
        direction: action.direction,
        speed: action.speed,
        damage: action.damage,
        radius: action.radius,
        attack: action.attack,
      });
      this.emit({
        type: 'projectile-spawn',
        enemyId: action.enemy.id,
        kind: action.enemy.kind,
        position: action.origin.clone(),
        attack: action.attack ?? 'projectile',
        projectileId: projectile.id,
      });
      return;
    }
    this.processSummon(action.enemy, action.count, action.preferredKinds, player.position);
  }

  private processSummon(
    boss: DoodleEnemy,
    count: number,
    preferredKinds: readonly RegularEnemyKind[],
    playerPosition: THREE.Vector3,
  ): void {
    const handled = this.options.onBossSummon?.({ boss, count, preferredKinds });
    if (handled === true) return;
    const capacity = Math.max(0, (this.options.maxEnemies ?? DEFAULT_MAX_ENEMIES) - this.livingCount);
    const spawnCount = Math.min(count, capacity);
    for (let index = 0; index < spawnCount; index += 1) {
      const kind = preferredKinds[index % preferredKinds.length] ?? 'grunt';
      const position = this.pickSummonPosition(boss.position, playerPosition, index);
      this.spawn(kind, position);
    }
  }

  private pickSummonPosition(bossPosition: THREE.Vector3, playerPosition: THREE.Vector3, offset: number): THREE.Vector3 {
    const points = this.options.bossSummonPoints;
    if (points?.length) {
      const viable = points.filter((point) => point.distanceToSquared(playerPosition) >= 25);
      const pool = viable.length ? viable : points;
      const point = pool[(this.summonCursor + offset) % pool.length] ?? bossPosition;
      this.summonCursor = (this.summonCursor + 1) % pool.length;
      return point.clone();
    }
    const angle = ((this.summonCursor + offset) * 2.399963) % (Math.PI * 2);
    this.summonCursor += 1;
    return bossPosition.clone().add(new THREE.Vector3(Math.sin(angle) * 3.4, 0, Math.cos(angle) * 3.4));
  }

  private hitEnemyAlongSegment(from: THREE.Vector3, to: THREE.Vector3, projectile: EnemyProjectileView): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.0001) return false;
    this.raycaster.set(from, direction.normalize());
    const hit = this.raycast(this.raycaster, distance + projectile.radius);
    if (!hit) return false;
    this.applyDamage(hit, {
      amount: projectile.damage * 1.65,
      type: 'reflected',
      point: hit.point,
      direction,
      impulse: 5.5,
      sourceId: 'player-reflection',
    });
    this.emit({
      type: 'projectile-impact',
      enemyId: hit.enemy.id,
      kind: hit.enemy.kind,
      position: hit.point.clone(),
      attack: projectile.attack,
      damage: projectile.damage * 1.65,
      projectileId: projectile.id,
    });
    return true;
  }

  private resolveDamageTarget(target: string | THREE.Object3D | EnemyRayHit): HitOwner | null {
    if (typeof target === 'string') {
      const enemy = this.enemies.get(target);
      return enemy ? { enemy, zone: 'torso' } : null;
    }
    if ('enemy' in target && 'hitZone' in target) {
      const enemy = this.enemies.get(target.enemy.id);
      return enemy ? { enemy, zone: target.hitZone } : null;
    }
    let object: THREE.Object3D | null = target;
    while (object) {
      const owner = this.hitOwners.get(object);
      if (owner) return owner;
      object = object.parent;
    }
    return null;
  }

  private computeSeparation(enemies: readonly DoodleEnemy[]): Map<string, THREE.Vector3> {
    const result = new Map<string, THREE.Vector3>();
    for (const enemy of enemies) result.set(enemy.id, new THREE.Vector3());
    for (let firstIndex = 0; firstIndex < enemies.length; firstIndex += 1) {
      const first = enemies[firstIndex];
      if (!first) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < enemies.length; secondIndex += 1) {
        const second = enemies[secondIndex];
        if (!second) continue;
        const delta = first.position.clone().sub(second.position).setY(0);
        const desired = first.collisionRadius + second.collisionRadius + 0.38;
        const distanceSquared = delta.lengthSq();
        if (distanceSquared >= desired * desired) continue;
        if (distanceSquared <= 0.0001) delta.set(firstIndex % 2 === 0 ? 1 : -1, 0, 0);
        const distance = Math.max(0.01, Math.sqrt(distanceSquared));
        const strength = THREE.MathUtils.clamp((desired - distance) / desired, 0, 1);
        delta.normalize().multiplyScalar(strength);
        result.get(first.id)?.add(delta);
        result.get(second.id)?.addScaledVector(delta, -1);
      }
    }
    for (const vector of result.values()) if (vector.lengthSq() > 1) vector.normalize();
    return result;
  }

  private emit(event: EnemyEvent): void {
    this.options.onEvent?.(event);
  }
}
