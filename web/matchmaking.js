import { peerIceOptions } from './ice-servers.js';
import { PROTOCOL, normalizeCode, validCode } from './rooms.js';

// A static site has no queue of its own, so the public PeerServer holds one:
// its single named seat is the waiting line. The player who holds that seat
// already owns an ordinary private room and hands its code to the first player
// who calls; both then meet in that room. Anyone else who calls is told to try
// again, and takes the seat as soon as the pair has left it.
export const LOBBY_ID = 'sportheads-lobby-v7';
// Browser checks queue in a line of their own, away from real players.
const lobbyId = () => typeof globalThis.SPORTHEADS_LOBBY === 'string' ? globalThis.SPORTHEADS_LOBBY : LOBBY_ID;
export const SEARCH_LIMIT = 180000;
const OPEN_TIMEOUT = 15000, ANSWER_TIMEOUT = 9000, OFFER_HOLD = 20000, SEAT_SETTLE = 1000;
const RETRY_MIN = 800, RETRY_SPREAD = 1600;
// A guest that cannot reach the same waiting room twice stops asking for it.
const JOIN_ATTEMPTS = 2;

export class Matchmaker {
  constructor({ onHost, onGuest, onTimeout, onError }) {
    Object.assign(this, { onHost, onGuest, onTimeout, onError });
    this.closed = false; this.suspended = false; this.lobby = null; this.asker = null;
    this.code = ''; this.offeredAt = -Infinity; this.retryTimer = null; this.deadline = null;
    this.failedCodes = new Map(); this.attempt = 0;
  }

  start() {
    this.deadline = setTimeout(() => { if (!this.closed) { this.close(); this.onTimeout?.(); } }, SEARCH_LIMIT);
    this.search();
  }
  // The waiting player's room exists: its code can now be handed out, once
  // PeerServer has released the guest seat that its creation checked.
  offer(code) { clearTimeout(this.offerTimer); this.offerTimer = setTimeout(() => { this.code = code; }, SEAT_SETTLE); }
  // The promised guest failed to connect: the next caller may have the room.
  reopen() { this.offeredAt = -Infinity; }
  // The room could not be created or reached: leave the line and look again.
  retry(code) {
    if (this.closed) return;
    if (code) this.failedCodes.set(code, (this.failedCodes.get(code) || 0) + 1);
    this.release(); this.later();
  }
  // A hidden page cannot answer, so it leaves the line until it is shown again.
  suspend() {
    if (this.closed) return;
    this.suspended = true; clearTimeout(this.retryTimer); this.retryTimer = null;
    this.release();
  }
  resume() {
    if (this.closed || !this.suspended) return;
    this.suspended = false; this.search();
  }
  get waiting() { return !!this.lobby?.open; }

  later(delay = RETRY_MIN + Math.random() * RETRY_SPREAD) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.search(); }, delay);
  }
  release() {
    const lobby = this.lobby, asker = this.asker;
    this.lobby = this.asker = null;
    lobby?.destroy(); asker?.destroy();
  }

  // TURN credentials are fetched once; listeners are bound as soon as a peer exists.
  async ready(attempt) {
    const ice = peerIceOptions();
    if (ice instanceof Promise) await ice;
    return !this.closed && !this.suspended && attempt === this.attempt && !this.lobby && !this.asker;
  }
  peer(id) { const options = { debug: 0, ...peerIceOptions() }; return id ? new window.Peer(id, options) : new window.Peer(options); }

  async search() {
    if (this.closed || this.suspended || this.lobby || this.asker) return;
    const attempt = ++this.attempt;
    if (!await this.ready(attempt)) return;
    const lobby = this.lobby = this.peer(lobbyId());
    let opened = false;
    const timeout = setTimeout(() => { if (!opened && this.lobby === lobby) { this.release(); this.later(); } }, OPEN_TIMEOUT);
    lobby.on('open', () => {
      clearTimeout(timeout);
      if (this.lobby !== lobby) return;
      opened = true; this.onHost?.();
    });
    lobby.on('connection', connection => this.answer(connection));
    // Losing the seat means another player may already wait there: ask it.
    lobby.on('disconnected', () => { if (this.lobby === lobby) { this.release(); this.later(); } });
    lobby.on('error', error => {
      if (this.lobby !== lobby) return;
      if (!opened && error.type === 'unavailable-id') { clearTimeout(timeout); this.release(); this.ask(); return; }
      if (opened && error.type === 'peer-unavailable') return;
      clearTimeout(timeout); this.release();
      if (error.type === 'browser-incompatible') { this.close(); this.onError?.('Ce navigateur ne permet pas de jouer en ligne.'); return; }
      this.later();
    });
  }

  answer(connection) {
    connection.on('error', () => {});
    connection.on('open', () => {
      const now = Date.now();
      const free = this.code && !this.closed && connection.metadata?.protocol === PROTOCOL && now - this.offeredAt > OFFER_HOLD;
      if (free) this.offeredAt = now;
      try { connection.send(free ? { type: 'room', protocol: PROTOCOL, code: this.code } : { type: 'busy' }); } catch { /* It will ask again. */ }
      setTimeout(() => connection.close(), 1000);
    });
  }

  async ask() {
    if (this.closed || this.suspended) return;
    const attempt = this.attempt;
    if (!await this.ready(attempt)) return;
    const asker = this.asker = this.peer();
    let done = false;
    const finish = code => {
      if (done || this.asker !== asker) return;
      done = true; clearTimeout(timeout); this.release();
      if (code) this.onGuest?.(code); else this.later();
    };
    const timeout = setTimeout(() => finish(null), ANSWER_TIMEOUT);
    asker.on('open', () => {
      const connection = asker.connect(lobbyId(), { serialization: 'json', reliable: true, metadata: { protocol: PROTOCOL } });
      connection.on('data', message => {
        const code = normalizeCode(message?.code ?? '');
        if (message?.type === 'room' && message.protocol === PROTOCOL && validCode(code) && (this.failedCodes.get(code) || 0) < JOIN_ATTEMPTS) finish(code);
        else finish(null);
      });
      connection.on('error', () => finish(null));
    });
    asker.on('error', () => finish(null));
  }

  close() {
    this.closed = true; this.attempt++;
    clearTimeout(this.deadline); clearTimeout(this.retryTimer); clearTimeout(this.offerTimer);
    this.release();
  }
}
