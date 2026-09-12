import assert from 'node:assert/strict';
import test from 'node:test';
import { DEATH_INK_STYLE, firearmAftermathProfile, INK_EJECTION_STYLE, playerInkTrailProfile } from './EffectPool';

test('ink ejection replaces rigid cartridge chunks with layered dispersing ink', () => {
  assert.equal(INK_EJECTION_STYLE.casingForm, 'wet-ink-bloom');
  assert.equal(INK_EJECTION_STYLE.muzzleFragmentForm, 'flying-white-brush');
  assert.equal(INK_EJECTION_STYLE.usesRigidCartridge, false);
  assert.equal(INK_EJECTION_STYLE.paperLayers, 0);
  assert.ok(INK_EJECTION_STYLE.brushLayers >= 4);
  assert.equal(INK_EJECTION_STYLE.dissolvesInFlight, true);
});

test('rifle ejects one restrained flying-white stroke and one wet-ink bloom', () => {
  const profile = firearmAftermathProfile('rifle');
  assert.equal(profile.casingDelay, 0);
  assert.equal(profile.muzzleShardCount, 1);
  assert.equal(profile.casingCount, 1);
  assert.equal(profile.smokeCount, 2);
  assert.ok(profile.ejectionSpeed > profile.liftSpeed);
  assert.ok(profile.casingLifetime >= 0.9);
});

test('pump and bolt weapons defer their larger cases to the authored action', () => {
  const shotgun = firearmAftermathProfile('shotgun');
  const sniper = firearmAftermathProfile('sniper');
  const rifle = firearmAftermathProfile('rifle');

  assert.ok(Math.abs(shotgun.casingDelay - 0.58 * 0.47) < 0.01);
  assert.ok(Math.abs(sniper.casingDelay - 0.82 * 0.38) < 0.01);
  assert.ok(shotgun.casingScale[1] > sniper.casingScale[1]);
  assert.ok(sniper.casingScale[1] > rifle.casingScale[1]);
  assert.ok(shotgun.smokeScale > rifle.smokeScale);
  assert.equal(shotgun.muzzleShardCount, 4);
});

test('revolver retains cases in its cylinder during firing', () => {
  const profile = firearmAftermathProfile('revolver');
  assert.equal(profile.casingCount, 0);
  assert.ok(profile.muzzleShardCount > 0);
  assert.equal(profile.casingLifetime, 0);
  assert.equal(profile.smokeCount, 1);
});

test('player ink trails stay brief and sparse while preserving weapon character', () => {
  const rifle = playerInkTrailProfile('rifle');
  const shotgun = playerInkTrailProfile('shotgun');
  const revolver = playerInkTrailProfile('revolver');
  const sniper = playerInkTrailProfile('sniper');

  assert.equal(rifle.trailCount, 1);
  assert.equal(shotgun.trailCount, 3);
  assert.equal(revolver.trailCount, 1);
  assert.equal(sniper.trailCount, 1);
  assert.ok(rifle.lifetime <= 0.15);
  assert.ok(sniper.lifetime <= 0.2);
  assert.ok(sniper.strokeLength > revolver.strokeLength);
  assert.ok(revolver.strokeLength > rifle.strokeLength);
  assert.ok(shotgun.strokeLength < rifle.strokeLength);
  assert.ok(sniper.travelSpeed > rifle.travelSpeed);
  assert.ok(rifle.opacity >= 0.7);
  for (const profile of [rifle, shotgun, revolver, sniper]) {
    assert.ok(profile.opacity <= 0.9);
    assert.ok(profile.strokeLength <= 2.5);
  }
});

test('wall blood is composed from broken impact, rivulet, and satellite layers', () => {
  assert.equal(DEATH_INK_STYLE.wallImpactLayers, 2);
  assert.ok(DEATH_INK_STYLE.wallDripLayers >= 3);
  assert.ok(DEATH_INK_STYLE.wallDropletLayers >= 5);
  assert.ok(
    DEATH_INK_STYLE.wallDripLayers + DEATH_INK_STYLE.wallDropletLayers
      > DEATH_INK_STYLE.wallImpactLayers,
    'fine secondary marks should outnumber broad masses',
  );
  assert.ok(DEATH_INK_STYLE.textureVariants >= 4);
});

test('floor blood remains a broken trail instead of one oversized radial decal', () => {
  assert.equal(DEATH_INK_STYLE.floorPoolLayers, 2);
  assert.ok(DEATH_INK_STYLE.floorStreakLayers >= 3);
  assert.ok(DEATH_INK_STYLE.floorSatelliteCount >= 7);
  assert.ok(DEATH_INK_STYLE.floorSatelliteCount > DEATH_INK_STYLE.floorPoolLayers);
  assert.ok(DEATH_INK_STYLE.opacityRange[0] < 0.5);
  assert.ok(DEATH_INK_STYLE.opacityRange[1] < 1);
  assert.ok(DEATH_INK_STYLE.decalLifetime >= 50);
});
