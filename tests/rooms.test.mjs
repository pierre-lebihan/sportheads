import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Room, PROTOCOL, normalizeCode, validCode } from '../web/rooms.js';
import { resetIceServers } from '../web/ice-servers.js';

class FakeConnection extends EventEmitter {
  constructor(metadata = { protocol: PROTOCOL, role: 'guest' }) {
    super();
    this.metadata = metadata;
    this.peerConnection = new EventTarget();
    this.open = false;
    this.closed = false;
    this.sent = [];
    this.throwOnSend = false;
  }
  openChannel() { this.open = true; this.emit('open'); }
  send(message) {
    if (this.throwOnSend) throw new Error('Data channel is unavailable');
    assert.equal(this.open, true);
    this.sent.push(message);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit('close');
  }
}

function setup(t, plans = []) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  resetIceServers({}); // Offline: PeerJS default ICE servers, no credential fetch.
  const peers = [];
  class FakePeer extends EventEmitter {
    constructor(id, options) {
      super();
      Object.assign(this, { id, options, destroyed: false, channels: [], reconnects: 0 });
      peers.push(this);
      const plan = plans.shift() || 'open';
      queueMicrotask(() => {
        if (this.destroyed || plan === 'pending') return;
        if (plan === 'open') this.emit('open', id);
        else this.emit('error', Object.assign(new Error(plan), { type: plan }));
      });
    }
    connect(id, options) {
      this.target = id;
      this.connectOptions = options;
      const connection = new FakeConnection(options.metadata);
      this.channels.push(connection);
      return connection;
    }
    incoming(connection) {
      connection.peer ??= this.id.endsWith('-guest') ? this.id.slice(0, -6) : this.id + '-guest';
      this.channels.push(connection); this.emit('connection', connection);
    }
    reconnect() { this.reconnects++; }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const channel of this.channels) channel.close();
    }
  }
  const previousWindow = globalThis.window;
  globalThis.window = { Peer: FakePeer };
  const rooms = [];
  t.after(() => {
    for (const room of rooms) room.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const createRoom = (overrides = {}) => {
    const events = { ready: [], messages: [], disconnects: [], errors: [] };
    const room = new Room({
      onReady: role => events.ready.push(role),
      onMessage: message => events.messages.push(message),
      onDisconnect: message => events.disconnects.push(message),
      onError: message => events.errors.push(message),
      ...overrides,
    });
    rooms.push(room);
    return { room, events };
  };
  return { peers, createRoom };
}

const flush = () => Promise.resolve();

test('room codes normalize spaces, hyphens and case, and accept one unambiguous character and legacy eight-character links', async t => {
  assert.equal(normalizeCode(' abcd-2345\n'), 'ABCD2345');
  assert.equal(validCode('ABCD2345'), true);
  for (const code of 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') assert.equal(validCode(code), true);
  for (const code of ['', 'AA', 'I', 'O', '0', '1', 'a', '!']) assert.equal(validCode(code), false, code);
  for (const code of ['ABCD234', 'ABCD23456', 'ABCDI234', 'ABCDO234', 'ABCD0234', 'ABCD1234', 'abcd2345', 'ABCD!234']) {
    assert.equal(validCode(code), false, code);
  }
  const { peers, createRoom } = setup(t);
  const { room } = createRoom();
  await assert.rejects(room.join('INVALID'), /le caractère/);
  assert.equal(peers.length, 0, 'invalid codes must not open a signalling connection');
  await room.join(' abcd-2345 ');
  assert.equal(room.code, 'ABCD2345');
  assert.equal(peers[0].id, 'sportheads-room-v7-ABCD2345-guest');
  assert.equal(peers[0].target, 'sportheads-room-v7-ABCD2345');
  assert.deepEqual(peers[0].connectOptions.metadata, { protocol: PROTOCOL, role: 'guest' });
});

test('joining an occupied guest seat reserves the vacant creator seat and connects back to the guest', async t => {
  const { peers, createRoom } = setup(t, ['unavailable-id', 'open']);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  assert.equal(peers[0].destroyed, true);
  assert.equal(peers[1].id, 'sportheads-room-v7-ABCD2345');
  assert.equal(peers[1].target, 'sportheads-room-v7-ABCD2345-guest');
  assert.equal(room.role, 'host'); assert.equal(room.returningHost, true);
  room.connection.openChannel();
  assert.equal(room.connected, true); assert.deepEqual(events.ready, ['host']);
});

test('a single lowercase character joins the same named room as its uppercase code', async t => {
  const { peers, createRoom } = setup(t);
  const { room } = createRoom(); await room.join(' a ');
  assert.equal(room.code, 'A');
  assert.equal(peers[0].id, 'sportheads-room-v7-A-guest');
  assert.equal(peers[0].target, 'sportheads-room-v7-A');
});

test('two occupied seats reject a third join and release both failed peers', async t => {
  const { peers, createRoom } = setup(t, ['unavailable-id', 'unavailable-id']);
  const { room, events } = createRoom();
  await assert.rejects(room.join('ABCD2345'), /complète/);
  assert.equal(peers.length, 2); assert.ok(peers.every(peer => peer.destroyed));
  assert.equal(room.connected, false); assert.deepEqual(events.ready, []);
});

test('disposable updates use an unordered channel without retries; controls keep the reliable path', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom(); await room.create();
  const connection = new FakeConnection(), pc = connection.peerConnection = new EventTarget();
  const sent = [];
  const adopted = [];
  pc.ondatachannel = event => adopted.push(event.channel.label);
  const channel = { label: 'sportheads-realtime-v1', readyState: 'open', bufferedAmount: 0,
    send: message => sent.push(JSON.parse(message)), close() { this.readyState = 'closed'; this.onclose?.(); } };
  pc.createDataChannel = (label, config) => {
    assert.equal(label, channel.label); assert.deepEqual(config, { ordered: false, maxRetransmits: 0 }); return channel;
  };
  peers[0].incoming(connection); connection.openChannel();
  assert.equal(room.realtime, undefined, 'older peers never receive an unsupported extra channel');
  connection.emit('data', { type: 'capabilities', realtime: 1 });
  pc.ondatachannel({ channel: { label: 'peerjs-control' } });
  const extra = { ...channel, readyState: 'open', close() { this.readyState = 'closed'; } };
  pc.ondatachannel({ channel: extra });
  assert.deepEqual(adopted, ['peerjs-control'], 'PeerJS must never adopt the disposable data channel');
  assert.equal(extra.readyState, 'closed', 'a duplicate realtime channel is refused');
  assert.equal(room.send({ type: 'frame', sequence: 1 }, { volatile: true }), true);
  assert.deepEqual(sent, [{ type: 'frame', sequence: 1 }]);
  room.send({ type: 'pause', value: true }, { volatile: true }); assert.equal(connection.sent.at(-1).type, 'pause');
  channel.bufferedAmount = 20000;
  assert.equal(room.send({ type: 'frame', sequence: 2 }, { volatile: true }), false);
  assert.equal(sent.length, 1); assert.equal(room.connected, true);
  channel.onmessage({ data: JSON.stringify({ type: 'input', sequence: 7, mask: 0 }) });
  assert.equal(events.messages.at(-1).mask, 0);
  channel.onmessage({ data: '{invalid' }); channel.onmessage({ data: JSON.stringify({ type: 'pause', value: false }) });
  assert.equal(events.messages.length, 1);
  channel.close(); room.send({ type: 'frame', sequence: 3 }, { volatile: true });
  assert.equal(connection.sent.at(-1).sequence, 3, 'a closed realtime channel falls back to reliable transport');
  channel.readyState = 'open'; channel.bufferedAmount = 0; room.realtime = channel;
  channel.send = () => { channel.onclose(); throw new DOMException('closed during send', 'InvalidStateError'); };
  assert.equal(room.send({ type: 'input', sequence: 4, mask: 0 }, { volatile: true }), true);
  assert.equal(connection.sent.at(-1).sequence, 4, 'a close event during send also falls back safely');
  assert.equal(room.connected, true);
});

test('a failed creator return releases its new reservation so the original guest can accept a retry', async t => {
  const { peers, createRoom } = setup(t, ['unavailable-id', 'open']);
  const { room, events } = createRoom(); await room.join('ABCD2345');
  room.connection.emit('error', { type: 'negotiation-failed' });
  assert.equal(room.closed, true); assert.equal(peers[1].destroyed, true);
  assert.equal(events.errors.length, 1); assert.deepEqual(events.ready, []);
});

test('a surviving guest retains its named seat and accepts a returning creator only after welcome', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  room.connection.openChannel();
  room.connection.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  room.connection.close();
  assert.equal(room.closed, false); assert.equal(room.connected, false);
  assert.equal(peers[0].destroyed, false); assert.equal(events.disconnects.length, 1);
  const returning = new FakeConnection({ protocol: PROTOCOL, role: 'host' });
  peers[0].incoming(returning); returning.openChannel();
  assert.equal(room.connected, false, 'a new channel alone is not a completed handshake');
  returning.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  assert.equal(room.connected, true); assert.deepEqual(events.ready, ['guest', 'guest']);
  returning.close();
  const failed = new FakeConnection({ protocol: PROTOCOL, role: 'host' });
  peers[0].incoming(failed); failed.emit('error', { type: 'negotiation-failed' });
  assert.equal(room.closed, false, 'a failed return must not destroy the surviving seat');
  assert.equal(peers[0].destroyed, false);
});

