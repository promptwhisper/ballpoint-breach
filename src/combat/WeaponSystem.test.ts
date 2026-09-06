import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DoodleMaterial } from '../render';
import { KATANA_CONTACT_PROGRESS, WeaponSystem, sampleKatanaSlash } from './WeaponSystem';
import type { HitscanRequest, PelletsRequest, ReflectRequest, WeaponEffect } from './types';

const deterministicRandom = (): number => 0.5;

test('automatic rifle obeys its fire interval and consumes one round per ray', () => {
  const hits: HitscanRequest[] = [];
  const system = new WeaponSystem({
    random: deterministicRandom,
    callbacks: { onHitscan: (request) => hits.push(request) },
  });
  system.setAimRay(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, -1));
  system.setTrigger(true);
  system.update(0);
  assert.equal(hits.length, 1);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 29);

  system.update(0.09);
  assert.equal(hits.length, 1);
  system.update(0.006);
  assert.equal(hits.length, 2);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 28);
  assert.deepEqual(hits[0]?.origin.toArray(), [1, 2, 3]);

  system.update(0.38);
  assert.equal(hits.length, 6);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 24);
  system.setTrigger(false);
});

test('reload transfers only the missing rounds after its full duration', () => {
  const effects: WeaponEffect[] = [];
  const system = new WeaponSystem({
    random: deterministicRandom,
    callbacks: { onEffect: (effect) => effects.push(effect) },
  });
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.update(0.06);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 29);
  assert.equal(system.requestReload(), true);
  assert.equal(system.getSnapshot().phase, 'reloading');

  system.update(1.54);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 29);
  system.update(0.02);
  const snapshot = system.getSnapshot();
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.ammo.rifle.magazine, 30);
  assert.equal(snapshot.ammo.rifle.reserve, 149);
  assert.deepEqual(
    effects.filter((effect) => effect.kind.startsWith('reload')).map((effect) => effect.kind),
    ['reload-start', 'reload-complete'],
  );
});

test('empty firearm automatically reloads when reserve ammunition remains', () => {
  const effects: WeaponEffect[] = [];
  const system = new WeaponSystem({
    random: deterministicRandom,
    callbacks: { onEffect: (effect) => effects.push(effect) },
  });
  system.setTrigger(true);
  system.update(0);
  system.update(2.76);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 0);

  system.update(0.06);
  assert.equal(system.getSnapshot().phase, 'reloading');
  assert.equal(effects.filter((effect) => effect.kind === 'reload-start').length, 1);

  system.update(1.56);
  const snapshot = system.getSnapshot();
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.ammo.rifle.magazine, 30);
  assert.equal(snapshot.ammo.rifle.reserve, 120);
});

test('shotgun emits a pellet batch and pump state guards repeat attacks', () => {
  const volleys: PelletsRequest[] = [];
  const system = new WeaponSystem({
    initialWeapon: 'shotgun',
    random: deterministicRandom,
    callbacks: { onPellets: (request) => volleys.push(request) },
  });
  system.setTrigger(true);
  system.update(0);
  assert.equal(volleys.length, 1);
  assert.equal(volleys[0]?.rays.length, 9);
  assert.equal(system.getSnapshot().phase, 'pumping');
  assert.equal(system.getSnapshot().ammo.shotgun.magazine, 5);

  system.setTrigger(false);
  system.setTrigger(true);
  system.update(0.3);
  assert.equal(volleys.length, 1);
  system.setTrigger(false);
  system.update(0.5);
  system.setTrigger(true);
  system.update(0);
  assert.equal(volleys.length, 2);
  assert.equal(system.getSnapshot().ammo.shotgun.magazine, 4);
});

test('revolver remains semi-automatic and produces a visible recoil offset', () => {
  const hits: HitscanRequest[] = [];
  const system = new WeaponSystem({
    initialWeapon: 'revolver',
    random: deterministicRandom,
    callbacks: { onHitscan: (request) => hits.push(request) },
  });
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.update(0.2);
  assert.equal(hits.length, 1);
  assert.notDeepEqual(system.getOffsets().recoilRotation, [0, 0, 0]);

  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  assert.equal(hits.length, 1);
  system.update(0.25);
  system.setTrigger(true);
  system.update(0);
  assert.equal(hits.length, 2);
  assert.equal(system.getSnapshot().ammo.revolver.magazine, 4);
});

