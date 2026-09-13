import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { getOutlineCacheStats } from '../render/OutlinedMesh';
import { ArenaBuilder } from './ArenaBuilder';

function isFiniteVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

test('arena exposes complete gameplay contracts and valid AABB colliders', () => {
  const arena = new ArenaBuilder({ outlineIrregularity: 0.003 }).build();
  try {
    assert.equal(arena.root.name, 'doodle-construction-arena');
    assert.ok(arena.enemySpawnPoints.length >= 12, 'needs at least twelve enemy spawns');
    assert.ok(arena.supplyPoints.length >= 6, 'needs at least six supply points');
    assert.ok(arena.grappleAnchors.length >= 8, 'needs environment grapple anchors');
    assert.ok(arena.ledges.length >= 8, 'needs meaningful high ledges');
    assert.ok(arena.breakables.length >= 4, 'needs multiple breakable barricades');
    assert.equal(arena.root.getObjectByName('fold-foundry-stage'), undefined, 'classic arena must remain untouched by alternate modes');
    assert.ok(arena.raycastMeshes.length > 40, 'arena surfaces should be raycastable');
    assert.ok(arena.colliders.length > 30, 'arena requires explicit collision coverage');

    const ids = new Set<string>();
    for (const collider of arena.colliders) {
      assert.ok(!ids.has(collider.id), `duplicate collider id: ${collider.id}`);
      ids.add(collider.id);
      assert.ok(isFiniteVector(collider.min) && isFiniteVector(collider.max), `${collider.id} must be finite`);
      assert.ok(collider.min.x < collider.max.x, `${collider.id} x bounds must have volume`);
      assert.ok(collider.min.y < collider.max.y, `${collider.id} y bounds must have volume`);
      assert.ok(collider.min.z < collider.max.z, `${collider.id} z bounds must have volume`);
      assert.equal(collider.min, collider.bounds.min);
      assert.equal(collider.max, collider.bounds.max);
    }

    for (const spawn of arena.enemySpawnPoints) assert.ok(isFiniteVector(spawn.position));
    for (const supply of arena.supplyPoints) assert.ok(isFiniteVector(supply.position));
    assert.ok(isFiniteVector(arena.safePlayerSpawn));
    assert.ok(arena.killY < arena.safePlayerSpawn.y);
  } finally {
    arena.dispose();
  }
});

test('waypoint graph is connected, bidirectional, and avoids dead ends', () => {
  const arena = new ArenaBuilder().build();
  try {
    const graph = arena.waypointGraph;
    assert.ok(graph.nodes.length >= 24);
    const first = graph.nodes[0];
    assert.ok(first);
    const visited = new Set<string>([first.id]);
    const queue = [first.id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      for (const neighbor of graph.neighborsOf(id)) {
        assert.ok(neighbor.neighbors.includes(id), `${id}/${neighbor.id} should be bidirectional`);
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);
        queue.push(neighbor.id);
      }
    }
    assert.equal(visited.size, graph.nodes.length, 'all navigation levels should be connected');
    assert.equal(graph.nodes.filter((node) => node.neighbors.length < 2).length, 0, 'waypoints should not create dead ends');
    assert.ok(graph.nodes.some((node) => node.tags.includes('stairs')));
    assert.ok(graph.nodes.some((node) => node.tags.includes('marksman')));
  } finally {
    arena.dispose();
  }
});

test('expanded arena preserves human scale while providing reference-length routes', () => {
  const arena = new ArenaBuilder().build();
  try {
    const ground = arena.colliders.find((collider) => collider.id === 'collider-main-ground');
    assert.ok(ground);
    const groundSize = ground.bounds.getSize(new THREE.Vector3());
    assert.ok(groundSize.x >= 72 && groundSize.z >= 78, `expected expanded ground, got ${groundSize.toArray().join(',')}`);
    assert.deepEqual(arena.safePlayerSpawn.toArray(), [2, 0.32, 4.5]);

    const groundNodes = arena.waypointGraph.nodes.filter((node) => node.tags.includes('ground'));
    const xValues = groundNodes.map((node) => node.position.x);
    const zValues = groundNodes.map((node) => node.position.z);
    assert.ok(Math.max(...xValues) - Math.min(...xValues) >= 60);
    assert.ok(Math.max(...zValues) - Math.min(...zValues) >= 65);
    assert.ok(arena.enemySpawnPoints.length >= 22);
    assert.ok(arena.waypointGraph.nodes.some((node) => node.id === 'rear-deck-west'));
    assert.ok(arena.colliders.some((collider) => collider.id === 'collider-rear-transit-deck'));
  } finally {
    arena.dispose();
  }
});

