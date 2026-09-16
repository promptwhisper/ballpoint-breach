import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WAVES } from '../waves';
import { DIFFICULTY_PROFILES, scaleWaveDefinitions } from './Difficulty';

test('relaxed difficulty preserves every enemy while reducing simultaneous pressure', () => {
  const relaxed = scaleWaveDefinitions(DEFAULT_WAVES, 'relaxed');
  assert.deepEqual(relaxed.map(wave => wave.composition), DEFAULT_WAVES.map(wave => wave.composition));
  assert.ok(relaxed.every((wave, index) => wave.maxConcurrent < DEFAULT_WAVES[index]!.maxConcurrent));
  assert.ok(relaxed.every((wave, index) => wave.spawnInterval > DEFAULT_WAVES[index]!.spawnInterval));
  assert.equal(DIFFICULTY_PROFILES.relaxed.incomingDamageScale, 0.18);
  assert.equal(DIFFICULTY_PROFILES.relaxed.enemyTimeScale, 0.62);
  assert.equal(DIFFICULTY_PROFILES.relaxed.outgoingDamageScale, 1.35);
  assert.equal(DIFFICULTY_PROFILES.relaxed.healthRecovery, 0.6);
});

test('challenge difficulty keeps authored encounters unchanged', () => {
  assert.equal(scaleWaveDefinitions(DEFAULT_WAVES, 'challenge'), DEFAULT_WAVES);
  assert.equal(DIFFICULTY_PROFILES.challenge.incomingDamageScale, 1);
});
