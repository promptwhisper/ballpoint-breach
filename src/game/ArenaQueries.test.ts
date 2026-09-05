import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { EnemyView } from '../enemies';
import {
  ArenaWaypointGraph,
  type ArenaBuildResult,
  type ArenaCollider,
} from '../level/ArenaBuilder';
import { ArenaQueries } from './ArenaQueries';

function makeCollider(
  id: string,
  min: THREE.Vector3,
  max: THREE.Vector3,
  category: ArenaCollider['category'] = 'wall',
): ArenaCollider {
  return {
    id,
    bounds: new THREE.Box3(min.clone(), max.clone()),
    min: min.clone(),
    max: max.clone(),
    category,
    tags: [],
    object: new THREE.Object3D(),
    enabled: true,
  };
}

function makeArena(colliders: ArenaCollider[], waypointGraph: ArenaWaypointGraph): ArenaBuildResult {
  const root = new THREE.Group();
  return {
    root,
    colliders,
    raycastMeshes: [],
    enemySpawnPoints: [],
    enemySpawns: [],
    supplyPoints: [],
    grappleAnchors: [],
    ledges: [],
    waypointGraph,
    breakables: [],
    safePlayerSpawn: new THREE.Vector3(),
    killY: -9,
    update: () => undefined,
    syncColliderBounds: () => undefined,
    damageBreakable: () => undefined,
    resetBreakables: () => undefined,
    dispose: () => undefined,
  };
}

function makeEnemy(position = new THREE.Vector3()): EnemyView {
  return {
    id: 'test-enemy',
    kind: 'grunt',
    object: new THREE.Group(),
    position,
    state: 'seek',
    health: 100,
    maxHealth: 100,
    alive: true,
    collisionRadius: 0.3,
  };
}

test('enemy collision resolves along the open axis instead of crossing cover', () => {
  const graph = new ArenaWaypointGraph([]);
  const cover = makeCollider(
    'cover',
    new THREE.Vector3(0.5, 0, -1),
    new THREE.Vector3(1.5, 3, 1),
    'cover',
  );
  const queries = new ArenaQueries(makeArena([cover], graph));
  const enemy = makeEnemy(new THREE.Vector3(0, 0, 0));

  const resolved = queries.resolveEnemyMovement(enemy, new THREE.Vector3(1, 0, 1.2));

  assert.deepEqual(resolved.toArray(), [0, 0, 1.2]);
  assert.notStrictEqual(resolved, enemy.position);
});

test('navigation returns the next connected waypoint toward the player', () => {
  const nodes: ConstructorParameters<typeof ArenaWaypointGraph>[0] = [
    { id: 'start', position: new THREE.Vector3(0, 0, 0), neighbors: ['middle'], tags: ['ground'] },
    { id: 'middle', position: new THREE.Vector3(2, 0, 0), neighbors: ['start', 'goal'], tags: ['ground'] },
    { id: 'goal', position: new THREE.Vector3(4, 0, 0), neighbors: ['middle'], tags: ['ground'] },
  ];
  const graph = new ArenaWaypointGraph(nodes);
  const queries = new ArenaQueries(makeArena([], graph));

  const target = queries.navigationTarget(makeEnemy(new THREE.Vector3(0, 0, 0)), new THREE.Vector3(4.1, 0, 0));

  assert.ok(target);
  assert.deepEqual(target.toArray(), [2, 0, 0]);
});

test('navigation keeps a stateful route instead of oscillating across nearest-node boundaries', () => {
  const nodes: ConstructorParameters<typeof ArenaWaypointGraph>[0] = [
    { id: 'office', position: new THREE.Vector3(22, 0, 2.5), neighbors: ['east'], tags: ['ground'] },
    { id: 'east', position: new THREE.Vector3(30, 0, 9), neighbors: ['office', 'goal'], tags: ['ground'] },
    { id: 'goal', position: new THREE.Vector3(2, 0, 25), neighbors: ['east'], tags: ['ground'] },
  ];
  const graph = new ArenaWaypointGraph(nodes);
  const queries = new ArenaQueries(makeArena([], graph));
  const position = new THREE.Vector3(15, 0, 9);
  const enemy = makeEnemy(position);
  const player = new THREE.Vector3(2, 0, 25);
  const targetIds: string[] = [];

  for (let step = 0; step < 900; step += 1) {
    const target = queries.navigationTarget(enemy, player);
    assert.ok(target);
    const matchingNode = graph.nodes.find((node) => node.position.distanceToSquared(target) < 0.0001);
    if (matchingNode && targetIds[targetIds.length - 1] !== matchingNode.id) targetIds.push(matchingNode.id);
    const delta = target.clone().sub(position).setY(0);
    if (delta.lengthSq() > 0.075 * 0.075) position.add(delta.normalize().multiplyScalar(0.075));
    else position.copy(target);
  }

  assert.ok(position.distanceTo(player) < 0.9, `expected route to reach the player, got ${position.toArray().join(',')}`);
  assert.deepEqual(targetIds.slice(0, 3), ['office', 'east', 'goal']);
  assert.equal(targetIds.filter((id) => id === 'east').length, 1, 'completed waypoints must not be selected again');
});

