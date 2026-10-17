const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fields = [
  'speed.left', 'speed.right', 'jump.left', 'jump.right',
  'freeze.left', 'freeze.right', 'broken.left', 'broken.right',
  'bombed.left', 'bombed.right', 'ballSize', 'bounce',
  'goalHeight.left', 'goalHeight.right', 'scale.left', 'scale.right',
  'fire', 'streakerAlive', 'timer.speed.left', 'timer.speed.right',
  'timer.jump.left', 'timer.jump.right', 'timer.ice.left', 'timer.ice.right',
  'timer.goal.left', 'timer.goal.right', 'timer.size.left', 'timer.size.right',
  'timer.broken.left', 'timer.broken.right', 'timer.fire', 'timer.ballSize',
  'timer.bounce', 'timer.streaker', 'goalFlag.left', 'goalFlag.right',
];
const checkpoints = [1, 39, 40, 79, 80, 199, 200, 399, 400, 599, 600, 699, 700, 999, 1000];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { scope: 'original PUHandler state and uint timers, all 18 pickups for both collectors, plus interactions', fields, cases: [], errors: [], passed: false };
  const fixture = ['# Original Flash PUHandler numeric states, including timer mistakes.', '# fields ' + fields.join(' ')];
  try {
    const page = await browser.newPage();
    page.on('console', message => { if (/ERROR/.test(message.text())) report.errors.push(message.text()); });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.goto((process.env.PROBE_URL || 'http://127.0.0.1:8765') + '/probe/?file=instrumented');
    await page.waitForFunction(() => window.loaded && typeof window.player?.probeState === 'function', { timeout: 30000 });
    const call = (name, ...args) => page.evaluate(({ name, args }) => window.player.ruffle().callExternalInterface(name, ...args), { name, args });
    await call('probeCall', 'gotoAndPlay', [3]);
    await page.waitForTimeout(200);
    await call('probeCall', 'gotoAndStop', ['menu']);
    await call('probeSet', 'tpPitch', 8);
    await call('probeCall', 'new2PlayerGame', []);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.player.ruffle().suspend());
    await call('probeCall', 'initLevel', []);
    await page.evaluate(() => window.player.ruffle().resume());
    await page.waitForTimeout(200);
    await page.evaluate(() => window.player.ruffle().suspend());
    await call('probeCall', 'Counter.gotoAndStop', [1]);
    const isolatedWasm = process.env.POWERUPS_WASM_PATH ? [...fs.readFileSync(process.env.POWERUPS_WASM_PATH)] : null;
    await page.evaluate(async bytes => {
      const { instance } = bytes
        ? await WebAssembly.instantiate(new Uint8Array(bytes))
        : await WebAssembly.instantiateStreaming(fetch('/probe/physics-core.wasm'));
      window.puCore = instance.exports;
      for (const name of ['pu_probe_reset', 'pu_probe_apply', 'pu_probe_tick', 'pu_probe_value']) {
        if (typeof window.puCore[name] !== 'function') throw new Error('Missing WASM probe ' + name);
      }
    }, isolatedWasm);

    function numericSnapshot(state) {
      const values = Array.isArray(state) ? state : state?.values;
      assert.ok(Array.isArray(values), 'Missing original probePowerupState.values');
      assert.ok(values.length >= fields.length, 'Incomplete original powerup snapshot');
      return values.slice(0, fields.length).map(Number);
    }
    async function rustSnapshot() {
      return page.evaluate(count => Array.from({ length: count }, (_, field) => window.puCore.pu_probe_value(field)), fields.length);
    }
    async function run(name, actions) {
      await call('probePowerupReset');
      await page.evaluate(() => window.puCore.pu_probe_reset());
      const result = { name, passed: true, firstMismatch: null, snapshots: [] };
      fixture.push('case ' + name, 'reset');
      async function compare(label, flashState) {
        const flash = numericSnapshot(flashState);
        const rust = await rustSnapshot();
        const snapshot = { label, flash, rust };
        for (let field = 0; field < fields.length; field++) {
          if ((!Number.isFinite(flash[field]) || !Number.isFinite(rust[field]) || flash[field] !== rust[field]) && !result.firstMismatch) {
            result.firstMismatch = { label, field: fields[field], expected: flash[field], actual: rust[field] };
            result.passed = false;
          }
        }
        result.snapshots.push(snapshot);
        fixture.push('expect ' + flash.join(' '));
      }
      await compare('initial', await call('probePowerupState'));
      for (const action of actions) {
        if (action.apply) {
          const [kind, side] = action.apply;
          fixture.push(`apply ${kind} ${side}`);
          const state = await call('probePowerup', kind, side);
          await page.evaluate(({ kind, side }) => window.puCore.pu_probe_apply(kind, side), { kind, side });
          await compare(`apply-${kind}-${side}`, state);
        } else {
          fixture.push('step ' + action.step);
          const state = await call('probePowerupStep', action.step);
          await page.evaluate(count => { for (let tick = 0; tick < count; tick++) window.puCore.pu_probe_tick(); }, action.step);
          await compare('step-' + action.step, state);
        }
      }
      report.cases.push(result);
      console.log(JSON.stringify({ name, passed: result.passed, firstMismatch: result.firstMismatch }));
    }

    for (let kind = 1; kind <= 18; kind++) {
      for (let side = 0; side < 2; side++) {
        let previous = 0;
        const actions = [{ apply: [kind, side] }];
        for (const tick of checkpoints) { actions.push({ step: tick - previous }); previous = tick; }
        await run(`pickup-${kind}-side-${side}`, actions);
      }
    }
    for (const [name, actions] of [
      ['right-low-jump-existing-timer', [{ apply: [3, 1] }, { step: 150 }, { apply: [4, 1] }, { step: 49 }, { step: 1 }]],
      ['left-ice-existing-timer', [{ apply: [6, 0] }, { step: 100 }, { apply: [5, 1] }, { step: 99 }, { step: 1 }]],
      ['small-ball-existing-size-timer', [{ apply: [10, 0] }, { step: 300 }, { apply: [12, 1] }, { step: 99 }, { step: 1 }, { step: 100 }]],
      ['bouncy-ball-existing-bounce-timer', [{ apply: [13, 0] }, { step: 100 }, { apply: [11, 1] }, { step: 99 }, { step: 1 }, { step: 300 }]],
      ['goals-share-reset', [{ apply: [7, 1] }, { step: 500 }, { apply: [7, 0] }, { step: 99 }, { step: 1 }, { step: 500 }]],
      ['streaker-refresh', [{ apply: [18, 1] }, { step: 900 }, { apply: [18, 0] }, { step: 999 }, { step: 1 }]],
      ['speed-replacement', [{ apply: [1, 1] }, { step: 190 }, { apply: [2, 1] }, { step: 199 }, { step: 1 }]],
    ]) await run(name, actions);

    report.unexpectedErrors = report.errors.filter(error => !error.includes('pb_Preloader_2'));
    report.passed = report.unexpectedErrors.length === 0 && report.cases.every(result => result.passed);
    assert.deepEqual(report.unexpectedErrors, [], 'Unexpected Flash error during powerup comparison');
    assert.ok(report.cases.every(result => result.passed), 'Powerup parity failed; see evidence/powerups-parity.json');
    if (process.argv.includes('--capture')) {
      fs.mkdirSync('tests/fixtures/powerups', { recursive: true });
      fs.writeFileSync('tests/fixtures/powerups/original.txt', fixture.join('\n') + '\n');
    }
    console.log(`PASS ${report.cases.length} powerup cases, ${report.cases.reduce((count, result) => count + result.snapshots.length, 0)} exact snapshots`);
  } finally {
    fs.writeFileSync('evidence/powerups-parity.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
