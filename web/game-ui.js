import { PHASE, MATCH } from './engine-contract.js';
import { BONUS_MODES, BONUS_NAMES } from './bonuses.js';
import { AI_LEVELS } from './opponent.js';
import { matchAssetsReady } from './assets.js';
import { renderSetup } from './setup-ui.js';
import { updateSelectionPreviews, updatePitchChoices } from './selection.js';
import { syncSkinOptions } from './roster-access.js';

// Only this view projects application state into controls and menus.
export function createGameUI({ app, engine, snapshot, coreReady, canStart, peerUpdateNeeded, hasTouch, touch, balancing, characterSelection, clearInput, audio, randomChoices }) {
  const $ = selector => document.querySelector(selector);
  let lastUiKey, previousPhase = -1;
  return function renderUI() {
    const config = app.value.config;
    const bonusMode = () => config.bonusMode, targetScore = () => config.targetScore;
    const difficulty = () => AI_LEVELS.find(level => level.id === config.difficulty);
    const ownSide = () => app.value.role === 'guest' ? 1 : 0;
  const e = engine(),state = snapshot(),phase = state.phase;
  // Tick/position changes belong to the canvas, not to the preparation menus.
  const uiKey = JSON.stringify([app.value, coreReady(), matchAssetsReady(bonusMode()), phase, state.score, state.targetScore, state.pitch, e?.game_value(MATCH.notice), (e?.game_value(MATCH.noticeTicks) || 0) > 0, hasTouch(), app.value.touchLayout]);
  if (uiKey === lastUiKey) return;
  lastUiKey = uiKey;
  $('#join-code').value = app.value.joinCode;
  for (const [side, id] of ['skin-left', 'skin-right'].entries()) { syncSkinOptions($('#' + id), config.skins); $('#' + id).value = config.skins[side]; }
  updatePitchChoices($('#pitch'), config.bonusPitches);
  $('#bonus-pitches').checked = config.bonusPitches;
  $('#pitch').value = config.pitch; $('#target-score').value = config.targetScore; $('#bonuses').value = config.bonusMode;
  for (const radio of document.querySelectorAll('[name="ai-level"]')) radio.checked = radio.value === config.difficulty;
  balancing.value = config.balance;

  const names = app.value.mode === 'ai' ? ['Vous · Bleu', 'IA · Rouge'] : ['Bleu', 'Rouge'];
  document.body.classList.toggle('touch-device', hasTouch());
  $('#touch-settings').hidden = !hasTouch();
  $('#touch-layout-help').textContent = app.value.touchLayout === 'thumbs' ?
  'Pouce gauche : orientez le joystick pour marcher. Une remontée déclenche un seul saut, même en diagonale. Revenez au centre ou dans la moitié basse, puis remontez pour resauter. Pouce droit : Tir.' :
  'Pouce gauche : déplacement. Index gauche : Saut, en haut à gauche. Pouce droit : Tir. En local, Rouge a son bouton Saut en haut à droite.';
  if (app.value.mode !== 'local') $('#touch-layout-help').textContent += ' Le bouton Saut au-dessus de Tir déclenche aussi un saut par appui, sans déplacement.';
  $('#measure-performance').disabled = !app.value.started;
  $('#measure-performance-paused').disabled = !app.value.started;
  $('#play-view').disabled = !app.value.started;
  $('#play-view').setAttribute('aria-expanded', String(!app.value.started || app.value.settingsOpen));
  $('#close-settings').hidden = !app.value.started;
  $('#quit-match-settings').hidden = !app.value.started;
  $('#touch-controls').hidden = !app.value.started;
  // Safari before 15.4 has no :has(), so the dock follows the controls by class.
  $('.ground-bar').classList.toggle('with-controls', app.value.started);
  touch.update({ mode: app.value.mode, side: ownSide(), names, enabled: app.value.started && !app.value.paused && phase !== PHASE.finished && (app.value.mode !== 'online' || app.value.connected) });
  $('.team.blue span').textContent = names[0];$('.team.red span').textContent = names[1];
  $('.team.blue span').title = names[0];$('.team.red span').title = names[1];
  $('#score-left').textContent = state.score[0] ?? 0;$('#score-right').textContent = state.score[1] ?? 0;
  const notice = e?.game_value(MATCH.noticeTicks) > 0 ? BONUS_NAMES[e.game_value(MATCH.notice)] : '';
  $('#bonus-notice').textContent = notice;$('#bonus-notice').hidden = !notice;
  $('#welcome').hidden = app.value.started && !app.value.settingsOpen;$('#finished').hidden = !app.value.started || phase !== PHASE.finished || app.value.settingsOpen;$('#paused').hidden = !app.value.started || !app.value.paused || phase === PHASE.finished || app.value.settingsOpen;
  $('#start').disabled = !canStart();
  $('#start').textContent = !coreReady() || !matchAssetsReady(bonusMode()) ? 'Chargement…' : app.value.mode !== 'online' ? 'Commencer' : peerUpdateNeeded() ? 'Votre adversaire doit actualiser le jeu' : app.value.connected ? 'Lancer le match' : 'En attente d’un adversaire';
  $('#welcome-title').textContent = app.value.mode === 'ai' ? `Contre l’IA · ${difficulty().label}` : app.value.mode === 'local' ? 'À vous de jouer.' : app.value.connected ? 'Vous êtes deux !' : 'Invitez un adversaire.';
  $('#welcome-detail').textContent = app.value.mode === 'ai' ? 'Vous jouez Bleu. L’IA joue Rouge avec les mêmes règles.' : app.value.mode === 'local' ? 'Marquez plus de buts que votre adversaire. Jouez à deux avec les commandes tactiles ou le clavier.' :
  app.value.connected ? app.value.role === 'host' ? 'Vous jouez Bleu. Votre adversaire joue Rouge. Lancez le match quand vous êtes prêts.' : 'Vous jouez Rouge. Le créateur de la salle va lancer le match.' :
  'Créez une salle, partagez son code et retrouvez-vous sur le terrain.';
  $('#pause').disabled = !app.value.started || phase === PHASE.finished || app.value.mode === 'online' && !app.value.connected;
  const pauseLabel = app.value.pauseFlags[ownSide()] ? 'Reprendre' : 'Pause';
  $('#pause').textContent = app.value.pauseFlags[ownSide()] ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', pauseLabel);$('#pause').title = pauseLabel;
  const mayResume = app.value.mode !== 'online' || app.value.connected && app.value.pauseFlags[ownSide()];
  $('#resume').disabled = !mayResume;$('#resume').textContent = mayResume ? 'Reprendre' : 'Adversaire en pause';
  $('#pause-detail').textContent = app.value.mode !== 'online' ? 'Le temps vous attend.' : !app.value.connected ? 'Connexion interrompue. Le match reprendra dès que la liaison sera rétablie.' :
  app.value.pauseFlags[ownSide()] ? 'Vous avez mis le match en pause. Chaque joueur doit reprendre pour continuer.' : 'Votre adversaire a mis le match en pause.';
  $('#restart').hidden = app.value.mode === 'online';$('#restart').disabled = !app.value.started;
  $('#again').disabled = !canStart();$('#again').textContent = app.value.mode === 'online' && app.value.role === 'guest' ? 'Le créateur peut relancer' :
  'Rejouer';
  $('#create-room').disabled = !coreReady() || app.value.busy;$('#join-room').disabled = !coreReady() || app.value.busy;
  const settingsLocked = app.value.started && phase !== PHASE.finished || app.value.mode === 'online' && app.value.role === 'guest';
  $('#bonuses').disabled = !!settingsLocked;
  $('#bonuses-help').textContent = BONUS_MODES[bonusMode()].description;
  $('#v2-guide').hidden = bonusMode() !== 2;
  for (const radio of document.querySelectorAll('[name="ai-level"]')) radio.disabled = app.value.started && phase !== PHASE.finished;
  for (const id of ['target-score', 'pitch', 'bonus-pitches']) $('#' + id).disabled = !!settingsLocked;
  $('#goal-minus').disabled = !!settingsLocked || targetScore() <= 1;
  $('#goal-plus').disabled = !!settingsLocked || targetScore() >= 9;
  balancing.update({ disabled: !!settingsLocked, skins: config.skins });
  updateSelectionPreviews(state.pitch, config.skins, app.value.mode === 'online' && app.value.role === 'guest' ? app.value.remoteBalancedPitches : true);
  $('#settings-legend').textContent = 'Votre partie';
  renderSetup({ screen: app.value.setupStep, mode: app.value.mode, matchmaking: app.value.matchmaking, role: app.value.role, started: app.value.started, ready: coreReady(), busy: app.value.busy, connected: app.value.connected });
  for (const side of [0, 1]) {
    $('#' + ['skin-left', 'skin-right'][side]).disabled = app.value.mode === 'online' && (app.value.role === null || side !== ownSide());
  }
  characterSelection.update({ mode: app.value.mode, role: app.value.role, connected: app.value.connected });
  for (const [buttonId, selectId] of randomChoices) $('#' + buttonId).disabled = $('#' + selectId).disabled;
  $('#status').textContent = app.value.mode === 'online' && !app.value.connected ? `${app.value.matchmaking ? 'Matchmaking' : 'Salle privée'} · En attente d’un adversaire` :
  !app.value.started ? 'Choisissez vos joueurs et votre terrain' : phase === PHASE.countdown ? 'Préparez-vous…' : phase === PHASE.goal ? `But pour ${names[e.game_value(MATCH.lastScorer)]} !` :
  phase === PHASE.finished ? 'Match terminé' : app.value.mode === 'ai' ? `Contre l’IA · ${difficulty().label} · Vous jouez Bleu` : app.value.mode === 'online' ? `Duel à distance · Vous jouez ${app.value.role === 'host' ? 'Bleu' : 'Rouge'}` : 'Duel local · À vous de jouer';
  if (app.value.started && phase === PHASE.finished) {
    const [a, b] = state.score;$('#result').textContent = `${names[a > b ? 0 : 1]} remporte le match !`;
    $('#final-score').textContent = `${names[0]} ${a} — ${b} ${names[1]}`;
    if (phase !== previousPhase) {clearInput();audio.stopAll();}
  }
  previousPhase = phase;

  };
}