test('one folded-paper scout aircraft follows a deterministic rooftop patrol', () => {
  const arena = new ArenaBuilder().build();
  try {
    const aircraft: THREE.Object3D[] = [];
    arena.root.traverse((object) => {
      if (object.name === 'sky-scout-aircraft') aircraft.push(object);
    });
    assert.equal(aircraft.length, 1, 'the reference has one persistent scout aircraft');
    const scout = aircraft[0];
    assert.ok(scout);
    assert.equal(scout.userData.referenceSilhouette, 'folded-paper-scout');
    assert.equal(scout.userData.patrolDirection, 'clockwise');
    assert.equal(scout.userData.patrolDurationSeconds, 32);
    assert.ok(scout.userData.averageSpeed > 4 && scout.userData.averageSpeed < 7);
    assert.equal(scout.children.length, 5, 'five paper panels should expose the folded silhouette');

    const bounds = new THREE.Box3().setFromObject(scout).getSize(new THREE.Vector3());
    const longestSide = Math.max(bounds.x, bounds.y, bounds.z);
    assert.ok(longestSide > 1.7 && longestSide < 2.6, `unexpected scout size: ${bounds.toArray().join(',')}`);
    assert.ok(scout.position.y > 12.5 && scout.position.y < 16);

    const startPosition = scout.position.clone();
    const startQuaternion = scout.quaternion.clone();
    arena.update(1);
    assert.ok(scout.position.distanceTo(startPosition) > 3, 'the aircraft should visibly advance along its patrol');
    assert.ok(1 - Math.abs(scout.quaternion.dot(startQuaternion)) > 0.0001, 'the aircraft should bank and turn');
    assert.ok(scout.position.y > 12.5 && scout.position.y < 16);

    arena.update(31);
    assert.ok(scout.position.distanceTo(startPosition) < 1e-6, 'one full patrol should return to its starting point');
    assert.ok(1 - Math.abs(scout.quaternion.dot(startQuaternion)) < 1e-6, 'the patrol transform should loop cleanly');

    scout.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      assert.equal(object.userData.raycastDisabled, true);
      assert.ok(!arena.raycastMeshes.includes(object), 'sky geometry must not intercept weapon raycasts');
    });
  } finally {
    arena.dispose();
  }
});

test('barricades disable collision and world raycasts, then reset cleanly', () => {
  const arena = new ArenaBuilder().build();
  try {
    const barricade = arena.breakables[0];
    assert.ok(barricade);
    const raycastCount = arena.raycastMeshes.length;
    const result = arena.damageBreakable(
      barricade.id,
      barricade.maxHealth,
      barricade.root.getWorldPosition(new THREE.Vector3()),
      new THREE.Vector3(0.2, 0.5, -1),
    );
    assert.equal(result?.destroyed, true);
    assert.equal(barricade.collider.enabled, false);
    assert.ok(arena.raycastMeshes.length < raycastCount);
    assert.ok(barricade.raycastMeshes.every((mesh) => mesh.userData.raycastDisabled === true));

    arena.update(1 / 60);
    arena.resetBreakables();
    assert.equal(barricade.broken, false);
    assert.equal(barricade.collider.enabled, true);
    assert.equal(arena.raycastMeshes.length, raycastCount);
    assert.ok(barricade.raycastMeshes.every((mesh) => mesh.userData.raycastDisabled === false));
  } finally {
    arena.dispose();
    assert.equal(getOutlineCacheStats().references, 0);
  }
});

test('foundry has connected ground and elevated routes even after both bridges collapse', () => {
  const arena = new ArenaBuilder({levelMode:'fold-foundry'}).build();
  try {
    assert.equal(arena.objectives?.length,3);
    assert.ok(arena.breakables.filter(b=>b.id.startsWith('paper-wall')).length>=18);
    const graph=arena.waypointGraph;
    const visited=new Set<string>(); const queue=[graph.nodes[0]!];
    while(queue.length) {const n=queue.pop()!;if(visited.has(n.id))continue;visited.add(n.id);queue.push(...graph.neighborsOf(n.id));}
    assert.equal(visited.size,graph.nodes.length,'all authored combat floors connect');
    for(const side of ['west','east']) {
      const joint=arena.breakables.find(b=>b.id==='fold-'+side+'-bridge-joint--1')!;
      assert.ok(joint);
      arena.damageBreakable(joint.id,100);
    }
    for(let i=0;i<20;i++) arena.update(0.05);
    assert.ok(arena.colliders.filter(c=>c.tags.includes('folding')).every(c=>!c.enabled));
    assert.ok(arena.colliders.find(c=>c.id==='collider-challenge-floor')?.enabled,'collapse never removes the traversable ground');
    assert.ok(arena.root.getObjectByName('fold-west-bridge')!.rotation.x < -0.1);
    arena.resetBreakables();
    assert.ok(arena.colliders.filter(c=>c.tags.includes('folding')).every(c=>c.enabled));
    assert.ok(arena.breakables.every(b=>!b.broken));
  } finally {arena.dispose();}
});

