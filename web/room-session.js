import { PHASE, MATCH, isBonusPitch, decodeFrame, encodeFrame } from './engine-contract.js';
import { Room, normalizeCode, validCode, CODE_HELP } from './rooms.js';
import { captureState, createRemoteEngine } from './net-state.js';
import { createRemoteView } from './net-render.js';
import { createOwnPrediction } from './net-predict.js';
import { availablePitches } from './selection.js';
import { PLAYER_COUNT } from './players.js';
import { createBalance, validBalance } from './balance.js';
import { validSetupStep } from './setup-ui.js';
import { bonusModeFromMessage, BONUS_V2_VERSION } from './bonuses.js';
import { connectionPath } from './analytics.js';

// Connection ownership, ordering, recovery and legacy compatibility live here.
export function createRoomSession({ app, getCore, skins, bonusMode, targetScore, validTarget, clearMatch, clearInput, update, music, pause, applyPause, canvas, touch, input, playSounds, audio, track = () => {} }) {
 const $ = selector => document.querySelector(selector);
 const prediction = createOwnPrediction();
 let room = null, remote = createRemoteEngine(), remoteView = createRemoteView(remote.engine, undefined, prediction);
 let lastBroadcast = 0, frameSequence = 0, receivedSequence = -1, inputSequence = 0, receivedInput = -1;
 let remoteInput = 0, lastInputAt = 0, soundTick = -1, soundMatch = -1;
 let remoteJumpPending = false, receivedJump = null, sentJump = null, recoveryTimer;
 const pitchGeometry = 'balanced-v1';
 const engine = () => remote.engine;
function refreshDiagnostic() {
  if (room) $('#network-report').textContent = JSON.stringify(room.diagnostic(), null, 2);
}

function roomStatus(message, error = false) {
  app.dispatch({ type: 'room.notice', message, error });
  $('#room-status').textContent = message;$('#room-status').classList.toggle('error', error);
  $('#network-diagnostic').hidden = !room;
  if (room && (error || $('#network-diagnostic').open)) refreshDiagnostic();
}

function sendInput() {
  if (!room || app.value.mode !== 'online' || app.value.role !== 'guest' || !app.value.connected) return;
  const jump = touch.jumpSequence;
  // The legacy mask keeps older hosts working. New hosts apply only held
  // controls plus a single tick per gesture counter, even if packets repeat.
  const heldMask = app.value.paused ? 0 : input('held');
  if (room.send({ type: 'input', sequence: ++inputSequence, mask: app.value.paused ? 0 : input('legacy'), heldMask, jump,
    skin: app.value.config.skins[1], pitchGeometry, statBuffs: 1, bonusV2: BONUS_V2_VERSION, bonusPitches: 1 }, { volatile: app.value.started && !app.value.paused && jump === sentJump })) {
    sentJump = jump;touch.consumeJumps();prediction.sent(inputSequence, heldMask, jump);
  }
}

function broadcast() {
  const core = getCore();
  if (!room || app.value.mode !== 'online' || app.value.role !== 'host' || !app.value.connected) return;
  const frame = decodeFrame(captureState(core, skins()));
  if (!app.value.started) {
    frame.match.targetScore = validTarget() ? targetScore() : app.value.lastValidTarget;
    frame.match.pitch = app.value.config.pitch; frame.buffs = app.value.config.balance.buffs;
    frame.bonus.mode = bonusMode();
  }
  // Older guests can keep reading the lobby while asking them to refresh.
  // Starting a bonus pitch remains blocked until the capability is advertised.
  if (!app.value.guestBonusPitches && isBonusPitch(frame.match.pitch)) frame.match.pitch = 8;
  const packet = encodeFrame(frame);
  if (!app.value.guestStatBuffs) delete packet.buffs;
  if (!app.value.guestBonusV2) delete packet.bonus;
  // ack: the newest guest input already applied, so the guest can predict the rest.
  room.send({ type: 'frame', sequence: ++frameSequence, ack: receivedInput, matchId: app.value.matchId, started: app.value.started,
    bonuses: bonusMode() !== 0, bonusMode: bonusMode(), setupStep: validSetupStep(app.value.setupStep) ? app.value.setupStep : 'players',
    pauseFlags: [...app.value.pauseFlags], pitchGeometry, bonusPitches: app.value.config.bonusPitches, balancePreset: app.value.config.balance.preset,
    balanceAmount: app.value.config.balance.amount, state: packet },
    { volatile: app.value.started && !app.value.paused && frame.match.phase === PHASE.playing });
  lastBroadcast = performance.now();
}

function onMessage(message) {
  const core = getCore();
  if (app.value.role === 'host') {
    if (message.type === 'room-settings' && app.value.restoringSettings &&
    Array.isArray(message.skins) && message.skins.length === 2 && message.skins.every((skin) => Number.isInteger(skin) && skin >= 1 && skin <= PLAYER_COUNT) &&
    (message.bonusPitches === undefined || typeof message.bonusPitches === 'boolean') &&
    availablePitches(message.bonusPitches === true).some((pitch) => pitch.id === message.pitch) &&
    Number.isInteger(message.targetScore) && message.targetScore >= 1 && message.targetScore <= 99 &&
    validBalance(message.balance) && bonusModeFromMessage(message) !== null) {
      app.dispatch({ type: 'connection.changed', restoringSettings: false, busy: false }); clearTimeout(recoveryTimer);
      room.returningHost = false;
      app.dispatch({ type: 'configuration.changed', patch: { skins: message.skins, pitch: message.pitch, bonusPitches: message.bonusPitches ?? false, targetScore: Math.min(9, message.targetScore), balance: message.balance, bonusMode: bonusModeFromMessage(message) } });
      clearMatch();app.dispatch({ type: "preparation.changed", setupStep: 'players' });
      roomStatus('Salle retrouvée. Vous êtes Bleu. Vos réglages sont conservés : préparez le prochain match.');
      update();broadcast();return;
    }
    if (message.type === 'input' && Number.isSafeInteger(message.sequence) && message.sequence > receivedInput &&
    Number.isInteger(message.mask) && message.mask >= 0 && message.mask <= 15 && (
    message.heldMask === undefined || Number.isInteger(message.heldMask) && message.heldMask >= 0 && message.heldMask <= 15 && Number.isSafeInteger(message.jump) && message.jump >= 0) &&
    Number.isInteger(message.skin) && message.skin >= 1 && message.skin <= PLAYER_COUNT) {
      receivedInput = message.sequence;remoteInput = message.heldMask ?? message.mask;lastInputAt = performance.now();
      if (message.heldMask !== undefined) {
        if (receivedJump !== null && message.jump > receivedJump && app.value.started && !app.value.paused && core.game_value(MATCH.phase) === PHASE.playing) remoteJumpPending = true;
        receivedJump = Math.max(receivedJump ?? 0, message.jump);
      }
      const supportsBalanced = message.pitchGeometry === pitchGeometry;
      const supportsBuffs = message.statBuffs === 1,supportsV2 = message.bonusV2 === BONUS_V2_VERSION, supportsBonusPitches = message.bonusPitches === 1;
      const changed = app.value.config.skins[1] !== message.skin || app.value.guestBalancedPitches !== supportsBalanced || app.value.guestStatBuffs !== supportsBuffs || app.value.guestBonusV2 !== supportsV2 || app.value.guestBonusPitches !== supportsBonusPitches;
      if (changed) {
        app.dispatch({ type: 'capabilities.changed', guestBalancedPitches: supportsBalanced, guestStatBuffs: supportsBuffs, guestBonusV2: supportsV2, guestBonusPitches: supportsBonusPitches });
        const nextSkins = skins(); nextSkins[1] = message.skin; app.dispatch({ type: 'configuration.changed', patch: { skins: nextSkins } });
        update();
      }
    } else if (message.type === 'pause' && typeof message.value === 'boolean' && app.value.started && core.game_value(MATCH.phase) !== PHASE.finished) {
      applyPause(1, message.value);broadcast();
    }
    return;
  }
  if (app.value.role !== 'guest' || message.type !== 'frame' || !Number.isSafeInteger(message.sequence) || message.sequence <= receivedSequence ||
  !Number.isSafeInteger(message.matchId) || message.matchId < app.value.matchId || typeof message.started !== 'boolean' || bonusModeFromMessage(message) === null ||
  (message.bonusPitches !== undefined && typeof message.bonusPitches !== 'boolean') ||
  (isBonusPitch(message.state?.values?.[MATCH.pitch]) && message.bonusPitches !== true) ||
  !validSetupStep(message.setupStep) ||
  !Array.isArray(message.pauseFlags) || message.pauseFlags.length !== 2 || !message.pauseFlags.every((v) => typeof v === 'boolean') ||
  message.state?.buffs && !validBalance({ preset: message.balancePreset, amount: message.balanceAmount, buffs: message.state.buffs }) ||
  !remote.update(message.state)) return;
  const received = remote.readFrame();
  const newMatch = message.matchId !== app.value.matchId || app.value.started !== message.started;
  const oldPaused = app.value.paused;
  receivedSequence = message.sequence;
  app.dispatch({ type: 'remote.frame', matchId: message.matchId, started: message.started, pauseFlags: message.pauseFlags,
    setupStep: message.setupStep, balancedPitches: message.pitchGeometry === pitchGeometry, newMatch,
    config: { skins: [received.skins[0], skins()[1]], pitch: received.match.pitch, bonusPitches: message.bonusPitches ?? false, targetScore: received.match.targetScore,
      bonusMode: bonusModeFromMessage(message), balance: received.buffs ? { preset: message.balancePreset, amount: message.balanceAmount, buffs: received.buffs } : createBalance() } });
  prediction.frame(remote.engine, message.ack, received.buffs, app.value.started && !app.value.paused && received.match.phase === PHASE.playing);
  remoteView.update({ active: app.value.started && !app.value.paused && received.match.phase === PHASE.playing,
    key: `${app.value.matchId}:${app.value.started}:${received.match.phase}:${received.match.pitch}` });
  if (newMatch) {if (app.value.started) app.dispatch({ type: 'settings.closed' });clearInput();music();if (app.value.started && document.hidden) pause(true);else if (app.value.started) canvas.focus({ preventScroll: true });}
  if (oldPaused !== app.value.paused) {clearInput();music();if (!app.value.paused) canvas.focus({ preventScroll: true });}
  if (app.value.started && !app.value.paused && (soundTick !== engine().game_value(MATCH.tick) || soundMatch !== app.value.matchId)) {
    soundTick = engine().game_value(MATCH.tick);soundMatch = app.value.matchId;playSounds(engine().game_value(MATCH.sounds));
  }
  update();
}

async function connectRoom(create) {
  const core = getCore();
  if (!core || app.value.busy) return;
  const code = normalizeCode(app.value.joinCode);
  if (!create && !validCode(code)) {roomStatus(CODE_HELP, true);$('#join-code').focus();return;}
  app.dispatch({ type: "connection.changed", restoringSettings: false });clearTimeout(recoveryTimer);
  room?.close(); clearMatch(); app.dispatch({ type: 'room.connecting', create });
  const candidate = new Room({
    onReady: () => {
      if (room !== candidate) return;
      app.dispatch({ type: 'connection.changed', role: candidate.role, connected: candidate.connected, code: candidate.code });
      remoteInput = 0;receivedInput = -1;receivedJump = null;sentJump = null;app.dispatch({ type: "connection.changed", busy: false });
      // The selected ICE pair is known a moment after the channel opens.
      setTimeout(() => { if (room === candidate) track('online_connected', { role: candidate.role, resumed: !!candidate.resumed, path: connectionPath(candidate.diagnostic()) }); }, 3000);
      roomStatus(app.value.role === 'host' ? 'Votre adversaire est là. Vous êtes Bleu : lancez le match quand vous êtes prêts.' : 'Vous êtes Rouge. Le créateur de la salle va lancer le match.');
      $('#room-details').hidden = false;$('#room-actions').hidden = true;$('#room-code').textContent = candidate.code;
      if (app.value.role === 'host' && candidate.returningHost) {
        app.dispatch({ type: "connection.changed", restoringSettings: true });app.dispatch({ type: "connection.changed", busy: true });app.dispatch({ type: "preparation.changed", setupStep: 'players' });
        roomStatus('Salle retrouvée. Récupération des réglages auprès de votre adversaire…');
        recoveryTimer = setTimeout(() => {
          if (room === candidate && app.value.restoringSettings) candidate.fail('Impossible de récupérer les réglages. Rejoignez à nouveau avec le même code.');
        }, 10000);
      } else if (candidate.resumed) {
        // Same pages on both ends: keep the match, paused by the drop, and let each player resume it.
        if (app.value.started) app.dispatch({ type: 'settings.closed' });
        roomStatus(app.value.started ? 'Connexion rétablie. Reprenez le match quand vous êtes prêts.' : 'Connexion rétablie.');
        if (app.value.role === 'host') broadcast(); else sendInput();
      } else if (app.value.role === 'host') {
        const wasPlaying = app.value.started;clearMatch();if (wasPlaying) app.dispatch({ type: "preparation.changed", setupStep: 'players' });broadcast();
      } else {
        // A creator returning from a fresh page has no simulation to resume.
        // Keep the last settings here until it receives them, then start in the lobby.
        receivedSequence = -1;app.dispatch({ type: 'connection.match-reset' });app.dispatch({ type: "preparation.changed", setupStep: 'players' });
        candidate.send({ type: 'room-settings', skins: skins(), pitch: app.value.config.pitch, bonusPitches: app.value.config.bonusPitches,
          targetScore: targetScore(), balance: app.value.config.balance, bonuses: bonusMode() !== 0, bonusMode: bonusMode() });
        roomStatus('Vous êtes Rouge. Le créateur peut préparer et lancer le match.');sendInput();
      }
      update();
    },
    onMessage: (message) => {if (room === candidate) onMessage(message);},
    onRedialFailed: () => {if (room === candidate) roomStatus('La connexion n’a pas pu être rétablie. Rejoignez la salle avec le même code.', true);},
    onDisconnect: () => {
      if (room !== candidate) return;
      clearTimeout(recoveryTimer); app.dispatch({ type: 'room.disconnected' });
      clearInput(); remoteInput = 0; if (app.value.started) audio.stopAll();
      roomStatus(candidate.role === 'guest' ? 'Vous êtes déconnecté du créateur. Reconnexion automatique… La salle reste ouverte avec le même code.'
        : 'Votre adversaire est déconnecté. Le match reprendra à son retour ; la salle reste ouverte avec le même code.', true);
      $('#room-details').hidden = false;$('#room-actions').hidden = true;
      update();
    },
    onError: (message) => {
      if (room !== candidate) return;
      app.dispatch({ type: "connection.changed", restoringSettings: false });clearTimeout(recoveryTimer);
      app.dispatch({ type: 'connection.changed', busy: false, connected: candidate.connected }); roomStatus(message, true);
      track('online_failed', { role: candidate.role, connected_before: candidate.hasConnected, reason: message, path: connectionPath(candidate.diagnostic()) });
      const failedJoin = !candidate.hasConnected && (candidate.role === 'guest' || candidate.returningHost);
      if (failedJoin || !candidate.code || candidate.closed) {$('#room-details').hidden = true;$('#room-actions').hidden = false;if (!app.value.started) app.dispatch({ type: "preparation.changed", setupStep: 'room' });}
      update();
    }
  });
  room = candidate;frameSequence = 0;inputSequence = 0;
  roomStatus(create ? 'Création de la salle…' : 'Connexion à la salle…');update();audio.unlock();
  try {
    if (create) await candidate.create();else await candidate.join(code);
    if (room !== candidate || candidate.closed) return;
    app.dispatch({ type: 'connection.changed', role: candidate.role, connected: candidate.connected, code: candidate.code });
    if (create) {
      track('room_created');
      app.dispatch({ type: "connection.changed", busy: false });$('#room-code').textContent = candidate.code;$('#room-details').hidden = false;$('#room-actions').hidden = true;
      if (!candidate.connected) roomStatus('Salle créée. Partagez le code ou le lien avec votre adversaire.');
    }
  } catch (error) {
    if (room !== candidate) return;
    candidate.close();app.dispatch({ type: "connection.changed", busy: false });app.dispatch({ type: "connection.changed", role: null });app.dispatch({ type: "preparation.changed", setupStep: 'room' });
    roomStatus(error.message || 'Impossible de créer la connexion. Réessayez.', true);
    track('online_failed', { role: create ? 'host' : 'guest', connected_before: false, reason: error.message || 'unknown', path: 'unknown' });
    $('#room-actions').hidden = false;$('#room-details').hidden = true;
  }
  if (room === candidate) update();
}

async function copyRoom(link) {
  if (!room?.code) return;
  const url = new URL(location.href);url.search = '';url.hash = '';url.searchParams.set('room', room.code);
  try {await navigator.clipboard.writeText(link ? url.href : room.code);roomStatus(link ? 'Lien copié. Envoyez-le à votre adversaire.' : 'Code copié. Envoyez-le à votre adversaire.');}
  catch {roomStatus(`Copie indisponible. Votre code : ${room.code}.`);}
}
 return Object.freeze({
  connect: connectRoom, sendInput, broadcast, copy: copyRoom, status: roomStatus, refreshDiagnostic,
  send: message => room?.send(message), suspend: () => room?.suspend(), resume: () => room?.resume(),
  close() {
    // Closing a page can still emit keyup/blur; clear ownership before the
    // transport disappears so those events cannot send through a stale room.
    app.dispatch({ type: 'connection.changed', connected: false, busy: false, restoringSettings: false });
    clearTimeout(recoveryTimer); room?.close(); room = null;
  },
  clearInput() { remoteJumpPending = false; },
  resetMatch() { remoteInput = 0; receivedSequence = receivedInput = -1; remoteJumpPending = false; remote = createRemoteEngine(); prediction.reset(); remoteView = createRemoteView(remote.engine, undefined, prediction); },
  inputMask() { return (performance.now() - lastInputAt < 350 ? remoteInput | (remoteJumpPending ? 4 : 0) : 0) << 4; },
  consumedInput() { remoteJumpPending = false; },
  heartbeat() { if (app.value.role === 'host' && performance.now() - lastBroadcast > 200) broadcast(); },
  advance: time => remoteView.advance(time),
  get engine() { return remote.engine; }, get viewEngine() { return remoteView.engine; },
 });
}
