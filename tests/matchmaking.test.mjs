import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Matchmaker, LOBBY_ID, SEARCH_LIMIT } from '../web/matchmaking.js';
import { PROTOCOL } from '../web/rooms.js';
import { resetIceServers } from '../web/ice-servers.js';

// A tiny PeerServer: named seats are exclusive and connections pair two ends.
function network(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  resetIceServers({});
  const seats = new Map();
  let anonymous = 0;
  class End extends EventEmitter {
    constructor(peer, metadata) { super(); Object.assign(this, { peer, metadata, open: false }); }
    send(message) { assert.equal(this.open, true); const other = this.other; queueMicrotask(() => other.open && other.emit('data', structuredClone(message))); }
    close() { for (const end of [this, this.other]) if (end.open) { end.open = false; end.emit('close'); } }
  }
  class FakePeer extends EventEmitter {
    constructor(id) {
      super();
      this.id = typeof id === 'string' ? id : `anonymous-${++anonymous}`;
      this.open = false; this.destroyed = false; this.ends = [];
      queueMicrotask(() => {
        if (this.destroyed) return;
        if (seats.has(this.id)) { this.emit('error', Object.assign(new Error('taken'), { type: 'unavailable-id' })); return; }
        seats.set(this.id, this); this.open = true; this.emit('open', this.id);
      });
    }
    connect(target, options) {
      const mine = new End(target, options.metadata), theirs = new End(this.id, options.metadata);
      mine.other = theirs; theirs.other = mine; this.ends.push(mine);
      queueMicrotask(() => {
        const host = seats.get(target);
        if (!host || host.silent) { if (!host) this.emit('error', Object.assign(new Error('missing'), { type: 'peer-unavailable' })); return; }
        host.ends.push(theirs); host.emit('connection', theirs);
        queueMicrotask(() => { mine.open = theirs.open = true; theirs.emit('open'); mine.emit('open'); });
      });
      return mine;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.open = false;
      if (seats.get(this.id) === this) seats.delete(this.id);
      for (const end of this.ends) end.close();
    }
  }
  const previous = globalThis.window;
  globalThis.window = { Peer: FakePeer };
  const players = [];
  t.after(() => { for (const { search } of players) search.close(); globalThis.window = previous; });
  const player = (code = '') => {
    const events = { host: 0, guest: [], timeout: 0 };
    const search = new Matchmaker({
      onHost: () => { events.host++; if (code) search.offer(code); },
      onGuest: found => events.guest.push(found),
      onTimeout: () => events.timeout++,
    });
    players.push({ search, events });
    return { search, events };
  };
  return { seats, player };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('the first player waits in the lobby and hands its room code to the next one', async t => {
  const { seats, player } = network(t);
  const first = player('ABCD2345'); first.search.start(); await settle(); t.mock.timers.tick(1000);
  assert.equal(first.events.host, 1); assert.equal(first.search.waiting, true); assert.ok(seats.has(LOBBY_ID));
  const second = player(); second.search.start(); await settle();
  assert.deepEqual(second.events.guest, ['ABCD2345']);
  assert.equal(second.events.host, 0);
  assert.equal(seats.size, 1, 'the guest releases its temporary signalling peer');
});

test('one waiting room is promised to a single caller; the others retry and take the lobby once it is free', async t => {
  const { seats, player } = network(t);
  const first = player('ABCD2345'); first.search.start(); await settle(); t.mock.timers.tick(1000);
  const second = player(); second.search.start(); await settle();
  const third = player('WXYZ6789'); third.search.start(); await settle();
  assert.deepEqual(second.events.guest, ['ABCD2345']); assert.deepEqual(third.events.guest, []);
  // The pair met: the creator leaves the line.
  first.search.close(); assert.equal(seats.has(LOBBY_ID), false);
  t.mock.timers.tick(2500); await settle();
  assert.equal(third.events.host, 1); assert.equal(third.search.waiting, true);
});

test('a promised guest that never arrives frees the room for the next caller', async t => {
  const { player } = network(t);
  const first = player('ABCD2345'); first.search.start(); await settle(); t.mock.timers.tick(1000);
  const ghost = player(); ghost.search.start(); await settle(); ghost.search.close();
  const next = player(); next.search.start(); await settle();
  assert.deepEqual(next.events.guest, []);
  for (let i = 0; i < 14; i++) { t.mock.timers.tick(2500); await settle(); }
  assert.deepEqual(next.events.guest, ['ABCD2345']);
  // A creator that saw the promised call fail offers its room again at once.
  const last = player(); last.search.start(); await settle();
  assert.deepEqual(last.events.guest, []);
  first.search.reopen(); t.mock.timers.tick(2500); await settle();
  assert.deepEqual(last.events.guest, ['ABCD2345']);
});

test('a lobby that does not answer and a room that cannot be reached are retried, then skipped', async t => {
  const { seats, player } = network(t);
  const first = player('ABCD2345'); first.search.start(); await settle(); t.mock.timers.tick(1000);
  const second = player(); second.search.start(); await settle();
  assert.deepEqual(second.events.guest, ['ABCD2345']);
  second.search.retry('ABCD2345');
  for (let i = 0; i < 14; i++) { t.mock.timers.tick(2500); await settle(); }
  assert.deepEqual(second.events.guest, ['ABCD2345', 'ABCD2345']);
  second.search.retry('ABCD2345');
  for (let i = 0; i < 14; i++) { t.mock.timers.tick(2500); await settle(); }
  assert.equal(second.events.guest.length, 2, 'two failed joins to the same room are enough');
  // A frozen lobby holder (a hidden phone) never answers: callers time out and keep looking.
  seats.get(LOBBY_ID).silent = true;
  const third = player(); third.search.start(); await settle();
  t.mock.timers.tick(10000); await settle();
  assert.deepEqual(third.events.guest, []); assert.equal(third.search.closed, false);
});

test('a page that cannot reach anyone gives up after the search limit and leaves the line', async t => {
  const { seats, player } = network(t);
  const lonely = player('ABCD2345'); lonely.search.start(); await settle();
  t.mock.timers.tick(SEARCH_LIMIT - 1); assert.equal(lonely.events.timeout, 0);
  t.mock.timers.tick(1); assert.equal(lonely.events.timeout, 1);
  assert.equal(lonely.search.closed, true); assert.equal(seats.has(LOBBY_ID), false);
});

test('a hidden page leaves the lobby and takes its place again when shown', async t => {
  const { seats, player } = network(t);
  const waiting = player('ABCD2345'); waiting.search.start(); await settle();
  waiting.search.suspend(); assert.equal(seats.has(LOBBY_ID), false);
  const other = player('WXYZ6789'); other.search.start(); await settle(); t.mock.timers.tick(1000);
  assert.equal(other.search.waiting, true);
  waiting.search.resume(); await settle();
  assert.deepEqual(waiting.events.guest, ['WXYZ6789'], 'the returning page joins whoever waits now');
});

test('callers from another game version are never given a room', async t => {
  const { seats, player } = network(t);
  const first = player('ABCD2345'); first.search.start(); await settle(); t.mock.timers.tick(1000);
  const replies = [];
  const old = new window.Peer(); await settle();
  const connection = old.connect(LOBBY_ID, { metadata: { protocol: 'sportheads-rooms-6' } });
  connection.on('data', message => replies.push(message)); await settle();
  assert.deepEqual(replies, [{ type: 'busy' }]);
  assert.notEqual(PROTOCOL, 'sportheads-rooms-6'); assert.ok(seats.has(LOBBY_ID));
});
