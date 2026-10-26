// A roster-only release can reuse the exact engine from a successful ancestor.
// Compare with that release, not push.before: a previous failed change must stay
// in the diff and keep the complete validation mandatory.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function rosterOnly(paths) {
  return paths.every(file => file.endsWith('.md') || [
    'web/players.js', 'web/roster-access.js', 'web/assets/portraits.webp',
    'tests/roster-access.test.mjs', 'scripts/optimize-portraits.py',
  ].includes(file) || /^web\/assets\/[^/]+\.png$/.test(file));
}

function chooseProfile({ event, ref, forceFull, baseline, ancestor, paths }) {
  if (forceFull || !['push', 'workflow_dispatch'].includes(event) || ref !== 'refs/heads/main') return 'full';
  if (!baseline || baseline.conclusion !== 'success' || !['push', 'workflow_dispatch'].includes(baseline.event) || !ancestor) return 'full';
  return rosterOnly(paths) ? 'roster' : 'full';
}

function main() {
  const root = path.resolve(__dirname, '..');
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
  let profile = 'full', reason = 'Full validation by default', baseline;
  let temporary;
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const forceFull = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.inputs?.force_full !== 'false';
    if (forceFull || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME) || process.env.GITHUB_REF !== 'refs/heads/main') {
      reason = 'Pull requests and forced manual runs use full validation';
    } else {
      const endpoint = `repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?branch=main&status=success&per_page=10`;
      const runs = JSON.parse(run('gh', ['api', endpoint])).workflow_runs;
      baseline = runs.find(item => item.head_branch === 'main' && item.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(item.event));
      if (!baseline || !/^[0-9a-f]{40}$/.test(baseline.head_sha) || !Number.isSafeInteger(baseline.id)) throw Error('No successful reference release');
      run('git', ['merge-base', '--is-ancestor', baseline.head_sha, 'HEAD']);
      const paths = run('git', ['diff', '--name-only', '--no-renames', '-z', baseline.head_sha, 'HEAD']).split('\0').filter(Boolean);
      profile = chooseProfile({ event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, forceFull, baseline, ancestor: true, paths });
      reason = `${paths.length} changed paths since successful run ${baseline.id}`;
      if (profile === 'roster') {
        // The site artifact is produced by this workflow and retained for 14 days.
        // An expired/missing artifact falls back to compiling and testing normally.
        temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sportheads-engine-'));
        run('gh', ['run', 'download', String(baseline.id), '--repo', process.env.GITHUB_REPOSITORY, '--name', 'site', '--dir', temporary]);
        const wasm = fs.readFileSync(path.join(temporary, 'physics-core.wasm'));
        if (!WebAssembly.validate(wasm)) throw Error('Reference engine is not valid WebAssembly');
        fs.mkdirSync(path.join(root, 'probe'), { recursive: true });
        fs.writeFileSync(path.join(root, 'probe/physics-core.wasm'), wasm);
        reason += '; reusing its validated engine';
      }
    }
  } catch (error) {
    profile = 'full';
    reason = `Reference unavailable (${error.message.split('\n')[0]}); using full validation`;
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log(`Validation: ${profile}. ${reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `profile=${profile}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Validation: ${profile}\n\n${reason}\n`);
}

module.exports = { rosterOnly, chooseProfile };
if (require.main === module) main();
