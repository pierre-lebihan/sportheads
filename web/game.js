import { readRenderState } from './engine-view.js';
import { setupPerformancePanel } from './performance-ui.js';
import { assetStats } from './assets.js';
import { createRoomSession } from './room-session.js';
import { createPlannerService } from './planner.js';
import { createPerformanceMonitor } from './performance.js';
import { createFixedStepper } from './fixed-step.js';
import { createFramePacer } from './frame-pacing.js';
import { createTickBlend } from './tick-blend.js';
import { createGameUI } from './game-ui.js';
import { createAppStore } from './app-state.js';
import { PHASE, MATCH, TICK_MS, readMatch } from "./engine-contract.js";
import { loadAssets, prepareMatchAssets, matchAssetsReady, drawGame, drawBonusPickup, createAudio } from './render.js';
import './vendor/peerjs-1.5.5.min.js';
import { normalizeCode, validCode } from "./rooms.js";

import { createCharacterSelection } from "./selection.js";
import { syncSkinOptions } from './roster-access.js';
import { isBonusPitch } from './engine-contract.js';
import { BALANCED_PITCHES } from './pitch-geometry.js';

import { createBalanceControls } from './balance-ui.js';

import { layoutArena, setupFullscreen } from './arena-ui.js';
import { createTouchControls } from './touch-controls.js';
import { AI_LEVELS, createOpponent } from './opponent.js';
import { BONUS_NAMES, NEW_BONUSES } from "./bonuses.js";
import { createAnalytics, createMatchTracker } from './analytics.js';

const app = createAppStore(), monitor = createPerformanceMonitor(), clock = createFixedStepper(), pacer = createFramePacer();
const $ = (selector) => document.querySelector(selector);
const randomChoices = [['random-player-0', 'skin-left'], ['random-player-1', 'skin-right'], ['random-pitch', 'pitch']];
const canvas = $('#field'),ctx = canvas.getContext('2d'),keys = new Set(),audio = createAudio();
const bindings = { KeyA: 1, KeyQ: 1, KeyD: 2, KeyW: 4, KeyZ: 4, Space: 8, ArrowLeft: 16, ArrowRight: 32, ArrowUp: 64, KeyP: 128 };
for (const bonus of NEW_BONUSES) {
  const row = document.createElement('li'),title = document.createElement('strong'),detail = document.createElement('span');
  title.textContent = BONUS_NAMES[bonus.id];detail.textContent = bonus.detail;
  const icon = document.createElement('canvas');icon.width = 76;icon.height = 40;icon.setAttribute('aria-hidden', 'true');
  drawBonusPickup(icon.getContext('2d'), bonus.id, bonus.redId ? 19 : 38, 20, .5);
  if (bonus.redId) drawBonusPickup(icon.getContext('2d'), bonus.redId, 57, 20, .5);
  row.append(icon, title, detail);$('#v2-bonus-list').append(row);
}
let planner;
let core, network, blend;

let opponent = null;
// Started once the game has loaded, so statistics never delay the first match.
let analytics = { track() {} };
const track = (event, properties) => analytics.track(event, properties);
const observeMatch = createMatchTracker(track);

const hasTouch = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
const touch = createTouchControls($('#touch-controls'), sendInput, monitor.measure);
app.dispatch({ type: 'preferences.changed', touchLayout: touch.layout });
$('#touch-layout').value = app.value.touchLayout;
$('#touch-layout').addEventListener('change', () => {clearInput(); app.dispatch({ type: 'preferences.changed', touchLayout: $('#touch-layout').value }); touch.setLayout(app.value.touchLayout); update();});
function clearInput() {keys.clear();touch.clear();network?.clearInput();}
for (const level of AI_LEVELS) {
  const label = document.createElement('label'),radio = document.createElement('input');
  radio.type = 'radio';radio.name = 'ai-level';radio.value = level.id;radio.checked = level.id === 'normal';
  const text = document.createElement('span'),title = document.createElement('strong'),detail = document.createElement('small');
  title.textContent = level.label;detail.textContent = level.description;text.append(title, detail);label.append(radio, text);
  radio.addEventListener('change', () => { if (radio.disabled) return; app.dispatch({ type: 'configuration.changed', patch: { difficulty: radio.value } }); update(); });$('#ai-difficulty').append(label);
}
const difficulty = () => AI_LEVELS.find(level => level.id === app.value.config.difficulty);