test('a guest refuses a returning connection that has not reserved the creator seat', async t => {
  const { peers, createRoom } = setup(t);
  const { room } = createRoom(); await room.join('ABCD2345');
  room.connection.openChannel(); room.connection.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  room.connection.close();
  const impostor = new FakeConnection({ protocol: PROTOCOL, role: 'host' });
  impostor.peer = 'unreserved-peer'; peers[0].incoming(impostor); impostor.openChannel();
  assert.equal(room.connection, null); assert.equal(room.connected, false);
  t.mock.timers.tick(250); assert.equal(impostor.closed, true);
});

test('creation retries an unavailable ID with a new peer and destroys the failed peer', async t => {
  const { peers, createRoom } = setup(t, ['unavailable-id', 'open']);
  const { room, events } = createRoom();
  const code = await room.create();
  assert.equal(peers.length, 3);
  assert.equal(peers[0].destroyed, true);
  assert.equal(peers[2].destroyed, true, 'the temporary guest reservation must be released');
  assert.equal(peers[1].destroyed, false);
  assert.equal(room.peer, peers[1]);
  assert.equal(validCode(code), true);
  assert.equal(code.length, 1);
  assert.notEqual(peers[0].id, peers[1].id, 'an occupied code is never retried');
  assert.equal(peers[1].id, 'sportheads-room-v7-' + code);
  assert.deepEqual(events.errors, []);
  assert.deepEqual(events.ready, []);
});

