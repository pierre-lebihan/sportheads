import test from 'node:test';
import assert from 'node:assert/strict';
import { BONUS_MODES, BONUS_NAMES, NEW_BONUSES, BONUS_PICKUP_COUNT, BONUS_V2_VERSION, validBonusMode, bonusModeFromMessage, validBonusState } from '../web/bonuses.js';
test('three modes expose the eighteen originals plus five effects and three opponent variants',()=>{
  assert.deepEqual(BONUS_MODES.map(mode=>mode.id),[0,1,2]);assert.equal(BONUS_NAMES.length,27);
  assert.deepEqual(NEW_BONUSES.map(bonus=>bonus.id),[19,20,21,22,23]);
  assert.deepEqual(NEW_BONUSES.filter(b=>b.redId).map(b=>b.redId),[24,25,26]);
  assert.equal(BONUS_PICKUP_COUNT,26);assert.equal(BONUS_V2_VERSION,2);
  assert.ok(!BONUS_NAMES.some(name=>/double saut/i.test(name)));
});
test('room settings distinguish no bonuses, historical and V2 while reading legacy flags',()=>{
  for(const mode of [0,1,2]){assert.ok(validBonusMode(mode));assert.equal(bonusModeFromMessage({bonusMode:mode,bonuses:mode!==0}),mode);}
  assert.equal(bonusModeFromMessage({bonuses:false}),0);assert.equal(bonusModeFromMessage({bonuses:true}),1);
  for(const mode of [-1,3,1.5,NaN,'2',null]){assert.equal(validBonusMode(mode),false);assert.equal(bonusModeFromMessage({bonusMode:mode,bonuses:true}),null);}
  assert.equal(bonusModeFromMessage({bonusMode:2,bonuses:false}),null);
});
test('wire timers are bounded, complete, and cannot activate V2 in historical mode',()=>{
  const state=[2,240,240,150,150,180,180,180,180,12,12,12,10,10,10];assert.ok(validBonusState(state));
  for(const edit of [s=>s[0]=1,s=>s[1]=241,s=>s[3]=151,s=>s[7]=181,s=>s[8]=-1,s=>s[9]=13,s=>s[13]=11,s=>s[4]=.5,s=>delete s[10],s=>s.push(0)]){const bad=state.slice();edit(bad);assert.equal(validBonusState(bad),false);}
  for(const mode of [0,1,2])assert.ok(validBonusState([mode,...Array(14).fill(0)]));
});
