import { BONUS, BONUS_FIELDS, BONUS_LIMITS } from './engine-contract.js';
export const BONUS_V2_VERSION = 2;
export const BONUS_PICKUP_COUNT = 26;
export const BONUS_MODES = Object.freeze([
  { id: 0, label: 'Aucun bonus', description: 'Un duel sans bonus à ramasser.' },
  { id: 1, label: 'Bonus historiques', description: 'Les 18 bonus du jeu original.' },
  { id: 2, label: 'Bonus V2', description: 'Les 18 historiques et 5 nouveaux effets, soit 26 pastilles avec les variantes rouges.' },
].map(Object.freeze));
export const BONUS_NAMES = Object.freeze(['', 'Vitesse augmentée', 'Vitesse réduite', 'Super saut', 'Petit saut', 'Gel adverse', 'Gel', 'Grand but', 'Petit but', 'Bombes', 'Grand ballon', 'Ballon rebondissant', 'Petit ballon', 'Ballon sans rebond', 'Grande tête', 'Petite tête', 'Pied adverse cassé', 'Pied cassé', 'Intrus sur le terrain', 'Frappe puissante', 'Bouclier de but', 'Ballon lourd', 'Tête ressort', 'Zone trampoline', 'Frappe puissante adverse', 'Bouclier de but adverse', 'Tête ressort adverse']);
export const NEW_BONUSES = Object.freeze([
  { id: 19, redId: 24, detail: 'Une frappe manuelle renforcée pendant 8 secondes. Vert : pour vous ; rouge : pour l’adversaire.' },
  { id: 20, redId: 25, detail: 'Le but repousse un seul ballon pendant 5 secondes. Vert : votre but ; rouge : le but adverse.' },
  { id: 21, color: '#667d96', detail: 'Un ballon plus lourd qui retombe plus vite pendant 6 secondes.' },
  { id: 22, redId: 26, detail: 'La tête renvoie le ballon plus fort pendant 6 secondes. Vert : pour vous ; rouge : pour l’adversaire.' },
  { id: 23, color: '#b96ab7', detail: 'Au centre, le sol fait bondir les deux joueurs et le ballon pendant 6 secondes.' },
].map(Object.freeze));
export const validBonusMode = value => Number.isInteger(value) && value >= 0 && value <= 2;
export function bonusModeFromMessage(message) {
  if (!message || typeof message.bonuses !== 'boolean') return null;
  if (!Object.hasOwn(message,'bonusMode')) return Number(message.bonuses);
  return validBonusMode(message.bonusMode) && message.bonuses === (message.bonusMode !== 0) ? message.bonusMode : null;
}
export const BONUS_FIELD_COUNT = BONUS_FIELDS.length;
export function validBonusState(state) {
  return Array.isArray(state) && state.length === BONUS_FIELD_COUNT && BONUS_FIELDS.every((name, index) =>
    Number.isInteger(state[index]) && state[index] >= 0 && state[index] <= BONUS_LIMITS[name]
    && (index === BONUS.mode || state[BONUS.mode] === 2 || state[index] === 0));
}
