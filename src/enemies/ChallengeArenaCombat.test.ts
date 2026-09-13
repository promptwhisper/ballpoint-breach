import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ArenaBuilder, type LevelMode } from '../level';
import { ArenaQueries } from '../game/ArenaQueries';
import { EnemyManager } from './EnemyManager';
import type { PlayerDamageEvent } from './types';

// These run the real arena geometry, movement queries and projectile collision.
// No automated damage, invulnerability, or mocked line of sight is involved.
for (const mode of ['fold-foundry', 'dual-pages'] as const satisfies readonly LevelMode[]) {
  test(`${mode}: an occluded rifleman routes around cover and hits a stationary player`, () => {
    const arena = new ArenaBuilder({ levelMode: mode }).build();
    arena.syncColliderBounds();
    arena.root.updateMatrixWorld(true);
    const queries = new ArenaQueries(arena);
    const sourceId = mode === 'fold-foundry' ? 'foundry-s0-ground-2' : 'gallery-s1-ground-1';
    const source = arena.enemySpawnPoints.find(point => point.id === sourceId)!;
    assert.ok(source);
    const feet = mode === 'fold-foundry' ? new THREE.Vector3(0, 0.32, 27) : arena.objectives![1]!.position;
    const player = { position: feet.clone().add(new THREE.Vector3(0, 0.95, 0)), radius: 0.48, alive: true };
    let navigationCalls = 0;
    let time = 0;
    let firstDamage: number | null = null;
    const damage: PlayerDamageEvent[] = [];
    const manager = new EnemyManager(new THREE.Group(), {
      getPlayer: () => player,
      getCombatProfile: () => mode === 'fold-foundry' ? 'assault' : 'siege',
      hasLineOfSight: (from, to) => queries.hasLineOfSight(from, to),
      resolveMovement: (enemy, proposed) => queries.resolveEnemyMovement(enemy, proposed),
      groundHeight: (position, enemy) => queries.groundHeight(position, enemy),
      navigationTarget: (enemy, target) => { navigationCalls += 1; return queries.navigationTarget(enemy, target); },
      isProjectileBlocked: (from, to) => queries.segmentBlocked(from, to),
      onPlayerDamage: event => { firstDamage ??= time; damage.push(event); },
    });
    try {
      assert.equal(queries.hasLineOfSight(source.position.clone().add(new THREE.Vector3(0, 1.5, 0)), player.position), false);
      const enemy = manager.spawn('grunt', source.position.clone());
      const originalDistance = enemy.position.distanceTo(player.position);
      for (; time < 12 && firstDamage === null; time += 0.05) manager.update(0.05);
      assert.ok(navigationCalls > 0, 'the route must actually be used');
      assert.ok(firstDamage !== null && firstDamage < 12, 'cover must not create a permanent safe firing position');
      assert.ok(enemy.position.distanceTo(player.position) < originalDistance - 2);
      assert.ok(damage.some(event => event.projectileId && event.amount === 9));
    } finally {
      manager.reset();
      arena.dispose();
    }
  });

  test(`${mode}: solid entrance cover blocks muzzle projectiles`, () => {
    const arena = new ArenaBuilder({ levelMode: mode }).build();
    arena.syncColliderBounds();
    arena.root.updateMatrixWorld(true);
    const queries = new ArenaQueries(arena);
    const wallZ = mode === 'fold-foundry' ? 21 : 19;
    const origin = new THREE.Vector3(0, 1.2, wallZ + 4);
    const player = { position: new THREE.Vector3(0, 1.2, wallZ - 4), radius: 0.48 };
    let impacts = 0;
    let damage = 0;
    const manager = new EnemyManager(new THREE.Group(), {
      getPlayer: () => player,
      isProjectileBlocked: (from, to) => queries.segmentBlocked(from, to),
      onPlayerDamage: () => { damage += 1; },
      onEvent: event => { if (event.type === 'projectile-impact') impacts += 1; },
    });
    try {
      manager.projectilePool.spawn({ ownerId: 'cover-probe', ownerKind: 'grunt', origin,
        direction: player.position.clone().sub(origin).normalize(), speed: 34, damage: 9 });
      for (let tick = 0; tick < 20; tick += 1) manager.update(0.05);
      assert.equal(impacts, 1);
      assert.equal(damage, 0, 'ranged attacks must respect opaque cover');
      assert.equal(manager.projectilePool.activeCount, 0);
    } finally {
      manager.reset();
      arena.dispose();
    }
  });
}

test('foundry east rooftop marksman uses the landing and stairs without falling to death', () => {
  const arena = new ArenaBuilder({ levelMode: 'fold-foundry' }).build();
  arena.syncColliderBounds();
  arena.root.updateMatrixWorld(true);
  const queries = new ArenaQueries(arena);
  const player = { position: arena.objectives![2]!.position.clone().add(new THREE.Vector3(0, 0.95, 0)), radius: 0.48 };
  let time = 0;
  let firstHit: number | null = null;
  let usedLanding = false;
  let usedStairs = false;
  const manager = new EnemyManager(new THREE.Group(), {
    getPlayer: () => player,
    getCombatProfile: () => 'assault',
    hasLineOfSight: (from, to) => queries.hasLineOfSight(from, to),
    resolveMovement: (enemy, proposed) => queries.resolveEnemyMovement(enemy, proposed),
    groundHeight: (position, enemy) => queries.groundHeight(position, enemy),
    navigationTarget: (enemy, target) => queries.navigationTarget(enemy, target),
    isProjectileBlocked: (from, to) => queries.segmentBlocked(from, to),
    onPlayerDamage: () => { firstHit ??= time; },
  });
  try {
    const spawn = arena.enemySpawnPoints.find(point => point.id === 'foundry-high-office-east')!;
    const enemy = manager.spawn('marksman', spawn.position.clone());
    for (; time < 20; time += 0.05) {
      manager.update(0.05);
      usedLanding ||= enemy.position.x > 21.3 && enemy.position.z < -46.5 && enemy.position.y > 4;
      usedStairs ||= enemy.position.x > 22.5 && enemy.position.z > -46 && enemy.position.y > 0.5 && enemy.position.y < 4;
      assert.equal(enemy.alive, true, 'the defender must not take an unsupported shortcut off the roof');
    }
    assert.ok(usedLanding && usedStairs, 'the physical landing and stair flight must both be traversed');
    assert.ok(firstHit !== null && firstHit < 12, 'the safe route must still let the defender engage');
  } finally {
    manager.reset();
    arena.dispose();
  }
});
