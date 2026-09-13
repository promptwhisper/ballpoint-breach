import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSettings } from './SettingsPanel';
test('settings default to 3x touch look and right-screen shooting', () => {
  assert.deepEqual(normalizeSettings(null), { sensitivity: 3, fireMode: 'screen', soundEnabled: true });
});
test('stored settings reject malformed values and bound sensitivity', () => {
  assert.equal(normalizeSettings({ sensitivity: NaN }).sensitivity, 3);
  assert.equal(normalizeSettings({ sensitivity: 20 }).sensitivity, 4);
  assert.equal(normalizeSettings({ sensitivity: -1 }).sensitivity, .5);
  assert.equal(normalizeSettings({ fireMode: 'other' }).fireMode, 'screen');
  assert.deepEqual(normalizeSettings({ sensitivity: 3, fireMode: 'button', soundEnabled: false }), { sensitivity: 3, fireMode: 'button', soundEnabled: false });
});
