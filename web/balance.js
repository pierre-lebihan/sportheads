// Seven positions: help Blue 30/20/10%, neutral, help Red 10/20/30%.
export function balanceToAssists(position) {
  if (!Number.isInteger(position) || position < -3 || position > 3) throw new TypeError('Équilibrage invalide.');
  return [Math.max(0, -position), Math.max(0, position)];
}
export function assistsToBalance(levels) {
  if (!Array.isArray(levels) || levels.length !== 2 || !levels.every(level => Number.isInteger(level) && level >= 0 && level <= 3)
    || (levels[0] > 0 && levels[1] > 0)) throw new TypeError('Un seul joueur peut recevoir une aide.');
  return levels[1] - levels[0];
}
export function balanceLabel(position) {
  const [blue, red] = balanceToAssists(position);
  return position === 0 ? 'Équilibré' : `${blue ? 'Bleu' : 'Rouge'} +${(blue || red) * 10} %`;
}
