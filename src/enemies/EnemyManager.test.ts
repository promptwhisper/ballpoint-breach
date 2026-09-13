import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DoodleMaterial } from '../render';
import { EnemyManager } from './EnemyManager';
import type { EnemyCombatProfile, EnemyEvent, PlayerDamageEvent } from './types';

function updateFor(manager: EnemyManager, seconds: number, step = 0.05): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) manager.update(step);
}

test('challenge riflemen contest a 24 metre lane without increasing their health', () => {
  for (const profile of ['classic', 'assault', 'siege'] as const) {
    const events: EnemyEvent[] = [];
    const manager = new EnemyManager(new THREE.Group(), {
      seed: 42,
      getPlayer: () => ({ position: new THREE.Vector3(0, 1, 24), radius: 0.48 }),
      getCombatProfile: () => profile,
      onEvent: event => events.push(event),
    });
    const enemy = manager.spawn('grunt', new THREE.Vector3());
    updateFor(manager, 2);
    assert.equal(enemy.maxHealth, 90, 'difficulty must not inflate time to kill');
    const fired = events.some(event => event.type === 'projectile-spawn');
    assert.equal(fired, profile !== 'classic', `${profile} should have its own effective range`);
    manager.reset();
  }
});

test('changing maps restores the classic combat profile on subsequent spawns', () => {
  let profile: EnemyCombatProfile = 'assault';
  const manager = new EnemyManager(new THREE.Group(), {
    seed: 42,
    getPlayer: () => ({ position: new THREE.Vector3(0, 1, 40) }),
    hasLineOfSight: () => false,
    getCombatProfile: () => profile,
  });
  const distances: number[] = [];
  for (const next of ['assault', 'siege', 'classic'] as const) {
    profile = next;
    manager.reset();
    const enemy = manager.spawn('rusher', new THREE.Vector3());
    updateFor(manager, 1.5);
    assert.equal(enemy.combatProfile, next);
    assert.equal(enemy.maxHealth, 58);
    distances.push(enemy.position.z);
  }
  assert.ok(distances[1]! > distances[0]! && distances[0]! > distances[2]! * 1.4);
  manager.reset();
});

test('challenge bosses navigate to an obstructed player before starting an attack', () => {
  const events: EnemyEvent[] = [];
  let navigationCalls = 0;
  const manager = new EnemyManager(new THREE.Group(), {
    getPlayer: () => ({ position: new THREE.Vector3(0, 1, 18) }),
    getCombatProfile: () => 'siege',
    hasLineOfSight: () => false,
    navigationTarget: () => { navigationCalls += 1; return new THREE.Vector3(5, 0, 6); },
    onEvent: event => events.push(event),
  });
  const boss = manager.spawn('boss', new THREE.Vector3());
  updateFor(manager, 2);
  assert.ok(navigationCalls > 0);
  assert.ok(boss.position.x > 0.5, 'boss should follow the side passage');
  assert.equal(events.some(event => event.type === 'attack-telegraph'), false);
  manager.reset();
});

test('grunt progresses through its FSM, attacks, and damages the player', () => {
  const scene = new THREE.Group();
  const player = { position: new THREE.Vector3(0, 0, 7), radius: 0.45 };
  const events: EnemyEvent[] = [];
  const damageEvents: PlayerDamageEvent[] = [];
  const manager = new EnemyManager(scene, {
    seed: 42,
    getPlayer: () => player,
    onEvent: (event) => events.push(event),
    onPlayerDamage: (event) => damageEvents.push(event),
  });
  const grunt = manager.spawn('grunt', new THREE.Vector3(0, 0, 0), { id: 'test-grunt' });
  assert.ok(grunt.rig.head.getObjectByName('head-hit-zone') instanceof THREE.Mesh);
  assert.ok((grunt.rig.head.getObjectByName('head-hit-zone') as THREE.Mesh).material instanceof DoodleMaterial);

  updateFor(manager, 2.2);

  assert.ok(events.some((event) => event.type === 'state-change' && event.state === 'seek'));
  assert.ok(events.some((event) => event.type === 'attack-telegraph'));
  assert.ok(events.some((event) => event.type === 'projectile-spawn'));
  assert.ok(damageEvents.some((event) => event.sourceEnemyId === 'test-grunt' && event.amount === 9));
  assert.ok(damageEvents.some((event) => event.projectileId?.startsWith('enemy-projectile-')));
});

