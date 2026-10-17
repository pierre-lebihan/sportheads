import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Room, PROTOCOL, normalizeCode, validCode } from '../web/rooms.js';

class FakeConnection extends EventEmitter {
  constructor(metadata = { protocol: PROTOCOL }) {
    super();
    this.metadata = metadata;
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
    incoming(connection) { this.channels.push(connection); this.emit('connection', connection); }
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

test('room codes normalize spaces, hyphens and case, and require eight unambiguous characters', async t => {
  assert.equal(normalizeCode(' abcd-2345\n'), 'ABCD2345');
  assert.equal(validCode('ABCD2345'), true);
  for (const code of ['ABCD234', 'ABCD23456', 'ABCDI234', 'ABCDO234', 'ABCD0234', 'ABCD1234', 'abcd2345', 'ABCD!234']) {
    assert.equal(validCode(code), false, code);
  }
  const { peers, createRoom } = setup(t);
  const { room } = createRoom();
  await assert.rejects(room.join('INVALID'), /8 caractères/);
  assert.equal(peers.length, 0, 'invalid codes must not open a signalling connection');
  await room.join(' abcd-2345 ');
  assert.equal(room.code, 'ABCD2345');
  assert.equal(peers[0].target, 'sportheads-room-v3-ABCD2345');
  assert.deepEqual(peers[0].connectOptions.metadata, { protocol: PROTOCOL });
});

test('creation retries an unavailable ID with a new peer and destroys the failed peer', async t => {
  const { peers, createRoom } = setup(t, ['unavailable-id', 'open']);
  const { room, events } = createRoom();
  const code = await room.create();
  assert.equal(peers.length, 2);
  assert.equal(peers[0].destroyed, true);
  assert.equal(peers[1].destroyed, false);
  assert.equal(room.peer, peers[1]);
  assert.equal(validCode(code), true);
  assert.equal(peers[1].id, 'sportheads-room-v3-' + code);
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
  assert.deepEqual(opponent.sent, [{ type: 'welcome', protocol: PROTOCOL, code: room.code }]);
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