test('closing during peer open promptly rejects the pending operation and clears its timeout', async t => {
  const { peers, createRoom } = setup(t, ['pending']);
  const timeouts = t.mock.method(globalThis, 'setTimeout');
  const cleared = t.mock.method(globalThis, 'clearTimeout');
  const { room, events } = createRoom();
  let settled = false;
  const pending = assert.rejects(room.create(), /annulée/).then(() => { settled = true; });
  await flush();
  room.close();
  await pending;
  assert.equal(settled, true, 'cancellation must settle without advancing the 15-second timeout');
  const openTimeout = timeouts.mock.calls.find(call => call.arguments[1] === 15000).result;
  assert.ok(cleared.mock.calls.some(call => call.arguments[0] === openTimeout), 'the pending peer-open timeout must be cleared');
  assert.equal(room.cancelOpen, null);
  assert.equal(peers[0].destroyed, true);
  t.mock.timers.tick(30000);
  assert.deepEqual(events.errors, []);
  assert.deepEqual(events.ready, []);
});

test('creation skips a short code held by a surviving guest and releases both attempted seats', async t => {
  const { peers, createRoom } = setup(t, ['open', 'unavailable-id', 'open', 'open']);
  const { room, events } = createRoom(); const code = await room.create();
  assert.equal(peers.length, 4);
  assert.ok(peers[0].destroyed && peers[1].destroyed && peers[3].destroyed);
  assert.notEqual(peers[0].id, peers[2].id);
  assert.equal(room.peer, peers[2]); assert.equal(peers[2].destroyed, false);
  assert.equal(peers[2].id, 'sportheads-room-v7-' + code);
  assert.deepEqual(events.errors, []); assert.equal(room.reservation, null);
});

