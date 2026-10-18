import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalance, validBalance, copyBalance, validBuffs, balanceLabel, BUFF_STATS, AID_AMOUNTS } from '../web/balance.js';
const zero=()=>Array(5).fill(0);
test('normal, Superman and both three-level aids fill all five stats', () => {
  assert.deepEqual(BUFF_STATS.map(stat => stat.id), ['jump','head','goal','speed','kick']);
  assert.deepEqual(AID_AMOUNTS,[10,30,50]);
  assert.deepEqual(createBalance().buffs,[zero(),zero()]);
  assert.deepEqual(createBalance('superman').buffs,[Array(5).fill(30),Array(5).fill(30)]);
  for (const amount of AID_AMOUNTS) for (const [preset,side] of [['blue',0],['red',1]]) {
    const config=createBalance(preset,amount);
    assert.deepEqual(config.buffs[side],Array(5).fill(amount));
    assert.deepEqual(config.buffs[1-side],zero());assert.ok(validBalance(config));
    assert.match(balanceLabel(config),new RegExp(`${amount} %`));
  }
});
test('manual preserves both players and all five independently chosen percentages', () => {
  const previous=createBalance('superman'), manual=createBalance('manual',previous.amount,previous.buffs);
  manual.buffs[0]=[1,2,3,4,5];manual.buffs[1]=[50,49,48,47,46];
  assert.deepEqual(previous.buffs,[Array(5).fill(30),Array(5).fill(30)]);
  assert.ok(validBalance(manual));
  const copied=copyBalance(manual);copied.buffs[0][1]=0;assert.equal(manual.buffs[0][1],2);
  assert.deepEqual(createBalance('normal',manual.amount,manual.buffs).buffs,[zero(),zero()]);
  assert.deepEqual(createBalance('red',50,manual.buffs).buffs,[zero(),Array(5).fill(50)]);
});
test('untrusted settings cannot exceed five stats, their limits, or contradict a preset', () => {
  for (const buffs of [null,[],[[1,2,3]],[zero(),[0,0,0,0,51]],[zero(),[-1,0,0,0,0]],[zero(),[0,.5,0,0,0]],[zero(),[0,0,NaN,0,0]],[zero(),[0,0,0,'30',0]],[zero(),[0,0,0,0,0,1]],[new Array(5),zero()]]) assert.equal(validBuffs(buffs),false);
  for (const config of [null,{}, {...createBalance(),preset:'speed'}, {...createBalance(),preset:undefined}, {...createBalance(),amount:20}, {...createBalance(),buffs:[[1,0,0,0,0],zero()]}, {...createBalance('superman'),buffs:[Array(5).fill(30),zero()]}]) {
    assert.equal(validBalance(config),false);assert.throws(()=>copyBalance(config));
  }
});
