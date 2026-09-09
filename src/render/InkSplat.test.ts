import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createInkStamp } from './InkSplat';
import { ProjectilePool } from '../enemies/ProjectilePool';

test('wet ink stamps have deterministic irregular coverage, transparency and wash levels', () => {
  const a = createInkStamp(64, 91);
  assert.deepEqual(a, createInkStamp(64, 91));
  assert.notDeepEqual(a, createInkStamp(64, 128));
  const alpha = a.filter((_, i) => i % 4 === 3);
  assert.ok(alpha.filter(v => v === 0).length > alpha.length * .5);
  assert.ok(alpha.filter(v => v > 140).length > alpha.length * .05);
  assert.ok(alpha.filter(v => v > 0 && v < 100).length > 100);
  assert.equal(a[3], 0);
});

test('ink projectiles retain collision radius, reflect and reset pooled visual state', () => {
  const pool = new ProjectilePool(1);
  const spawn = () => pool.spawn({ownerId:'test', ownerKind:'grunt', origin:new THREE.Vector3(),
    direction:new THREE.Vector3(0,0,-1), speed:10, damage:8, radius:.075});
  const projectile = spawn();
  const object = pool.object.children[0];
  const sprites = object.children.filter((child): child is THREE.Sprite => child instanceof THREE.Sprite);
  assert.equal(sprites.length, 4);
  assert.equal(projectile.radius, .075);
  assert.ok(object.children.filter(child => child instanceof THREE.Mesh).every(child => !child.visible));
  const hostileMaterial = sprites[0].material;
  pool.reflect(new THREE.Vector3(), 1, new THREE.Vector3(0,0,1));
  assert.notEqual(sprites[0].material, hostileMaterial);
  pool.clear();
  assert.equal(object.visible, false);
  spawn();
  assert.equal(sprites[0].material, hostileMaterial);
  assert.equal(pool.activeCount, 1);
  const expected = new THREE.Vector3(0,0,1).applyQuaternion(object.quaternion);
  assert.ok(expected.distanceTo(new THREE.Vector3(0,0,-1)) < 1e-8);
});
