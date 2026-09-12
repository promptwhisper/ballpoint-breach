import assert from 'node:assert/strict';
import test from 'node:test';
import { battleCardTitle, type BattleCardStats } from './BattleCard';

const base: BattleCardStats = {
  score: 800,
  wave: 4,
  kills: 8,
  headshots: 0,
  reflectedKills: 0,
  meleeKills: 0,
  maxCombo: 2,
  healthRemaining: 60,
  victory: false,
};

test('battle card titles reward the strongest achievement', () => {
  assert.equal(battleCardTitle({ ...base, victory: true }), '十阵尽破');
  assert.equal(battleCardTitle({ ...base, reflectedKills: 2 }), '借墨还锋');
  assert.equal(battleCardTitle({ ...base, meleeKills: 4 }), '白刃入墨');
  assert.equal(battleCardTitle({ ...base, headshots: 4 }), '一笔封喉');
  assert.equal(battleCardTitle({ ...base, healthRemaining: 12 }), '绝处破阵');
  assert.equal(battleCardTitle({ ...base, wave: 2, maxCombo: 7 }), '笔走龙蛇');
  assert.equal(battleCardTitle(base), '墨痕未尽');
});
