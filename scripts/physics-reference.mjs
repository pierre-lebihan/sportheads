// Numerical replay contract captured before the application refactor. Updating
// the fixture is an explicit maintenance operation, never part of test/build.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MATCH_FIELDS, BODY_FIELDS, PLAYER_FIELDS, BONUS_FIELDS, readMatch, readBody, readPlayer, readBonus } from '../web/engine-contract.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function physicsSourceHashes() {
  const files = (await readdir(resolve(root, 'src'))).filter(name => name.endsWith('.rs')).sort();
  return Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update(await readFile(resolve(root, 'src', name))).digest('hex')])));
}
export function physicalState(e) {
  const collection = (name, width) => Array.from({ length: e[`game_${name}_count`]() }, (_, i) =>
    Array.from({ length: width }, (_, field) => e[`game_${name}_value`](i, field)));
  return {
    match: readMatch(e), bodies: Array.from({ length: e.game_body_count() }, (_, index) => ({
      ...readBody(e, index), vertices: Array.from({ length: e.game_vertex_count(index) }, (_, j) => [e.game_vertex_value(index, j, 0), e.game_vertex_value(index, j, 1)]),
    })), players: [0, 1].map(side => readPlayer(e, side)), bonus: readBonus(e),
    buffs: [0, 1].map(side => Array.from({ length: 5 }, (_, stat) => e.game_buff_value(side, stat))),
    pickups: collection('pickup', 4), bombs: collection('bomb', 2), effects: collection('effect', 6),
    contacts: collection('contact', 4),
  };
}
export async function runPhysicsReference(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes), e = instance.exports;
  const cases = [];
  for (const pitch of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]) for (const bonusMode of [0, 1, 2]) {
    e.game_start_balanced_pitch(18371 + pitch, 9, Number(bonusMode !== 0), pitch); e.game_set_bonus_mode(bonusMode);
    e.game_set_buffs(0, 10, 30, 50, 20, 40); e.game_set_buffs(1, 50, 0, 10, 30, 20);
    const hash = createHash('sha256'); let snapshots = 0;
    for (let tick = 0; tick < 600; tick++) {
      if (bonusMode && tick >= 110 && (tick - 110) % 15 === 0) {
        const kind = (tick - 110) / 15 + 1;
        if (kind <= (bonusMode === 2 ? 23 : 18)) e.game_collect(kind, kind % 2);
      }
      const blue = tick % 120 < 50 ? 2 : tick % 120 < 90 ? 1 : 0;
      const red = tick % 110 < 65 ? 1 : 2;
      const input = blue | (tick % 61 < 2 ? 4 : 0) | (tick % 38 < 5 ? 8 : 0)
        | ((red | (tick % 73 < 3 ? 4 : 0) | (tick % 43 < 6 ? 8 : 0)) << 4);
      e.game_tick(input);
      if (tick % 30 === 0 || tick === 599) { hash.update(JSON.stringify(physicalState(e))); snapshots++; }
    }
    cases.push({ pitch, bonusMode, ticks: 600, snapshots, sha256: hash.digest('hex') });
  }
  return { fields: { match: MATCH_FIELDS, body: BODY_FIELDS, player: PLAYER_FIELDS, bonus: BONUS_FIELDS }, cases };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--write')) throw Error('Use --write explicitly to update a physics reference');
  const wasmIndex = process.argv.indexOf('--wasm');
  const wasm = wasmIndex >= 0 ? process.argv[wasmIndex + 1] : resolve(root, 'probe/physics-core.wasm');
  const result = { sourceHashes: await physicsSourceHashes(), ...await runPhysicsReference(await readFile(wasm)) };
  await writeFile(resolve(root, 'tests/fixtures/physics-preservation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Captured ${result.cases.length} cases, ${result.cases.reduce((n, c) => n + c.ticks, 0)} unchanged physics ticks`);
}