test('visible player behind low cover triggers navigation escape instead of permanent body blocking', () => {
  const scene = new THREE.Group();
  const player = { position: new THREE.Vector3(0, 0, 8), radius: 0.34 };
  let elapsed = 0;
  let firstNavigationAt: number | null = null;
  const manager = new EnemyManager(scene, {
    seed: 17,
    getPlayer: () => player,
    hasLineOfSight: () => true,
    navigationTarget: () => {
      if (firstNavigationAt === null) firstNavigationAt = elapsed;
      return new THREE.Vector3(2.2, 0, 2.4);
    },
    resolveMovement: (enemy, proposed) => {
      const blockedByLowCover = proposed.z > 1 && Math.abs(proposed.x) < 0.9;
      if (!blockedByLowCover) return proposed;
      const slide = enemy.position.clone();
      slide.x = proposed.x;
      return slide;
    },
  });
  const rusher = manager.spawn('rusher', new THREE.Vector3(0, 0, 0), { id: 'cover-blocked-rusher' });
  let maxLateralDistance = 0;

  for (let tick = 0; tick < 240; tick += 1) {
    elapsed += 0.025;
    manager.update(0.025);
    maxLateralDistance = Math.max(maxLateralDistance, Math.abs(rusher.position.x));
  }

  assert.ok(firstNavigationAt !== null, 'stalled movement should force a navigation request despite visual LOS');
  assert.ok(firstNavigationAt < 2, `expected an early stuck recovery, navigation began at ${firstNavigationAt}`);
  assert.ok(maxLateralDistance >= 0.9, `expected a lateral escape, got ${maxLateralDistance}`);
  assert.ok(rusher.position.z > 2, `expected the rusher to clear cover, got ${rusher.position.toArray().join(',')}`);
});

test('ordinary NPC rig matches the paper snowman silhouette from the reference', () => {
  const scene = new THREE.Group();
  const manager = new EnemyManager(scene, {
    getPlayer: () => ({ position: new THREE.Vector3(0, 0, 12) }),
  });
  const grunt = manager.spawn('grunt', new THREE.Vector3(0, 0, 0), { id: 'reference-rig', yaw: 0 });
  scene.updateMatrixWorld(true);

  const head = grunt.rig.head.getObjectByName('head-hit-zone');
  const torso = grunt.rig.torso.getObjectByName('torso-hit-zone');
  assert.ok(head instanceof THREE.Mesh && head.material instanceof DoodleMaterial);
  assert.ok(torso instanceof THREE.Mesh && torso.material instanceof DoodleMaterial);
  assert.equal(head.material.surfaceColor.getHex(), 0xf0eae0);
  assert.equal(torso.material.surfaceColor.getHex(), 0xf0eae0);
  assert.equal(head.material.inkColor.getHex(), 0xb63a56);

  const headSize = new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());
  const torsoSize = new THREE.Box3().setFromObject(torso).getSize(new THREE.Vector3());
  assert.ok(torsoSize.y / headSize.x >= 0.85 && torsoSize.y / headSize.x <= 1.2);
  const upperArm = grunt.rig.leftArm.getObjectByName('left-arm-upper-segment');
  assert.ok(upperArm instanceof THREE.Mesh);
  const limbDiameter = (upperArm.parent?.scale.x ?? 0) * 2;
  assert.ok(limbDiameter / headSize.x < 0.18);

  for (const name of [
    'regular-brow--1',
    'regular-brow-1',
    'regular-red-eye-line',
    'left-arm-elbow',
    'right-arm-mitten-hand',
    'left-leg-knee',
    'right-leg-shoe',
    'grunt-upright-weapon',
    'enemy-muzzle-socket',
  ]) assert.ok(grunt.rig.root.getObjectByName(name), `missing reference rig node ${name}`);
});

