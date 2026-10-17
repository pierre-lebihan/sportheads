import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { protectIceSignaling } from '../web/ice-signaling.js';

function setup() {
  const peer = new EventEmitter(); let ready = false;
  const sent = [], events = [];
  peer.socket = Object.assign(new EventEmitter(), { _wsOpen: () => ready, send(message) { if (ready) sent.push(JSON.parse(JSON.stringify(message))); } });
  const guard = protectIceSignaling(peer, (event, details) => events.push({ event, ...details }));
  const connection = { connectionId: 'test', peerConnection: { addIceCandidate: async () => {} } };
  guard.watch(connection);
  return { peer, sent, events, guard, connection, open() { ready = true; peer.emit('open'); } };
}
const signal = (type, candidate) => ({ type, payload: { connectionId: 'test', ...(candidate ? { candidate } : {}) } });

test('signals generated before the signalling socket is ready are sent in order after open', () => {
  const { peer, sent, guard, open } = setup();
  const candidate = { candidate: 'candidate:1 1 udp 1 192.0.2.1 4000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  peer.socket.send(signal('ANSWER')); peer.socket.send(signal('CANDIDATE', candidate));
  assert.equal(sent.length, 0); open();
  assert.deepEqual(sent.map(message => message.type), ['ANSWER', 'CANDIDATE']);
  assert.equal(guard.snapshot().queuedSignals, 2); assert.equal(guard.snapshot().flushedSignals, 2);
  peer.emit('open'); assert.equal(sent.length, 2, 'signals are not duplicated by a later open event');
  guard.close();
});

test('description diagnostics distinguish sending an offer from receiving an answer, including without a channel', () => {
  const { peer, sent, events, guard, open } = setup();
  guard.drop('test');
  peer.socket.emit('message', { type: 'OFFER', src: 'private-room-id', payload: { sdp: 'private-sdp' } });
  assert.equal(guard.signaling().incomingOffers, 1, 'a waiting creator can report an offer even without an attached channel');
  peer.socket.send(signal('ANSWER'));
  assert.equal(guard.signaling().outgoingAnswers, 1);
  assert.equal(guard.signaling().socketOpen, false);
  open(); assert.equal(sent.length, 1);
  assert.equal(guard.signaling().outgoingAnswers, 1, 'flushing the same description is not another attempt');
  peer.socket.send(signal('OFFER'));
  assert.equal(guard.signaling().outgoingOffers, 1);
  assert.equal(guard.signaling().incomingAnswers, 0, 'an unanswered offer must remain distinguishable');
  peer.socket.emit('message', { type: 'ANSWER', payload: { sdp: 'private-sdp' } });
  peer.socket.emit('message', { type: 'HEARTBEAT' });
  assert.equal(guard.signaling().incomingAnswers, 1);
  assert.equal(guard.signaling().socketOpen, true);
  assert.doesNotMatch(JSON.stringify({ events, state: guard.signaling() }), /private-room-id|private-sdp/);
  guard.close();
  assert.equal(peer.socket.listenerCount('message'), 0, 'closing removes the observer');
  assert.equal(guard.signaling().incomingAnswers, 1, 'the failed attempt stays available after close');
});

test('native candidate getters are copied explicitly and diagnostic output contains no addresses', () => {
  const { peer, sent, events, guard, open } = setup(); open();
  const candidate = Object.create({ candidate: 'candidate:1 1 udp 1 secret.local 4000 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'private-fragment' });
  assert.deepEqual(JSON.parse(JSON.stringify(candidate)), {});
  peer.socket.send(signal('CANDIDATE', candidate));
  assert.equal(sent[0].payload.candidate.candidate, candidate.candidate);
  assert.equal(sent[0].payload.candidate.sdpMLineIndex, 0);
  assert.doesNotMatch(JSON.stringify({ events, summary: guard.snapshot() }), /secret\.local|private-fragment/);
  guard.close();
});

test('candidate receipt, pending application and rejection stay distinguishable', async () => {
  const { guard, connection, events } = setup();
  let settle;
  guard.drop('test');
  const failure = Object.assign(new Error('private-address'), { name: 'OperationError' });
  connection.peerConnection.addIceCandidate = () => new Promise((resolve, reject) => { settle = reject; });
  guard.watch(connection);
  const pending = connection.peerConnection.addIceCandidate({ candidate: 'candidate:1 1 udp 1 192.0.2.1 4000 typ host' });
  assert.equal(guard.snapshot().incomingCandidates, 1); assert.equal(guard.snapshot().pendingRemoteCandidates, 1);
  settle(failure); await assert.rejects(pending, error => error === failure);
  assert.equal(guard.snapshot().rejectedCandidates, 1); assert.equal(guard.snapshot().pendingRemoteCandidates, 0);
  assert.doesNotMatch(JSON.stringify(events), /private-address|192\.0\.2\.1/);
  guard.close();
});

test('closing or replacing a channel discards its unsent signals', () => {
  const { guard, peer, sent, open } = setup();
  peer.socket.send(signal('OFFER')); guard.drop('test'); open(); assert.equal(sent.length, 0);
  guard.close(); peer.emit('open'); assert.equal(sent.length, 0);
  const waiting = setup();
  waiting.peer.socket.send(signal('ANSWER')); waiting.guard.close(); waiting.open();
  assert.equal(waiting.sent.length, 0, 'leaving while offline never sends the abandoned answer');
});

test('applied candidates are distinct from end signals and delayed results from an old connection', async () => {
  const { guard, connection } = setup();
  await connection.peerConnection.addIceCandidate({ candidate: 'candidate:1 1 udp 1 192.0.2.1 4000 typ host' });
  await connection.peerConnection.addIceCandidate(null);
  assert.equal(guard.snapshot().appliedCandidates, 1);
  assert.equal(guard.snapshot().remoteEndSignals, 1);
  assert.equal(guard.snapshot().pendingRemoteCandidates, 0);
  guard.drop('test');
  let finish;
  connection.peerConnection.addIceCandidate = () => new Promise(resolve => { finish = resolve; });
  guard.watch(connection);
  const pending = connection.peerConnection.addIceCandidate({ candidate: 'candidate:2 1 udp 1 192.0.2.2 4000 typ host' });
  guard.drop('test'); guard.watch({ connectionId: 'replacement', peerConnection: {} });
  finish(); await pending;
  assert.equal(guard.snapshot().appliedCandidates, 0, 'old async completion cannot change the replacement report');
  guard.close();
});
