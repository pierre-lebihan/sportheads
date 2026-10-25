import { PLAYER_COUNT, PLAYER_NAMES } from './players.js';

// Front-end only: the portraits stay in the public atlas, this just keeps the
// friends' caricatures out of the default roster. Each group gets a link such as
// ?groupe=<code>; the code is remembered on that device, ?groupe=aucun forgets them.
export const PUBLIC_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1));
const id = name => PLAYER_NAMES.indexOf(name) + 1;
const ALL_IDS = Array.from({ length: PLAYER_COUNT }, (_, index) => index + 1);
const ids = (...names) => names.map(id);
const PIERRE_VILMA = ids('Pierre', 'Pierre Nomad', 'Vilma', 'Vilma Dreadlocks');
export const GROUPS = Object.freeze({
  rennes: ids('Pierre', 'Vilma', 'Thibaud', 'Marie', 'Corentin', 'Pierre Nomad', 'Maël', 'Arthur', 'Vilma Dreadlocks'),
  insa: [...PIERRE_VILMA, ...ids('Baptiste', 'Jerem')],
  famille: PIERRE_VILMA,
  macedonia: [...PIERRE_VILMA, ...ids('Dragan', 'Budimka', 'Alex')],
  // Unlocks every character (also used by the browser checks).
  tout: ALL_IDS,
});
const KEY = 'sportheads-groupes-v1';
const FORGET = 'aucun';

export function readGroups(storage = globalThis.localStorage) {
  try {
    const codes = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(codes) ? codes.filter(code => Object.hasOwn(GROUPS, code)) : [];
  } catch { return []; }
}
function saveGroups(codes, storage) {
  try { storage.setItem(KEY, JSON.stringify(codes)); } catch { /* The unlock still works for this page. */ }
}
// Reads ?groupe= from the URL, remembers it, and returns the active codes.
export function applyGroupLink(location = globalThis.location, storage = globalThis.localStorage, history = globalThis.history) {
  let codes = readGroups(storage);
  const params = new URLSearchParams(location?.search || '');
  if (!params.has('groupe')) return codes;
  const code = params.get('groupe').trim().toLowerCase();
  if (code === FORGET) codes = [];
  else if (Object.hasOwn(GROUPS, code) && !codes.includes(code)) codes = [...codes, code];
  saveGroups(codes, storage);
  params.delete('groupe');
  // Keep the code out of the address bar so a shared screenshot does not leak it.
  try { const query = params.toString(); history?.replaceState(history.state, '', location.pathname + (query ? '?' + query : '') + location.hash); } catch { /* Cosmetic. */ }
  return codes;
}
export function unlockedIds(codes) {
  return new Set([...PUBLIC_IDS, ...codes.flatMap(code => GROUPS[code] || [])]);
}

let active = null;
// Locked characters picked by the other side (online room, saved choice) stay shown.
export function isVisible(character, skins = []) {
  active ??= unlockedIds(applyGroupLink());
  return active.has(character) || skins.includes(character);
}
// Keeps a <select> limited to the visible characters plus the current picks.
export function syncSkinOptions(select, skins) {
  const ids = ALL_IDS.filter(character => isVisible(character, skins));
  if (select.options.length === ids.length && ids.every((character, index) => +select.options[index].value === character)) return;
  select.replaceChildren(...ids.map(character => new Option(PLAYER_NAMES[character - 1], character)));
}
