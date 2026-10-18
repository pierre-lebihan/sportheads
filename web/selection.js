import { drawGame, drawSprite, drawPitch, getAssets } from './render.js';
import { PLAYER_NAMES } from './players.js';
import { PLAYABLE_PITCH_IDS } from './engine-contract.js';

export { PLAYER_NAMES } from './players.js';
// Preserve original IDs for the available symmetric and corrected pitches.
export const PITCHES = PLAYABLE_PITCH_IDS.map(id => ({ id, name: id === 8 ? 'Terrain libre' : `Terrain ${id}` }));
let previous = '';
export function createCharacterSelection(container) {
  const $ = selector => container.querySelector(selector);
  const selects = ['#skin-left', '#skin-right'].map($);
  let side = 0, currentMode, painted = false;
  const buttons = PLAYER_NAMES.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'character-tile'; button.dataset.character = index + 1;
    const portrait = document.createElement('canvas'); portrait.width = portrait.height = 96; portrait.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'character-name'; label.textContent = name;
    button.append(portrait, label);
    for (const [camp, text] of [['blue', 'B'], ['red', 'R']]) {
      const marker = document.createElement('span'); marker.className = 'character-marker ' + camp; marker.textContent = text; marker.setAttribute('aria-hidden', 'true');
      button.append(marker);
    }
    button.addEventListener('click', () => {
      const select = selects[side];
      if (select.disabled) return;
      select.value = String(index + 1); select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    button.addEventListener('keydown', event => {
      const columns = getComputedStyle($('#character-roster')).gridTemplateColumns.split(' ').length;
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns, Home: -index, End: buttons.length - 1 - index }[event.key];
      if (delta === undefined) return;
      event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))].focus();
    });
    $('#character-roster').append(button); return button;
  });
  function target(next) { if (!selects[next].disabled) { side = next; refresh(); } }
  for (const camp of [0, 1]) {
    $('#choose-side-' + camp).addEventListener('click', () => target(camp));
    selects[camp].addEventListener('focus', () => target(camp));
    selects[camp].addEventListener('change', () => target(camp));
  }
  function refresh() {
    const skins = selects.map(select => +select.value);
    container.dataset.selectionSide = side;
    for (const camp of [0, 1]) {
      $('#fighter-name-' + camp).textContent = PLAYER_NAMES[skins[camp] - 1];
      const focus = $('#choose-side-' + camp);
      focus.disabled = selects[camp].disabled; focus.setAttribute('aria-pressed', String(camp === side));
      focus.closest('.control-side').dataset.active = String(camp === side);
      $('#fighter-action-' + camp).textContent = selects[camp].disabled ? 'Choix en direct' : camp === side ? 'Choisissez dans la grille' : 'Choisir ce camp';
    }
    $('#roster-target').textContent = 'Choix pour ' + (side ? 'Rouge' : 'Bleu');
    for (const [index, button] of buttons.entries()) {
      const camps = skins.flatMap((skin, camp) => skin === index + 1 ? [camp ? 'Rouge' : 'Bleu'] : []);
      button.disabled = selects[side].disabled;
      button.dataset.blue = String(skins[0] === index + 1); button.dataset.red = String(skins[1] === index + 1);
      button.setAttribute('aria-pressed', String(skins[side] === index + 1));
      button.setAttribute('aria-label', PLAYER_NAMES[index] + (camps.length ? ', choisi par ' + camps.join(' et ') : ''));
    }
    if (getAssets() && !painted) {
      painted = buttons.map((button, index) => drawSprite(button.querySelector('canvas').getContext('2d'), 'modern-heads', index + 1, 48, 48, undefined, undefined, 0, { scale: 1.7 })).every(Boolean);
    }
  }
  return { update({ mode, role, connected }) {
    if (mode !== currentMode) side = 0;
    currentMode = mode;
    if (mode === 'online') side = role === 'guest' ? 1 : 0;
    for (const select of selects) {
      const compact = container.classList.contains('guest-profile');
      select.tabIndex = compact ? 0 : -1;
      select.setAttribute('aria-hidden', String(!compact));
    }
    $('#fighter-role-0').textContent = mode === 'ai' ? 'Vous' : mode === 'local' ? 'Joueur 1' : role === 'host' ? 'Vous' : 'Adversaire';
    $('#fighter-role-1').textContent = mode === 'ai' ? 'IA' : mode === 'local' ? 'Joueur 2' : role === 'guest' ? 'Vous' : 'Adversaire';
    $('#selection-live').textContent = mode !== 'online' ? 'Les mêmes capacités pour tous. À vous de faire la différence.'
      : connected ? 'Les choix se partagent en direct. Le créateur valide le duel.' : 'Choisissez Bleu en attendant votre adversaire.';
    refresh();
  } };
}
export function updateSelectionPreviews(pitch, skins, balanced = true) {
  const key = `${pitch}:${skins.join(':')}:${balanced}`;
  if (!getAssets() || previous === key) return;
  let drawn = true;
  for (const side of [0, 1]) {
    const canvas = document.querySelector('#player-preview-' + side), ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawn = drawSprite(ctx, 'modern-heads', skins[side], canvas.width / 2, canvas.height / 2, undefined, undefined, 0, { scale: canvas.width / 60, flipX: side === 1 }) && drawn;
  }
  const canvas = document.querySelector('#pitch-preview'), ctx = canvas.getContext('2d');
  ctx.save(); ctx.scale(canvas.width / 800, canvas.height / 540);
  drawGame(ctx, null, { started: false });
  drawn = drawPitch(ctx, pitch, balanced) && drawn;
  ctx.restore();
  document.querySelector('#pitch-caption').textContent = PITCHES.find(p => p.id === pitch)?.name || 'Terrain';
  if (drawn) previous = key;
}
