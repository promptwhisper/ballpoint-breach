import assert from 'node:assert/strict';
import test from 'node:test';
import { battleCardTitle, type BattleCardStats } from './BattleCard';

const base: BattleCardStats = {
  score: 500,
  progress: '第 3 波',
  levelName: '经典生存',
  kills: 4,
  headshots: 0,
  maxCombo: 2,
  healthRemaining: 80,
  victory: false,
};

test('battle card title reflects victory and notable combat styles', () => {
  assert.equal(battleCardTitle({ ...base, victory: true }), '十波守住');
  assert.equal(battleCardTitle({ ...base, levelName: '货站突围', victory: true }), '全关突破');
  assert.equal(battleCardTitle({ ...base, headshots: 3 }), '一枪定稿');
  assert.equal(battleCardTitle({ ...base, maxCombo: 7 }), '连笔成锋');
});
