// Keep connectivity evidence without recording IPs, mDNS names, SDP or ICE passwords.
const choice = (value, allowed) => allowed.includes(value) ? value : 'unknown';
const count = value => Number.isFinite(value) && value >= 0 ? value : undefined;
function candidate(value = {}) {
  const address = value.address || value.ip || '';
  return {
    type: choice(value.candidateType, ['host', 'srflx', 'prflx', 'relay']),
    protocol: choice(value.protocol, ['udp', 'tcp']),
    family: address.endsWith('.local') ? 'mdns' : address.includes(':') ? 'ipv6' : /^\d+\.\d+\.\d+\.\d+$/.test(address) ? 'ipv4' : 'unknown',
  };
}
export function summarizeIce(report) {
  const rows = [...report.values()];
  const local = rows.filter(row => row.type === 'local-candidate');
  const remote = rows.filter(row => row.type === 'remote-candidate');
  const selected = new Set(rows.filter(row => row.type === 'transport').map(row => row.selectedCandidatePairId));
  const pairs = rows.filter(row => row.type === 'candidate-pair').map(row => ({
    selected: selected.has(row.id) || row.selected === true,
    state: choice(row.state, ['frozen', 'waiting', 'in-progress', 'failed', 'succeeded']),
    local: candidate(report.get(row.localCandidateId)), remote: candidate(report.get(row.remoteCandidateId)),
    requestsSent: count(row.requestsSent), requestsReceived: count(row.requestsReceived),
    responsesReceived: count(row.responsesReceived), responsesSent: count(row.responsesSent),
    bytesSent: count(row.bytesSent), bytesReceived: count(row.bytesReceived),
  })).sort((a, b) => Number(b.selected) - Number(a.selected) || (b.requestsSent || 0) - (a.requestsSent || 0));
  return {
    localCandidates: local.map(candidate), remoteCandidates: remote.map(candidate),
    sharedReflexiveAddress: local.some(a => a.candidateType === 'srflx' && a.address && remote.some(b => b.candidateType === 'srflx' && a.address === b.address)),
    pairCount: pairs.length, pairs: pairs.slice(0, 12),
  };
}
export function iceServerLabel(url = '') {
  if (url.includes('eu-0.turn.peerjs.com')) return 'peerjs-eu';
  if (url.includes('us-0.turn.peerjs.com')) return 'peerjs-us';
  if (url.includes('stun.l.google.com')) return 'google-stun';
  return /^turns?:/.test(url) ? 'other-turn' : 'other-stun';
}
