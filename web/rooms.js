import { summarizeIce, iceServerLabel } from './ice-diagnostics.js';
import { protectIceSignaling } from './ice-signaling.js';

export const PROTOCOL = 'sportheads-rooms-7';
const PREFIX = 'sportheads-room-v7-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SILENCE_TIMEOUT = 120000;
export const NETWORK_REVISION = 5;
export function normalizeCode(value) { return String(value).toUpperCase().replace(/[\s-]/g, ''); }
export function validCode(code) { return /^[A-HJ-NP-Z2-9]{8}$/.test(code); }
function randomCode() { return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => ALPHABET[n & 31]).join(''); }

// Only matchmaking passes through PeerServer. Match snapshots and inputs use
// one encrypted WebRTC data channel; the creator is the sole simulation owner.
export class Room {
  constructor({ onReady, onMessage, onDisconnect, onError }) {
    Object.assign(this, { onReady, onMessage, onDisconnect, onError });
    this.closed = false; this.connected = false; this.peer = null; this.connection = null;
    this.timer = null; this.heartbeat = null; this.code = ''; this.role = null;
    this.suspended = false; this.lastSeen = 0;
    this.hasConnected = false; this.returningHost = false;
    this.events = []; this.createdAt = performance.now();
  }

  record(event, details = {}) {
    const pc = this.connection?.peerConnection;
    this.events.push({ ms: Math.round(performance.now() - this.createdAt), event, ...details,
      ice: pc?.iceConnectionState, channel: this.connection?.dataChannel?.readyState });
    if (this.events.length > 40) this.events.shift();
  }
  diagnostic() {
    return { revision: NETWORK_REVISION, protocol: PROTOCOL, role: this.role,
      browser: globalThis.navigator?.userAgent, online: globalThis.navigator?.onLine,
      connected: this.connected, candidateSignaling: this.iceSignaling?.snapshot(),
      connectivity: this.connectivity, events: this.events.map(event => ({ ...event })) };
  }

  async captureConnectivity(connection) {
    const pc = connection.peerConnection;
    if (!pc?.getStats || this.collectingStats || this.connection !== connection) return;
    this.collectingStats = true;
    try {
      const report = await pc.getStats();
      if (this.connection === connection) this.connectivity = {
        ms: Math.round(performance.now() - this.createdAt),
        signaling: pc.signalingState, gathering: pc.iceGatheringState,
        localDescription: pc.localDescription?.type, remoteDescription: pc.remoteDescription?.type,
        remoteSdpCandidates: (pc.remoteDescription?.sdp?.match(/^a=candidate:/gm) || []).length,
        ...summarizeIce(report),
      };
    } catch { /* Some browsers stop providing stats while closing or suspended. */ }
    finally { this.collectingStats = false; }
  }

  async create() {
    this.role = 'host';
    for (let attempt = 0; attempt < 3; attempt++) {
      this.code = randomCode();
      try { await this.openPeer(PREFIX + this.code); return this.code; }
      catch (error) {
        this.peer?.destroy();
        if (error.type !== 'unavailable-id' || attempt === 2 || this.closed) throw error;
      }
    }
  }

