import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { ArenaBuildResult, SupplyPoint } from '../level/ArenaBuilder';
import { SupplySystem, type SupplyPickupEvent } from './SupplySystem';

function makeArena(points: SupplyPoint[]): { arena: ArenaBuildResult; objects: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const objects = new Map<string, THREE.Object3D>();
  const raycastMeshes: THREE.Mesh[] = [];
  for (const point of points) {
    const object = new THREE.Group();
    object.name = point.id;
    root.add(object);
    objects.set(point.id, object);

    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
    blocker.name = `${point.id}-blocker`;
    object.add(blocker);
    objects.set(blocker.name, blocker);
    raycastMeshes.push(blocker);

    const marker = new THREE.Object3D();
    marker.name = `${point.id}-marker`;
    marker.position.y = 0.75;
    root.add(marker);
    objects.set(marker.name, marker);
  }
  const arena: ArenaBuildResult = {
    root,
    colliders: [],
    raycastMeshes,
    enemySpawnPoints: [],
    enemySpawns: [],
    supplyPoints: points,
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
  return { arena, objects };
}

test('a nearby supply emits once, stays hidden for cooldown, then respawns', () => {
  const point: SupplyPoint = {
    id: 'ammo-crate',
    position: new THREE.Vector3(2, 0, 3),
    kind: 'ammo',
    respawnSeconds: 2,
  };
  const { arena, objects } = makeArena([point]);
  const pickups: SupplyPickupEvent[] = [];
  const supplies = new SupplySystem(arena, (event) => pickups.push(event));
  const player = point.position.clone();

  supplies.update(0.016, player, false);
  assert.equal(pickups.length, 0);
  supplies.update(0.016, player, true);
  assert.deepEqual(pickups, [{ id: 'ammo-crate', kind: 'ammo', health: 0, ammo: 28 }]);
  assert.equal(objects.get('ammo-crate')?.visible, false);
  assert.equal(objects.get('ammo-crate-blocker')?.userData.raycastDisabled, true);

  supplies.update(1, player, true);
  assert.equal(pickups.length, 1);
  assert.equal(objects.get('ammo-crate')?.visible, false);
  supplies.update(1, player, true);
  assert.equal(pickups.length, 1);
  assert.equal(objects.get('ammo-crate')?.visible, true);
  assert.equal(objects.get('ammo-crate-blocker')?.userData.raycastDisabled, false);
  supplies.update(0, player, true);
  assert.equal(pickups.length, 2);
});

test('reset restores visibility, marker height, and immediate pickup eligibility', () => {
  const point: SupplyPoint = {
    id: 'mixed-crate',
    position: new THREE.Vector3(),
    kind: 'mixed',
    respawnSeconds: 10,
  };
  const { arena, objects } = makeArena([point]);
  const pickups: SupplyPickupEvent[] = [];
  const supplies = new SupplySystem(arena, (event) => pickups.push(event));
  const marker = objects.get('mixed-crate-marker');

  supplies.update(0.016, point.position, true);
  assert.equal(objects.get('mixed-crate')?.visible, false);
  assert.notEqual(marker?.position.y, 0.75);

  supplies.reset();
  assert.equal(objects.get('mixed-crate')?.visible, true);
  assert.equal(objects.get('mixed-crate-blocker')?.userData.raycastDisabled, false);
  assert.equal(marker?.position.y, 0.75);
  supplies.update(0, point.position, true);

  assert.deepEqual(pickups, [
    { id: 'mixed-crate', kind: 'mixed', health: 18, ammo: 16 },
    { id: 'mixed-crate', kind: 'mixed', health: 18, ammo: 16 },
  ]);
});