test('sniper enters a scope, cycles its bolt after firing, and restores aim', () => {
  const hits: HitscanRequest[] = [];
  const system = new WeaponSystem({
    initialWeapon: 'sniper',
    baseFov: 70,
    random: deterministicRandom,
    callbacks: { onHitscan: (request) => hits.push(request) },
  });
  system.setAimHeld(true);
  system.update(0.3);
  let snapshot = system.getSnapshot();
  assert.equal(snapshot.scopeState, 'active');
  assert.ok(snapshot.desiredFov < 25);

  system.setTrigger(true);
  system.update(0);
  snapshot = system.getSnapshot();
  assert.equal(hits.length, 1);
  assert.equal(snapshot.phase, 'bolting');
  assert.equal(snapshot.scopeState, 'cycling');
  assert.equal(snapshot.ammo.sniper.magazine, 4);

  system.setTrigger(false);
  system.update(0.4);
  assert.equal(system.getSnapshot().scopeState, 'cycling');
  system.update(0.43);
  snapshot = system.getSnapshot();
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.scopeState, 'active');
  system.update(0.3);
  assert.equal(system.getSnapshot().scopeState, 'active');
});

test('katana slash, block, and perfect reflection use independent callbacks', () => {
  const reflections: ReflectRequest[] = [];
  let meleeCount = 0;
  const system = new WeaponSystem({
    initialWeapon: 'katana',
    random: deterministicRandom,
    callbacks: {
      onMelee: () => { meleeCount += 1; },
      onReflect: (request) => reflections.push(request),
    },
  });
  system.setAimHeld(true);
  system.update(0.01);
  assert.equal(system.getSnapshot().phase, 'blocking');
  assert.equal(system.requestReflection({ projectileId: 'first' }), true);
  assert.equal(reflections[0]?.perfect, true);
  const staminaAfterPerfect = system.getSnapshot().katana.stamina;

  system.update(0.25);
  assert.equal(system.requestReflection({ projectileId: 'late' }), true);
  assert.equal(reflections[1]?.perfect, false);
  assert.ok(system.getSnapshot().katana.stamina < staminaAfterPerfect);

  system.setAimHeld(false);
  system.update(0);
  system.setTrigger(true);
  system.update(0);
  assert.equal(meleeCount, 0);
  assert.equal(system.getSnapshot().phase, 'slashing');
  system.update(0.07);
  assert.equal(meleeCount, 0);
  system.update(0.02);
  assert.equal(meleeCount, 1);
  system.update(0.2);
  assert.equal(meleeCount, 1);
});

test('katana contact survives a large frame and uses the contact-time aim ray once', () => {
  const requests: Array<{ origin: THREE.Vector3; direction: THREE.Vector3; timestamp: number }> = [];
  const system = new WeaponSystem({
    initialWeapon: 'katana',
    random: deterministicRandom,
    callbacks: {
      onMelee: (request) => requests.push({
        origin: request.origin.clone(),
        direction: request.direction.clone(),
        timestamp: request.timestamp,
      }),
    },
  });
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.setAimRay(new THREE.Vector3(4, 5, 6), new THREE.Vector3(1, 0, 0));
  system.update(0.8);

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]?.origin.toArray(), [4, 5, 6]);
  assert.deepEqual(requests[0]?.direction.toArray(), [1, 0, 0]);
  assert.ok(Math.abs((requests[0]?.timestamp ?? 0) - 0.42 * KATANA_CONTACT_PROGRESS) < 1e-9);
  assert.equal(system.getSnapshot().phase, 'idle');
});

test('katana authored swing travels from a raised wind-up into a low follow-through', () => {
  const windup = sampleKatanaSlash(0.04);
  const contact = sampleKatanaSlash(KATANA_CONTACT_PROGRESS);
  const followThrough = sampleKatanaSlash(0.6);
  const recovered = sampleKatanaSlash(1);

  assert.ok(windup.position[1] > contact.position[1]);
  assert.ok(windup.rotation[1] < contact.rotation[1]);
  assert.ok(followThrough.position[0] < contact.position[0]);
  assert.ok(followThrough.position[1] < contact.position[1]);
  assert.ok(contact.trail > 0);
  assert.deepEqual(recovered.position, [0, 0, 0]);
  assert.deepEqual(recovered.rotation, [0, 0, 0]);
});

