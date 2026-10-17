import { loadAssets, drawGame, createAudio } from './render.js';
import './vendor/peerjs-1.5.5.min.js';
import { Room, normalizeCode, validCode } from './rooms.js';
import { captureState, createRemoteEngine } from './net-state.js';
import { PLAYER_NAMES, PITCHES, updateSelectionPreviews } from './selection.js';
import { PLAYER_COUNT } from './players.js';
import { balanceToAssists, assistsToBalance, balanceLabel } from './balance.js';
import { PREPARATION_STEPS, validSetupStep, renderSetup } from './setup-ui.js';
import { layoutArena } from './arena-ui.js';
import { createTouchControls } from './touch-controls.js';

const $ = selector => document.querySelector(selector);
const randomChoices = [['random-player-0', 'skin-left'], ['random-player-1', 'skin-right'], ['random-pitch', 'pitch']];
const canvas = $('#field'), ctx = canvas.getContext('2d'), keys = new Set(), audio = createAudio();
const bindings = { KeyA: 1, KeyQ: 1, KeyD: 2, KeyW: 4, KeyZ: 4, Space: 8, ArrowLeft: 16, ArrowRight: 32, ArrowUp: 64, KeyP: 128 };
const bonusNames = ['', 'Vitesse augmentée', 'Vitesse réduite', 'Super saut', 'Petit saut', 'Gel adverse', 'Gel', 'Grand but', 'Petit but', 'Bombes', 'Grand ballon', 'Ballon rebondissant', 'Petit ballon', 'Ballon sans rebond', 'Grande tête', 'Petite tête', 'Pied adverse cassé', 'Pied cassé', 'Intrus sur le terrain'];
const effectNames = ['ring', 'green-ring', 'red-ring', 'explosion', 'dust', 'trail'];
let core, remote = createRemoteEngine(), room = null, mode = 'local', role = null;
let started = false, paused = false, pauseFlags = [false, false], soundEnabled = true;
let last = 0, accumulator = 0, previousPhase = -1, lastBroadcast = 0;
let matchId = 0, frameSequence = 0, receivedSequence = -1, inputSequence = 0, receivedInput = -1;
let remoteInput = 0, lastInputAt = 0, soundTick = -1, soundMatch = -1, busy = false;
let settingsOpen = false, setupStep = 'home', lastValidTarget = 7;
let restoringSettings = false, recoveryTimer;
const hasTouch = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
const touch = createTouchControls($('#touch-controls'), sendInput);
function clearInput() { keys.clear(); touch.clear(); }

