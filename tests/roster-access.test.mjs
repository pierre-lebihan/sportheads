import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_COUNT, PLAYER_NAMES } from '../web/players.js';
import { GROUPS, PUBLIC_IDS, applyGroupLink, readGroups, unlockedIds, initialSkins } from '../web/roster-access.js';

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
  for (const ids of Object.values(GROUPS)) assert.ok(ids.every(id => Number.isInteger(id) && id >= 1 && id <= PLAYER_COUNT));
});
test('groups match the friend circles', () => {
  const names = code => [...unlockedIds([code])].filter(id => id > 12).sort((a, b) => a - b);
  assert.deepEqual(names('rennes'), [13, 14, 15, 16, 17, 18, 19, 22, 23]);
  assert.deepEqual(names('insa'), [13, 14, 18, 20, 21, 23]);
  assert.deepEqual(names('famille'), [13, 14, 18, 23]);
  assert.equal(unlockedIds(['tout']).size, PLAYER_COUNT - PUBLIC_IDS.length);
});

test('Macedonia unlocks its three portraits alongside the shared family characters', () => {
  assert.deepEqual(PLAYER_NAMES.slice(23), ['Dragan', 'Budimka', 'Alex']);
  assert.deepEqual(GROUPS.macedonia, [13, 18, 14, 23, 24, 25, 26]);
  const storage = memory();
  assert.deepEqual(applyGroupLink(place('?groupe=Macedonia'), storage), ['macedonia']);
  const visible = unlockedIds(readGroups(storage));
  for (const id of [24, 25, 26]) {
    assert.equal(visible.has(id), true);
    for (const group of ['rennes', 'insa', 'famille']) assert.equal(unlockedIds([group]).has(id), false);
  }
  assert.equal(visible.size, 7);
});

test('group rosters replace the public footballers and start with Pierre and Vilma', () => {
  assert.deepEqual(initialSkins([]), [1, 2]);
  for (const code of Object.keys(GROUPS)) {
    const allowed = unlockedIds([code]);
    assert.equal([...allowed].some(id => PUBLIC_IDS.includes(id)), false, code);
    assert.deepEqual(initialSkins([code]), [13, 14], code);
    assert.ok(initialSkins([code]).every(id => allowed.has(id)));
  }
});
test('opening another group replaces the remembered roster, including legacy accumulated links', () => {
  const storage = memory();
  applyGroupLink(place('?groupe=tout'), storage);
  assert.deepEqual(applyGroupLink(place('?groupe=macedonia'), storage), ['macedonia']);
  assert.deepEqual(readGroups(storage), ['macedonia']);
  storage.setItem('sportheads-groupes-v1', '["tout","rennes","macedonia"]');
  assert.deepEqual(readGroups(storage), ['macedonia']);
  assert.equal(unlockedIds(readGroups(storage)).size, 7);
  applyGroupLink(place('?groupe=aucun'), storage);
  assert.deepEqual(initialSkins(readGroups(storage)), [1, 2]);
});
