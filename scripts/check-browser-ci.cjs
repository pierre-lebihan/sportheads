// Run only local, functional browser scenarios against the exact Pages build.
// Public PeerServer connectivity and device performance are separate checks.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const reports = path.join(root, 'browser-report');
const checks = ['game', 'setup', 'character-selection', 'ai', 'buffs', 'touch-layouts', 'touch-release', 'display', 'balanced-pitches', 'bonus-pitches', 'bonuses', 'runtime', 'offline', 'hd'];
// CI runs these groups as parallel jobs (`--shard 2`), each under 2 minutes.
// Every check belongs to exactly one group, so the jobs together run them all.
const shards = [
  ['ai', 'buffs', 'game', 'setup', 'display'],
  ['character-selection', 'runtime', 'hd'],
  ['touch-layouts', 'bonuses', 'bonus-pitches', 'touch-release', 'balanced-pitches', 'offline'],
];
const grouped = shards.flat();
if (grouped.length !== checks.length || checks.some(name => !grouped.includes(name)))
  throw Error('Browser check shards must contain every check exactly once');
const shardArg = process.argv.indexOf('--shard');
const selected = shardArg < 0 ? checks : shards[Number(process.argv[shardArg + 1]) - 1];
if (!selected) throw Error(`Unknown shard: ${process.argv[shardArg + 1]} (1-${shards.length})`);
const results = [];
let server, child;

async function run(name, url) {
  const directory = path.join(reports, name);
  await fs.mkdir(directory, { recursive: true });
  const started = Date.now();
  console.log(`\nRunning browser check: ${name}`);
  const args = ['setup', 'character-selection', 'bonuses'].includes(name) ? ['--local-only'] : [];
  child = spawn(process.execPath, ['--require', path.join(__dirname, 'browser-ci-hooks.cjs'),
    path.join(__dirname, `check-${name}.cjs`), url, ...args], {
    cwd: root,
    env: { ...process.env, SPORTHEADS_BROWSER_ARTIFACTS: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', timedOut = false;
  for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.on('data', data => { output += data; destination.write(data); });
  }
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 240_000);
  try {
    const [code, signal] = await once(child, 'exit');
    const result = { name, passed: code === 0 && !timedOut, code, signal, timedOut, ms: Date.now() - started };
    await fs.writeFile(path.join(directory, 'output.log'), output);
    results.push(result);
    if (!result.passed) throw Error(`Browser check ${name} failed${timedOut ? ' (240s timeout)' : ` (exit ${code}, signal ${signal})`}`);
  } finally { clearTimeout(timeout); child = undefined; }
}

async function main() {
  await fs.rm(reports, { recursive: true, force: true });
  await fs.mkdir(reports, { recursive: true });
  await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
  await fs.access(path.join(root, '_site', 'index.html'));
  server = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'serve.py'), '--port', '0', '--directory', '_site'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stderr.on('data', data => { serverLog += data; });
  const lines = readline.createInterface({ input: server.stdout });
  const timer = setTimeout(() => server.kill(), 10_000);
  let url;
  try {
    const [line] = await Promise.race([
      once(lines, 'line'),
      once(server, 'exit').then(([code]) => { throw Error(`Local server exited (${code}): ${serverLog}`); }),
    ]);
    if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(line)) throw Error(`Unexpected server address: ${line}`);
    url = line;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error(`Local build returned HTTP ${response.status}`);
  } finally { clearTimeout(timer); lines.close(); }
  try {
    for (const name of selected) await run(name, url);
  } finally { await fs.writeFile(path.join(reports, 'server.log'), serverLog); }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  child?.kill('SIGKILL'); server?.kill(); process.exit(1);
});
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  server?.kill();
  await fs.mkdir(reports, { recursive: true });
  await fs.writeFile(path.join(reports, 'results.json'), JSON.stringify({ passed: results.length === selected.length && results.every(r => r.passed), results }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Browser checks\n\n${results.map(r => `- ${r.passed ? '✅' : '❌'} ${r.name} (${(r.ms / 1000).toFixed(1)}s)`).join('\n')}\n`);
});
