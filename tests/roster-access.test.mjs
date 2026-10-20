import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, PUBLIC_IDS, applyGroupLink, readGroups, unlockedIds } from '../web/roster-access.js';

const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) }; };
const place = search => ({ search, pathname: '/sportheads/', hash: '' });
const code = 'famille';

test('public roster is limited to the 12 pros', () => {
  assert.deepEqual([...unlockedIds([])], PUBLIC_IDS);
  assert.ok(PUBLIC_IDS.every(id => id <= 12));
});
test('a group link is remembered, cleaned from the URL and can be forgotten', () => {
  const storage = memory(), urls = [];
  const history = { state: null, replaceState: (_, __, url) => urls.push(url) };
  assert.deepEqual(applyGroupLink(place('?groupe=' + code.toUpperCase()), storage, history), [code]);
  assert.deepEqual(urls, ['/sportheads/']);
  assert.deepEqual(applyGroupLink(place(''), storage, history), [code]);
  assert.ok(unlockedIds(readGroups(storage)).has(23));
  assert.deepEqual(applyGroupLink(place('?groupe=inconnu'), storage, history), [code]);
  assert.deepEqual(applyGroupLink(place('?groupe=aucun'), storage, history), []);
});
test('broken or stale storage falls back to the public roster', () => {
  const storage = memory(); storage.setItem('sportheads-groupes-v1', '{oops');
  assert.deepEqual(readGroups(storage), []);
  storage.setItem('sportheads-groupes-v1', '["ancien-code"]');
  assert.deepEqual(readGroups(storage), []);
  assert.deepEqual(readGroups({ getItem() { throw Error('blocked'); } }), []);
});
test('every group only lists known characters', () => {
  for (const ids of Object.values(GROUPS)) assert.ok(ids.every(id => Number.isInteger(id) && id >= 1 && id <= 23));
});
test('groups match the friend circles', () => {
  const names = code => [...unlockedIds([code])].filter(id => id > 12).sort((a, b) => a - b);
  assert.deepEqual(names('rennes'), [13, 14, 15, 16, 17, 18, 19, 22, 23]);
  assert.deepEqual(names('insa'), [13, 14, 18, 20, 21, 23]);
  assert.deepEqual(names('famille'), [13, 14, 18, 23]);
  assert.equal(unlockedIds(['tout']).size, 23);
});
