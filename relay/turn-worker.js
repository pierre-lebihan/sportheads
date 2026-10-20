// Cloudflare Worker that hands the game short-lived TURN credentials.
// The TURN key never reaches the browser: it stays in the Worker secrets
// TURN_KEY_ID and TURN_KEY_API_TOKEN. ALLOWED_ORIGINS is a comma-separated
// list of pages allowed to ask (default: the GitHub Pages site).
//
// Spending guards, both optional so an older deployment keeps working:
// - RATE_LIMITER (wrangler.toml binding) caps credential requests per IP.
// - ACCOUNT_ID + ANALYTICS_TOKEN (secret, "Account Analytics: Read") let the
//   Worker read this month's TURN egress and stop handing out credentials once
//   it reaches MONTHLY_BUDGET_GB, well under the 1000 GB free tier. Credentials
//   already given out expire within TTL_SECONDS, which ends their relays too.
const DEFAULT_ORIGINS = 'https://pierre-lebihan.github.io';
// A relay is cut when its credentials expire, so this bounds the longest
// relayed session as well as how long a stopped budget takes to bite.
const TTL_SECONDS = 4 * 3600;
const DEFAULT_BUDGET_GB = 500;
const USAGE_CACHE_MS = 10 * 60000;
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

let usage = null; // { bytes, until } for this isolate

export async function monthEgressBytes(env, now = new Date()) {
  if (usage && now.getTime() < usage.until) return usage.bytes;
  const today = now.toISOString().slice(0, 10);
  const query = `query ($account: string!, $from: Date!, $to: Date!) {
    viewer { accounts(filter: { accountTag: $account }) {
      callsTurnUsageAdaptiveGroups(filter: { date_geq: $from, date_leq: $to }, limit: 1) {
        sum { egressBytes }
      }
    } }
  }`;
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: env.ACCOUNT_ID, from: `${today.slice(0, 8)}01`, to: today } }),
  });
  const body = response.ok ? await response.json() : null;
  if (!body || body.errors?.length) throw new Error(`analytics ${response.status}`);
  const groups = body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups || [];
  const bytes = groups.reduce((total, group) => total + Number(group.sum?.egressBytes || 0), 0);
  usage = { bytes, until: now.getTime() + USAGE_CACHE_MS };
  return bytes;
}

// True once this month's egress reached the budget. An analytics outage keeps
// the relay open: the budget sits far enough under the free tier to absorb it.
async function overBudget(env) {
  if (!env.ACCOUNT_ID || !env.ANALYTICS_TOKEN) return false;
  const budget = Number(env.MONTHLY_BUDGET_GB) || DEFAULT_BUDGET_GB;
  try {
    return await monthEgressBytes(env) >= budget * 1e9;
  } catch (error) {
    console.warn('TURN usage check failed', error.message);
    return false;
  }
}

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

    if (env.RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) return new Response('Too many requests', { status: 429, headers: { ...cors, 'Retry-After': '60' } });
    }
    if (await overBudget(env)) return new Response('Monthly relay budget reached', { status: 503, headers: cors });

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
