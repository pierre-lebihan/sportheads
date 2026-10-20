import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceInfo, connectionPath, createMatchTracker } from '../web/analytics.js';

test('device type, system and browser come from the user agent', () => {
  assert.deepEqual(deviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5, 390),
    { $os: 'iOS', $browser: 'Safari', $device_type: 'Mobile' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5, 1024),
    { $os: 'iOS', $browser: 'Safari', $device_type: 'Tablet' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 5, 412),
    { $os: 'Android', $browser: 'Chrome', $device_type: 'Mobile' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', 0, 1920),
    { $os: 'Windows', $browser: 'Microsoft Edge', $device_type: 'Desktop' });
  assert.equal(deviceInfo('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0').$browser, 'Firefox');
});

test('the online path tells the TURN relay from a direct link', () => {
  const pair = (local, remote, selected = true) => ({ selected, local: { type: local }, remote: { type: remote } });
  assert.equal(connectionPath({ connectivity: { pairs: [pair('relay', 'srflx')] } }), 'relay');
  assert.equal(connectionPath({ connectivity: { pairs: [pair('relay', 'relay', false), pair('srflx', 'host')] } }), 'direct');
  assert.equal(connectionPath({ connectivity: { pairs: [pair('host', 'host', false)] } }), 'unknown');
  assert.equal(connectionPath(undefined), 'unknown');
});

test('each match is reported once as started, then finished or left', () => {
  const events = [];
  let clock = 0;
  const observe = createMatchTracker((event, properties) => events.push([event, properties]), () => clock);
  const base = { started: false, mode: 'ai', role: null, difficulty: 'expert', matchId: 0, phase: 0, pitch: 8, targetScore: 5, bonusMode: 1, skins: [1, 2], score: [0, 0] };
  observe(base);
  observe({ ...base, started: true, matchId: 1 });
  observe({ ...base, started: true, matchId: 1, phase: 1 });
  clock = 90000;
  observe({ ...base, started: true, matchId: 1, phase: 3, score: [5, 3] });
  observe({ ...base, started: true, matchId: 1, phase: 3, score: [5, 3] });
  observe({ ...base, started: true, matchId: 2, phase: 0 });
  clock = 120000;
  observe({ ...base, started: false, score: [1, 0] });
  assert.deepEqual(events.map(([event]) => event), ['match_started', 'match_finished', 'match_started', 'match_left']);
  assert.equal(events[0][1].ai_level, 'expert');
  assert.deepEqual({ ...events[1][1], players: undefined }, { mode: 'ai', role: undefined, ai_level: 'expert', pitch: 8, target_score: 5, bonus_mode: 1,
    players: undefined, score_blue: 5, score_red: 3, duration_s: 90, winner: 'blue', outcome: 'win' });
  assert.equal(events[3][1].duration_s, 30);
});

test('an online guest wins with the red side', () => {
  const events = [];
  const observe = createMatchTracker((event, properties) => events.push([event, properties]), () => 0);
  const state = { started: true, mode: 'online', role: 'guest', matchId: 4, phase: 3, score: [2, 3] };
  observe(state);
  assert.equal(events[1][1].outcome, 'win');
  observe({ ...state, mode: 'local', role: null, matchId: 5, score: [1, 1] });
  assert.equal(events[3][1].winner, 'draw');
  assert.equal(events[3][1].outcome, undefined);
});