for (const [id, selected] of [['skin-left', 1], ['skin-right', 2]]) {syncSkinOptions($('#' + id), [1, 2]);$('#' + id).value = selected;}
const characterSelection = createCharacterSelection($('#player-choice'));
const engine = () => app.value.mode === 'online' && app.value.role === 'guest' ? network.engine : core;
const renderEngine = () => app.value.mode === 'online' && app.value.role === 'guest' && app.value.started && !app.value.paused && app.value.connected && engine().game_value(MATCH.phase) === PHASE.playing ? network.viewEngine : engine();
const balancing = createBalanceControls($('#balance-controls'), balance => { app.dispatch({ type: 'configuration.changed', patch: { balance } }); applyBuffs(); update(); broadcast(); });
const applyBuffs = () => app.value.config.balance.buffs.forEach((stats, side) => core?.game_set_buffs(side, ...stats));
const skins = () => app.value.config.skins.slice();
const ownSide = () => app.value.role === 'guest' ? 1 : 0;
const bonusMode = () => app.value.config.bonusMode;
const targetScore = () => app.value.config.targetScore;
const validTarget = () => Number.isInteger(targetScore()) && targetScore() >= 1 && targetScore() <= 9;
const peerUpdateNeeded = () => app.value.mode === 'online' && app.value.role === 'host' && app.value.connected && (
isBonusPitch(app.value.config.pitch) && !app.value.guestBonusPitches || !!BALANCED_PITCHES[app.value.config.pitch] && !app.value.guestBalancedPitches || !app.value.guestStatBuffs || bonusMode() === 2 && !app.value.guestBonusV2);
const canStart = () => !!core && matchAssetsReady(bonusMode()) && !app.value.restoringSettings && validTarget() && !peerUpdateNeeded() && (app.value.mode !== 'online' || app.value.role === 'host' && app.value.connected);
function input(kind = 'pulse') {
  let mask = touch.mask(kind);
  for (const key of keys) {const bit = bindings[key] || 0;mask |= app.value.mode === 'local' || bit < 16 ? bit : bit >> 4;}
  return mask;
}
function snapshot() {
  const e = engine(), appState = app.value, match = e ? readMatch(e) : {};
  return { started: appState.started, paused: appState.paused, mode: appState.mode, role: appState.role,
    difficulty: appState.mode === 'ai' ? appState.config.difficulty : null, connected: appState.connected, code: appState.code,
    matchId: appState.matchId, setupStep: appState.setupStep, phase: match.phase,
    targetScore: appState.started ? match.targetScore : appState.config.targetScore,
    pitch: appState.started ? match.pitch : appState.config.pitch, bonusPitches: appState.config.bonusPitches, bonusMode: appState.config.bonusMode,
    balance: appState.config.balance, buffs: appState.config.balance.buffs,
    remainingTicks: match.remainingTicks, score: [match.blueScore, match.redScore], countdown: match.countdown, tick: match.tick };
}
function playSounds(mask) {
  if (!app.value.soundEnabled) return;
  for (const [bit, name] of [[1, 'kick'], [2, 'jump'], [4, 'die'], [8, 'whistle'], [16, 'pop'], [32, 'coin'], [64, 'explosion']]) if (mask & bit) audio.play(name, { volume: .5 });
  if (mask & 4) audio.play('cheer', { volume: .3 });
}
function music() {
  if (app.value.soundEnabled && app.value.started && !app.value.paused && engine().game_value(MATCH.phase) !== PHASE.finished) audio.play('music-match', { loop: true, volume: .14 });else
  audio.stopAll();
}

