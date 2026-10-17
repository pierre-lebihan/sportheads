import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceToAssists, assistsToBalance, balanceLabel } from '../web/balance.js';

test('seven symmetric positions help one camp at most and round trip exactly', () => {
  const expected = [[3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3]];
  for (let position = -3; position <= 3; position++) {
    const levels = balanceToAssists(position);
    assert.deepEqual(levels, expected[position + 3]);
    assert.equal(assistsToBalance(levels), position);
  }
  assert.equal(balanceLabel(-3), 'Bleu +30 %');
  assert.equal(balanceLabel(0), 'Équilibré');
  assert.equal(balanceLabel(3), 'Rouge +30 %');
});
test('invalid or two-sided handicaps are rejected', () => {
  for (const value of [-4, 4, 1.5, NaN, '1', null]) assert.throws(() => balanceToAssists(value));
  for (const pair of [[1, 1], [3, 2], [-1, 0], [0, 4], [0.5, 0], [1], null]) assert.throws(() => assistsToBalance(pair));
});
