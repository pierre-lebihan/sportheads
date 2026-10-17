import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, currentMatch, recordResult, validateTournament } from '../web/tournament.js';

const entrants = count => Array.from({ length: count }, (_, index) => ({ name: `Joueur ${index + 1}`, skin: index + 1 }));
const win = (state, side = 0, id = state.records.length + 1, target = 3) => recordResult(state, { scores: side ? [1, target] : [target, 1], target, matchId: id });

test('four entrants advance only from recorded semifinals and a final', () => {
  const first = createTournament({ format: 'bracket', entrants: entrants(4) });
  assert.equal(validateTournament(first), true);
  assert.deepEqual(currentMatch(first).players, [0, 1]);
  assert.equal(currentMatch(first).roundLabel, 'Demi-finale');
  const second = win(first, 1);
  assert.deepEqual(currentMatch(second).players, [2, 3]);
  assert.deepEqual(currentMatch(first).players, [0, 1], 'recording must not mutate the previous state');
  const final = win(second);
  assert.deepEqual(currentMatch(final).players, [1, 2]);
  assert.equal(currentMatch(final).roundLabel, 'Finale');
  const complete = win(final);
  assert.equal(complete.champion, 1);
  assert.equal(currentMatch(complete).finished, true);
  assert.equal(currentMatch(complete).players, null);
  assert.equal(complete.records.length, 3);
  assert.deepEqual(complete.records.map(record => record.players), [[0, 1], [2, 3], [1, 2]]);
  assert.throws(() => win(complete));
  assert.equal(validateTournament(JSON.parse(JSON.stringify(complete))), true);
});

test('eight entrants reach quarterfinals, semifinals and the actual final pairing', () => {
  let state = createTournament({ format: 'bracket', entrants: entrants(8) });
  for (const [players, side] of [[[0, 1], 1], [[2, 3], 0], [[4, 5], 1], [[6, 7], 1]]) {
    assert.deepEqual(currentMatch(state).players, players);
    assert.equal(currentMatch(state).roundLabel, 'Quart de finale');
    state = win(state, side);
  }
  assert.deepEqual(currentMatch(state).players, [1, 2]);
  assert.equal(currentMatch(state).round, 2);
  state = win(state, 1);
  assert.deepEqual(currentMatch(state).players, [5, 7]);
  state = win(state);
  assert.deepEqual(currentMatch(state).players, [2, 5]);
  assert.equal(currentMatch(state).roundLabel, 'Finale');
  state = win(state, 1);
  assert.equal(state.champion, 5);
  assert.equal(state.records.length, 7);
  assert.equal(validateTournament(state), true);
});

test('best-of-three and best-of-five count victories and stop at the winning threshold', () => {
  for (const [bestOf, winners, champion] of [[3, [0, 1, 0], 0], [5, [1, 0, 1, 0, 1], 1]]) {
    let state = createTournament({ format: 'series', entrants: entrants(2), bestOf });
    const wins = [0, 0];
    for (const side of winners) {
      assert.deepEqual(currentMatch(state).players, [0, 1]);
      assert.deepEqual(currentMatch(state).wins, wins);
      state = win(state, side);
      wins[side]++;
    }
    assert.equal(state.champion, champion);
    assert.equal(currentMatch(state).finished, true);
    assert.deepEqual(currentMatch(state).wins, wins);
    assert.equal(validateTournament(state), true);
    assert.throws(() => win(state));
  }
  let sweep = createTournament({ format: 'series', entrants: entrants(2) });
  assert.equal(sweep.bestOf, 3);
  sweep = win(win(sweep));
  assert.equal(sweep.champion, 0);
  assert.equal(sweep.records.length, 2);
});

test('names are trimmed, bounded, human-readable and unique after normalization', () => {
  const people = entrants(4);
  people[0].name = '  Élodie  ';
  const state = createTournament({ format: 'bracket', entrants: people });
  assert.equal(state.entrants[0].name, 'Élodie');
  assert.equal(people[0].name, '  Élodie  ');
  for (const name of ['', '   ', 'x'.repeat(25), 'bad\nname', 'bad\u0000name', '\u202Ehidden']) {
    const invalid = entrants(4);
    invalid[0].name = name;
    assert.throws(() => createTournament({ format: 'bracket', entrants: invalid }));
  }
  for (const [one, two] of [['Alice', 'ALICE'], ['Ａlice', 'Alice'], ['équipe', 'e\u0301quipe']]) {
    const invalid = entrants(4);
    invalid[0].name = one;
    invalid[1].name = two;
    assert.throws(() => createTournament({ format: 'bracket', entrants: invalid }));
  }
  for (const skin of [0, 27, 1.5, NaN]) {
    const invalid = entrants(4); invalid[0].skin = skin;
    assert.throws(() => createTournament({ format: 'bracket', entrants: invalid }));
  }
});