test('all 32 occupied codes are tried once and reported without opening an existing room', async t => {
  const { peers, createRoom } = setup(t, Array(32).fill('unavailable-id'));
  const { room } = createRoom();
  await assert.rejects(room.create(), /Tous les codes de salle sont occupés/);
  assert.equal(peers.length, 32); assert.equal(new Set(peers.map(peer => peer.id)).size, 32);
  assert.ok(peers.every(peer => peer.destroyed));
});

test('closing during the guest-seat check cancels and releases both reservations', async t => {
  const { peers, createRoom } = setup(t, ['open', 'pending']);
  const { room } = createRoom(); const pending = assert.rejects(room.create(), /annulée/);
  await flush(); await flush(); assert.ok(room.reservation);
  room.close(); await pending;
  assert.equal(peers.length, 2); assert.ok(peers.every(peer => peer.destroyed));
  assert.equal(room.reservation, null);
});

test('a throwing welcome send never marks the host ready or connected', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  await room.create();
  const connection = new FakeConnection();
  connection.throwOnSend = true;
  peers[0].incoming(connection);
  connection.openChannel();
  assert.equal(room.connected, false);
  assert.equal(room.connection, null);
  assert.equal(connection.closed, true);
  assert.deepEqual(events.ready, []);
  assert.equal(events.errors.length, 1);
  t.mock.timers.tick(20000);
  assert.equal(events.errors.length, 1, 'failed welcome must clear its heartbeat and deadline');
});

test('the host reserves its slot before open and rejects a third player without dropping its opponent', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  await room.create();
  const opponent = new FakeConnection();
  const third = new FakeConnection();
  peers[0].incoming(opponent);
  peers[0].incoming(third);
  assert.equal(room.connection, opponent, 'pending handshakes reserve the only guest slot');
  third.openChannel();
  assert.deepEqual(third.sent, [{ type: 'reject', reason: 'full' }]);
  opponent.openChannel();
  assert.deepEqual(opponent.sent, [{ type: 'welcome', protocol: PROTOCOL, code: room.code, realtime: 1 }]);
  assert.deepEqual(events.ready, ['host']);
  t.mock.timers.tick(250);
  assert.equal(third.closed, true);
  assert.equal(opponent.closed, false);
  assert.equal(room.connection, opponent);
  assert.equal(room.connected, true);
  assert.deepEqual(events.errors, []);
  assert.deepEqual(events.disconnects, []);
});

for (const [name, welcome] of [
  ['wrong code', { protocol: PROTOCOL, code: 'WXYZ2345' }],
  ['wrong protocol', { protocol: 'other-version', code: 'ABCD2345' }],
]) {
  test(`guest rejects a welcome with ${name} and closes before reporting the error`, async t => {
    const { peers, createRoom } = setup(t);
    const errors = [];
    let room;
    ({ room } = createRoom({ onError: message => {
      assert.equal(room.closed, true);
      assert.equal(room.connected, false);
      assert.equal(peers[0].destroyed, true);
      errors.push(message);
    } }));
    await room.join('ABCD2345');
    const connection = room.connection;
    connection.openChannel();
    connection.emit('data', { type: 'welcome', ...welcome });
    assert.equal(connection.closed, true);
    assert.equal(room.connection, null);
    assert.equal(errors.length, 1);
    t.mock.timers.tick(20000);
    assert.equal(errors.length, 1);
  });
}