test('katana alternates authored forward and reverse trajectories', () => {
  const reverseRaised = sampleKatanaSlash(0.04, 'reverse');
  const reverseFollowThrough = sampleKatanaSlash(0.52, 'reverse');
  assert.ok(reverseRaised.position[0] < 0);
  assert.ok(reverseRaised.position[1] > reverseFollowThrough.position[1]);
  assert.ok(reverseRaised.rotation[1] > 0);
  assert.ok(reverseFollowThrough.position[0] > 0);
  assert.ok(reverseFollowThrough.rotation[1] < 0);
  assert.deepEqual(sampleKatanaSlash(0.68, 'reverse').position, [0, 0, 0]);

  const system = new WeaponSystem({ initialWeapon: 'katana', random: deterministicRandom });
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.update(0.02);
  const forwardRotation = system.getViewmodel('katana').parts.action?.rotation.y ?? 0;
  system.update(0.5);
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.update(0.02);
  const reverseRotation = system.getViewmodel('katana').parts.action?.rotation.y ?? 0;
  assert.ok(forwardRotation < 0);
  assert.ok(reverseRotation > 0);
});

test('switching rejects overlapping selection and suppresses a held trigger', () => {
  const volleys: PelletsRequest[] = [];
  const system = new WeaponSystem({
    random: deterministicRandom,
    callbacks: { onPellets: (request) => volleys.push(request) },
  });
  system.setTrigger(true);
  assert.equal(system.selectSlot(2), true);
  assert.equal(system.selectSlot(3), false);
  assert.equal(system.requestReload(), false);
  system.update(0.2);
  assert.equal(system.getSnapshot().activeWeapon, 'shotgun');
  assert.equal(system.getSnapshot().phase, 'switching');
  system.update(0.2);
  assert.equal(system.getSnapshot().phase, 'idle');
  assert.equal(volleys.length, 0);

  system.setTrigger(false);
  system.setTrigger(true);
  system.update(0);
  assert.equal(volleys.length, 1);
  assert.equal(system.selectSlot(3), false);
});

test('switching away cancels a reload without granting ammunition', () => {
  const effects: WeaponEffect[] = [];
  const system = new WeaponSystem({
    random: deterministicRandom,
    callbacks: { onEffect: (effect) => effects.push(effect) },
  });
  system.setTrigger(true);
  system.update(0);
  system.setTrigger(false);
  system.update(0.06);
  assert.equal(system.requestReload(), true);
  assert.equal(system.selectWeapon('shotgun'), true);
  assert.equal(system.getSnapshot().ammo.rifle.magazine, 29);
  assert.equal(system.getSnapshot().ammo.rifle.reserve, 150);
  assert.equal(effects.some((effect) => effect.kind === 'reload-cancel'), true);
});

