// Percent bonuses belong to the two camps for this match, never to an avatar.
export const BUFF_STATS = Object.freeze([
  { id: 'jump', label: 'Puissance de saut', detail: 'Pour atteindre les ballons plus hauts.' },
  { id: 'head', label: 'Taille de la tête', detail: 'Une plus grande surface pour intercepter.' },
  { id: 'goal', label: 'Protection du but', detail: 'Réduit la hauteur de votre but : +50 % le rend deux fois plus petit.' },
  { id: 'speed', label: 'Vitesse', detail: 'Accélération et vitesse de course augmentées.' },
  { id: 'kick', label: 'Frappe', detail: 'Un mouvement du pied plus rapide pour frapper plus fort.' },
].map(Object.freeze));
export const AID_AMOUNTS = Object.freeze([10, 30, 50]);
export const BALANCE_PRESETS = Object.freeze([
  { id: 'normal', label: 'Normal' }, { id: 'superman', label: 'Superman' },
  { id: 'blue', label: 'Aides bleues' }, { id: 'red', label: 'Aides rouges' }, { id: 'manual', label: 'Manuel' },
].map(Object.freeze));
export const validBuffs = buffs => Array.isArray(buffs) && buffs.length === 2 && [0, 1].every(side =>
  Array.isArray(buffs[side]) && buffs[side].length === BUFF_STATS.length && BUFF_STATS.every((_, stat) =>
    Number.isInteger(buffs[side][stat]) && buffs[side][stat] >= 0 && buffs[side][stat] <= 50));
const sameBuffs = (a, b) => a.every((stats, side) => stats.every((value, stat) => value === b[side][stat]));
export function createBalance(preset = 'normal', amount = 30, buffs = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]) {
  if (!BALANCE_PRESETS.some(item => item.id === preset) || !AID_AMOUNTS.includes(amount) || !validBuffs(buffs)) throw new TypeError('Équilibrage invalide.');
  if (preset === 'manual') return { preset, amount, buffs: buffs.map(stats => stats.slice()) };
  if (preset === 'normal' || preset === 'superman') amount = 30;
  return { preset, amount, buffs: [0, 1].map(side => Array(BUFF_STATS.length).fill(preset === 'superman' ? 30
    : preset === (side === 0 ? 'blue' : 'red') ? amount : 0)) };
}
export function validBalance(config) {
  try {
    if (!config || !BALANCE_PRESETS.some(item => item.id === config.preset) || !validBuffs(config.buffs)) return false;
    const canonical = createBalance(config.preset, config.amount, config.buffs);
    return canonical.amount === config.amount && sameBuffs(canonical.buffs, config.buffs);
  } catch { return false; }
}
export function copyBalance(config) {
  if (!validBalance(config)) throw new TypeError('Équilibrage invalide.');
  return createBalance(config.preset, config.amount, config.buffs);
}
export function balanceLabel(config) {
  if (!validBalance(config)) throw new TypeError('Équilibrage invalide.');
  if (config.preset === 'normal') return 'Capacités normales';
  if (config.preset === 'superman') return 'Superman · +30 % pour les deux joueurs';
  if (config.preset === 'manual') return 'Réglages manuels par joueur';
  return `${config.preset === 'blue' ? 'Bleu' : 'Rouge'} +${config.amount} %`;
}