function pause(value = true) {
  if (!app.value.started || engine().game_value(MATCH.phase) === PHASE.finished) return;
  clearInput(); clock.reset();
  if (!value) canvas.focus({ preventScroll: true });
  if (app.value.mode === 'online' && app.value.role === 'guest') { network.send({ type: 'pause', value: !!value }); sendInput(); return; }
  applyPause(0, !!value); broadcast();
}
function applyPause(side, value) {
  const before = app.value.paused;
  app.dispatch({ type: 'match.pause', side, value });
  clearInput(); clock.reset();
  if (before !== app.value.paused) music();
  update();
}
function reset() {
  if (!canStart()) return;
  audio.unlock(); monitor.reset();
  if (app.value.mode === 'ai') planner.start(); else planner.stop();
  core.game_start_balanced_pitch(crypto.getRandomValues(new Uint32Array(1))[0], targetScore(), +(bonusMode() !== 0), app.value.config.pitch);
  core.game_set_bonus_mode(bonusMode()); applyBuffs();
  opponent = app.value.mode === 'ai' ? createOpponent({ difficulty: difficulty().id, seed: crypto.getRandomValues(new Uint32Array(1))[0], planner }) : null;
  app.dispatch({ type: 'match.started' });
   clearInput(); clock.reset();
  canvas.focus({ preventScroll: true }); music(); update(); broadcast();
}
function clearMatch() {
  app.dispatch({ type: 'match.cleared' }); opponent = null; planner?.stop(); monitor.reset();
  clearInput();  clock.reset();
  network?.resetMatch();
  audio.stopAll(); core?.game_reset(1); applyBuffs();
}
function leaveRoom() {
  network.close();
  app.dispatch({ type: 'room.left' }); clearMatch();
  $('#room-details').hidden = true; $('#room-actions').hidden = false;
  roomStatus('Créez une salle ou saisissez le code de votre adversaire.'); update();
}
function quitMatch() {
  if (!app.value.started) return;
  leaveRoom(); app.dispatch({ type: 'match.quit' });
  const url = new URL(location.href); url.searchParams.delete('room');
  history.replaceState(history.state, '', url);
  update(); $('#play-' + app.value.mode).focus({ preventScroll: true });
}
function selectMode(next) {
  leaveRoom(); app.dispatch({ type: 'mode.selected', mode: next }); track('mode_selected', { mode: next });
  $('#online-panel').hidden = next !== 'online'; $('#online-controls').hidden = next === 'local';
  for (const name of ['local', 'online', 'ai']) $('#play-' + name).setAttribute('aria-pressed', String(next === name));
  update();
}
function findMatch() { leaveRoom(); track('matchmaking_started'); network.findMatch(); update(); }
// The same button stops a search in progress.
function toggleMatchmaking() { if (app.value.matchmaking && app.value.busy) leaveRoom(); else findMatch(); }

