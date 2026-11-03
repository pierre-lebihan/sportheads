import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchQuality } from '../web/match-quality.js';

const playing = { mode: 'online', role: 'guest', started: true, connected: true, paused: false, matchId: 1, phase: 1, pitch: 8, bonusMode: 0 };
function setup(options = {}) {
  let clock = 0, visible = true;
  const events = [];
  const quality = createMatchQuality({ now: () => clock, visible: () => visible, makeId: () => 'anonymous-token',
    track: (name, properties) => events.push({ name, ...properties }), context: () => ({ build: 'test', match_token: 'shared-host-token' }), ...options });
  return { quality, events, time: value => { clock = value; }, visibility: value => { visible = value; } };
}

test('foreground play produces one numeric summary per window with shared match and build context', () => {
  const { quality, events, time } = setup();
  quality.observe(playing);
  for (let frame = 0; frame <= 900; frame++) { time(frame * 1000 / 60); quality.record('render', 3); quality.frame(frame * 1000 / 60); }
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'online_quality'); assert.equal(events[0].fps, 60);
  assert.equal(events[0].match_token, 'shared-host-token'); assert.equal(events[0].build, 'test');
  assert.equal(events[0].frames, 900); assert.equal(events[0].render_mean_ms, 3);
  assert.equal(events[0].window_s, 15); assert.equal(events[0].role, 'guest');
});

test('network irregularity, skipped states, acknowledgement latency and corrections keep their units', () => {
  const { quality, events, time } = setup(); quality.observe(playing); quality.frame(0);
  quality.state(10, 30, 0); quality.state(13, 33, 160);
  quality.record('rtt', 42); quality.record('inputAck', 80); quality.record('correction', 12);
  quality.count('sendDrops', 2); quality.record('rawSdp', 100); quality.count('roomCode', 1);
  time(160); quality.frame(160); quality.flush('test');
  const report = events[0];
  assert.equal(report.state_gap_mean_ms, 160); assert.equal(report.state_jitter_mean_ms, 60);
  assert.equal(report.state_skips, 2); assert.equal(report.send_drops, 2);
  assert.equal(report.input_ack_mean_ms, 80); assert.equal(report.rtt_mean_ms, 42);
  assert.equal(report.correction_max_px, 12); assert.equal(report.correction_max_ms, undefined);
  assert.equal(report.raw_sdp_mean_ms, undefined); assert.equal(report.room_code, undefined);
});

test('pause, hidden time and disconnection do not pollute the frame cadence or duplicate windows', () => {
  const { quality, events, time, visibility } = setup(); quality.observe(playing);
  quality.frame(0); time(20); quality.frame(20); quality.observe({ ...playing, paused: true });
  assert.equal(events[0].reason, 'paused');
  time(10000); quality.frame(10000); quality.record('render', 999);
  quality.observe(playing); quality.frame(10000); time(10020); quality.frame(10020);
  visibility(false); quality.suspend(); quality.flush('pagehide');
  assert.equal(events.length, 2); assert.equal(events[1].fps, 50); assert.equal(events[1].render_max_ms, undefined);
  time(20000); visibility(true); quality.observe(playing); quality.frame(20000); time(20020); quality.frame(20020);
  quality.observe({ ...playing, connected: false });
  assert.equal(events[2].reason, 'disconnected'); assert.equal(events[2].fps, 50);
  quality.observe({ ...playing, started: false }); assert.equal(events.length, 3);
});

test('offline modes are not sampled, rematches start new windows, and blocked collection never throws', () => {
  const { quality, events, time } = setup(); quality.observe({ ...playing, mode: 'local' });
  quality.frame(0); time(30); quality.frame(30); quality.flush(); assert.equal(events.length, 0);
  quality.observe(playing); quality.frame(30); time(50); quality.frame(50);
  quality.observe({ ...playing, matchId: 2 }); assert.equal(events[0].reason, 'left');
  quality.frame(50); time(80); quality.frame(80); quality.observe({ ...playing, matchId: 2, phase: 3 });
  assert.equal(events[1].reason, 'finished'); assert.equal(events[1].fps, 33.33);
  const blocked = setup({ track: () => { throw Error('blocked'); } });
  blocked.quality.observe(playing); blocked.quality.frame(0); blocked.time(100); blocked.quality.frame(100);
  assert.doesNotThrow(() => blocked.quality.flush());
});
