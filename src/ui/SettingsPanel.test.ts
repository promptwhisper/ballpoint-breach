import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSettings } from './SettingsPanel';
test('settings default to easier play and right-screen shooting', () => {
  assert.deepEqual(normalizeSettings(null), { sensitivity: 3.5, fireMode: 'screen', soundEnabled: true, autoFire: false, difficulty: 'relaxed', controlLayout: {} });
});
test('stored settings reject malformed values and bound sensitivity', () => {
  assert.equal(normalizeSettings({ sensitivity: NaN }).sensitivity, 3.5);
  assert.equal(normalizeSettings({ sensitivity: 20 }).sensitivity, 4);
  assert.equal(normalizeSettings({ sensitivity: -1 }).sensitivity, .5);
  assert.equal(normalizeSettings({ fireMode: 'other' }).fireMode, 'screen');
  assert.deepEqual(normalizeSettings({ sensitivity: 3, fireMode: 'button', soundEnabled: false, autoFire: true, difficulty: 'challenge' }), { sensitivity: 3, fireMode: 'button', soundEnabled: false, autoFire: true, difficulty: 'challenge', controlLayout: {} });
});
test('control positions are bounded and malformed points are ignored', () => {
  const settings = normalizeSettings({ controlLayout: { move: { x: -4, y: 3 }, fire: { x: 'bad', y: 0.5 }, aim: { x: .7, y: .8 } } });
  assert.deepEqual(settings.controlLayout, { move: { x: .04, y: .94 }, aim: { x: .7, y: .8 } });
});