test('foundry spawn points have supported feet, body clearance and nearby connected routes', () => {
  const arena = new ArenaBuilder({ levelMode: 'fold-foundry' }).build();
  try {
    for (const spawn of arena.enemySpawnPoints) {
      const floor = arena.colliders.find(collider => ['ground', 'platform'].includes(collider.category)
        && Math.abs(collider.max.y - spawn.position.y) < 0.45
        && spawn.position.x > collider.min.x + 0.3 && spawn.position.x < collider.max.x - 0.3
        && spawn.position.z > collider.min.z + 0.3 && spawn.position.z < collider.max.z - 0.3);
      assert.ok(floor, `${spawn.id} requires supported ground`);
      assert.equal(arena.colliders.some(collider => collider.enabled && collider !== floor
        && collider.min.y < spawn.position.y + 1.7 && collider.max.y > spawn.position.y + 0.5
        && spawn.position.x > collider.min.x - 0.5 && spawn.position.x < collider.max.x + 0.5
        && spawn.position.z > collider.min.z - 0.5 && spawn.position.z < collider.max.z + 0.5), false,
      `${spawn.id} must have body clearance`);
      const node = arena.waypointGraph.nearest(spawn.position);
      assert.ok(node && node.position.distanceTo(spawn.position) < 4,
        `${spawn.id} must be close to a reachable route`);
    }
    const landing = arena.colliders.find(collider => collider.id === 'collider-dispatch-roof-connection');
    assert.ok(landing && landing.min.x < 21 && landing.max.z > -47,
      'the dispatch landing must overlap both the office roof and the stair top');
  } finally { arena.dispose(); }
});

test('reactor routes connect both floors and solid machinery limits long-range firing', () => {
  const arena = new ArenaBuilder({ levelMode: 'dual-pages' }).build();
  try {
    assert.deepEqual(arena.objectives?.map(objective => objective.firstWave), [1, 3, 5]);
    assert.equal(arena.colliders.some(collider => collider.tags.includes('page-shutter')), false);
    assert.equal(arena.activatePageSwitch?.(), false, 'the combat map has no timed routing switches');
    const graph = arena.waypointGraph;
    const first = graph.nearest(arena.safePlayerSpawn)!;
    const reachable = new Set<string>();
    const queue = [first];
    while (queue.length) {
      const node = queue.pop()!;
      if (reachable.has(node.id)) continue;
      reachable.add(node.id);
      queue.push(...graph.neighborsOf(node.id));
    }
    assert.equal(reachable.size, graph.nodes.length, 'entry, ground ring, service bypass and balconies must connect');
    for (const spawn of arena.enemySpawnPoints) {
      const floor = arena.colliders.find(collider => ['ground', 'platform'].includes(collider.category)
        && Math.abs(collider.max.y - spawn.position.y) < 0.45
        && spawn.position.x > collider.min.x + 0.3 && spawn.position.x < collider.max.x - 0.3
        && spawn.position.z > collider.min.z + 0.3 && spawn.position.z < collider.max.z - 0.3);
      assert.ok(floor, `${spawn.id} requires supported ground`);
      assert.equal(arena.colliders.some(collider => collider.enabled && collider !== floor
        && collider.min.y < spawn.position.y + 1.7 && collider.max.y > spawn.position.y + 0.5
        && spawn.position.x > collider.min.x - 0.5 && spawn.position.x < collider.max.x + 0.5
        && spawn.position.z > collider.min.z - 0.5 && spawn.position.z < collider.max.z + 0.5), false,
      `${spawn.id} must have body clearance`);
      assert.ok(graph.nearest(spawn.position)!.position.distanceTo(spawn.position) < 4,
        `${spawn.id} must be close to a reachable route`);
    }
    const sightline = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
      const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to));
      return ray.intersectObjects(arena.raycastMeshes, false).length === 0;
    };
    assert.equal(sightline(new THREE.Vector3(0,1.7,26), new THREE.Vector3(0,1.7,-15)), false,
      'spawn must not see the entire hall');
    assert.equal(sightline(new THREE.Vector3(-8,1.7,-6), new THREE.Vector3(8,1.7,-6)), false,
      'the central vessel must interrupt cross-map shots');
    assert.equal(sightline(new THREE.Vector3(-24,1.7,-21), new THREE.Vector3(-16,1.7,-21)), true,
      'the service passage must have a real open doorway into the hall');
    assert.equal(sightline(new THREE.Vector3(-15.6,5.9,-6), new THREE.Vector3(-11,1.7,3)), true,
      'balcony defenders must threaten their near floor lane');
    assert.equal(sightline(new THREE.Vector3(-15.6,5.9,-6), new THREE.Vector3(10,1.7,-8)), false,
      'the same balcony must not cover the floor behind the core');
  } finally { arena.dispose(); }
});