test('ordinary NPC drawings keep bounded scale while varying contour, limbs, face and upright gun', () => {
  const scene = new THREE.Group();
  const manager = new EnemyManager(scene, {
    seed: 73,
    getPlayer: () => ({ position: new THREE.Vector3(0, 0, 12) }),
  });
  const first = manager.spawn('grunt', new THREE.Vector3(0, 0, 0), { id: 'irregular-a', yaw: 0 });
  const second = manager.spawn('grunt', new THREE.Vector3(2, 0, 0), { id: 'irregular-b', yaw: 0 });
  scene.updateMatrixWorld(true);

  assert.equal(first.rig.root.userData.handDrawnAsymmetry, true);
  assert.notEqual(first.rig.root.userData.doodleVariant, second.rig.root.userData.doodleVariant);
  assert.notEqual(
    first.rig.root.getObjectByName('regular-mouth-expression')?.userData.expression,
    second.rig.root.getObjectByName('regular-mouth-expression')?.userData.expression,
  );
  for (const name of [
    'regular-head-scribble-contour-primary',
    'regular-head-scribble-contour-echo',
    'regular-torso-scribble-contour-primary',
    'regular-torso-scribble-contour-echo',
    'left-leg-upper-paper-break-1',
    'right-leg-lower-paper-break-2',
    'regular-mouth-expression',
  ]) assert.ok(first.rig.root.getObjectByName(name), `missing hand-drawn detail ${name}`);

  const head = first.rig.root.getObjectByName('head-hit-zone') as THREE.Mesh;
  const torso = first.rig.root.getObjectByName('torso-hit-zone') as THREE.Mesh;
  assert.equal(head.geometry.userData.doodleSilhouette, true);
  assert.equal(torso.geometry.userData.doodleSilhouette, true);
  const headSize = new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());
  const torsoSize = new THREE.Box3().setFromObject(torso).getSize(new THREE.Vector3());
  assert.ok(headSize.z / headSize.x < 0.56, 'head must read as a shallow paper drawing, not a perfect ball');
  assert.ok(torsoSize.z / torsoSize.x < 0.58, 'belly must stay shallow without changing its collision radius');

  assert.notEqual(first.rig.leftArm.rotation.z, -first.rig.rightArm.rotation.z, 'arms must not be mirrored');
  const leftLeg = first.rig.root.getObjectByName('left-leg-lower-segment') as THREE.Mesh;
  const rightLeg = first.rig.root.getObjectByName('right-leg-lower-segment') as THREE.Mesh;
  assert.notEqual(leftLeg.parent?.scale.y, rightLeg.parent?.scale.y, 'leg stroke lengths should differ');
  assert.ok(leftLeg.material instanceof DoodleMaterial);
  assert.equal(leftLeg.material.surfaceColor.getHex(), 0xcf3f5a);

  const leftShoe = first.rig.root.getObjectByName('left-leg-shoe');
  const rightShoe = first.rig.root.getObjectByName('right-leg-shoe');
  assert.ok(leftShoe instanceof THREE.Mesh && rightShoe instanceof THREE.Mesh);
  assert.notEqual(leftShoe.parent?.scale.x, rightShoe.parent?.scale.x);
  assert.notEqual(leftShoe.parent?.rotation.z, -rightShoe.parent!.rotation.z);

  const weapon = first.rig.root.getObjectByName('grunt-upright-weapon');
  const receiver = first.rig.root.getObjectByName('grunt-weapon-receiver');
  assert.ok(weapon && receiver);
  assert.equal(weapon.userData.handDrawnOffset, true);
  const receiverSize = new THREE.Box3().setFromObject(receiver).getSize(new THREE.Vector3());
  assert.ok(receiverSize.x / torsoSize.x < 0.18, 'upright receiver should remain a narrow off-centre stroke');
  assert.equal(first.collisionRadius, second.collisionRadius);
  assert.equal(first.collisionRadius, 0.42, 'visual irregularity must not change gameplay collision scale');
});

