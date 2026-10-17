// Pure human tournament model. Returned states contain JSON data only and are
// deeply frozen. A valid copied/loaded state is accepted after replaying history.
//
// State: {version:1, format, entrants:[{name,skin}], bestOf:null|3|5,
//         records:[{players:[index,index],scores:[a,b],target,id}], champion:null|index}.
// currentMatch: {players:[index,index]|null,roundLabel,round,matchNumber,wins,
//                finished,champion}. `wins` is a pair for series, null for brackets.
// recordResult accepts {scores:[a,b],target:1..99,matchId:positive safe integer}.
// Scores describe a completed first-to-target match; the winning score equals target.

const MAX_TARGET = 99;
const controls = /[\p{Cc}\p{Cf}]/u;
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;

function objectWithKeys(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(object);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function entrantsFor(input, format, canonical) {
  if (!Array.isArray(input) || !(format === 'bracket' ? [4, 8].includes(input.length) : input.length === 2)) {
    throw new TypeError('Un tableau de 4 ou 8 participants, ou une série de 2 participants, est requis.');
  }
  const names = new Set();
  return Array.from(input, entrant => {
    if (!objectWithKeys(entrant, ['name', 'skin']) || typeof entrant.name !== 'string'
      || controls.test(entrant.name) || !integer(entrant.skin, 1, 26)) throw new TypeError('Participant invalide.');
    const name = entrant.name.trim();
    if (!name || [...name].length > 24 || (canonical && name !== entrant.name)) throw new TypeError('Le nom doit contenir entre 1 et 24 caractères.');
    const key = name.normalize('NFKC').toLowerCase();
    if (names.has(key)) throw new TypeError('Chaque participant doit avoir un nom différent.');
    names.add(key);
    return { name, skin: entrant.skin };
  });
}

function configFor(format, entrants, bestOf, canonical = false) {
  if (format !== 'bracket' && format !== 'series') throw new TypeError('Format de tournoi invalide.');
  if (format === 'bracket' ? bestOf !== null : bestOf !== 3 && bestOf !== 5) throw new TypeError('Nombre de manches invalide.');
  return { format, entrants: entrantsFor(entrants, format, canonical), bestOf };
}

function winningSide(scores, target) {
  if (!integer(target, 1, MAX_TARGET) || !Array.isArray(scores) || scores.length !== 2
    || !integer(scores[0], 0, target) || !integer(scores[1], 0, target)) throw new TypeError('Score ou objectif invalide.');
  if (scores[0] === target && scores[1] < target) return 0;
  if (scores[1] === target && scores[0] < target) return 1;
  throw new TypeError('Le résultat doit atteindre l’objectif et désigner un vainqueur.');
}

function replay(config, records) {
  const limit = config.format === 'bracket' ? config.entrants.length - 1 : config.bestOf;
  if (!Array.isArray(records) || records.length > limit) throw new TypeError('Historique invalide.');
  const ids = new Set();
  for (const record of records) {
    if (!objectWithKeys(record, ['players', 'scores', 'target', 'id']) || !integer(record.id, 1)
      || ids.has(record.id) || !Array.isArray(record.players) || record.players.length !== 2
      || !record.players.every(player => integer(player, 0, config.entrants.length - 1))) throw new TypeError('Match enregistré invalide.');
    ids.add(record.id);
    winningSide(record.scores, record.target);
  }
  let cursor = 0;
  const take = players => {
    const record = records[cursor++];
    if (record.players[0] !== players[0] || record.players[1] !== players[1]) throw new TypeError('Les participants ne correspondent pas au match atteint.');
    return winningSide(record.scores, record.target);
  };
  if (config.format === 'series') {
    const wins = [0, 0];
    const needed = (config.bestOf + 1) / 2;
    for (const record of records) {
      if (wins.some(count => count >= needed)) throw new TypeError('Un résultat a été ajouté après la fin de la série.');
      wins[take([0, 1])]++;
    }
    const champion = wins.findIndex(count => count >= needed);
    const finished = champion !== -1;
    return {
      players: finished ? null : [0, 1], roundLabel: finished ? 'Série terminée' : `Manche ${cursor + 1}`,
      round: finished ? cursor : cursor + 1, matchNumber: finished ? cursor : cursor + 1,
      wins, finished, champion: finished ? champion : null,
    };
  }
  let participants = config.entrants.map((_, index) => index);
  let round = 1;
  while (participants.length > 1) {
    const next = [];
    const roundLabel = participants.length === 8 ? 'Quart de finale' : participants.length === 4 ? 'Demi-finale' : 'Finale';
    for (let index = 0; index < participants.length; index += 2) {
      const players = [participants[index], participants[index + 1]];
      if (cursor === records.length) return { players, roundLabel, round, matchNumber: cursor + 1, wins: null, finished: false, champion: null };
      next.push(players[take(players)]);
    }
    participants = next;
    round++;
  }
  return { players: null, roundLabel: 'Tournoi terminé', round: round - 1, matchNumber: cursor, wins: null, finished: true, champion: participants[0] };
}

function freezeState(config, records) {
  const champion = replay(config, records).champion;
  const state = {
    version: 1, format: config.format,
    entrants: Object.freeze(config.entrants.map(entrant => Object.freeze({ ...entrant }))),
    bestOf: config.bestOf,
    records: Object.freeze(records.map(record => Object.freeze({
      players: Object.freeze(record.players.slice()), scores: Object.freeze(record.scores.slice()),
      target: record.target, id: record.id,
    }))), champion,
  };
  return Object.freeze(state);
}

/** Create an unplayed 4/8 entrant bracket, or a two-person best-of-3/5 series. */
export function createTournament(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Configuration invalide.');
  const keys = Reflect.ownKeys(options);
  if (!keys.includes('format') || !keys.includes('entrants') || keys.some(key => !['format', 'entrants', 'bestOf'].includes(key))) throw new TypeError('Configuration invalide.');
  const bestOf = options.format === 'series' ? options.bestOf ?? 3 : options.bestOf ?? null;
  return freezeState(configFor(options.format, options.entrants, bestOf), []);
}

/** Verify shape, participants, results, unique IDs, reachable pairings and champion. */
export function validateTournament(state) {
  try {
    if (!objectWithKeys(state, ['version', 'format', 'entrants', 'bestOf', 'records', 'champion']) || state.version !== 1) return false;
    const config = configFor(state.format, state.entrants, state.bestOf, true);
    return replay(config, state.records).champion === state.champion;
  } catch {
    return false;
  }
}

/** Returns the reached human match, or a finished descriptor with its champion. */
export function currentMatch(state) {
  if (!validateTournament(state)) throw new TypeError('État du tournoi invalide.');
  const result = replay(state, state.records);
  return Object.freeze({ ...result,
    players: result.players && Object.freeze(result.players),
    wins: result.wins && Object.freeze(result.wins),
  });
}

/** Append exactly one reached match. Existing state and caller inputs stay intact. */
export function recordResult(state, result) {
  if (!validateTournament(state)) throw new TypeError('État du tournoi invalide.');
  if (!objectWithKeys(result, ['scores', 'target', 'matchId']) || !integer(result.matchId, 1)) throw new TypeError('Résultat invalide.');
  winningSide(result.scores, result.target);
  if (state.records.some(record => record.id === result.matchId)) throw new TypeError('Ce résultat a déjà été enregistré.');
  const match = replay(state, state.records);
  if (match.finished) throw new TypeError('Le tournoi est terminé.');
  const record = { players: match.players, scores: result.scores, target: result.target, id: result.matchId };
  return freezeState(state, [...state.records, record]);
}
