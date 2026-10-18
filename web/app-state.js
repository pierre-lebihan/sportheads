import { createBalance, copyBalance } from './balance.js';
import { PLAYER_COUNT } from './players.js';
import { PREPARATION_STEPS } from './setup-ui.js';
import { PLAYABLE_PITCH_IDS } from './engine-contract.js';
import { AI_LEVELS } from './opponent.js';
import { TOUCH_LAYOUTS } from './touch-layout.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const cleared = { started: false, paused: false, pauseFlags: [false, false], settingsOpen: false,
  guestBalancedPitches: false, remoteBalancedPitches: false, guestStatBuffs: false, guestBonusV2: false };
export function initialAppState() {
  return freeze({ ...cleared, mode: 'local', role: null, connected: false, code: '', joinCode: '', busy: false, restoringSettings: false,
    soundEnabled: true, touchLayout: 'thumbs', setupStep: 'home', lastValidTarget: 7, matchId: 0, roomNotice: { message: '', error: false },
    config: { skins: [1, 2], pitch: 8, targetScore: 7, bonusMode: 1, difficulty: 'normal', balance: createBalance() } });
}
const fields = {
  'connection.changed': ['role', 'connected', 'code', 'busy', 'restoringSettings'],
  'preparation.changed': ['setupStep'],
  'preferences.changed': ['soundEnabled', 'touchLayout'],
  'capabilities.changed': ['guestBalancedPitches', 'remoteBalancedPitches', 'guestStatBuffs', 'guestBonusV2'],
};
function configuration(state, patch, remote = false) {
  if (Object.keys(patch).some(name => !['skins', 'pitch', 'targetScore', 'bonusMode', 'difficulty', 'balance'].includes(name))) throw TypeError('Unknown match setting');
  if (Object.hasOwn(patch, 'pitch') && !(remote ? Number.isInteger(patch.pitch) && patch.pitch >= 2 && patch.pitch <= 20 : PLAYABLE_PITCH_IDS.includes(patch.pitch))) throw TypeError('Invalid pitch');
  if (Object.hasOwn(patch, 'bonusMode') && ![0, 1, 2].includes(patch.bonusMode)) throw TypeError('Invalid bonus mode');
  if (Object.hasOwn(patch, 'difficulty') && !AI_LEVELS.some(level => level.id === patch.difficulty)) throw TypeError('Invalid difficulty');
  const next = { ...state.config, ...patch };
  if (patch.skins) {
    if (!Array.isArray(patch.skins) || patch.skins.length !== 2 || !patch.skins.every(id => Number.isInteger(id) && id >= 1 && id <= PLAYER_COUNT)) throw TypeError('Invalid players');
    next.skins = patch.skins.slice();
  }
  if (patch.balance) next.balance = copyBalance(patch.balance);
  return { ...state, config: next,
    lastValidTarget: Number.isInteger(next.targetScore) && next.targetScore >= 1 && next.targetScore <= 9 ? next.targetScore : state.lastValidTarget };
}
// Transitions are pure and atomic. DOM controls project this state and emit
// events; they never supply values when starting/replaying/broadcasting a match.
export function transition(state, event) {
  let next = state;
  switch (event.type) {
    case 'mode.selected':
      if (!['local', 'ai', 'online'].includes(event.mode)) throw TypeError('Invalid mode');
      next = { ...state, ...cleared, mode: event.mode, role: null, connected: false, code: '', busy: false, restoringSettings: false,
        setupStep: event.mode === 'local' ? 'players' : event.mode === 'ai' ? 'difficulty' : 'room' }; break;
    case 'match.cleared': next = { ...state, ...cleared }; break;
    case 'match.started': next = { ...state, matchId: state.matchId + 1, started: true, paused: false, pauseFlags: [false, false], settingsOpen: false, setupStep: 'rules' }; break;
    case 'room.left':
    case 'match.quit': next = { ...state, ...cleared, role: null, connected: false, code: '', busy: false, restoringSettings: false,
      setupStep: event.type === 'match.quit' || state.mode !== 'online' ? 'home' : 'room' }; break;
    case 'room.connecting': next = { ...state, ...cleared, matchId: 0, busy: true, restoringSettings: false, connected: false, code: '', role: event.create ? 'host' : 'guest', setupStep: event.create ? 'players' : 'room' }; break;
    case 'connection.match-reset': next = { ...state, matchId: 0 }; break;
    case 'room.code-edited': next = { ...state, joinCode: String(event.value) }; break;
    case 'room.notice': next = { ...state, roomNotice: { message: event.message, error: !!event.error } }; break;
    case 'room.disconnected': next = { ...state, connected: false, busy: false, restoringSettings: false, setupStep: 'players',
      ...(state.started ? { paused: true, pauseFlags: [true, true], settingsOpen: true } : {}) }; break;
    case 'match.pause': {
      const flags = event.flags ? event.flags.slice() : state.pauseFlags.map((flag, side) => side === event.side ? !!event.value : flag);
      if (flags.length !== 2 || !flags.every(flag => typeof flag === 'boolean')) throw TypeError('Invalid pause flags');
      next = { ...state, pauseFlags: flags, paused: flags.some(Boolean) }; break;
    }
    case 'settings.opened': next = { ...state, settingsOpen: state.started }; break;
    case 'settings.closed': next = { ...state, settingsOpen: false }; break;
    case 'configuration.changed': next = configuration(state, event.patch); break;
    case 'remote.frame':
      next = configuration({ ...state, matchId: event.matchId, started: event.started, paused: event.pauseFlags.some(Boolean), pauseFlags: event.pauseFlags.slice(),
        setupStep: event.setupStep, remoteBalancedPitches: event.balancedPitches,
        settingsOpen: event.newMatch && event.started ? false : state.settingsOpen }, event.config, true); break;
    case 'preparation.navigated': {
      if (state.mode === 'online' && state.role === 'guest' && state.connected) return state;
      const steps = state.mode === 'ai' ? ['difficulty', ...PREPARATION_STEPS] : PREPARATION_STEPS;
      const index = steps.indexOf(state.setupStep);
      const step = event.direction > 0 && index >= 0 && index < steps.length - 1 ? steps[index + 1]
        : event.direction < 0 && index > 0 ? steps[index - 1]
          : event.direction < 0 ? (state.setupStep === 'players' && state.mode === 'online' ? 'room' : 'home') : state.setupStep;
      next = { ...state, setupStep: step }; break;
    }
    default: {
      const allowed = fields[event.type];
      if (!allowed) throw TypeError(`Unknown app transition: ${event.type}`);
      if (event.type === 'preferences.changed' && Object.hasOwn(event, 'touchLayout') && !TOUCH_LAYOUTS.includes(event.touchLayout)) throw TypeError('Invalid touch layout');
      next = { ...state };
      for (const name of allowed) if (Object.hasOwn(event, name)) next[name] = event[name];
    }
  }
  return freeze(next);
}
export function createAppStore() {
  let value = initialAppState();
  return Object.freeze({ get value() { return value; }, dispatch(event) { value = transition(value, event); return value; } });
}
