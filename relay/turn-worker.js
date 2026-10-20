// Cloudflare Worker that hands the game short-lived TURN credentials.
// The TURN key never reaches the browser: it stays in the Worker secrets
// TURN_KEY_ID and TURN_KEY_API_TOKEN. ALLOWED_ORIGINS is a comma-separated
// list of pages allowed to ask (default: the GitHub Pages site).
const DEFAULT_ORIGINS = 'https://pierre-lebihan.github.io';
const TTL_SECONDS = 4 * 3600;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(value => value.trim());
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return new Response('Not configured', { status: 503, headers: cors });

    const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!upstream.ok) return new Response('TURN unavailable', { status: 502, headers: cors });
    const { iceServers } = await upstream.json();
    return Response.json({ iceServers, expiresAt: Date.now() + TTL_SECONDS * 1000 },
      { headers: { ...cors, 'Cache-Control': 'no-store' } });
  },
};
