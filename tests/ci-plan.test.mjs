import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { rosterOnly, chooseProfile } = createRequire(import.meta.url)('../scripts/ci-plan.cjs');
const release = { event: 'push', ref: 'refs/heads/main', baseline: { event: 'push', conclusion: 'success' }, ancestor: true, paths: ['web/players.js', 'web/assets/new-player.png', 'web/assets/portraits.webp'] };

test('portraits, group lists, artwork and their focused tests use roster validation', () => {
  assert.equal(chooseProfile(release), 'roster');
  assert.equal(rosterOnly(['web/roster-access.js', 'tests/roster-access.test.mjs', 'scripts/optimize-portraits.py', 'docs/players.md']), true);
});

test('any engine, network, UI, build, dependency or CI change requires the full suite', () => {
  for (const file of ['src/game.rs', 'Cargo.lock', 'web/rooms.js', 'web/game.js', 'web/render.js', 'web/game.css', 'web/assets/runtime.json', 'web/assets/sprites/goal-001.svg', 'scripts/build-pages.py', 'package-lock.json', '.github/workflows/pages.yml', 'tests/net-state.test.mjs', 'scripts/ci-plan.cjs']) {
    assert.equal(chooseProfile({ ...release, paths: [...release.paths, file] }), 'full', file);
  }
});

test('a failed earlier engine change stays in the comparison with the last successful release', () => {
  assert.equal(chooseProfile({ ...release, paths: ['src/game.rs', 'web/assets/new-player.png'] }), 'full');
  assert.equal(chooseProfile({ ...release, baseline: { event: 'push', conclusion: 'failure' } }), 'full');
});

test('unknown references, rewritten history and pull requests always get full validation', () => {
  for (const patch of [{ baseline: undefined }, { ancestor: false }, { event: 'pull_request' }, { ref: 'refs/heads/other' }]) {
    assert.equal(chooseProfile({ ...release, ...patch }), 'full');
  }
});

test('manual runs are full when forced, or classify normally when explicitly requested', () => {
  assert.equal(chooseProfile({ ...release, event: 'workflow_dispatch', forceFull: true }), 'full');
  assert.equal(chooseProfile({ ...release, event: 'workflow_dispatch', forceFull: false, paths: [] }), 'roster');
});

test('the actual planner restores a validated engine, falls back on missing artifacts and retains earlier failed changes', t => {
  const directory = mkdtempSync(join(tmpdir(), 'sportheads-plan-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'repo'), bin = join(directory, 'bin');
  mkdirSync(join(root, 'scripts'), { recursive: true }); mkdirSync(join(root, 'web'));
  mkdirSync(bin);
  copyFileSync(new URL('../scripts/ci-plan.cjs', import.meta.url), join(root, 'scripts/ci-plan.cjs'));
  writeFileSync(join(root, 'web/players.js'), 'before');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.name', 'CI'); git('config', 'user.email', 'ci@example.invalid');
  const commit = () => { git('add', '.'); git('commit', '-qm', 'test'); };
  commit();
  const baseline = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(root, 'web/players.js'), 'after'); commit();
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\n
    const fs = require('node:fs'), path = require('node:path');
    if (process.argv[2] === 'api') console.log(JSON.stringify({workflow_runs: [{id: 1, head_branch: 'main', head_sha: '${baseline}', event: 'push', conclusion: 'success'}]}));
    else {
      if (process.env.MISSING_ARTIFACT) process.exit(1);
      fs.writeFileSync(path.join(process.argv[process.argv.indexOf('--dir') + 1], 'physics-core.wasm'), Buffer.from([0,97,115,109,1,0,0,0]));
    }\n`, { mode: 0o755 });
  const event = join(directory, 'event.json'), output = join(directory, 'output');
  writeFileSync(event, '{}');
  const run = (patch = {}) => {
    writeFileSync(output, '');
    execFileSync(process.execPath, [join(root, 'scripts/ci-plan.cjs')], { cwd: root, stdio: 'pipe', env: {
      ...process.env, PATH: bin + ':' + process.env.PATH, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'test/sportheads', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '', ...patch,
    } });
    return readFileSync(output, 'utf8');
  };
  assert.equal(run(), 'profile=roster\n');
  assert.deepEqual(readFileSync(join(root, 'probe/physics-core.wasm')), wasm);
  assert.equal(run({ MISSING_ARTIFACT: '1' }), 'profile=full\n');
  assert.equal(run({ GITHUB_EVENT_NAME: 'workflow_dispatch' }), 'profile=full\n', 'manual defaults to full');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/game.rs'), 'unvalidated engine change'); commit();
  writeFileSync(join(root, 'web/players.js'), 'later cosmetic push'); commit();
  assert.equal(run(), 'profile=full\n', 'a later cosmetic push cannot hide an earlier engine change');
});