test('raycast reports head hit zones and heavy takes amplified headshot damage', () => {
  const scene = new THREE.Group();
  const manager = new EnemyManager(scene, {
    getPlayer: () => ({ position: new THREE.Vector3(20, 0, 20) }),
  });
  const heavy = manager.spawn('heavy', new THREE.Vector3(0, 0, 5), { id: 'heavy-target' });
  scene.updateMatrixWorld(true);
  const headCenter = new THREE.Box3().setFromObject(heavy.rig.head).getCenter(new THREE.Vector3());
  const raycaster = new THREE.Raycaster(new THREE.Vector3(headCenter.x, headCenter.y, 0), new THREE.Vector3(0, 0, 1), 0, 10);
  const hit = manager.raycast(raycaster, 10);

  assert.ok(hit);
  assert.equal(hit.hitZone, 'head');
  const result = manager.applyDamage(hit, { amount: 40, type: 'shotgun', direction: new THREE.Vector3(0, 0, 1), impulse: 2 });
  assert.ok(result);
  assert.equal(result.headshot, true);
  assert.ok(result.applied > 140);
  assert.equal(heavy.health, 260 - result.applied);
});

test('lethal hits preserve impact direction and hold the red death silhouette for one beat', () => {
  const scene = new THREE.Group();
  const events: EnemyEvent[] = [];
  const manager = new EnemyManager(scene, {
    getPlayer: () => ({ position: new THREE.Vector3(0, 0, 8) }),
    onEvent: (event) => events.push(event),
  });
  const target = manager.spawn('grunt', new THREE.Vector3(0, 0, 2), { id: 'ink-death-target' });
  const direction = new THREE.Vector3(0.2, 0.1, -1).normalize();

  const result = manager.applyDamage(target.id, {
    amount: target.maxHealth * 2,
    type: 'shotgun',
    direction,
    impulse: 6,
  });

  assert.equal(result?.killed, true);
  assert.equal(target.rig.root.visible, true);
  updateFor(manager, 0.12, 0.06);
  assert.equal(target.rig.root.visible, false);
  const death = events.find((event) => event.type === 'death' && event.enemyId === target.id);
  assert.ok(death?.direction);
  assert.ok(death.direction.distanceTo(direction) < 1e-9);
  assert.equal(death.deathCause, 'shotgun');
});

test('projectiles can be reflected and damage enemies', () => {
  const scene = new THREE.Group();
  const events: EnemyEvent[] = [];
  const manager = new EnemyManager(scene, {
    getPlayer: () => ({ position: new THREE.Vector3(50, 0, 50) }),
    onEvent: (event) => events.push(event),
  });
  const target = manager.spawn('grunt', new THREE.Vector3(0, 0, 3), { id: 'reflection-target' });
  manager.projectilePool.spawn({
    ownerId: 'offscreen-marksman',
    ownerKind: 'marksman',
    origin: new THREE.Vector3(0, 1.2, 0),
    direction: new THREE.Vector3(0, 0, -1),
    speed: 20,
    damage: 30,
  });
  manager.projectilePool.spawn({
    ownerId: 'nearby-decoy',
    ownerKind: 'grunt',
    origin: new THREE.Vector3(0.45, 1.2, 0.35),
    direction: new THREE.Vector3(-0.2, 0, -1),
    speed: 12,
    damage: 5,
  });
  const activeBeforeQuery = manager.projectilePool.activeCount;
  const incoming = manager.findIncomingProjectile(new THREE.Vector3(0, 1.2, -0.4), 1);
  assert.ok(incoming);
  assert.equal(incoming.reflected, false);
  assert.equal(manager.projectilePool.activeCount, activeBeforeQuery);
  const reflection = manager.reflectProjectiles(
    new THREE.Vector3(0, 1.2, 0),
    1,
    new THREE.Vector3(0, 0, 1),
    incoming.id,
  );
  assert.equal(reflection.count, 1);
  assert.deepEqual(reflection.projectileIds, [incoming.id]);
  assert.ok(manager.findIncomingProjectile(new THREE.Vector3(0, 1.2, 0), 1), 'nearby untargeted projectile remains hostile');

  scene.updateMatrixWorld(true);
  updateFor(manager, 0.25, 0.025);

  assert.ok(target.health < target.maxHealth);
  assert.ok(events.some((event) => event.type === 'projectile-reflected'));
  assert.ok(events.some((event) => event.type === 'projectile-impact' && event.enemyId === target.id));
});

