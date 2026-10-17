import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIce, iceServerLabel } from '../web/ice-diagnostics.js';

test('route summary distinguishes received candidates and unanswered connectivity checks without IPs', () => {
  const report = new Map([
    ['local', { id: 'local', type: 'local-candidate', candidateType: 'host', protocol: 'udp', address: 'device-secret.local' }],
    ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'host', protocol: 'udp', address: '192.0.2.14' }],
    ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote', state: 'failed', requestsSent: 7, responsesReceived: 0 }],
    ['sdp', { type: 'certificate', sdp: 'secret SDP', fingerprint: 'secret fingerprint' }],
  ]);
  const summary = summarizeIce(report);
  assert.equal(summary.remoteCandidates.length, 1);
  assert.deepEqual(summary.pairs[0], {
    selected: false, state: 'failed', local: { type: 'host', protocol: 'udp', family: 'mdns' },
    remote: { type: 'host', protocol: 'udp', family: 'ipv4' }, requestsSent: 7, responsesReceived: 0,
    requestsReceived: undefined, responsesSent: undefined, bytesSent: undefined, bytesReceived: undefined,
  });
  assert.doesNotMatch(JSON.stringify(summary), /192\.0\.2\.14|device-secret|SDP|fingerprint/);
});

test('empty remote list stays distinguishable from failed checks and the selected route is retained', () => {
  assert.deepEqual(summarizeIce(new Map()).remoteCandidates, []);
  const report = new Map([
    ['local', { type: 'local-candidate', candidateType: 'srflx', protocol: 'udp', address: '198.51.100.1' }],
    ['remote', { type: 'remote-candidate', candidateType: 'srflx', protocol: 'udp', address: '198.51.100.1' }],
    ['transport', { type: 'transport', selectedCandidatePairId: 'active' }],
    ['active', { id: 'active', type: 'candidate-pair', state: 'succeeded', localCandidateId: 'local', remoteCandidateId: 'remote', bytesReceived: 400 }],
    ...Array.from({ length: 20 }, (_, i) => [`p${i}`, { id: `p${i}`, type: 'candidate-pair', state: 'failed', requestsSent: 10 }]),
  ]);
  const summary = summarizeIce(report);
  assert.equal(summary.sharedReflexiveAddress, true);
  assert.equal(summary.pairCount, 21);
  assert.equal(summary.pairs.length, 12);
  assert.equal(summary.pairs[0].selected, true);
  assert.equal(summary.pairs[0].bytesReceived, 400);
  assert.doesNotMatch(JSON.stringify(summary), /198\.51\.100/);
});

test('server errors are labelled without exposing custom URLs or credentials', () => {
  assert.equal(iceServerLabel('stun:stun.l.google.com:19302'), 'google-stun');
  assert.equal(iceServerLabel('turn:eu-0.turn.peerjs.com:3478'), 'peerjs-eu');
  assert.equal(iceServerLabel('turn:us-0.turn.peerjs.com:3478'), 'peerjs-us');
  assert.equal(iceServerLabel('turns:secret:password@192.0.2.1:443'), 'other-turn');
});
