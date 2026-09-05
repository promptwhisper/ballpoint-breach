import assert from 'node:assert/strict';
import test from 'node:test';
import { GameState } from './GameState';

test('kill scoring applies bounded combo and explicit bonuses', () => {
  const state = new GameState();
  assert.equal(state.awardKill(100), 100);
  assert.equal(state.awardKill(100, { headshot: true }), 185);
  assert.equal(state.score, 285);
  assert.ok(state.timeScale < 1);
});

test('reset restores a fresh first-wave start state', () => {
  const state = new GameState();
  state.mode = 'victory';
  state.wave = 5;
  state.awardKill(500, { boss: true });
  state.reset();
  assert.equal(state.mode, 'start');
  assert.equal(state.wave, 1);
  assert.equal(state.score, 0);
});