for (const [id, selected] of [['skin-left', 1], ['skin-right', 2]]) {
  for (let i = 1; i <= PLAYER_COUNT; i++) { const option = new Option(PLAYER_NAMES[i - 1], i); option.selected = i === selected; $('#' + id).add(option); }
}
for (const pitch of PITCHES) { const option = new Option(pitch.name, pitch.id); option.selected = pitch.id === 8; $('#pitch').add(option); }
const engine = () => mode === 'online' && role === 'guest' ? remote.engine : core;
const assists = () => balanceToAssists(+$('#balance').value);
const applyAssists = () => assists().forEach((level, side) => core?.game_set_assistance(side, level));
const skins = () => [+$('#skin-left').value, +$('#skin-right').value];
const ownSide = () => role === 'guest' ? 1 : 0;
const targetScore = () => +$('#target-score').value;
const validTarget = () => Number.isInteger(targetScore()) && targetScore() >= 1 && targetScore() <= 99;
const canStart = () => !!core && !restoringSettings && validTarget() && (mode === 'local' || (role === 'host' && room?.connected));
function input() {
  let mask = touch.mask();
  for (const key of keys) { const bit = bindings[key] || 0; mask |= mode === 'local' || bit < 16 ? bit : bit >> 4; }
  return mask;
}
function snapshot() {
  const e = engine();
  return { started, paused, mode, role, connected: !!room?.connected, code: room?.code || '', matchId, setupStep,
    phase: e?.game_value(0), targetScore: started ? e?.game_value(14) : targetScore(), pitch: started ? e?.game_value(15) : +$('#pitch').value,
    assists: started ? [0, 1].map(side => e?.game_player_value(side, 6)) : assists(), remainingTicks: e?.game_value(1), score: [e?.game_value(2), e?.game_value(3)], countdown: e?.game_value(4), tick: e?.game_value(6) };
}
function playSounds(mask) {
  if (!soundEnabled) return;
  for (const [bit, name] of [[1, 'kick'], [2, 'jump'], [4, 'die'], [8, 'whistle'], [16, 'pop'], [32, 'coin'], [64, 'explosion']]) if (mask & bit) audio.play(name, { volume: .5 });
  if (mask & 4) audio.play('cheer', { volume: .3 });
}
function music() {
  if (soundEnabled && started && !paused && engine().game_value(0) !== 3) audio.play('music-match', { loop: true, volume: .14 });
  else audio.stopAll();
}
function roomStatus(message, error = false) {
  $('#room-status').textContent = message; $('#room-status').classList.toggle('error', error);
  $('#network-diagnostic').hidden = !error || !room;
  if (error && room) $('#network-report').textContent = JSON.stringify(room.diagnostic(), null, 2);
}
function sendInput() {
  if (mode === 'online' && role === 'guest' && room?.connected) room.send({ type: 'input', sequence: ++inputSequence, mask: paused ? 0 : input(), skin: +$('#skin-right').value });
}
function broadcast() {
  if (mode !== 'online' || role !== 'host' || !room?.connected) return;
  const state = captureState(core, skins());
  if (!started) state.values[14] = validTarget() ? targetScore() : lastValidTarget;
  if (!started) { state.values[15] = +$('#pitch').value; state.players.forEach((player, side) => { player[6] = assists()[side]; }); }
  room.send({ type: 'frame', sequence: ++frameSequence, matchId, started, bonuses: $('#bonuses').checked,
    setupStep: validSetupStep(setupStep) ? setupStep : 'players', pauseFlags: [...pauseFlags], state });
  lastBroadcast = performance.now();
}
function pause(value = true) {
  if (!started || engine().game_value(0) === 3) return;
  clearInput(); accumulator = 0; last = 0;
  if (!value) canvas.focus({ preventScroll: true });
  if (mode === 'online' && role === 'guest') { room?.send({ type: 'pause', value: !!value }); sendInput(); return; }
  pauseFlags[0] = !!value; applyPause(); broadcast();
}
function applyPause() {
  const changed = paused !== pauseFlags.some(Boolean);
  paused = pauseFlags.some(Boolean); clearInput(); accumulator = 0; last = 0;
  if (changed) music();
  update();
}
function reset() {
  if (!canStart()) return;
  audio.unlock();
  core.game_start_on_pitch(crypto.getRandomValues(new Uint32Array(1))[0], targetScore(), +$('#bonuses').checked, +$('#pitch').value);
  applyAssists();
  settingsOpen = false; setupStep = 'rules';
  started = true; paused = false; pauseFlags = [false, false]; previousPhase = -1;
  remoteInput = 0; matchId++; clearInput(); accumulator = 0; last = 0;
  canvas.focus({ preventScroll: true }); music(); update(); broadcast();
}
function clearMatch() {
  settingsOpen = false;
  started = false; paused = false; pauseFlags = [false, false]; clearInput(); remoteInput = 0;
  last = 0; accumulator = 0; previousPhase = -1; receivedSequence = -1; receivedInput = -1;
  remote = createRemoteEngine(); audio.stopAll(); core?.game_reset(1); applyAssists();
}
function leaveRoom() {
  restoringSettings = false; clearTimeout(recoveryTimer);
  setupStep = mode === 'online' ? 'room' : 'home';
  room?.close(); room = null; role = null; busy = false; clearMatch();
  $('#room-details').hidden = true; $('#room-actions').hidden = false;
  roomStatus('Créez une salle ou saisissez le code de votre adversaire.'); update();
}
function selectMode(next) {
  leaveRoom(); mode = next; setupStep = next === 'local' ? 'players' : 'room';
  $('#online-panel').hidden = mode !== 'online'; $('#online-controls').hidden = mode !== 'online';
  $('#play-local').setAttribute('aria-pressed', String(mode === 'local'));
  $('#play-online').setAttribute('aria-pressed', String(mode === 'online'));
  update();
}
function onMessage(message) {
  if (role === 'host') {
    if (message.type === 'room-settings' && restoringSettings
      && Array.isArray(message.skins) && message.skins.length === 2 && message.skins.every(skin => Number.isInteger(skin) && skin >= 1 && skin <= PLAYER_COUNT)
      && Number.isInteger(message.pitch) && PITCHES.some(pitch => pitch.id === message.pitch)
      && Number.isInteger(message.targetScore) && message.targetScore >= 1 && message.targetScore <= 99
      && Number.isInteger(message.balance) && message.balance >= -3 && message.balance <= 3 && typeof message.bonuses === 'boolean') {
      restoringSettings = false; clearTimeout(recoveryTimer); busy = false;
      room.returningHost = false;
      $('#skin-left').value = message.skins[0]; $('#skin-right').value = message.skins[1];
      $('#pitch').value = message.pitch; $('#target-score').value = message.targetScore; lastValidTarget = message.targetScore;
      $('#balance').value = message.balance; $('#bonuses').checked = message.bonuses;
      clearMatch(); setupStep = 'players';
      roomStatus('Salle retrouvée. Vous êtes Bleu. Vos réglages sont conservés : préparez le prochain match.');
      update(); broadcast(); return;
    }
    if (message.type === 'input' && Number.isSafeInteger(message.sequence) && message.sequence > receivedInput
      && Number.isInteger(message.mask) && message.mask >= 0 && message.mask <= 15
      && Number.isInteger(message.skin) && message.skin >= 1 && message.skin <= PLAYER_COUNT) {
      receivedInput = message.sequence; remoteInput = message.mask; lastInputAt = performance.now();
      const changed = +$('#skin-right').value !== message.skin;
      $('#skin-right').value = message.skin;
      if (changed) update();
    } else if (message.type === 'pause' && typeof message.value === 'boolean' && started && core.game_value(0) !== 3) {
      pauseFlags[1] = message.value; applyPause(); broadcast();
    }
    return;
  }
  if (role !== 'guest' || message.type !== 'frame' || !Number.isSafeInteger(message.sequence) || message.sequence <= receivedSequence
    || !Number.isSafeInteger(message.matchId) || message.matchId < matchId || typeof message.started !== 'boolean' || typeof message.bonuses !== 'boolean'
    || !validSetupStep(message.setupStep)
    || !Array.isArray(message.pauseFlags) || message.pauseFlags.length !== 2 || !message.pauseFlags.every(v => typeof v === 'boolean')
    || !remote.update(message.state)) return;
  const newMatch = message.matchId !== matchId || started !== message.started;
  const oldPaused = paused;
  receivedSequence = message.sequence; matchId = message.matchId; started = message.started;
  setupStep = message.setupStep;
  pauseFlags = message.pauseFlags; paused = pauseFlags.some(Boolean);
  // Preserve the guest's desired skin while an older snapshot is still in flight.
  $('#skin-left').value = message.state.skins[0];
  $('#balance').value = assistsToBalance(message.state.players.map(player => player[6]));
  $('#bonuses').checked = message.bonuses;
  $('#target-score').value = message.state.values[14]; lastValidTarget = message.state.values[14];
  $('#pitch').value = message.state.values[15];
  if (newMatch) { if (started) settingsOpen = false; previousPhase = -1; clearInput(); music(); if (started && document.hidden) pause(true); else if (started) canvas.focus({ preventScroll: true }); }
  if (oldPaused !== paused) { clearInput(); music(); if (!paused) canvas.focus({ preventScroll: true }); }
  if (started && !paused && (soundTick !== engine().game_value(6) || soundMatch !== matchId)) {
    soundTick = engine().game_value(6); soundMatch = matchId; playSounds(engine().game_value(7));
  }
  update();
}
async function connectRoom(create) {
  if (!core || busy) return;
  const code = normalizeCode($('#join-code').value);
  if (!create && !validCode(code)) { roomStatus('Entrez les 8 caractères du code de la salle.', true); $('#join-code').focus(); return; }
  restoringSettings = false; clearTimeout(recoveryTimer);
  room?.close(); clearMatch(); busy = true; role = create ? 'host' : 'guest';
  setupStep = create ? 'players' : 'room';
  const candidate = new Room({
    onReady: () => {
      if (room !== candidate) return;
      role = candidate.role;
      remoteInput = 0; receivedInput = -1; busy = false;
      roomStatus(role === 'host' ? 'Votre adversaire est là. Vous êtes Bleu : lancez le match quand vous êtes prêts.' : 'Vous êtes Rouge. Le créateur de la salle va lancer le match.');
      $('#room-details').hidden = false; $('#room-actions').hidden = true; $('#room-code').textContent = candidate.code;
      if (role === 'host' && candidate.returningHost) {
        restoringSettings = true; busy = true; setupStep = 'players';
        roomStatus('Salle retrouvée. Récupération des réglages auprès de votre adversaire…');
        recoveryTimer = setTimeout(() => {
          if (room === candidate && restoringSettings) candidate.fail('Impossible de récupérer les réglages. Rejoignez à nouveau avec le même code.');
        }, 10000);
      } else if (role === 'host') {
        const wasPlaying = started; clearMatch(); if (wasPlaying) setupStep = 'players'; broadcast();
      } else {
        // A creator returning from a fresh page has no simulation to resume.
        // Keep the last settings here until it receives them, then start in the lobby.
        receivedSequence = -1; matchId = 0; setupStep = 'players';
        candidate.send({ type: 'room-settings', skins: skins(), pitch: +$('#pitch').value,
          targetScore: targetScore(), balance: +$('#balance').value, bonuses: $('#bonuses').checked });
        roomStatus('Vous êtes Rouge. Le créateur peut préparer et lancer le match.'); sendInput();
      }
      update();
    },
    onMessage: message => { if (room === candidate) onMessage(message); },
    onDisconnect: message => {
      if (room !== candidate) return;
      restoringSettings = false; clearTimeout(recoveryTimer);
      busy = false; clearInput(); remoteInput = 0;
      if (started) { pauseFlags = [true, true]; paused = true; audio.stopAll(); }
      roomStatus('Votre adversaire est déconnecté. La salle reste ouverte : il peut revenir avec le même code.', true);
      $('#room-details').hidden = false; $('#room-actions').hidden = true;
      setupStep = 'players'; if (started) settingsOpen = true;
      update();
    },
    onError: message => {
      if (room !== candidate) return;
      restoringSettings = false; clearTimeout(recoveryTimer);
      busy = false; roomStatus(message, true);
      const failedJoin = !candidate.hasConnected && (candidate.role === 'guest' || candidate.returningHost);
      if (failedJoin || !candidate.code || candidate.closed) { $('#room-details').hidden = true; $('#room-actions').hidden = false; if (!started) setupStep = 'room'; }
      update();
    },
  });
  room = candidate; frameSequence = 0; matchId = 0; inputSequence = 0;
  roomStatus(create ? 'Création de la salle…' : 'Connexion à la salle…'); update(); audio.unlock();
  try {
    if (create) await candidate.create(); else await candidate.join(code);
    if (room !== candidate || candidate.closed) return;
    role = candidate.role;
    if (create) {
      busy = false; $('#room-code').textContent = candidate.code; $('#room-details').hidden = false; $('#room-actions').hidden = true;
      if (!candidate.connected) roomStatus('Salle créée. Partagez le code ou le lien avec votre adversaire.');
    }
  } catch (error) {
    if (room !== candidate) return;
    candidate.close(); busy = false; role = null; setupStep = 'room';
    roomStatus(error.message || 'Impossible de créer la connexion. Réessayez.', true);
    $('#room-actions').hidden = false; $('#room-details').hidden = true;
  }
  if (room === candidate) update();
}
async function copyRoom(link) {
  if (!room?.code) return;
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', room.code);
  try { await navigator.clipboard.writeText(link ? url.href : room.code); roomStatus(link ? 'Lien copié. Envoyez-le à votre adversaire.' : 'Code copié. Envoyez-le à votre adversaire.'); }
  catch { roomStatus(`Copie indisponible. Votre code : ${room.code}.`); }
}

