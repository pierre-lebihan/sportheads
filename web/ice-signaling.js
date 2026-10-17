// PeerJS 1.5.5 silently drops signals while its WebSocket is connecting.
// Keep them until its next open event. Addresses/SDP stay in memory only.
// https://github.com/peers/peerjs/issues/1373
const signalTypes = new Set(['OFFER', 'ANSWER', 'CANDIDATE']);
function candidateInfo(candidate) {
  const line = candidate?.candidate || '';
  return { type: line.match(/\btyp (host|srflx|prflx|relay)\b/)?.[1] || 'unknown',
    bytes: line.length, midPresent: typeof candidate?.sdpMid === 'string', indexPresent: Number.isInteger(candidate?.sdpMLineIndex) };
}
function plainCandidate(candidate) {
  if (typeof candidate?.candidate !== 'string') return candidate;
  return { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null, usernameFragment: candidate.usernameFragment ?? null };
}
export function protectIceSignaling(peer, record) {
  const socket = peer.socket, queue = [];
  let closed = false, currentId, restoreCandidate;
  const exchanges = { outgoingOffers: 0, incomingOffers: 0, outgoingAnswers: 0, incomingAnswers: 0 };
  let counts;
  const reset = () => { counts = { outgoingCandidates: 0, incomingCandidates: 0, appliedCandidates: 0, rejectedCandidates: 0, remoteEndSignals: 0, queuedSignals: 0, flushedSignals: 0 }; };
  reset();
  const originalSend = socket?.send;
  const ready = () => !peer.disconnected && !!socket?._wsOpen?.();
  function send(message) {
    if (closed || !signalTypes.has(message?.type)) return originalSend.call(socket, message);
    if (message.type === 'OFFER' || message.type === 'ANSWER') {
      exchanges[message.type === 'OFFER' ? 'outgoingOffers' : 'outgoingAnswers']++;
      record('description-signal-send', { type: message.type, socketReady: ready() });
    }
    const belongs = message.payload?.connectionId === currentId;
    if (message.type === 'CANDIDATE') {
      message = { ...message, payload: { ...message.payload, candidate: plainCandidate(message.payload?.candidate) } };
      if (belongs) { counts.outgoingCandidates++; record('candidate-signal-send', { ...candidateInfo(message.payload.candidate), socketReady: ready() }); }
    }
    if (!ready()) {
      if (queue.length < 128) {
        queue.push(message);
        if (belongs) { counts.queuedSignals++; record('signal-queued', { type: message.type }); }
      } else record('signal-queue-full');
      return;
    }
    return originalSend.call(socket, message);
  }
  function flush() {
    if (closed || !ready()) return;
    while (queue.length && ready()) {
      const message = queue.shift();
      if (message.payload?.connectionId === currentId) { counts.flushedSignals++; record('signal-flushed', { type: message.type }); }
      originalSend.call(socket, message);
    }
  }
  function incoming(message) {
    if (closed || (message?.type !== 'OFFER' && message?.type !== 'ANSWER')) return;
    exchanges[message.type === 'OFFER' ? 'incomingOffers' : 'incomingAnswers']++;
    record('description-signal-received', { type: message.type });
  }
  if (socket && originalSend) { socket.send = send; socket.on?.('message', incoming); peer.on('open', flush); }
  return {
    signaling: () => ({ socketOpen: ready(), ...exchanges }),
    snapshot: () => ({ ...counts, pendingRemoteCandidates: Math.max(0, counts.incomingCandidates - counts.appliedCandidates - counts.rejectedCandidates) }),
    watch(connection) {
      restoreCandidate?.(); currentId = connection.connectionId; reset();
      const pc = connection.peerConnection, add = pc?.addIceCandidate;
      if (!add) return;
      let active = true;
      async function receive(candidate) {
        const isCandidate = !!candidate?.candidate;
        if (active) {
          if (isCandidate) counts.incomingCandidates++; else counts.remoteEndSignals++;
          record(isCandidate ? 'remote-candidate-received' : 'remote-candidate-end', candidateInfo(candidate));
        }
        try {
          const result = await add.call(pc, candidate);
          if (active && isCandidate) { counts.appliedCandidates++; record('remote-candidate-applied', candidateInfo(candidate)); }
          return result;
        } catch (error) {
          if (active && isCandidate) { counts.rejectedCandidates++; record('remote-candidate-rejected', { type: error.name }); }
          throw error;
        }
      }
      pc.addIceCandidate = receive;
      restoreCandidate = () => { active = false; if (pc.addIceCandidate === receive) pc.addIceCandidate = add; };
    },
    drop(connectionId) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].payload?.connectionId === connectionId) queue.splice(i, 1);
      if (currentId === connectionId) { restoreCandidate?.(); restoreCandidate = null; currentId = undefined; }
    },
    close() {
      closed = true; queue.length = 0; restoreCandidate?.();
      peer.off?.('open', flush);
      socket?.off?.('message', incoming);
      if (socket?.send === send) socket.send = originalSend;
    },
  };
}
