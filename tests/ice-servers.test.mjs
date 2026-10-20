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
  assert.deepEqual(peerIceOptions(), {});
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