test('all procedural viewmodels expose host sockets and the rifle stays slim', () => {
  const system = new WeaponSystem({ random: deterministicRandom });
  for (const id of ['rifle', 'shotgun', 'revolver', 'sniper', 'katana'] as const) {
    assert.equal(system.getViewmodel(id).id, id);
    assert.equal(system.getMuzzleAnchor(id).name, 'muzzle-socket');
  }
  const rifle = system.getViewmodel('rifle').root;
  const receiver = rifle.getObjectByName('rifle-angular-receiver-fill');
  assert.ok(receiver instanceof THREE.Mesh && receiver.material instanceof DoodleMaterial);
  const holo = rifle.getObjectByName('small-square-holo-sight');
  assert.ok(holo);
  const lens = rifle.getObjectByName('holo-lens-fill');
  const redRing = rifle.getObjectByName('holo-red-ring');
  const redDot = rifle.getObjectByName('holo-red-dot');
  assert.ok(lens instanceof THREE.Mesh);
  assert.ok(lens.material instanceof THREE.MeshBasicMaterial);
  assert.equal(lens.material.transparent, true);
  assert.equal(lens.material.depthWrite, false);
  assert.ok(redRing && redDot);
  assert.ok(redRing.position.z > 0, 'expected the red holo ring on the camera-facing side of the lens');
  assert.ok(redDot.position.z > redRing.position.z, 'expected the red dot in front of the ring');

  assert.ok(rifle.getObjectByName('rifle-solid-angular-stock'));
  assert.equal(rifle.getObjectByName('rifle-open-stock-top'), undefined);
  assert.equal(rifle.getObjectByName('rifle-open-stock-lower'), undefined);
  const supportHand = rifle.getObjectByName('rifle-support-hand');
  const triggerHand = rifle.getObjectByName('rifle-trigger-hand');
  assert.ok(supportHand && triggerHand);
  assert.ok(supportHand.position.x < -0.08 && triggerHand.position.x < -0.08);

  const rifleSize = new THREE.Box3().setFromObject(rifle).getSize(new THREE.Vector3());
  const holoSize = new THREE.Box3().setFromObject(holo).getSize(new THREE.Vector3());
  assert.ok(rifleSize.z > rifleSize.y * 2.4, `expected long slim rifle, got ${rifleSize.toArray().join(',')}`);
  assert.ok(holoSize.x < 0.3 && holoSize.y < 0.3, `expected a small holo sight, got ${holoSize.toArray().join(',')}`);

  const hipPose = system.getViewmodel('rifle').hipPose;
  assert.ok(hipPose.position.x >= 0.6 && hipPose.position.y <= -0.55);
  assert.equal(hipPose.scale, 1.1);

  const katana = system.getViewmodel('katana').root;
  assert.ok(katana.getObjectByName('katana-action-root'));
  assert.ok(katana.getObjectByName('katana-main-hand'));
  assert.ok(katana.getObjectByName('katana-off-hand'));
  assert.ok(katana.getObjectByName('katana-main-paper-sleeve'));
  assert.ok(katana.getObjectByName('katana-tapered-blade'));
  assert.equal(katana.getObjectByName('katana-red-cutting-edge'), undefined);
  assert.equal(katana.getObjectByName('katana-pencil-hatch'), undefined);
  assert.ok(katana.getObjectByName('katana-reference-dash-arc'));
  assert.ok(katana.getObjectByName('katana-blade-blood'));
  assert.equal(katana.getObjectByName('katana-arc-dash-1'), undefined);
});

test('reset restores ammunition, rifle selection, stamina, FOV, viewmodels, and offsets', () => {
  const system = new WeaponSystem({ initialWeapon: 'katana', random: deterministicRandom });
  system.addKatanaBlood(3);
  assert.equal(system.getKatanaBloodLevel(), 3);
  assert.equal(system.getViewmodel('katana').parts.blood?.children.filter((child) => child.visible).length, 3);
  system.setAimHeld(true);
  system.setLookDelta(90, -50);
  system.setMotion({ strafe: 1, forward: 1, speed: 8, grounded: true, sprinting: true });
  system.update(0.25);
  assert.equal(system.requestReflection({ staminaCost: 30 }), true);
  system.setAimHeld(false);
  system.update(0.01);
  system.reset();

  const snapshot = system.getSnapshot();
  assert.equal(snapshot.time, 0);
  assert.equal(snapshot.activeWeapon, 'rifle');
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.desiredFov, 70);
  assert.equal(snapshot.katana.stamina, snapshot.katana.maxStamina);
  assert.equal(snapshot.ammo.rifle.magazine, 30);
  assert.equal(snapshot.ammo.rifle.reserve, 150);
  assert.equal(system.getKatanaBloodLevel(), 0);
  assert.equal(system.getViewmodel('katana').parts.blood?.children.some((child) => child.visible), false);
  assert.deepEqual(snapshot.offsets.position, [0, 0, 0]);
  assert.equal(system.getViewmodel('rifle').root.visible, true);
  assert.equal(system.getViewmodel('katana').root.visible, false);
});

test('viewmodel gait follows the shared reference phase and drops at lateral extremes', () => {
  const system = new WeaponSystem({ random: deterministicRandom });
  system.setMotion({
    strafe: 0,
    forward: 1,
    speed: 8.4,
    grounded: true,
    sprinting: false,
    gaitPhase: Math.PI / 2,
    gaitWeight: 1,
  });
  system.update(0);

  const offsets = system.getOffsets();
  assert.ok(Math.abs(offsets.headbobPosition[0] - 0.059) < 1e-9);
  assert.ok(Math.abs(offsets.headbobPosition[1] + 0.048) < 1e-9);
  assert.ok(Math.abs(offsets.headbobPosition[2] + 0.004) < 1e-9);
  assert.ok(Math.abs(offsets.headbobRotation[2] + 0.0022) < 1e-9);
});