test('a signalling outage while waiting keeps the same room and reconnects', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  const code = await room.create();
  const peer = peers[0];
  // PeerJS emits the network error before its disconnected event.
  peer.emit('error', Object.assign(new Error('Lost connection to server'), { type: 'network' }));
  peer.disconnected = true; peer.emit('disconnected');
  assert.equal(room.closed, false);
  assert.equal(peer.destroyed, false);
  assert.equal(room.code, code);
  t.mock.timers.tick(1500);
  assert.equal(peer.reconnects, 1);
  assert.deepEqual(events.errors, []);
  const guest = new FakeConnection(); peer.incoming(guest); guest.openChannel();
  assert.equal(room.connected, true);
  assert.deepEqual(events.ready, ['host']);
});

test('background suspension preserves a channel and return resets its presence deadline', async t => {
  const { createRoom } = setup(t);
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  const connection = room.connection; connection.openChannel();
  connection.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  room.suspend();
  now = 240000; t.mock.timers.tick(240000);
  assert.equal(room.connected, true, 'local suspension is not a lost connection');
  room.resume();
  now += 1000; t.mock.timers.tick(1000);
  assert.equal(room.connected, true, 'return gives the remote channel time to answer');
  connection.emit('data', { type: 'pong' });
  assert.deepEqual(events.disconnects, []);
  connection.close();
  assert.equal(events.disconnects.length, 1, 'an actual departure still disconnects immediately');
});

test('a silent remote browser has two minutes to return before its slot is released', async t => {
  const { createRoom } = setup(t);
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  const connection = room.connection; connection.openChannel();
  connection.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  now = 30000; t.mock.timers.tick(30000);
  assert.equal(room.connected, true, 'sharing an invitation must survive the old eight-second deadline');
  now = 121000; t.mock.timers.tick(91000);
  assert.equal(room.connected, false);
  assert.equal(events.disconnects.length, 1);
  assert.equal(connection.closed, true);
});

test('return reconnects signalling immediately with the existing peer and cancels the retry', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  const code = await room.create();
  peers[0].disconnected = true; peers[0].emit('disconnected');
  room.suspend(); room.resume();
  assert.equal(peers[0].reconnects, 1);
  assert.equal(room.code, code);
  t.mock.timers.tick(1500);
  assert.equal(peers[0].reconnects, 1);
  room.close(); room.resume();
  assert.equal(peers[0].reconnects, 1, 'explicit departure cannot reconnect');
  assert.deepEqual(events.errors, []);
});

test('diagnostics retain the actual ICE failure without room codes, addresses or descriptions', async t => {
  const { createRoom } = setup(t);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  const connection = room.connection;
  connection.peerConnection = { iceConnectionState: 'failed' };
  connection.emit('error', Object.assign(new Error('SDP 192.0.2.14 room ABCD2345'), { type: 'negotiation-failed' }));
  const diagnostic = room.diagnostic();
  assert.ok(diagnostic.events.some(event => event.event === 'channel-error' && event.type === 'negotiation-failed' && event.ice === 'failed'));
  assert.doesNotMatch(JSON.stringify(diagnostic), /192\.0\.2\.14|ABCD2345|SDP/);
  assert.match(events.errors[0], /liaison réseau/);
  assert.doesNotMatch(events.errors[0], /match/);
  assert.equal(room.closed, true);
});

