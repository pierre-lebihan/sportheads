import { drawGame, drawSprite, getAssets } from './render.js';

export { PLAYER_NAMES } from './players.js';
// Keep the original blueprint IDs, offering only geometry mirrored between camps.
export const PITCHES = [3, 5, 7, 8, 10, 11, 12].map(id => ({ id, name: id === 8 ? 'Terrain libre' : `Terrain ${id}` }));
let previous = '';
export function updateSelectionPreviews(pitch, skins) {
  const key = `${pitch}:${skins.join(':')}`;
  if (!getAssets() || previous === key) return;
  previous = key;
  for (const side of [0, 1]) {
    const canvas = document.querySelector('#player-preview-' + side), ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSprite(ctx, 'modern-heads', skins[side], 36, 38, undefined, undefined, 0, { scale: 1.2, flipX: side === 1 });
  }
  const canvas = document.querySelector('#pitch-preview'), ctx = canvas.getContext('2d');
  ctx.save(); ctx.scale(canvas.width / 800, canvas.height / 540);
  drawGame(ctx, null, { started: false });
  drawSprite(ctx, 'blueprints', pitch, 0, 0);
  ctx.restore();
  document.querySelector('#pitch-caption').textContent = PITCHES.find(p => p.id === pitch)?.name || 'Terrain';
}
