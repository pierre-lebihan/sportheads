// Anonymous audience measurement (PostHog, EU cloud, project "Sportheads"). The key is public by design.
// No SDK is loaded: each event is one small request sent after the page is ready.
// A random visitor id lives in localStorage for 13 months at most, nothing personal
// is sent, and Do Not Track, Global Privacy Control or ?stats=off turn it off.
export const POSTHOG_KEY = 'phc_yYc3dWFC6psqGbek5mTdVXLiKH8xKgofk5S9NELeG29D';
export const POSTHOG_HOST = 'https://eu.i.posthog.com';
const VISITOR = 'sportheads-visitor', OPT_OUT = 'sportheads-stats-off', VISITOR_DAYS = 395;

export function deviceInfo(ua = '', touchPoints = 0, width = 0) {
  const os = /iPhone|iPad|iPod/.test(ua) || /Macintosh/.test(ua) && touchPoints > 1 ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'Chrome OS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac OS X' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg(A|iOS)?\//.test(ua) ? 'Microsoft Edge' : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
  const tablet = /iPad|Tablet/.test(ua) || os === 'iOS' && !/iPhone|iPod/.test(ua) || os === 'Android' && !/Mobile/.test(ua);
  const device = tablet ? 'Tablet' : /Mobi|iPhone|iPod|Android/.test(ua) || touchPoints > 0 && width > 0 && width < 600 ? 'Mobile' : 'Desktop';
  return { $os: os, $browser: browser, $device_type: device };
}

// relay = through the TURN server, direct = peer to peer, unknown = no selected pair yet.
export function connectionPath(diagnostic) {
  const pair = diagnostic?.connectivity?.pairs?.find(row => row.selected);
  if (!pair) return 'unknown';
  return pair.local?.type === 'relay' || pair.remote?.type === 'relay' ? 'relay' : 'direct';
}

// Reports each match once: started, then finished or left (quit, restart, disconnect).
export function createMatchTracker(track, now = () => performance.now()) {
  let current = null;
  const details = (state) => ({ mode: state.mode, role: state.role || undefined, ai_level: state.difficulty || undefined,
    pitch: state.pitch, target_score: state.targetScore, bonus_mode: state.bonusMode, players: state.skins });
  const result = (state) => ({ score_blue: state.score?.[0], score_red: state.score?.[1], duration_s: Math.round((now() - current.since) / 1000) });
  return (state) => {
    const id = state.started ? `${state.mode}:${state.role}:${state.matchId}` : null;
    if (current && current.id !== id) {
      if (!current.finished) track('match_left', { ...current.details, ...result(current.last) });
      current = null;
    }
    if (id && !current) { current = { id, since: now(), finished: false, details: details(state), last: state }; track('match_started', current.details); }
    if (!current) return;
    current.last = state;
    if (!current.finished && state.phase === 3) {
      current.finished = true;
      const [blue, red] = state.score || [];
      const side = state.mode === 'ai' ? 0 : state.mode === 'online' ? (state.role === 'guest' ? 1 : 0) : null;
      const winner = blue === red ? 'draw' : blue > red ? 'blue' : 'red';
      track('match_finished', { ...current.details, ...result(state), winner,
        outcome: side === null || winner === 'draw' ? undefined : (winner === 'blue') === (side === 0) ? 'win' : 'loss' });
    }
  };
}

function storage(action) { try { return action(localStorage); } catch { return null; } }
function uuid7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)), ms = Date.now();
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 255;
  bytes[6] = bytes[6] & 15 | 112; bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function visitorId() {
  const saved = storage(store => JSON.parse(store.getItem(VISITOR) || 'null'));
  if (saved?.id && Date.now() - saved.since < VISITOR_DAYS * 864e5) return saved.id;
  const id = uuid7();
  storage(store => store.setItem(VISITOR, JSON.stringify({ id, since: Date.now() })));
  return id;
}

export function createAnalytics({ key = POSTHOG_KEY, host = POSTHOG_HOST } = {}) {
  const choice = new URL(location.href).searchParams.get('stats');
  if (choice === 'off') storage(store => { store.setItem(OPT_OUT, '1'); store.removeItem(VISITOR); });
  if (choice === 'on') storage(store => store.removeItem(OPT_OUT));
  const enabled = !!key && location.protocol === 'https:' && !navigator.webdriver && navigator.doNotTrack !== '1'
    && !navigator.globalPrivacyControl && storage(store => store.getItem(OPT_OUT)) !== '1';
  if (!enabled) return { enabled: false, track() {} };
  const distinctId = visitorId(), session = uuid7();
  const common = { ...deviceInfo(navigator.userAgent, navigator.maxTouchPoints, screen.width), $lib: 'sportheads',
    $session_id: session, $process_person_profile: false, $screen_width: screen.width, $screen_height: screen.height,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true };
  function track(event, properties = {}) {
    const url = new URL(location.href); url.search = ''; url.hash = '';
    const body = JSON.stringify({ api_key: key, event, distinct_id: distinctId, timestamp: new Date().toISOString(),
      properties: { ...common, $current_url: url.href, $host: url.host, $pathname: url.pathname, ...properties } });
    // Statistics never get in the way of the game: offline or blocked requests are dropped.
    fetch(`${host}/i/v0/e/`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  }
  const referrer = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : '';
  track('$pageview', { $referrer: referrer || '$direct', $referring_domain: referrer ? new URL(referrer).host : '$direct',
    invited_to_room: new URL(location.href).searchParams.has('room') });
  window.addEventListener('appinstalled', () => track('app_installed'));
  return { enabled: true, track };
}
