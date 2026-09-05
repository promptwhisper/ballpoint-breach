import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from './PlayerController';

const movingFrame = {
  moveX: 0,
  moveZ: 1,
  sprint: false,
  primary: false,
  secondary: false,
  jumpPressed: false,
  reloadPressed: false,
  grapplePressed: false,
  restartPressed: false,
  weaponSelection: null,
  weaponWheel: 0 as const,
  lookX: 0,
  lookY: 0,
  pointerLocked: false,
  controlsActive: true,
  pausePressed: false,
};

test('restore clears camera feedback, FOV, velocity, and health for a clean restart', () => {
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.025, 150);
  const spawn = new THREE.Vector3(2, 0.32, 9.5);
  const player = new PlayerController(camera, new PhysicsWorld([]), spawn);
  player.yaw = 0.42;
  player.pitch = -0.08;
  player.body.velocity.set(4, 7, -3);
  player.applyDamage(55);
  player.addRecoil(1.2, 0.4);
  player.setFovTarget(24);

  player.restore();

  assert.equal(player.health, player.maxHealth);
  assert.deepEqual(player.body.velocity.toArray(), [0, 0, 0]);
  assert.deepEqual(player.body.position.toArray(), spawn.toArray());
  assert.equal(camera.fov, 68);
  assert.ok(Math.abs(camera.rotation.x - player.pitch) < 1e-9);
  assert.ok(Math.abs(camera.rotation.y - player.yaw) < 1e-9);
  assert.equal(camera.rotation.z, 0);
});

test('reference gait reaches 1.68 Hz at normal speed and keeps camera motion subtle', () => {
  const camera = new THREE.PerspectiveCamera(68, 1920 / 952, 0.025, 150);
  const physics = {
    moveCapsule: (body: PlayerController['body'], dt: number): void => {
      body.position.addScaledVector(body.velocity, dt);
      body.position.y = 0.32;
      body.velocity.y = 0;
      body.grounded = true;
    },
  } as unknown as PhysicsWorld;
  const player = new PlayerController(camera, physics, new THREE.Vector3(0, 0.32, 0));
  player.enabled = true;
  player.body.grounded = true;
  for (let index = 0; index < 120; index += 1) player.update(1 / 60, movingFrame);
  const phaseStart = player.getSnapshot().gaitPhase;
  for (let index = 0; index < 60; index += 1) player.update(1 / 60, movingFrame);
  const snapshot = player.getSnapshot();
  const cycles = (snapshot.gaitPhase - phaseStart) / (Math.PI * 2);

  assert.ok(Math.abs(snapshot.speed - 8.4) < 0.01);
  assert.ok(cycles >= 1.67 && cycles <= 1.69, `expected reference cadence, got ${cycles}`);
  assert.ok(Math.abs(camera.position.y - (player.body.position.y + 1.58)) <= 0.0021);
});

test('forward movement stays aligned with the camera after turning', () => {
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.025, 150);
  const physics = {
    moveCapsule: (body: PlayerController['body'], dt: number): void => {
      body.position.addScaledVector(body.velocity, dt);
      body.position.y = 0.32;
      body.velocity.y = 0;
      body.grounded = true;
    },
  } as unknown as PhysicsWorld;
  const player = new PlayerController(camera, physics, new THREE.Vector3(0, 0.32, 0));
  player.enabled = true;
  player.yaw = Math.PI / 2;
  player.body.grounded = true;
  for (let index = 0; index < 60; index += 1) player.update(1 / 60, movingFrame);

  const movement = player.body.position.clone().setY(0).normalize();
  const cameraForward = player.getAimDirection().setY(0).normalize();
  assert.ok(movement.dot(cameraForward) > 0.999, `movement ${movement.toArray()} must follow view ${cameraForward.toArray()}`);
});