test('falling enemies die and are cleaned up on schedule', () => {
  const scene = new THREE.Group();
  const events: EnemyEvent[] = [];
  const manager = new EnemyManager(scene, {
    fallDeathY: -0.5,
    despawnDelay: 0.25,
    getPlayer: () => ({ position: new THREE.Vector3(12, 0, 12) }),
    groundHeight: () => null,
    onEvent: (event) => events.push(event),
  });
  manager.spawn('rusher', new THREE.Vector3(0, 0, 0), { id: 'falling-rusher' });

  updateFor(manager, 1.2);

  assert.ok(events.some((event) => event.type === 'death' && event.deathCause === 'fall'));
  assert.ok(events.some((event) => event.type === 'cleanup' && event.enemyId === 'falling-rusher'));
  assert.equal(manager.totalCount, 0);
});

test('a long drop onto the arena floor counts as a fall kill', () => {
  const scene = new THREE.Group();
  const events: EnemyEvent[] = [];
  const manager = new EnemyManager(scene, {
    fallDeathY: -9,
    getPlayer: () => ({ position: new THREE.Vector3(20, 0, 20) }),
    groundHeight: () => 0,
    onEvent: (event) => events.push(event),
  });
  manager.spawn('rusher', new THREE.Vector3(0, 6, 0), { id: 'ledge-rusher' });

  updateFor(manager, 1.4, 0.025);

  assert.ok(events.some((event) => event.type === 'death' && event.enemyId === 'ledge-rusher' && event.deathCause === 'fall'));
});

test('melee and boss direct damage are cancelled when line of sight breaks during windup', () => {
  const scene = new THREE.Group();
  const damageEvents: PlayerDamageEvent[] = [];
  let visible = true;
  const manager = new EnemyManager(scene, {
    seed: 7,
    getPlayer: () => ({ position: new THREE.Vector3(0, 0, 1), radius: 0.34 }),
    hasLineOfSight: () => visible,
    onEvent: (event) => {
      if (event.type === 'attack-telegraph') visible = false;
    },
    onPlayerDamage: (event) => damageEvents.push(event),
  });
  manager.spawn('rusher', new THREE.Vector3(0, 0, 0), { id: 'occluded-rusher' });

  updateFor(manager, 1.2, 0.025);

  assert.equal(damageEvents.length, 0);
});

test('THE DOODLER enters a faster second phase below half health', () => {
  const scene = new THREE.Group();
  const events: EnemyEvent[] = [];
  const manager = new EnemyManager(scene, {
    getPlayer: () => ({ position: new THREE.Vector3(0, 0, 9) }),
    onEvent: (event) => events.push(event),
  });
  const boss = manager.spawn('boss', new THREE.Vector3(0, 0, 0), { id: 'the-doodler' });
  manager.applyDamage(boss.id, { amount: boss.maxHealth * 0.51, type: 'bullet' });

  updateFor(manager, 1.5);

  assert.ok(events.some((event) => event.type === 'boss-phase' && event.phase === 2));
  assert.ok(events.some((event) => event.type === 'attack-telegraph' && event.kind === 'boss'));
});