for (const id of ['start', 'again', 'restart']) $('#' + id).addEventListener('click', reset);
$('#play-local').addEventListener('click', () => selectMode('local'));
$('#play-online').addEventListener('click', () => selectMode('online'));
$('#create-room').addEventListener('click', () => connectRoom(true));
$('#join-form').addEventListener('submit', event => { event.preventDefault(); connectRoom(false); });
$('#leave-room').addEventListener('click', leaveRoom);
$('#copy-code').addEventListener('click', () => copyRoom(false)); $('#copy-link').addEventListener('click', () => copyRoom(true));
$('#copy-diagnostic').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#network-report').textContent); $('#diagnostic-copy-status').textContent = ' Diagnostic copié.'; }
  catch { $('#diagnostic-copy-status').textContent = ' Sélectionnez le texte ci-dessus pour le copier.'; }
});
$('#target-score').addEventListener('input', () => { if (validTarget()) lastValidTarget = targetScore(); update(); broadcast(); });
$('#bonuses').addEventListener('change', () => { update(); broadcast(); });
$('#pitch').addEventListener('change', () => { update(); broadcast(); });
for (const [buttonId, selectId] of randomChoices) $('#' + buttonId).addEventListener('click', () => {
  const select = $('#' + selectId);
  if (select.disabled) return;
  const choices = [...select.options].filter(option => !option.disabled && option.value !== select.value);
  if (!choices.length) return;
  select.value = choices[Math.floor(Math.random() * choices.length)].value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
$('#balance').addEventListener('input', () => { applyAssists(); update(); broadcast(); });
function closeSettings() {
  settingsOpen = false; update(); canvas.focus({ preventScroll: true });
}
$('#play-view').addEventListener('click', () => {
  if (started) { pause(); settingsOpen = true; update(); $('#close-settings').focus({ preventScroll: true }); }
});
$('#close-settings').addEventListener('click', closeSettings);
function navigateSetup(direction) {
  if (mode === 'online' && role === 'guest' && room?.connected) return;
  const index = PREPARATION_STEPS.indexOf(setupStep);
  if (direction > 0 && index >= 0 && index < 2) setupStep = PREPARATION_STEPS[index + 1];
  else if (direction < 0 && index > 0) setupStep = PREPARATION_STEPS[index - 1];
  else if (direction < 0 && setupStep === 'players' && mode === 'online') { leaveRoom(); setupStep = 'room'; }
  else if (direction < 0) setupStep = 'home';
  update(); broadcast(); $('#setup-panel').scrollTop = 0;
}
$('#setup-next').addEventListener('click', () => navigateSetup(1));
$('#setup-back').addEventListener('click', () => navigateSetup(-1));
$('#pause').addEventListener('click', () => pause(!pauseFlags[ownSide()]));
$('#resume').addEventListener('click', () => { pause(false); if (mode === 'local') canvas.focus({ preventScroll: true }); });
for (const [side, id] of ['skin-left', 'skin-right'].entries()) $('#' + id).addEventListener('change', () => {
  if (mode === 'local' || (role === 'host' && side === 0)) { broadcast(); }
  else if (role === 'guest' && side === 1) sendInput();
  update();
});
$('#sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled; $('#sound').textContent = soundEnabled ? '♫' : '∅';
  $('#sound').setAttribute('aria-label', soundEnabled ? 'Couper le son' : 'Activer le son');
  $('#sound').title = soundEnabled ? 'Couper le son' : 'Activer le son';
  $('#sound').setAttribute('aria-pressed', String(soundEnabled)); audio.unlock(); music();
  if (started && !paused) canvas.focus({ preventScroll: true });
});
window.addEventListener('keydown', event => {
  if (['SELECT', 'INPUT', 'BUTTON'].includes(event.target.tagName) && event.code !== 'Escape') return;
  if (event.code === 'Escape' && settingsOpen) { event.preventDefault(); closeSettings(); return; }
  if (event.code === 'Escape') { if (started) { event.preventDefault(); pause(!pauseFlags[ownSide()]); } return; }
  if (bindings[event.code] && started && !paused && engine().game_value(0) !== 3 && (mode === 'local' || room?.connected)) {
    event.preventDefault(); keys.add(event.code); sendInput();
  }
});
window.addEventListener('keyup', event => { keys.delete(event.code); sendInput(); });
window.addEventListener('blur', () => { clearInput(); sendInput(); pause(); });
function suspendPage() { clearInput(); sendInput(); pause(); room?.suspend(); }
function resumePage() { room?.resume(); last = 0; accumulator = 0; }
// Mobile browsers can suspend this page while the invitation is shared in another app.
window.addEventListener('pagehide', event => { if (event.persisted) suspendPage(); else room?.close(); });
window.addEventListener('pageshow', resumePage);
window.addEventListener('online', resumePage);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendPage(); else resumePage(); });
setInterval(sendInput, 50);

