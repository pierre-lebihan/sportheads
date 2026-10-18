import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, transition } from '../web/app-state.js';
import { createBalance } from '../web/balance.js';

test('quit, change mode, return and replay have explicit atomic transitions', () => {
  const app = createAppStore();
  app.dispatch({ type: 'mode.selected', mode: 'ai' });
  assert.equal(app.value.setupStep, 'difficulty');
  for (const expected of ['players', 'pitch', 'rules']) {
    app.dispatch({ type: 'preparation.navigated', direction: 1 }); assert.equal(app.value.setupStep, expected);
  }
  app.dispatch({ type: 'configuration.changed', patch: { skins: [13, 23], targetScore: 9, pitch: 3, bonusMode: 2, balance: createBalance('blue', 50) } });
  const config = app.value.config;
  app.dispatch({ type: 'match.started' }); app.dispatch({ type: 'match.pause', side: 0, value: true }); app.dispatch({ type: 'settings.opened' });
  assert.equal(app.value.paused, true); assert.equal(app.value.settingsOpen, true);
  app.dispatch({ type: 'match.quit' });
  assert.deepEqual([app.value.started, app.value.paused, app.value.settingsOpen, app.value.role, app.value.setupStep], [false, false, false, null, 'home']);
  assert.deepEqual(app.value.config, config);
  app.dispatch({ type: 'mode.selected', mode: 'local' }); app.dispatch({ type: 'match.started' });
  assert.equal(app.value.matchId, 2); assert.deepEqual(app.value.pauseFlags, [false, false]);
  assert.deepEqual(app.value.config, config);
});
test('both online participants must resume, and disconnect preserves configuration for recovery', () => {
  const app = createAppStore(); app.dispatch({ type: 'mode.selected', mode: 'online' });
  app.dispatch({ type: 'room.connecting', create: true }); app.dispatch({ type: 'connection.changed', connected: true, busy: false, code: 'ABCDEFGH' });
  app.dispatch({ type: 'match.started' });
  app.dispatch({ type: 'match.pause', flags: [true, true] }); app.dispatch({ type: 'match.pause', side: 0, value: false });
  assert.equal(app.value.paused, true); app.dispatch({ type: 'match.pause', side: 1, value: false }); assert.equal(app.value.paused, false);
  const config = app.value.config; app.dispatch({ type: 'room.disconnected' });
  assert.deepEqual([app.value.connected, app.value.started, app.value.paused, app.value.settingsOpen], [false, true, true, true]);
  assert.deepEqual(app.value.config, config);
  app.dispatch({ type: 'room.left' }); assert.equal(app.value.setupStep, 'room'); assert.equal(app.value.code, '');
});
test('remote frames preserve the guest choice and cannot be navigated locally', () => {
  const app = createAppStore(); app.dispatch({ type: 'mode.selected', mode: 'online' }); app.dispatch({ type: 'room.connecting', create: false });
  app.dispatch({ type: 'connection.changed', connected: true });
  app.dispatch({ type: 'remote.frame', matchId: 3, started: false, pauseFlags: [false, false], setupStep: 'pitch', balancedPitches: true,
    config: { skins: [13, 14], pitch: 6, targetScore: 5 }, newMatch: true });
  const before = app.value; app.dispatch({ type: 'preparation.navigated', direction: 1 }); assert.equal(app.value, before);
  assert.equal(app.value.matchId, 3); assert.equal(app.value.config.pitch, 6);
  app.dispatch({ type: 'remote.frame', matchId: 4, started: true, pauseFlags: [false, false], setupStep: 'rules', balancedPitches: false,
    config: { pitch: 13, targetScore: 99 }, newMatch: true });
  assert.equal(app.value.config.pitch, 13, 'a validated older host can still send a historical pitch');
  assert.equal(app.value.config.targetScore, 99);
});
test('configuration is immutable, copied at the boundary and keeps the last valid goal target', () => {
  const app = createAppStore(), skins = [13, 14], balance = createBalance('manual');
  app.dispatch({ type: 'configuration.changed', patch: { skins, balance, targetScore: 5 } });
  skins[0] = 1; balance.buffs[0][0] = 50;
  assert.deepEqual(app.value.config.skins, [13, 14]); assert.equal(app.value.config.balance.buffs[0][0], 0);
  assert.throws(() => { app.value.config.pitch = 20; }, TypeError);
  app.dispatch({ type: 'configuration.changed', patch: { targetScore: 0 } });
  assert.equal(app.value.config.targetScore, 0); assert.equal(app.value.lastValidTarget, 5);
  assert.throws(() => app.dispatch({ type: 'configuration.changed', patch: { misspelledSetting: 1 } }), TypeError);
  assert.throws(() => transition(app.value, { type: 'invented' }), TypeError);
});
