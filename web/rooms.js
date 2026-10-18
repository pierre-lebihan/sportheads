import { summarizeIce, iceServerLabel } from './ice-diagnostics.js';
import { protectIceSignaling } from './ice-signaling.js';

export const PROTOCOL = 'sportheads-rooms-7';
const PREFIX = 'sportheads-room-v7-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SILENCE_TIMEOUT = 120000;
const REALTIME_LABEL = 'sportheads-realtime-v1';
export const NETWORK_REVISION = 7;
export function normalizeCode(value) { return String(value).toUpperCase().replace(/[\s-]/g, ''); }
export function validCode(code) { return /^(?:[A-HJ-NP-Z2-9]|[A-HJ-NP-Z2-9]{8})$/.test(code); }
function randomCode() { return ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] & 31]; }
export const CODE_HELP = 'Entrez le caractère du code de la salle.';

// Only matchmaking passes through PeerServer. Match snapshots and inputs use
// encrypted WebRTC data channels; the creator is the sole simulation owner.
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
      signaling: { ...this.iceSignaling?.signaling(), peerOpen: this.peer?.open === true,
        peerDisconnected: this.peer?.disconnected === true, peerDestroyed: this.peer?.destroyed === true,
        suspended: this.suspended },
      realtime: { open: this.realtime?.readyState === 'open', bufferedBytes: this.realtime?.bufferedAmount || 0 },
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
    const first = ALPHABET.indexOf(randomCode());
    for (let attempt = 0; attempt < ALPHABET.length; attempt++) {
      this.code = ALPHABET[(first + attempt) % ALPHABET.length];
      try {
        await this.openPeer(PREFIX + this.code);
        // A surviving guest still owns this room while its creator is away.
        // Check that seat too before offering this short code to a new host.
        const reservation = this.reservation = new Room({});
        await reservation.openPeer(PREFIX + this.code + '-guest');
        return this.code;
      }
      catch (error) {
        this.peer?.destroy();
        if (error.type !== 'unavailable-id' || this.closed) throw error;
      }
      finally { this.reservation?.close(); this.reservation = null; }
    }
    throw new Error('Tous les codes de salle sont occupés. Réessayez après avoir fermé une salle.');
  }

  async join(value) {
    this.code = normalizeCode(value);
    if (!validCode(this.code)) throw new Error(CODE_HELP);
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
          this.record('connection-rejected', { reason: this.closed ? 'closed' : this.connection ? 'occupied'
            : connection.peer !== expectedPeer ? 'seat' : connection.metadata?.role !== oppositeRole ? 'role' : 'protocol' });
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
    let realtimeAttempted = false;
    const bindRealtime = channel => {
      if (channel.label !== REALTIME_LABEL) return;
      if (this.connection !== connection || this.realtime) { channel.close(); return; }
      this.realtime = channel;
      channel.onopen = () => this.record('realtime-open');
      channel.onclose = () => { if (this.realtime === channel) this.realtime = null; };
      channel.onerror = () => { channel.close(); };
      channel.onmessage = event => {
        if (typeof event.data !== 'string' || event.data.length > 65536) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message?.type === 'frame' || message?.type === 'input') receive(message);
      };
    };
    if (pc) {
      // PeerJS 1.5.5 otherwise adopts EVERY incoming channel as its reliable one.
      const originalDataChannel = pc.ondatachannel;
      pc.ondatachannel = event => {
        if (event.channel.label === REALTIME_LABEL) bindRealtime(event.channel);
        else originalDataChannel?.call(pc, event);
      };
    }
    const enableRealtime = () => {
      if (this.role !== 'host' || realtimeAttempted || !pc?.createDataChannel) return;
      realtimeAttempted = true;
      try { bindRealtime(pc.createDataChannel(REALTIME_LABEL, { ordered: false, maxRetransmits: 0 })); }
      catch { /* Keep using the reliable channel if this browser cannot open it. */ }
    };
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
    this.timer = setTimeout(() => {
      if (pc?.localDescription?.type === 'offer' && !pc.remoteDescription) {
        this.record('answer-timeout');
        this.lost('Aucune réponse de l’autre joueur. Vérifiez qu’il est sur le jeu et que le code correspond à sa salle actuelle.');
      } else this.lost('La connexion a expiré. Essayez une nouvelle salle ou un autre réseau.');
    }, 18000);
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
        if (!this.send({ type: 'welcome', protocol: PROTOCOL, code: this.code, realtime: 1 }) || this.connection !== connection) return;
        welcomed = true; this.markReady();
      }
    });
    const receive = message => {
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
        welcomed = true;
        if (message.realtime === 1) this.send({ type: 'capabilities', realtime: 1 });
        this.markReady(); return;
      }
      if (!welcomed) return;
      if (message.type === 'capabilities') { if (message.realtime === 1) enableRealtime(); return; }
      if (message.type === 'ping') { this.send({ type: 'pong' }); return; }
      if (message.type !== 'pong') this.onMessage(message);
    };
    connection.on('data', receive);
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
  send(message, { volatile = false } = {}) {
    if (!this.connection?.open) return false;
    const realtime = this.realtime;
    if (volatile && ['frame', 'input'].includes(message.type) && realtime?.readyState === 'open') {
      // Old positions and held-key samples have no value once a newer one exists.
      if (realtime.bufferedAmount > 16384) return false;
      try { realtime.send(JSON.stringify(message)); return true; }
      catch (error) {
        this.record('realtime-send-error', { type: error.name });
        if (this.realtime === realtime) this.realtime = null;
        realtime.close();
      }
    }
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
    const realtime = this.realtime; this.realtime = null; realtime?.close();
    connection?.close();
    if (this.closed) return;
    if (wasConnected) this.onDisconnect(message);
    else this.onError(message);
    if (!this.hasConnected && (this.role === 'guest' || this.returningHost)) this.close();
  }
  fail(message) { if (!this.closed) { this.close(); this.onError(message); } }
  close() {
    this.closed = true; this.connected = false;
    this.reservation?.close();
    this.cancelOpen?.(); clearTimeout(this.reconnectTimer);
    clearTimeout(this.timer); clearInterval(this.heartbeat); clearInterval(this.statsTimer);
    const connection = this.connection; this.connection = null;
    this.iceSignaling?.close();
    const realtime = this.realtime; this.realtime = null; realtime?.close();
    connection?.close(); this.peer?.destroy();
  }
}
