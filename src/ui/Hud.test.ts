import assert from 'node:assert/strict';
import test from 'node:test';
import { accumulateDamageStrength } from './Hud';

test('damage wash stays weak for one small hit and stacks for rapid hits', () => {
  const weakHit = accumulateDamageStrength(0, 6);
  assert.equal(weakHit, 0.4);

  const secondHit = accumulateDamageStrength(weakHit, 6, 0.133);
  const thirdHit = accumulateDamageStrength(secondHit, 6, 0.133);
  assert.ok(secondHit > 0.72 && secondHit < 0.74);
  assert.ok(thirdHit > 0.99);

  const separatedHit = accumulateDamageStrength(weakHit, 6, 0.68);
  assert.ok(separatedHit < 0.55);
  assert.equal(accumulateDamageStrength(0, 15), 1);
});
