// Offline signaling fixture only. All game data still crosses native WebRTC
// data channels, including the separately negotiated unreliable channel.
async function installLocalPeers(context, seats = new Map()) {
  await context.exposeBinding('__localSignal', async ({ page }, message) => {
    if (message.type === 'register') {
      if (seats.has(message.id)) return false;
      seats.set(message.id, page); return true;
    }
    if (message.type === 'unregister') {
      if (seats.get(message.id) === page) seats.delete(message.id);
      return true;
    }
    const target = seats.get(message.to);
    if (!target || target.isClosed()) return false;
    await target.evaluate(message => window.__receiveLocalSignal(message), message);
    return true;
  });
  await context.addInitScript(() => {
    const peers = new Map();
    class Emitter {
      constructor() { this.handlers = new Map(); }
      on(name, action) { const list = this.handlers.get(name) || []; list.push(action); this.handlers.set(name, list); return this; }
      off(name, action) { this.handlers.set(name, (this.handlers.get(name) || []).filter(fn => fn !== action)); }
      emit(name, ...args) { for (const action of this.handlers.get(name) || []) action(...args); }
    }
    class Connection extends Emitter {
      constructor(owner, peer, connectionId, metadata) {
        super(); Object.assign(this, { owner, peer, connectionId, metadata, open: false });
        const pc = this.peerConnection = new RTCPeerConnection({ iceServers: [] });
        this.candidates = [];
        pc.onicecandidate = event => { if (event.candidate) this.signal({ candidate: event.candidate.toJSON() }); };
        pc.ondatachannel = event => this.bind(event.channel);
        pc.onnegotiationneeded = async () => {
          if (this.closed || pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(await pc.createOffer());
          await this.signal({ description: pc.localDescription.toJSON() });
        };
      }
      signal(data) { return window.__localSignal({ type: 'signal', from: this.owner.id, to: this.peer, connectionId: this.connectionId, metadata: this.metadata, ...data }); }
      bind(channel) {
        this.dataChannel = channel;
        channel.onopen = () => { this.open = true; this.emit('open'); };
        channel.onmessage = event => this.emit('data', JSON.parse(event.data));
        channel.onclose = () => this.close();
      }
      async receive(message) {
        if (message.description) {
          await this.peerConnection.setRemoteDescription(message.description);
          for (const candidate of this.candidates.splice(0)) await this.peerConnection.addIceCandidate(candidate);
          if (message.description.type === 'offer') {
            await this.peerConnection.setLocalDescription(await this.peerConnection.createAnswer());
            await this.signal({ description: this.peerConnection.localDescription.toJSON() });
          }
        } else if (message.candidate) {
          if (this.peerConnection.remoteDescription) await this.peerConnection.addIceCandidate(message.candidate);
          else this.candidates.push(message.candidate);
        }
      }
      send(message) { this.dataChannel.send(JSON.stringify(message)); }
      close() { if (this.closed) return; this.closed = true; this.open = false; this.peerConnection.close(); this.emit('close'); }
    }
    class Peer extends Emitter {
      constructor(id) {
        super(); this.id = id; this.connections = new Map(); this.pending = new Map();
        window.__localSignal({ type: 'register', id }).then(accepted => {
          if (!accepted) { this.emit('error', { type: 'unavailable-id' }); return; }
          if (this.destroyed) { window.__localSignal({ type: 'unregister', id }); return; }
          peers.set(id, this); this.open = true; this.emit('open', id);
        });
      }
      connect(peer, options) {
        const connectionId = crypto.randomUUID(), connection = new Connection(this, peer, connectionId, options.metadata);
        this.connections.set(connectionId, connection);
        connection.bind(connection.peerConnection.createDataChannel('control', { ordered: true }));
        return connection;
      }
      async receive(message) {
        let connection = this.connections.get(message.connectionId);
        if (!connection) {
          if (message.description?.type !== 'offer') {
            const pending = this.pending.get(message.connectionId) || []; pending.push(message); this.pending.set(message.connectionId, pending); return;
          }
          connection = new Connection(this, message.from, message.connectionId, message.metadata);
          this.connections.set(message.connectionId, connection); this.emit('connection', connection);
        }
        await connection.receive(message);
        for (const pending of this.pending.get(message.connectionId) || []) await connection.receive(pending);
        this.pending.delete(message.connectionId);
      }
      reconnect() { this.disconnected = false; this.emit('open', this.id); }
      destroy() {
        if (this.destroyed) return; this.destroyed = true; this.open = false;
        for (const connection of this.connections.values()) connection.close();
        peers.delete(this.id); window.__localSignal({ type: 'unregister', id: this.id });
      }
    }
    window.__receiveLocalSignal = message => peers.get(message.to)?.receive(message);
    window.__localPeerState = () => [...peers.values()].map(peer => ({ open: peer.open, connections: [...peer.connections.values()].map(connection => ({
      open: connection.open, ice: connection.peerConnection.iceConnectionState, gathering: connection.peerConnection.iceGatheringState,
      signaling: connection.peerConnection.signalingState, pendingCandidates: connection.candidates.length })) }));
    // The bundled PeerJS script assigns this property at boot.
    Object.defineProperty(window, 'Peer', { configurable: true, get: () => Peer, set() {} });
  });
}
module.exports = { installLocalPeers };
