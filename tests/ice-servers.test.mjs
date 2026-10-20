import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIceServers, peerIceOptions, resetIceServers } from '../web/ice-servers.js';
import worker from '../relay/turn-worker.js';

const cloudflare = { iceServers: [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
    username: 'user', credential: 'secret' },
] };

test('relay list drops browser-blocked port 53 and keeps a direct STUN first', () => {
  const servers = normalizeIceServers(cloudflare);
  assert.equal(servers[0].urls, 'stun:stun.l.google.com:19302');
  assert.deepEqual(servers[1], { urls: ['stun:stun.cloudflare.com:3478'] });
  assert.deepEqual(servers[2].urls, ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp']);
  assert.equal(servers[2].credential, 'secret');
});

test('responses without a usable relay are rejected', () => {
  assert.equal(normalizeIceServers({}), null);
  assert.equal(normalizeIceServers({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }), null);
  assert.equal(normalizeIceServers({ iceServers: [{ urls: 'turn:turn.cloudflare.com:3478' }] }), null);
  assert.equal(normalizeIceServers({ iceServers: { urls: 'javascript:alert(1)', username: 'a', credential: 'b' } }), null);
});

test('no configured service keeps PeerJS defaults synchronously', () => {
  resetIceServers();
  assert.deepEqual(peerIceOptions(() => {}, ''), {});
});

test('credentials are fetched once, cached, and a failure falls back to defaults', async t => {
  resetIceServers();
  const events = [];
  const record = (event, details) => events.push({ event, ...details });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...cloudflare, expiresAt: Date.now() + 4 * 3600e3 })));
  const pending = peerIceOptions(record, 'https://turn.example');
  assert.ok(pending instanceof Promise);
  assert.equal(peerIceOptions(record, 'https://turn.example'), pending);
  await pending;
  const options = peerIceOptions(record, 'https://turn.example');
  assert.equal(options.config.iceServers.length, 3);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(events, [{ event: 'turn-config', source: 'relay' }]);
  assert.doesNotMatch(JSON.stringify(events), /secret/);

  resetIceServers();
  fetch.mock.mockImplementation(async () => new Response('nope', { status: 502 }));
  await peerIceOptions(record, 'https://turn.example');
  assert.deepEqual(peerIceOptions(record, 'https://turn.example'), {});
  assert.deepEqual(events.at(-1), { event: 'turn-config', source: 'default', reason: 'unavailable' });
  resetIceServers();
});

test('worker only serves the game origin and never returns its API token', async t => {
  const env = { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' };
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(cloudflare)));
  const denied = await worker.fetch(new Request('https://w.example/', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(denied.status, 403);
  assert.equal(upstream.mock.callCount(), 0);
  const ok = await worker.fetch(new Request('https://w.example/', { headers: { Origin: 'https://pierre-lebihan.github.io' } }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://pierre-lebihan.github.io');
  const [url, init] = upstream.mock.calls[0].arguments;
  assert.equal(url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers');
  assert.equal(init.headers.Authorization, 'Bearer token');
  const body = await ok.json();
  assert.ok(body.expiresAt > Date.now());
  assert.doesNotMatch(JSON.stringify(body), /token/);
});

const gameRequest = ip => new Request('https://w.example/', { headers: { Origin: 'https://pierre-lebihan.github.io', 'CF-Connecting-IP': ip } });

test('worker refuses an IP past its rate limit before asking Cloudflare', async t => {
  const seen = new Map();
  const RATE_LIMITER = { limit: async ({ key }) => ({ success: seen.set(key, (seen.get(key) || 0) + 1).get(key) <= 2 }) };
  const env = { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token', RATE_LIMITER };
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(cloudflare)));
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await worker.fetch(gameRequest('1.2.3.4'), env)).status);
  statuses.push((await worker.fetch(gameRequest('5.6.7.8'), env)).status);
  assert.deepEqual(statuses, [200, 200, 429, 200]);
  assert.equal(upstream.mock.callCount(), 3);
});

test('worker stops handing out credentials once the monthly TURN budget is used', async t => {
  // A fresh module copy so the usage cache of other tests does not leak in.
  const { default: fresh, monthEgressBytes } = await import('../relay/turn-worker.js?budget');
  let egress = 499e9;
  const upstream = t.mock.method(globalThis, 'fetch', async (url, init) => url.endsWith('/graphql')
    ? new Response(JSON.stringify({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: egress } }] }] } } }))
    : new Response(JSON.stringify(cloudflare)));
  const env = { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token', ACCOUNT_ID: 'acct', ANALYTICS_TOKEN: 'read', MONTHLY_BUDGET_GB: '500' };
  assert.equal((await fresh.fetch(gameRequest('1.2.3.4'), env)).status, 200);
  const [, init] = upstream.mock.calls[0].arguments;
  const { variables } = JSON.parse(init.body);
  assert.equal(init.headers.Authorization, 'Bearer read');
  assert.match(variables.from, /^\d{4}-\d{2}-01$/);
  egress = 501e9;
  // Cached for ten minutes, then the new figure closes the relay.
  assert.equal(await monthEgressBytes(env), 499e9);
  assert.equal(await monthEgressBytes(env, new Date(Date.now() + 11 * 60000)), 501e9);
  const refused = await fresh.fetch(gameRequest('1.2.3.4'), env);
  assert.equal(refused.status, 503);
  assert.equal(upstream.mock.calls.filter(call => call.arguments[0].includes('rtc.live')).length, 1);
});

test('an analytics outage keeps the relay open', async t => {
  const { default: fresh } = await import('../relay/turn-worker.js?outage');
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('/graphql')
    ? new Response('nope', { status: 500 }) : new Response(JSON.stringify(cloudflare)));
  const env = { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token', ACCOUNT_ID: 'acct', ANALYTICS_TOKEN: 'read' };
  assert.equal((await fresh.fetch(gameRequest('1.2.3.4'), env)).status, 200);
});
