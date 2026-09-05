import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PhysicsWorld, type CapsuleBodyState, type CapsuleConfig, type WorldCollider } from './PhysicsWorld';

const config: CapsuleConfig = { radius: 0.34, height: 1.72, stepHeight: 0.46, gravity: 25 };
const collider = (id: string, min: [number, number, number], max: [number, number, number]): WorldCollider => ({
  id,
  min: new THREE.Vector3(...min),
  max: new THREE.Vector3(...max),
});

test('capsule lands on the floor without sinking', () => {
  const world = new PhysicsWorld([collider('floor', [-20, -1, -20], [20, 0, 20])]);
  const body: CapsuleBodyState = { position: new THREE.Vector3(0, 0.2, 0), velocity: new THREE.Vector3(0, -5, 0), grounded: false };
  world.moveCapsule(body, 0.05, config);
  assert.equal(body.position.y, 0);
  assert.equal(body.grounded, true);
});

test('substeps prevent fast horizontal tunnelling through a wall', () => {
  const world = new PhysicsWorld([
    collider('floor', [-20, -1, -20], [20, 0, 20]),
    collider('wall', [1, 0, -2], [1.2, 3, 2]),
  ]);
  const body: CapsuleBodyState = { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(30, 0, 0), grounded: true };
  world.moveCapsule(body, 0.05, config);
  assert.ok(body.position.x < 0.75);
  assert.equal(body.velocity.x, 0);
});

test('grounded capsule steps onto a low obstacle', () => {
  const world = new PhysicsWorld([
    collider('floor', [-20, -1, -20], [20, 0, 20]),
    collider('step', [0.4, 0, -1], [1.2, 0.3, 1]),
  ]);
  const body: CapsuleBodyState = { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(4, 0, 0), grounded: true };
  world.moveCapsule(body, 0.05, config);
  assert.equal(body.position.y, 0.3);
  assert.ok(body.position.x > 0);
});