test('navigation chooses a start node on the actor floor before a horizontally closer elevated node', () => {
  const nodes: ConstructorParameters<typeof ArenaWaypointGraph>[0] = [
    { id: 'ground-start', position: new THREE.Vector3(4, 0, 0), neighbors: ['ground-goal'], tags: ['ground'] },
    { id: 'ground-goal', position: new THREE.Vector3(10, 0, 0), neighbors: ['ground-start', 'elevated-middle'], tags: ['ground'] },
    { id: 'elevated-start', position: new THREE.Vector3(0, 2, 0), neighbors: ['elevated-middle'], tags: ['elevated'] },
    { id: 'elevated-middle', position: new THREE.Vector3(0, 2, 5), neighbors: ['elevated-start', 'ground-goal'], tags: ['elevated'] },
  ];
  const graph = new ArenaWaypointGraph(nodes);
  const queries = new ArenaQueries(makeArena([], graph));
  const enemy = makeEnemy(new THREE.Vector3(0, 0, 0));

  const target = queries.navigationTarget(enemy, new THREE.Vector3(10, 0, 0));

  assert.ok(target);
  assert.deepEqual(target.toArray(), [4, 0, 0]);
});

test('navigation inserts a local detour when an authored waypoint edge crosses solid cover', () => {
  const nodes: ConstructorParameters<typeof ArenaWaypointGraph>[0] = [
    { id: 'start', position: new THREE.Vector3(0, 0, 0), neighbors: ['goal'], tags: ['ground'] },
    { id: 'goal', position: new THREE.Vector3(0, 0, 6), neighbors: ['start'], tags: ['ground'] },
  ];
  const graph = new ArenaWaypointGraph(nodes);
  const cover = makeCollider(
    'wide-cover',
    new THREE.Vector3(-1, 0, 2),
    new THREE.Vector3(1, 3, 4),
    'cover',
  );
  const queries = new ArenaQueries(makeArena([cover], graph));
  const position = new THREE.Vector3(0, 0, 0);
  const enemy = makeEnemy(position);
  const player = new THREE.Vector3(0, 0, 6);

  const firstTarget = queries.navigationTarget(enemy, player);
  assert.ok(firstTarget);
  assert.ok(Math.abs(firstTarget.x) > 1.3, `expected a corner detour, got ${firstTarget.toArray().join(',')}`);

  for (let step = 0; step < 500 && position.distanceTo(player) > 0.8; step += 1) {
    const target = queries.navigationTarget(enemy, player);
    assert.ok(target);
    const delta = target.clone().sub(position).setY(0);
    if (delta.lengthSq() <= 0.06 * 0.06) position.copy(target);
    else position.copy(queries.resolveEnemyMovement(enemy, position.clone().add(delta.normalize().multiplyScalar(0.06))));
  }

  assert.ok(position.distanceTo(player) <= 0.8, `expected the route to clear cover, got ${position.toArray().join(',')}`);
});

test('enemy movement depenetrates a capsule that starts inside a collider', () => {
  const graph = new ArenaWaypointGraph([]);
  const column = makeCollider(
    'column',
    new THREE.Vector3(-0.2, 0, -0.2),
    new THREE.Vector3(0.2, 3, 0.2),
    'column',
  );
  const queries = new ArenaQueries(makeArena([column], graph));
  const enemy = makeEnemy(new THREE.Vector3(0, 0, 0));

  const resolved = queries.resolveEnemyMovement(enemy, new THREE.Vector3(0.1, 0, 0));
  const nearestX = THREE.MathUtils.clamp(resolved.x, column.min.x, column.max.x);
  const nearestZ = THREE.MathUtils.clamp(resolved.z, column.min.z, column.max.z);
  const clearance = Math.hypot(resolved.x - nearestX, resolved.z - nearestZ);

  assert.ok(resolved.distanceTo(enemy.position) > 0.3, 'overlapping actors should be moved out of the collider');
  assert.ok(clearance >= enemy.collisionRadius, `expected ${enemy.collisionRadius} clearance, got ${clearance}`);
});