function renderState() {
  const e = engine(), state = { started, paused, skins: skins(), modernPlayers: true, blueprintFrame: started ? e?.game_value(15) : +$('#pitch').value }; if (!e) return state;
  state.goalFrames = [8, 9].map(f => e.game_value(f) === 140 ? 2 : e.game_value(f) === 60 ? 3 : 1);
  state.players = [0, 1].map(s => Object.fromEntries(['speed', 'jump', 'freeze', 'broken', 'bombed', 'scale'].map((name, f) => [name, e.game_player_value(s, f)])));
  state.powerups = Array.from({ length: e.game_pickup_count() }, (_, i) => ({ kind: e.game_pickup_value(i, 0), x: e.game_pickup_value(i, 1), y: e.game_pickup_value(i, 2), ttl: e.game_pickup_value(i, 3) }));
  state.bombs = Array.from({ length: e.game_bomb_count() }, (_, i) => ({ x: e.game_bomb_value(i, 0), y: e.game_bomb_value(i, 1) }));
  state.effects = Array.from({ length: e.game_effect_count() }, (_, i) => {
    const kind = e.game_effect_value(i, 0), age = e.game_effect_value(i, 3), w = e.game_effect_value(i, 4), h = e.game_effect_value(i, 5);
    return { kind: effectNames[kind], x: e.game_effect_value(i, 1), y: e.game_effect_value(i, 2), age, width: kind === 4 ? 10 + age / 2 : w, height: kind === 4 ? 10 + age / 2 : h, alpha: kind === 4 ? Math.max(0, (1 - age / 10) * .6) : kind === 5 ? Math.max(0, 1 - age / 7) : 1 };
  });
  state.ballBounce = e.game_value(13); state.ballFrame = state.ballBounce === 0 ? 3 : state.ballBounce === 2 ? 2 : 1;
  return state;
}
function update() {
  const e = engine(), state = snapshot(), phase = state.phase;
  const names = ['Bleu', 'Rouge'];
  document.body.classList.toggle('touch-device', hasTouch());
  $('#play-view').disabled = !started;
  $('#play-view').setAttribute('aria-expanded', String(!started || settingsOpen));
  $('#close-settings').hidden = !started;
  $('#touch-controls').hidden = !started;
  touch.update({ mode, side: ownSide(), names, enabled: started && !paused && phase !== 3 && (mode === 'local' || !!room?.connected) });
  const teamNames = names.map((name, side) => `${name}${state.assists[side] ? ' +' + state.assists[side] * 10 + '%' : ''}`);
  $('.team.blue span').textContent = teamNames[0]; $('.team.red span').textContent = teamNames[1];
  $('.team.blue span').title = names[0]; $('.team.red span').title = names[1];
  $('#score-left').textContent = state.score[0] ?? 0; $('#score-right').textContent = state.score[1] ?? 0;
  const notice = e?.game_value(11) > 0 ? bonusNames[e.game_value(10)] : '';
  $('#bonus-notice').textContent = notice; $('#bonus-notice').hidden = !notice;
  $('#welcome').hidden = started && !settingsOpen; $('#finished').hidden = !started || phase !== 3 || settingsOpen; $('#paused').hidden = !started || !paused || phase === 3 || settingsOpen;
  $('#start').disabled = !canStart();
  $('#start').textContent = !core ? 'Chargement…' : mode === 'local' ? 'Commencer' : room?.connected ? 'Lancer le match' : 'En attente d’un adversaire';
  $('#welcome-title').textContent = mode === 'local' ? 'À vous de jouer.' : room?.connected ? 'Vous êtes deux !' : 'Invitez un adversaire.';
  $('#welcome-detail').textContent = mode === 'local' ? 'Marquez plus de buts que votre adversaire. Jouez à deux avec les commandes tactiles ou le clavier.'
    : room?.connected ? role === 'host' ? 'Vous jouez Bleu. Votre adversaire joue Rouge. Lancez le match quand vous êtes prêts.' : 'Vous jouez Rouge. Le créateur de la salle va lancer le match.'
      : 'Créez une salle, partagez son code et retrouvez-vous sur le terrain.';
  $('#pause').disabled = !started || phase === 3 || (mode === 'online' && !room?.connected);
  const pauseLabel = pauseFlags[ownSide()] ? 'Reprendre' : 'Pause';
  $('#pause').textContent = pauseFlags[ownSide()] ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', pauseLabel); $('#pause').title = pauseLabel;
  const mayResume = mode === 'local' || (!!room?.connected && pauseFlags[ownSide()]);
  $('#resume').disabled = !mayResume; $('#resume').textContent = mayResume ? 'Reprendre' : 'Adversaire en pause';
  $('#pause-detail').textContent = mode === 'local' ? 'Le temps vous attend.' : !room?.connected ? 'Votre adversaire est déconnecté. Il peut revenir avec le même code.'
    : pauseFlags[ownSide()] ? 'Vous avez mis le match en pause. Chaque joueur doit reprendre pour continuer.' : 'Votre adversaire a mis le match en pause.';
  $('#restart').hidden = mode === 'online'; $('#restart').disabled = !started;
  $('#again').disabled = !canStart(); $('#again').textContent = mode === 'online' && role === 'guest' ? 'Le créateur peut relancer'
    : 'Rejouer';
  $('#create-room').disabled = !core || busy; $('#join-room').disabled = !core || busy;
  $('#bonuses').disabled = mode === 'online' && (role === 'guest' || started);
  const settingsLocked = (started && phase !== 3) || (mode === 'online' && role === 'guest');
  for (const id of ['target-score', 'pitch', 'balance']) $('#' + id).disabled = !!settingsLocked;
  const balance = +$('#balance').value;
  $('#balance-status').textContent = balanceLabel(balance);
  $('#balance').setAttribute('aria-valuetext', balanceLabel(balance));
  $('#balance').style.accentColor = balance < 0 ? '#286bbe' : balance > 0 ? '#c14d51' : '#526c81';
  updateSelectionPreviews(state.pitch, skins());
  $('#settings-legend').textContent = 'Votre partie';
  renderSetup({ screen: setupStep, mode, role, started, ready: !!core, busy, connected: !!room?.connected });
  for (const side of [0, 1]) {
    $('#' + ['skin-left', 'skin-right'][side]).disabled = (mode === 'online' && (role === null || side !== ownSide()));
    $('.control-side.' + (side === 0 ? 'blue' : 'red')).dataset.own = String(mode === 'online' && role !== null && side === ownSide());
  }
  for (const [buttonId, selectId] of randomChoices) $('#' + buttonId).disabled = $('#' + selectId).disabled;
  $('#status').textContent = mode === 'online' && !room?.connected ? 'Salle privée · En attente d’un adversaire'
    : !started ? 'Choisissez vos joueurs et votre terrain' : phase === 0 ? 'Préparez-vous…' : phase === 2 ? `But pour ${names[e.game_value(5)]} !`
      : phase === 3 ? 'Match terminé' : mode === 'online' ? `Duel à distance · Vous jouez ${role === 'host' ? 'Bleu' : 'Rouge'}` : 'Duel local · À vous de jouer';
  if (started && phase === 3) {
    const [a, b] = state.score; $('#result').textContent = `${names[a > b ? 0 : 1]} remporte le match !`;
    $('#final-score').textContent = `${names[0]} ${a} — ${b} ${names[1]}`;
    if (phase !== previousPhase) { clearInput(); audio.stopAll(); }
  }
  previousPhase = phase;
}
function animate(time) {
  const elapsed = last ? Math.min(time - last, 250) : 0; last = time;
  if (core && started && !paused && engine().game_value(0) !== 3 && (mode === 'local' || (role === 'host' && room?.connected))) {
    accumulator += elapsed;
    while (accumulator >= 1000 / 30) {
      const mask = mode === 'local' ? input() : input() | ((performance.now() - lastInputAt < 350 ? remoteInput : 0) << 4);
      core.game_tick(mask); playSounds(core.game_value(7)); accumulator -= 1000 / 30; broadcast();
    }
    update();
  }
  if (role === 'host' && performance.now() - lastBroadcast > 200) broadcast();
  drawGame(ctx, engine(), renderState()); requestAnimationFrame(animate);
}
window.sportheads = { snapshot, renderState, get engine() { return engine(); }, render() { update(); drawGame(ctx, engine(), renderState()); } };
try {
  const response = await fetch('./physics-core.wasm'); if (!response.ok) throw new Error('Chargement du moteur impossible.');
  const [wasm] = await Promise.all([WebAssembly.instantiateStreaming(response), loadAssets()]);
  core = wasm.instance.exports; core.game_reset(1); window.ready = true;
  const code = normalizeCode(new URL(location.href).searchParams.get('room') || '');
  if (validCode(code)) { selectMode('online'); $('#join-code').value = code; roomStatus('Code reçu. Cliquez sur Rejoindre pour entrer dans la salle.'); }
  update();
} catch (error) {
  $('#start').textContent = 'Recharger la page'; $('#start').disabled = false; $('#start').addEventListener('click', () => location.reload());
  $('#status').textContent = 'Le jeu n’a pas pu se charger. Rechargez la page pour réessayer.'; window.loadError = error.message;
}
layoutArena($('.field-wrap'), $('#game-surface'), $('#touch-controls'));
requestAnimationFrame(animate);
