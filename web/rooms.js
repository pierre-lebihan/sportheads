export const PROTOCOL = 'sportheads-rooms-6';
const PREFIX = 'sportheads-room-v6-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
    await this.openPeer();
    if (this.closed) return;
    const connection = this.peer.connect(PREFIX + this.code, {
      serialization: 'json', reliable: true, metadata: { protocol: PROTOCOL },
    });
    this.attach(connection);
  }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('Connexion annulée.')); return; }
      const peer = this.peer = new window.Peer(id, { debug: 0 });
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout); this.cancelOpen = null;
        if (error) reject(error); else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Le service de salles ne répond pas. Réessayez.')), 15000);
      this.cancelOpen = () => finish(new Error('Connexion annulée.'));
      let opened = false;
      peer.on('open', () => { opened = true; if (this.closed) { peer.destroy(); return; } finish(); });
      peer.on('connection', connection => {
        if (this.closed || this.role !== 'host' || connection.metadata?.protocol !== PROTOCOL || this.connection) {
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
        // An established data channel survives signalling outages.
        if (!this.closed && !peer.destroyed && !this.reconnectTimer) this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.closed && !peer.destroyed && peer.disconnected) peer.reconnect();
        }, 1500);
      });
      peer.on('error', error => {
        if (this.closed) return;
        if (!opened) finish(error);
        else if (!this.connected) this.fail(error.type === 'peer-unavailable'
          ? 'Salle introuvable ou fermée. Vérifiez le code avec son créateur.'
          : 'Connexion impossible. Réessayez ou créez une nouvelle salle.');
      });
    });
  }

  attach(connection) {
    this.connection = connection;
    let welcomed = false, lastSeen = performance.now(), rateStart = lastSeen, messages = 0;
    this.timer = setTimeout(() => this.lost('La connexion a expiré. Essayez une nouvelle salle ou un autre réseau.'), 18000);
    connection.on('open', () => {
      if (this.closed || this.connection !== connection) { connection.close(); return; }
      lastSeen = performance.now();
      this.heartbeat = setInterval(() => {
        if (performance.now() - lastSeen > 8000) { this.lost('Connexion perdue. Le match est arrêté.'); return; }
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
      lastSeen = now;
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
    connection.on('error', () => { if (this.connection === connection) this.lost('Connexion perdue. Le match est arrêté.'); });
  }

  markReady() { clearTimeout(this.timer); this.connected = true; this.onReady(this.role); }
  send(message) {
    if (!this.connection?.open) return false;
    // Drop obsolete views instead of building seconds of delay on a slow link.
    if (message.type === 'frame' && this.connection.dataChannel?.bufferedAmount > 65536) return false;
    try { this.connection.send(message); return true; } catch { this.lost('Connexion perdue. Le match est arrêté.'); return false; }
  }
  lost(message) {
    clearTimeout(this.timer); clearInterval(this.heartbeat);
    const connection = this.connection; this.connection = null;
    const wasConnected = this.connected; this.connected = false;
    connection?.close();
    if (this.closed) return;
    if (wasConnected) this.onDisconnect(message);
    else this.onError(message);
    if (this.role === 'guest') this.close();
  }
  fail(message) { if (!this.closed) { this.close(); this.onError(message); } }
  close() {
    this.closed = true; this.connected = false;
    this.cancelOpen?.(); clearTimeout(this.reconnectTimer);
    clearTimeout(this.timer); clearInterval(this.heartbeat);
    const connection = this.connection; this.connection = null;
    connection?.close(); this.peer?.destroy();
  }
}
