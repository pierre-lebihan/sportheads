// Eleven positions: one camp receives 10/20/30/40/52%, or neither at the center.
export const ASSIST_PERCENTS = Object.freeze([0, 10, 20, 30, 40, 52]);
export function balanceToAssists(position) {
  if (!Number.isInteger(position) || position < -5 || position > 5) throw new TypeError('Équilibrage invalide.');
  return [Math.max(0, -position), Math.max(0, position)];
}
export function assistsToBalance(levels) {
  if (!Array.isArray(levels) || levels.length !== 2 || !levels.every(level => Number.isInteger(level) && level >= 0 && level <= 5)
    || (levels[0] > 0 && levels[1] > 0)) throw new TypeError('Un seul joueur peut recevoir une aide.');
  return levels[1] - levels[0];
}
export function balanceLabel(position) {
  const [blue, red] = balanceToAssists(position);
  return position === 0 ? 'Équilibré' : `${blue ? 'Bleu' : 'Rouge'} +${ASSIST_PERCENTS[blue || red]} %`;
}