test('only supported formats, sizes and odd series lengths can be created', () => {
  for (const config of [
    { format: 'league', entrants: entrants(4) },
    { format: 'bracket', entrants: entrants(2) },
    { format: 'bracket', entrants: entrants(6) },
    { format: 'bracket', entrants: new Array(4) },
    { format: 'bracket', entrants: entrants(4), bestOf: 3 },
    { format: 'series', entrants: entrants(4), bestOf: 3 },
    { format: 'series', entrants: entrants(2), bestOf: 4 },
    { format: 'series', entrants: entrants(2), bestOf: 7 },
  ]) assert.throws(() => createTournament(config));
});

test('scores must reach the target exactly, ties and duplicate IDs are rejected', () => {
  const initial = createTournament({ format: 'bracket', entrants: entrants(4) });
  for (const result of [
    { scores: [2, 1], target: 3, matchId: 1 },
    { scores: [3, 3], target: 3, matchId: 1 },
    { scores: [4, 1], target: 3, matchId: 1 },
    { scores: [3, -1], target: 3, matchId: 1 },
    { scores: [3, 0.5], target: 3, matchId: 1 },
    { scores: [3, NaN], target: 3, matchId: 1 },
    { scores: [0, 0], target: 0, matchId: 1 },
    { scores: [100, 1], target: 100, matchId: 1 },
    { scores: [3, 1], target: 3, matchId: 0 },
    { scores: [3, 1], target: 3, matchId: 1.5 },
  ]) assert.throws(() => recordResult(initial, result));
  const state = win(initial, 0, 12345);
  assert.throws(() => win(state, 1, 12345));
  assert.equal(state.records.length, 1);
  const oneGoal = recordResult(initial, { scores: [1, 0], target: 1, matchId: 9 });
  assert.equal(oneGoal.records[0].scores[0], 1);
});

test('replay validation rejects fake champions, edited pairings and extra unreachable results', () => {
  let valid = createTournament({ format: 'bracket', entrants: entrants(4) });
  valid = win(win(win(valid, 1), 0), 1);
  for (const mutate of [
    state => { state.champion = 0; },
    state => { state.records[2].players = [0, 3]; },
    state => { state.records[0].scores = [2, 1]; },
    state => { state.records[1].id = state.records[0].id; },
    state => { state.records.push(state.records[0]); },
    state => { state.records[0].players[0] = 0.5; },
    state => { state.entrants[0].name = '  untrimmed '; },
    state => { state.version = 2; },
    state => { state.bestOf = 3; },
    state => { state.wins = [99, 0]; },
  ]) {
    const copy = structuredClone(valid); mutate(copy);
    assert.equal(validateTournament(copy), false, mutate.toString());
    assert.throws(() => currentMatch(copy));
    assert.throws(() => win(copy));
  }
  const unplayed = structuredClone(createTournament({ format: 'bracket', entrants: entrants(4) }));
  unplayed.champion = 0;
  assert.equal(validateTournament(unplayed), false);
  let series = createTournament({ format: 'series', entrants: entrants(2), bestOf: 5 });
  series = win(win(win(series)));
  const extra = structuredClone(series);
  extra.records.push({ players: [0, 1], scores: [3, 1], target: 3, id: 999 });
  assert.equal(validateTournament(extra), false);
  for (const malformed of [null, undefined, [], 1, 'tournament', { ...valid, records: new Array(2) }]) assert.equal(validateTournament(malformed), false);
});

test('states, descriptors and their nested arrays are immutable and survive JSON persistence', () => {
  const state = win(createTournament({ format: 'bracket', entrants: entrants(4) }));
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.entrants[0]));
  assert.ok(Object.isFrozen(state.records[0].scores));
  assert.throws(() => { state.entrants[0].name = 'edited'; }, TypeError);
  assert.throws(() => state.records[0].players.push(3), TypeError);
  const descriptor = currentMatch(state);
  assert.ok(Object.isFrozen(descriptor));
  assert.throws(() => { descriptor.players[0] = 0; }, TypeError);
  const copy = JSON.parse(JSON.stringify(state));
  const next = win(copy);
  copy.records[0].scores[0] = 0;
  assert.equal(validateTournament(next), true);
  assert.deepEqual(next.records[0].scores, [3, 1]);
});
