import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ArenaBuilder } from './ArenaBuilder';
import { PhysicsWorld, type CapsuleBodyState } from '../physics/PhysicsWorld';

const config = { radius: 0.34, height: 1.72, stepHeight: 0.46, gravity: 25 };

for (const levelMode of ['fold-foundry', 'dual-pages'] as const) {
  test(`${levelMode}: every authored staircase supports normal player ascent and descent`, () => {
    const arena = new ArenaBuilder({ levelMode }).build();
    const physics = new PhysicsWorld([...arena.colliders]);
    try {
      const entries = arena.waypointGraph.nodes.filter(node => node.tags.includes('stairs') && node.id.endsWith('-nav-0'));
      assert.ok(entries.length >= 2);
      for (const entry of entries) {
        const end = arena.waypointGraph.get(entry.id.replace(/0$/, '8'))!;
        assert.ok(end, entry.id + ' must have an upper landing');
        for (const ascending of [true, false]) {
          const from = ascending ? entry.position : end.position;
          const to = ascending ? end.position : entry.position;
          const body: CapsuleBodyState = { position: from.clone(), velocity: new THREE.Vector3(), grounded: false };
          for (let tick = 0; tick < 400; tick += 1) {
            const delta = to.clone().sub(body.position).setY(0);
            if (delta.length() < 0.15) break;
            delta.normalize().multiplyScalar(8.4);
            body.velocity.x = delta.x;
            body.velocity.z = delta.z;
            physics.moveCapsule(body, 1 / 60, config);
          }
          const remaining = Math.hypot(body.position.x - to.x, body.position.z - to.z);
          assert.ok(remaining < 0.2, `${entry.id} ${ascending ? 'ascent' : 'descent'} blocked at ${body.position.toArray()}`);
          if (ascending) assert.ok(body.position.y >= to.y - 0.4, entry.id + ' must reach the upper floor');
        }
      }
    } finally { arena.dispose(); }
  });
}
