import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { getOutlineCacheStats } from '../render/OutlinedMesh';
import { ArenaBuilder, type ArenaCollider } from './ArenaBuilder';

function isFiniteVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

test('arena exposes complete gameplay contracts and valid AABB colliders', () => {
  const arena = new ArenaBuilder({ outlineIrregularity: 0.003 }).build();
  try {
    assert.equal(arena.root.name, 'doodle-construction-arena');
    assert.ok(arena.enemySpawnPoints.length >= 12, 'needs at least twelve enemy spawns');
    assert.ok(arena.supplyPoints.length >= 6, 'needs at least six supply points');
    assert.ok(arena.ledges.length >= 8, 'needs meaningful high ledges');
    assert.ok(arena.breakables.length >= 4, 'needs multiple breakable barricades');
    assert.ok(arena.raycastMeshes.length > 40, 'arena surfaces should be raycastable');
    assert.ok(arena.colliders.length > 30, 'arena requires explicit collision coverage');

    const stairLandings = arena.colliders.filter((collider) => collider.tags.includes('landing'));
    assert.equal(stairLandings.length, 10, 'every authored stair flight needs a walkable top landing');
    for (const landing of stairLandings) {
      const connectedPlatform = arena.colliders.some((candidate) => {
        if (candidate === landing || candidate.tags.includes('stairs')) return false;
        if (candidate.category !== 'platform') return false;
        const overlapX = Math.min(landing.max.x, candidate.max.x) - Math.max(landing.min.x, candidate.min.x);
        const overlapZ = Math.min(landing.max.z, candidate.max.z) - Math.max(landing.min.z, candidate.min.z);
        return overlapX >= 0.5 && overlapZ >= 0.5 && Math.abs(landing.max.y - candidate.max.y) <= 0.04;
      });
      assert.ok(connectedPlatform, `${landing.id} must overlap a destination platform at the same height`);
    }

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

test('every authored stair flight is climbable by the player capsule', () => {
  const arena = new ArenaBuilder().build();
  try {
    const flights = new Map<string, Array<{ collider: ArenaCollider; index: number }>>();
    for (const collider of arena.colliders) {
      const match = collider.id.match(/^collider-(.+)-step-(\d+)$/);
      if (!match) continue;
      const [, flightId, stepIndex] = match;
      assert.ok(flightId && stepIndex);
      const flight = flights.get(flightId) ?? [];
      flight.push({ collider, index: Number(stepIndex) });
      flights.set(flightId, flight);
    }

    assert.equal(flights.size, 10, 'expected all ten authored stair flights');
    const world = new PhysicsWorld(arena.colliders);
    const capsule = { radius: 0.34, height: 1.72, stepHeight: 0.46, gravity: 25 };

    for (const [flightId, flight] of flights) {
      flight.sort((left, right) => left.index - right.index);
      const first = flight[0]?.collider;
      const second = flight[1]?.collider;
      const last = flight.at(-1)?.collider;
      assert.ok(first && second && last, `${flightId} needs enough steps to test`);

      const firstCenter = first.min.clone().add(first.max).multiplyScalar(0.5);
      const lastCenter = last.min.clone().add(last.max).multiplyScalar(0.5);
      const direction = lastCenter.clone().sub(firstCenter).setY(0).normalize();
      const stepRise = second.max.y - first.max.y;
      const body = {
        position: firstCenter.clone().addScaledVector(direction, -0.12),
        velocity: new THREE.Vector3(),
        grounded: true,
      };
      body.position.y = first.max.y - stepRise;

      let peakFeetY = body.position.y;
      for (let frame = 0; frame < 1600; frame += 1) {
        body.velocity.x = direction.x * 3;
        body.velocity.z = direction.z * 3;
        world.moveCapsule(body, 1 / 240, capsule);
        peakFeetY = Math.max(peakFeetY, body.position.y);
        const progress = body.position.clone().sub(firstCenter).dot(direction);
        if (progress >= firstCenter.distanceTo(lastCenter) + 0.05) break;
      }

      assert.ok(
        peakFeetY >= last.max.y - 0.08,
        `${flightId} blocked at y=${peakFeetY.toFixed(2)} before top y=${last.max.y.toFixed(2)}`,
      );
    }
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