test('route stats survive a lost channel and collection stops on departure', async t => {
  const { peers, createRoom } = setup(t);
  const { room } = createRoom(); await room.create();
  const connection = new FakeConnection();
  const pc = connection.peerConnection = new EventTarget();
  Object.assign(pc, { signalingState: 'stable', iceGatheringState: 'complete', localDescription: { type: 'answer' }, remoteDescription: { type: 'offer' } });
  pc.getStats = t.mock.fn(async () => new Map([['remote', { type: 'remote-candidate', candidateType: 'host', protocol: 'udp', address: '192.0.2.1' }]]));
  peers[0].incoming(connection); await flush();
  assert.equal(room.diagnostic().connectivity.remoteCandidates.length, 1);
  connection.emit('error', { type: 'negotiation-failed' });
  assert.equal(room.diagnostic().connectivity.remoteDescription, 'offer');
  assert.doesNotMatch(JSON.stringify(room.diagnostic()), /192\.0\.2\.1/);
  const samples = pc.getStats.mock.callCount();
  t.mock.timers.tick(30000);
  assert.equal(pc.getStats.mock.callCount(), samples);
});

test('an unanswered offer reports a missing response rather than an ICE network failure', async t => {
  const { createRoom } = setup(t);
  const { room, events } = createRoom(); await room.join('ABCD2345');
  Object.assign(room.connection.peerConnection, { localDescription: { type: 'offer' }, remoteDescription: null, iceConnectionState: 'new' });
  t.mock.timers.tick(18000);
  assert.match(events.errors[0], /Aucune réponse/);
  assert.doesNotMatch(events.errors[0], /autre réseau/);
  assert.ok(room.diagnostic().events.some(event => event.event === 'answer-timeout' && event.ice === 'new'));
  assert.equal(room.closed, true);
});

test('a received answer that fails ICE keeps the network timeout message', async t => {
  const { createRoom } = setup(t);
  const { room, events } = createRoom(); await room.join('ABCD2345');
  Object.assign(room.connection.peerConnection, { localDescription: { type: 'offer' }, remoteDescription: { type: 'answer' }, iceConnectionState: 'checking' });
  t.mock.timers.tick(18000);
  assert.match(events.errors[0], /autre réseau/);
  assert.ok(!room.diagnostic().events.some(event => event.event === 'answer-timeout'));
});

test('a fatal peer error closes the waiting room before calling onError', async t => {
  const { peers, createRoom } = setup(t);
  let room;
  let errors = 0;
  ({ room } = createRoom({ onError: () => {
    errors++;
    assert.equal(room.closed, true);
    assert.equal(room.connected, false);
    assert.equal(peers[0].destroyed, true);
  } }));
  await room.create();
  peers[0].emit('error', Object.assign(new Error('Invalid signalling key'), { type: 'invalid-key' }));
  assert.equal(errors, 1);
  t.mock.timers.tick(30000);
  assert.equal(errors, 1);
});

test('close destroys channels and clears handshake, heartbeat and reconnect work without callbacks', async t => {
  const { peers, createRoom } = setup(t);
  const { room, events } = createRoom();
  await room.join('ABCD2345');
  const connection = room.connection;
  connection.openChannel();
  connection.emit('data', { type: 'welcome', protocol: PROTOCOL, code: room.code });
  assert.equal(room.connected, true);
  peers[0].disconnected = true;
  peers[0].emit('disconnected');
  const sent = connection.sent.length;
  room.close();
  room.close();
  assert.equal(connection.closed, true);
  assert.equal(room.connection, null);
  assert.equal(peers[0].destroyed, true);
  assert.equal(room.connected, false);
  t.mock.timers.tick(30000);
  assert.equal(connection.sent.length, sent);
  assert.equal(peers[0].reconnects, 0);
  assert.deepEqual(events.ready, ['guest']);
  assert.deepEqual(events.errors, []);
  assert.deepEqual(events.disconnects, []);
});

test('a room waits for TURN credentials and passes them to PeerJS', async t => {
  const { peers, createRoom } = setup(t);
  resetIceServers();
  const iceServers = [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' }];
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ iceServers, expiresAt: Date.now() + 3600e3 })));
  const { room } = createRoom();
  await room.create();
  assert.deepEqual(peers[0].options.config.iceServers.at(-1), iceServers[0]);
  assert.ok(room.diagnostic().events.some(event => event.event === 'turn-config' && event.source === 'relay'));
  resetIceServers();
});
