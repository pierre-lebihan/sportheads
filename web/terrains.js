import { MATCH } from './engine-contract.js';
import { loadAssets, drawGame, drawPitch } from './render.js';
import { PITCHES } from './selection.js';
import { BALANCED_PITCHES } from './pitch-geometry.js';

const removed = [
  { id: 2, detail: 'L’ensemble central est placé à x = 410, soit 10 px à droite du milieu.' },
  { id: 4, detail: 'Les deux cercles sont à x = 230 et x = 590 : le milieu de la paire est décalé de 10 px vers la droite.' },
  { id: 6, detail: 'Les paires sont décalées de 3 à 4,5 px vers la droite ; les deux cercles du bas ont aussi 2 px d’écart en hauteur.' },
  { id: 9, detail: 'Les paires inclinées et les cercles du bas ont environ 1 px d’écart par rapport à leur miroir. Visuellement, il est presque symétrique.' },
  { id: 13, uneven: true, detail: 'Les deux rampes ne se répondent pas : l’une est à gauche et en hauteur, l’autre plus bas et au centre.' },
  { id: 14, detail: 'Les deux poteaux ont 8 px d’écart en hauteur. Le milieu de leur paire est décalé de 2,5 px vers la droite.' },
  { id: 15, detail: 'Les paires de cercles et de rampes sont décalées de 5 à 6 px vers la droite. Les rampes ont aussi 1 px d’écart en hauteur.' },
  { id: 16, detail: 'Le cercle du haut est 10 px à gauche du milieu ; les paires du bas sont décalées de 5 à 6 px vers la droite.' },
  { id: 17, detail: 'Le cercle central et la paire intermédiaire sont centrés à x = 390, la paire du bas à x = 395, au lieu de x = 400.' },
  { id: 18, detail: 'La colonne centrale est 10 px à gauche du milieu. La paire de rampes est décalée de 11,5 px vers la gauche, avec 3 px d’écart en hauteur.' },
  { id: 19, uneven: true, detail: 'Une seule rampe inclinée, sans son équivalent en miroir. Elle peut dévier le ballon différemment selon le camp.' },
  { id: 20, uneven: true, detail: 'Une seule rampe inclinée dans l’autre sens, sans son équivalent en miroir.' }
].map(pitch => ({ ...pitch, corrected: !!BALANCED_PITCHES[pitch.id] }));
const $ = selector => document.querySelector(selector);
const previews = [];
function selection() {
  const selected = [...document.querySelectorAll('[data-restore]:checked')].map(input => +input.dataset.restore);
  $('#selected').textContent = selected.length ? 'À remettre : ' + selected.join(', ') : 'Aucun terrain coché.';
  $('#copy-selection').disabled = !selected.length; $('#copy-status').textContent = '';
  return selected;
}
for (const pitch of [...removed, ...PITCHES.filter(pitch => !BALANCED_PITCHES[pitch.id]).map(pitch => ({ ...pitch, kept: true }))]) {
  const article = document.createElement('article'); article.className = 'pitch'; article.dataset.pitch = pitch.id;
  const heading = document.createElement('div'); heading.className = 'pitch-heading';
  const title = document.createElement('h3'); title.textContent = pitch.name || 'Terrain ' + pitch.id; heading.append(title);
  if (pitch.corrected) { const status = document.createElement('span'); status.className = 'status'; status.textContent = 'Corrigé · Jouable'; heading.append(status); }
  if (!pitch.kept && !pitch.corrected) {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.dataset.restore = pitch.id;
    input.addEventListener('change', selection); label.append(input, 'À remettre'); heading.append(label);
  }
  const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 480; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', (pitch.name || 'Terrain ' + pitch.id) + '. ' + (pitch.detail || 'Conservé dans le sélecteur.'));
  article.append(heading, canvas);
  const detail = document.createElement('p');
  if (pitch.detail) { detail.textContent = pitch.detail; article.append(detail); }
  $(pitch.kept ? '#kept-pitches' : pitch.uneven ? '#uneven-pitches' : '#near-pitches').append(article);
  previews.push({ ...pitch, canvas, detailElement: detail });
}
$('#copy-selection').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('Remets les terrains ' + selection().join(', ') + '.'); $('#copy-status').textContent = 'Sélection copiée. Vous pouvez la coller dans la conversation.'; }
  catch { $('#copy-status').textContent = 'Copie indisponible : les numéros restent affichés à gauche.'; }
});
try {
  const response = await fetch('./physics-core.wasm'); if (!response.ok) throw Error('Moteur indisponible');
  const [wasm] = await Promise.all([WebAssembly.instantiateStreaming(response), loadAssets()]);
  const engine = wasm.instance.exports;
  function draw() {
    for (const { id, canvas, corrected, detail, detailElement } of previews) {
      const balanced = corrected && !$('#show-original').checked;
      engine[balanced ? 'game_start_balanced_pitch' : 'game_start_on_pitch'](1, 7, 0, id);
      if (corrected) detailElement.textContent = balanced ? 'Corrigé : obstacles recentrés, hauteurs alignées et angles en miroir. Le dessin suit les collisions.' : 'Avant : ' + detail;
      const ctx = canvas.getContext('2d');
      drawGame(ctx, engine, { started: false, skins: [1, 2], modernPlayers: true, blueprintFrame: id, balancedPitches: balanced,
        goalFrames: [MATCH.blueGoalHeight, MATCH.redGoalHeight].map(field => engine.game_value(field) === 140 ? 2 : engine.game_value(field) === 60 ? 3 : 1) });
      if ($('#show-mirror').checked) {
        ctx.save(); ctx.translate(800, 0); ctx.scale(-1, 1);
        ctx.globalAlpha = .5; ctx.filter = 'sepia(1) saturate(5) hue-rotate(330deg)';
        drawPitch(ctx, id, balanced);
        ctx.restore();
      }
      if ($('#show-axis').checked) {
        ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 480); ctx.stroke(); ctx.restore();
      }
    }
  }
  draw(); $('#show-original').addEventListener('change', draw); $('#show-axis').addEventListener('change', draw); $('#show-mirror').addEventListener('change', draw);
  $('#loading').hidden = true; window.reviewReady = true;
} catch (error) { $('#loading').textContent = 'Les aperçus n’ont pas pu se charger. Rechargez la page.'; window.reviewError = error.message; }