  async join(value) {
    this.code = normalizeCode(value);
    if (!validCode(this.code)) throw new Error('Entrez les 8 caractères du code de la salle.');
    this.role = 'guest';
    // PeerServer atomically reserves each of the room's two named seats.
    // The surviving guest keeps its seat when the creator's page disappears.
    try { await this.openPeer(PREFIX + this.code + '-guest'); }
    catch (error) {
      this.peer?.destroy();
      if (error.type !== 'unavailable-id' || this.closed) throw error;
      this.role = 'host'; this.returningHost = true;
      try { await this.openPeer(PREFIX + this.code); }
      catch (hostError) {
        this.peer?.destroy();
        if (hostError.type === 'unavailable-id') throw new Error('Cette salle est complète. Créez une autre salle.');
        throw hostError;
      }
    }
    if (this.closed) return;
    const connection = this.peer.connect(PREFIX + this.code + (this.role === 'host' ? '-guest' : ''), {
      serialization: 'json', reliable: true, metadata: { protocol: PROTOCOL, role: this.role },
    });
    this.attach(connection);
  }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('Connexion annulée.')); return; }
      this.iceSignaling?.close();
      const peer = this.peer = new window.Peer(id, { debug: 0 });
      this.iceSignaling = protectIceSignaling(peer, (event, details) => this.record(event, details));
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout); this.cancelOpen = null;
        if (error) reject(error); else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Le service de salles ne répond pas. Réessayez.')), 15000);
      this.cancelOpen = () => finish(new Error('Connexion annulée.'));
      let opened = false;
      peer.on('open', () => { this.record('signalling-open'); opened = true; if (this.closed) { peer.destroy(); return; } finish(); });
      peer.on('connection', connection => {
        const oppositeRole = this.role === 'host' ? 'guest' : 'host';
        const expectedPeer = PREFIX + this.code + (oppositeRole === 'guest' ? '-guest' : '');
        if (this.closed || connection.peer !== expectedPeer || connection.metadata?.role !== oppositeRole || connection.metadata?.protocol !== PROTOCOL || this.connection) {
          connection.on('error', () => {});
          connection.on('open', () => {
            connection.send({ type: 'reject', reason: this.connection ? 'full' : 'version' });
            setTimeout(() => connection.close(), 250);
          });
          return;
        }
        this.attach(connection);
      });
      peer.on('disconnected', () => {
        this.record('signalling-disconnected');
        // An established data channel survives signalling outages.
        if (!this.closed && !peer.destroyed && !this.reconnectTimer) this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.closed && !peer.destroyed && peer.disconnected) peer.reconnect();
        }, 1500);
      });
      peer.on('error', error => {
        if (this.closed) return;
        this.record('signalling-error', { type: error.type });
        if (!opened) finish(error);
        // PeerJS reports a transient network error BEFORE emitting disconnected.
        // Keep the host's ID alive while its signalling socket reconnects.
        else if (['network', 'socket-error', 'socket-closed'].includes(error.type)) return;
        else if (!this.connected) this.fail(error.type === 'peer-unavailable'
          ? 'Salle introuvable ou fermée. Vérifiez le code avec son créateur.'
          : 'Connexion impossible. Réessayez ou créez une nouvelle salle.');
      });
    });
  }

  attach(connection) {
    this.connection = connection;
    this.iceSignaling?.watch(connection);
    this.connectivity = undefined;
    this.record('channel-attempt');
    const pc = connection.peerConnection;
    pc?.addEventListener('iceconnectionstatechange', () => { this.record('ice-state'); this.captureConnectivity(connection); });
    pc?.addEventListener('signalingstatechange', () => this.record('sdp-state', { signaling: pc.signalingState }));
    pc?.addEventListener('icegatheringstatechange', () => this.record('gathering-state', { gathering: pc.iceGatheringState }));
    pc?.addEventListener('icecandidate', event => {
      if (event.candidate) this.record('candidate', { type: event.candidate.type, protocol: event.candidate.protocol });
    });
    pc?.addEventListener('icecandidateerror', event => this.record('ice-server-error', { code: event.errorCode, server: iceServerLabel(event.url) }));
    if (pc?.getStats) { this.captureConnectivity(connection); this.statsTimer = setInterval(() => this.captureConnectivity(connection), 1000); }
    let welcomed = false, rateStart = performance.now(), messages = 0;
    this.lastSeen = rateStart;
    this.timer = setTimeout(() => this.lost('La connexion a expiré. Essayez une nouvelle salle ou un autre réseau.'), 18000);
    connection.on('open', () => {
      if (this.closed || this.connection !== connection) { connection.close(); return; }
      this.record('channel-open');
      this.lastSeen = performance.now();
      this.heartbeat = setInterval(() => {
        if (this.suspended) return;
        if (performance.now() - this.lastSeen > SILENCE_TIMEOUT) { this.lost('Connexion perdue. Le match est arrêté.'); return; }
        this.send({ type: 'ping', time: Date.now() });
      }, 1000);
      if (this.role === 'host') {
        if (!this.send({ type: 'welcome', protocol: PROTOCOL, code: this.code }) || this.connection !== connection) return;
        welcomed = true; this.markReady();
      }
    });
    connection.on('data', message => {
      if (this.closed || this.connection !== connection || !message || typeof message !== 'object') return;
      const now = performance.now();
      if (now - rateStart > 1000) { rateStart = now; messages = 0; }
      if (++messages > 240) { this.lost('La connexion a été interrompue.'); return; }
      this.lastSeen = now;
      if (message.type === 'reject') {
        this.fail(message.reason === 'full' ? 'Cette salle est complète. Créez une autre salle.' : 'Versions du jeu différentes. Rechargez les deux pages.'); return;
      }
      if (message.type === 'welcome' && this.role === 'guest' && !welcomed) {
        if (message.protocol !== PROTOCOL || message.code !== this.code) { this.fail('Versions du jeu différentes. Rechargez les deux pages.'); return; }
        welcomed = true; this.markReady(); return;
      }
      if (!welcomed) return;
      if (message.type === 'ping') { this.send({ type: 'pong' }); return; }
      if (message.type !== 'pong') this.onMessage(message);
    });
    connection.on('close', () => { if (this.connection === connection) this.lost('Votre adversaire a quitté la salle.'); });
    connection.on('error', error => {
      if (this.connection !== connection) return;
      this.record('channel-error', { type: error?.type, detail: error?.error?.errorDetail });
      this.lost(this.connected ? 'Connexion perdue. Le match est arrêté.' : 'La liaison réseau entre les deux appareils a échoué. Réessayez de rejoindre la salle.');
    });
  }

  markReady() { this.record('ready'); clearTimeout(this.timer); this.connected = true; this.hasConnected = true; this.onReady(this.role); }
  suspend() { this.suspended = true; }
  resume() {
    if (this.closed) return;
    this.suspended = false; this.lastSeen = performance.now();
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect();
    if (this.connected) this.send({ type: 'ping', time: Date.now() });
  }
  send(message) {
    if (!this.connection?.open) return false;
    // Drop obsolete views instead of building seconds of delay on a slow link.
    if (message.type === 'frame' && this.connection.dataChannel?.bufferedAmount > 65536) return false;
    try { this.connection.send(message); return true; } catch (error) {
      this.record('send-error', { type: error?.name }); this.lost('Connexion perdue. Le match est arrêté.'); return false;
    }
  }
  lost(message) {
    this.record('connection-lost');
    clearTimeout(this.timer); clearInterval(this.heartbeat); clearInterval(this.statsTimer);
    const connection = this.connection; this.connection = null;
    const wasConnected = this.connected; this.connected = false;
    this.iceSignaling?.drop(connection?.connectionId);
    connection?.close();
    if (this.closed) return;
    if (wasConnected) this.onDisconnect(message);
    else this.onError(message);
    if (!this.hasConnected && (this.role === 'guest' || this.returningHost)) this.close();
  }
  fail(message) { if (!this.closed) { this.close(); this.onError(message); } }
  close() {
    this.closed = true; this.connected = false;
    this.cancelOpen?.(); clearTimeout(this.reconnectTimer);
    clearTimeout(this.timer); clearInterval(this.heartbeat); clearInterval(this.statsTimer);
    const connection = this.connection; this.connection = null;
    this.iceSignaling?.close();
    connection?.close(); this.peer?.destroy();
  }
}
