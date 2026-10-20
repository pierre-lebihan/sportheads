// Optional TURN fallback for networks that block direct WebRTC routes.
// A static site cannot hold a TURN secret, so a small credential service
// (relay/turn-worker.js) returns short-lived ICE servers. The build fills
// this URL from the SPORTHEADS_TURN_URL repository variable; empty keeps
// the PeerJS built-in servers.
export const TURN_CREDENTIALS_URL = '';
const FETCH_TIMEOUT = 3000;
const RETRY_AFTER_FAILURE = 60000;
const REFRESH_MARGIN = 10 * 60000;
const FALLBACK_STUN = { urls: 'stun:stun.l.google.com:19302' };

let cached = null; // { options, until }
let pending = null;

// Browsers refuse port 53, so those alternate URLs only add gathering errors.
function usableUrl(url) {
  return typeof url === 'string' && /^(?:stun|turns?):/.test(url) && !/:53(?:[/?]|$)/.test(url);
}
export function normalizeIceServers(body) {
  const list = Array.isArray(body?.iceServers) ? body.iceServers : body?.iceServers ? [body.iceServers] : [];
  const servers = [];
  for (const server of list) {
    const urls = (Array.isArray(server?.urls) ? server.urls : [server?.urls]).filter(usableUrl);
    if (!urls.length) continue;
    const relay = urls.some(url => url.startsWith('turn'));
    if (relay && (typeof server.username !== 'string' || typeof server.credential !== 'string')) continue;
    servers.push(relay ? { urls, username: server.username, credential: server.credential } : { urls });
  }
  return servers.some(server => server.urls.some(url => url.startsWith('turn'))) ? [FALLBACK_STUN, ...servers] : null;
}

async function load(url, record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const iceServers = normalizeIceServers(body);
    if (!iceServers) throw new Error('no relay');
    const expiresAt = Number(body.expiresAt);
    const until = Number.isFinite(expiresAt) ? expiresAt - REFRESH_MARGIN : Date.now() + 30 * 60000;
    cached = { options: { config: { iceServers } }, until };
    record('turn-config', { source: 'relay' });
  } catch (error) {
    cached = { options: {}, until: Date.now() + RETRY_AFTER_FAILURE };
    record('turn-config', { source: 'default', reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable' });
  } finally { clearTimeout(timer); pending = null; }
}

// Returns PeerJS options synchronously when known, otherwise a Promise that
// settles once the credential service answered or timed out.
export function peerIceOptions(record = () => {}, url = TURN_CREDENTIALS_URL) {
  if (!url) return {};
  if (cached && Date.now() < cached.until) return cached.options;
  return pending ||= load(url, record);
}
export function resetIceServers() { cached = null; pending = null; }
