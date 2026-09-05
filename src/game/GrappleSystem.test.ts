import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { EffectPool } from '../effects/EffectPool';
import type { EnemyManager, EnemyRayHit, EnemyView } from '../enemies';
import type { ArenaBuildResult, GrappleAnchor } from '../level/ArenaBuilder';
import type { PlayerController } from '../player/PlayerController';
import { GrappleSystem } from './GrappleSystem';

interface FakeEnemy extends EnemyView {
  addKnockback(direction: THREE.Vector3, strength: number): void;
}

interface RopeCall {
  start: THREE.Vector3;
  end: THREE.Vector3;
  visible: boolean;
}

function makeArena(raycastMeshes: THREE.Mesh[] = [], grappleAnchors: GrappleAnchor[] = []): ArenaBuildResult {
  const root = new THREE.Group();
  return {
    root,
    colliders: [],
    raycastMeshes,
    enemySpawnPoints: [],
    enemySpawns: [],
    supplyPoints: [],
    grappleAnchors,
    ledges: [],
    waypointGraph: null as unknown as ArenaBuildResult['waypointGraph'],
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

function makePlayer(camera: THREE.PerspectiveCamera): { player: PlayerController; velocity: THREE.Vector3 } {
  const velocity = new THREE.Vector3();
  const body = { position: new THREE.Vector3(0, 0, 0), velocity, grounded: true };
  const player = {
    body,
    getAimOrigin: (target = new THREE.Vector3()) => camera.getWorldPosition(target),
  } as unknown as PlayerController;
  return { player, velocity };
}

function makeEffects(calls: RopeCall[]): EffectPool {
  return {
    setGrapple: (start: THREE.Vector3, end: THREE.Vector3, visible: boolean) => {
      calls.push({ start: start.clone(), end: end.clone(), visible });
    },
  } as unknown as EffectPool;
}

function makeEnemyManager(enemy: FakeEnemy | null, hitDistance: number | null): EnemyManager {
  return {
    raycast: (_raycaster: THREE.Raycaster, _maxDistance: number): EnemyRayHit | null => {
      if (!enemy || hitDistance === null) return null;
      const point = new THREE.Vector3(0, 1.2, -hitDistance);
      return {
        enemy,
        hitZone: 'torso',
        point,
        distance: hitDistance,
        object: enemy.object,
        intersection: { distance: hitDistance, point, object: enemy.object } as THREE.Intersection,
      };
    },
    getEnemy: (id: string) => (enemy?.id === id ? enemy : null),
  } as unknown as EnemyManager;
}

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 100);
  camera.position.set(0, 1.5, 0);
  camera.lookAt(0, 1.5, -1);
  camera.updateMatrixWorld(true);
  return camera;
}

test('a world wall occludes enemies and anchors behind it', () => {
  const camera = makeCamera();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, -5);
  wall.updateMatrixWorld(true);
  const anchor: GrappleAnchor = {
    id: 'behind-wall',
    position: new THREE.Vector3(0, 1.5, -8),
    radius: 0.5,
    strength: 1,
    tags: [],
  };
  const enemy: FakeEnemy = {
    id: 'behind-wall-enemy',
    kind: 'grunt',
    object: new THREE.Group(),
    position: new THREE.Vector3(0, 0, -9),
    state: 'seek',
    health: 100,
    maxHealth: 100,
    alive: true,
    collisionRadius: 0.4,
    addKnockback: () => undefined,
  };
  const { player } = makePlayer(camera);
  const grapple = new GrappleSystem(
    camera,
    player,
    makeArena([wall], [anchor]),
    makeEnemyManager(enemy, 9),
    makeEffects([]),
  );

  const result = grapple.fire();

  assert.deepEqual(result, { fired: false, target: null, blocked: true });
  assert.equal(grapple.readyRatio, 1);
});

test('an anchor pulls the player and enforces the full cooldown', () => {
  const camera = makeCamera();
  const anchor: GrappleAnchor = {
    id: 'crane-hook',
    position: new THREE.Vector3(0, 1.5, -8),
    radius: 0.6,
    strength: 1,
    tags: ['high'],
  };
  const calls: RopeCall[] = [];
  const { player, velocity } = makePlayer(camera);
  const grapple = new GrappleSystem(
    camera,
    player,
    makeArena([], [anchor]),
    makeEnemyManager(null, null),
    makeEffects(calls),
  );

  assert.equal(grapple.fire().fired, true);
  assert.equal(grapple.fire().fired, false);
  assert.equal(grapple.readyRatio, 0);

  grapple.update(0.1);
  assert.ok(velocity.z < -1.4, `expected negative z pull, got ${velocity.z}`);
  assert.ok(velocity.y >= 2.4, `expected upward pull, got ${velocity.y}`);
  assert.equal(calls.at(-1)?.visible, true);

  grapple.update(0.4);
  assert.equal(grapple.active, false);
  assert.equal(grapple.fire().fired, false);
  grapple.update(2.5);
  assert.equal(grapple.readyRatio, 1);
  assert.equal(grapple.fire().fired, true);
});

test('an enemy grapple applies an immediate pull toward the player', () => {
  const camera = makeCamera();
  const knockbacks: { direction: THREE.Vector3; strength: number }[] = [];
  const enemy: FakeEnemy = {
    id: 'pull-target',
    kind: 'heavy',
    object: new THREE.Group(),
    position: new THREE.Vector3(0, 0, -6),
    state: 'seek',
    health: 160,
    maxHealth: 160,
    alive: true,
    collisionRadius: 0.55,
    addKnockback: (direction, strength) => knockbacks.push({ direction: direction.clone(), strength }),
  };
  const { player } = makePlayer(camera);
  const grapple = new GrappleSystem(
    camera,
    player,
    makeArena(),
    makeEnemyManager(enemy, 6),
    makeEffects([]),
  );

  const result = grapple.fire();

  assert.equal(result.target?.kind, 'enemy');
  assert.equal(knockbacks.length, 1);
  assert.equal(knockbacks[0]?.strength, 8.5);
  assert.ok((knockbacks[0]?.direction.z ?? 0) > 0.99);

  grapple.update(1 / 30);
  grapple.update(1 / 120);
  assert.equal(knockbacks.length, 1, 'the pull impulse must not scale with frame rate');
});