for (const id of ['start', 'again', 'restart']) $('#' + id).addEventListener('click', reset);
$('#play-local').addEventListener('click', () => selectMode('local'));
$('#play-online').addEventListener('click', () => selectMode('online'));
$('#play-ai').addEventListener('click', () => selectMode('ai'));
$('#matchmaking-toggle').addEventListener('click', toggleMatchmaking);
$('#matchmaking-again').addEventListener('click', findMatch);
$('#join-code').addEventListener('input', () => { app.dispatch({ type: 'room.code-edited', value: $('#join-code').value }); });
$('#create-room').addEventListener('click', () => connectRoom(true));
$('#join-form').addEventListener('submit', event => { event.preventDefault(); app.dispatch({ type: 'room.code-edited', value: $('#join-code').value }); connectRoom(false); });
$('#leave-room').addEventListener('click', leaveRoom);
$('#reload-page').addEventListener('click', () => {
  const url = new URL(location.href);
  // A fresh document URL retrieves the latest HTML; its modules are revisioned.
  url.searchParams.set('_refresh', String(Date.now()));
  if (app.value.mode === 'online' && app.value.code) url.searchParams.set('room', app.value.code);
  location.replace(url.href);
});
for (const button of document.querySelectorAll('[data-quit-match]')) button.addEventListener('click', quitMatch);
$('#copy-code').addEventListener('click', () => copyRoom(false));$('#copy-link').addEventListener('click', () => copyRoom(true));
$('#network-diagnostic').addEventListener('toggle', () => {if ($('#network-diagnostic').open) refreshDiagnostic();});
$('#copy-diagnostic').addEventListener('click', async () => {
  refreshDiagnostic();
  try {await navigator.clipboard.writeText($('#network-report').textContent);$('#diagnostic-copy-status').textContent = ' Diagnostic copié.';}
  catch {$('#diagnostic-copy-status').textContent = ' Sélectionnez le texte ci-dessus pour le copier.';}
});
$('#target-score').addEventListener('input', () => { if ($('#target-score').disabled) return; app.dispatch({ type: 'configuration.changed', patch: { targetScore: +$('#target-score').value } }); update(); broadcast();});
for (const [id, delta] of [['goal-minus', -1], ['goal-plus', 1]]) $('#' + id).addEventListener('click', () => {
  if ($('#target-score').disabled) return;
  const next = Math.max(1, Math.min(9, targetScore() + delta));
  if (next === targetScore()) return;
  $('#target-score').value = next;$('#target-score').dispatchEvent(new Event('input', { bubbles: true }));
});
$('#bonuses').addEventListener('change', () => { if ($('#bonuses').disabled) return; app.dispatch({ type: 'configuration.changed', patch: { bonusMode: +$('#bonuses').value } }); update(); broadcast(); });
$('#bonus-pitches').addEventListener('change', () => { if ($('#bonus-pitches').disabled) return; app.dispatch({ type: 'configuration.changed', patch: { bonusPitches: $('#bonus-pitches').checked } }); update(); broadcast(); });
$('#pitch').addEventListener('change', () => { if ($('#pitch').disabled) return; app.dispatch({ type: 'configuration.changed', patch: { pitch: +$('#pitch').value } }); update(); broadcast(); });
for (const [buttonId, selectId] of randomChoices) $('#' + buttonId).addEventListener('click', () => {
  const select = $('#' + selectId);
  if (select.disabled) return;
  const choices = [...select.options].filter((option) => !option.disabled && option.value !== select.value);
  if (!choices.length) return;
  select.value = choices[Math.floor(Math.random() * choices.length)].value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
function closeSettings() {
  app.dispatch({ type: 'settings.closed' });update();canvas.focus({ preventScroll: true });
}
$('#play-view').addEventListener('click', () => {
  if (app.value.started) {pause();app.dispatch({ type: 'settings.opened' });update();$('#close-settings').focus({ preventScroll: true });}
});
$('#close-settings').addEventListener('click', closeSettings);
function navigateSetup(direction) {
  if (app.value.started || app.value.mode === 'online' && app.value.role === 'guest' && app.value.connected) return;
  if (direction < 0 && app.value.setupStep === 'players' && app.value.mode === 'online') leaveRoom();
  else app.dispatch({ type: 'preparation.navigated', direction });
  update(); broadcast(); $('#setup-panel').scrollTop = 0;
}
$('#setup-next').addEventListener('click', () => navigateSetup(1));
$('#setup-back').addEventListener('click', () => navigateSetup(-1));
$('#pause').addEventListener('click', () => pause(!app.value.pauseFlags[ownSide()]));
$('#resume').addEventListener('click', () => {pause(false);if (app.value.mode === 'local') canvas.focus({ preventScroll: true });});
for (const [side, id] of ['skin-left', 'skin-right'].entries()) $('#' + id).addEventListener('change', () => {
  if ($('#' + id).disabled) return;
  const nextSkins = skins(); nextSkins[side] = +$('#' + id).value; app.dispatch({ type: 'configuration.changed', patch: { skins: nextSkins } });
  if (app.value.mode === 'local' || app.value.role === 'host' && side === 0) {broadcast();} else
  if (app.value.role === 'guest' && side === 1) sendInput();
  update();
});
$('#sound').addEventListener('click', () => {
  app.dispatch({ type: "preferences.changed", soundEnabled: !app.value.soundEnabled });$('#sound').textContent = app.value.soundEnabled ? '♫' : '∅';
  $('#sound').setAttribute('aria-label', app.value.soundEnabled ? 'Couper le son' : 'Activer le son');
  $('#sound').title = app.value.soundEnabled ? 'Couper le son' : 'Activer le son';
  $('#sound').setAttribute('aria-pressed', String(app.value.soundEnabled));audio.unlock();music();
  if (app.value.started && !app.value.paused) canvas.focus({ preventScroll: true });
});
window.addEventListener('keydown', (event) => {
  if (['SELECT', 'INPUT', 'BUTTON'].includes(event.target.tagName) && event.code !== 'Escape') return;
  if (event.code === 'Escape' && app.value.settingsOpen) {event.preventDefault();closeSettings();return;}
  if (event.code === 'Escape') {if (app.value.started) {event.preventDefault();pause(!app.value.pauseFlags[ownSide()]);}return;}
  if (bindings[event.code] && app.value.started && !app.value.paused && engine().game_value(MATCH.phase) !== PHASE.finished && (app.value.mode !== 'online' || app.value.connected)) {
    event.preventDefault();keys.add(event.code);sendInput();
  }
});
window.addEventListener('keyup', (event) => {keys.delete(event.code);sendInput();});
window.addEventListener('blur', () => {clearInput();sendInput();pause();});
function suspendPage() {clearInput();sendInput();pause();network.suspend();}
function resumePage() {network.resume();clock.reset();}
// Mobile browsers can suspend this page while the invitation is shared in another app.
window.addEventListener('pagehide', (event) => {if (event.persisted) suspendPage();else network.close();});
window.addEventListener('pageshow', resumePage);
window.addEventListener('online', resumePage);
document.addEventListener('visibilitychange', () => {if (document.hidden) suspendPage();else resumePage();});
setInterval(sendInput, 50);

function renderState() { return readRenderState(engine(), app.value); }
network = createRoomSession({ app, getCore: () => core, skins, bonusMode, targetScore, validTarget, clearMatch, clearInput, update, music, pause, applyPause, canvas, touch, input, playSounds, audio, track });
function sendInput() { network?.sendInput(); }
function broadcast() { network?.broadcast(); }
function connectRoom(create) { return network.connect(create); }
function copyRoom(link) { return network.copy(link); }
function refreshDiagnostic() { network.refreshDiagnostic(); }
function roomStatus(...args) { network.status(...args); }
const renderUI = createGameUI({ app, engine, snapshot, coreReady: () => !!core, canStart, peerUpdateNeeded, hasTouch, touch, balancing, characterSelection, clearInput, audio, randomChoices });
let preparingAssets;
function update() {
  if (core && (app.value.setupStep === 'rules' || app.value.started) && !matchAssetsReady(bonusMode()) && preparingAssets !== bonusMode()) {
    preparingAssets = bonusMode();
    prepareMatchAssets(bonusMode()).then(() => {update();}).catch((error) => {
      $('#status').textContent = 'Les graphismes n’ont pas pu se charger. Rechargez la page pour réessayer.';
      window.loadError = error.message;
    });
  }

  monitor.measure('ui', renderUI);
  observeMatch({ ...snapshot(), skins: skins() });
}
function animate(time) {
  if (!pacer.due(time)) { requestAnimationFrame(animate); return; }
  monitor.frame(time);
  const running = core && app.value.started && !app.value.paused && engine().game_value(MATCH.phase) !== PHASE.finished
    && (app.value.mode !== 'online' || (app.value.role === 'host' && app.value.connected));
  const advanced = clock.advance(time, running, () => {
    const human = monitor.measure('input', () => input());
    const opponentMask = app.value.mode === 'ai' ? monitor.measure('aiMain', () => opponent.step(core)) << 4
      : app.value.mode === 'online' ? network.inputMask() : 0;
    const mask = human | opponentMask;
    monitor.measure('physics', () => core.game_tick(mask)); blend.capture();
    touch.consumeJumps(); network.consumedInput(); playSounds(core.game_value(MATCH.sounds));
  });
  if (advanced) broadcast();
  if (running) update();
  network.heartbeat();
  network.advance(time);
  const view = running && renderEngine() === core ? blend.view(clock.debtMs / TICK_MS) : renderEngine();
  const resolution = canvas.width / 800;
  ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
  monitor.measure('render', () => drawGame(ctx, view, renderState()));
  monitor.record('simulationDebt', clock.debtMs);
  const saver = pacer.saver; pacer.drawn(time, running); if (pacer.saver !== saver) fitResolution();
  requestAnimationFrame(animate);
}
function performanceReport() {
  return { revision: 1, browser: navigator.userAgent, mode: app.value.mode, role: app.value.role, started: app.value.started, paused: app.value.paused, matchId: app.value.matchId, difficulty: app.value.mode === 'ai' ? difficulty().id : null,
    costs: monitor.report(), assets: { ...assetStats(), imageTransferBytes: performance.getEntriesByType('resource')
      .filter(entry => /\/assets\/.*\.(svg|png|webp)(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + entry.encodedBodySize, 0) },
    planner: planner?.stats(), scheduler: { tickMs: 1000 / 30, maxStepsPerFrame: 2, debtMs: clock.debtMs, batterySaver: pacer.saver } };
}
setupPerformancePanel({ report: performanceReport, reset: () => monitor.reset(), resume() { closeSettings(); pause(false); } });
window.sportheads = { resetPerformance: () => monitor.reset(), performance: performanceReport, inspectPlanner: () => planner.inspect(), get state() { return app.value; }, snapshot, renderState, get engine() {return engine();}, get renderEngine() {return renderEngine();}, render() {update();network.advance();ctx.setTransform(canvas.width / 800, 0, 0, canvas.width / 800, 0, 0);drawGame(ctx, renderEngine(), renderState());} };
try {
  const response = await fetch('./physics-core.wasm');if (!response.ok) throw new Error('Chargement du moteur impossible.');
  const [wasm] = await Promise.all([WebAssembly.instantiateStreaming(response), loadAssets()]);
  planner = createPlannerService(wasm.instance.exports, wasm.module, monitor);
  core = planner.engine; blend = createTickBlend(core); core.game_reset(1);window.ready = true;
  try { analytics = createAnalytics(); } catch { /* Statistics are optional. */ }
  const code = normalizeCode(new URL(location.href).searchParams.get('room') || '');
  if (validCode(code)) {selectMode('online'); app.dispatch({ type: 'room.code-edited', value: code }); roomStatus('Code reçu. Cliquez sur Rejoindre pour entrer dans la salle.');}
  update();
  // Installable, and playable offline vs the AI or 2P once loaded. A refusal only costs the cache.
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
} catch (error) {
  $('#start').textContent = 'Recharger la page';$('#start').disabled = false;$('#start').addEventListener('click', () => location.reload());
  $('#status').textContent = 'Le jeu n’a pas pu se charger. Rechargez la page pour réessayer.';window.loadError = error.message;
}
layoutArena($('.field-wrap'), $('#game-surface'), $('#touch-controls'));
// HD: only the canvas backing store follows the displayed size x devicePixelRatio,
// up to twice the 800 x 480 scene. The simulation, its coordinates and the 30 Hz
// tick never see it. The battery saver returns to the base resolution.
function fitResolution() {
  const wanted = pacer.saver ? 1 : canvas.clientWidth * (window.devicePixelRatio || 1) / 800;
  const resolution = Math.min(2, Math.max(1, Math.round(wanted * 4) / 4));
  if (canvas.width !== 800 * resolution) { canvas.width = 800 * resolution; canvas.height = 480 * resolution; }
}
new ResizeObserver(fitResolution).observe(canvas);
fitResolution();
setupFullscreen($('.arena'), $('#fullscreen'), $('#fullscreen-settings'), $('#fullscreen-status'), () => {clearInput();sendInput();clock.reset();});
requestAnimationFrame(animate);
