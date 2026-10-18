// Deterministic full-physics duels. No assistance or random pickup spawning.
import { readFile } from 'node:fs/promises';
import { AI_LEVELS, createOpponent } from '../web/opponent.js';
import { createOpponent as legacyOpponent } from '../tests/fixtures/opponent-v1.mjs';
const bytes = await readFile(new URL('../probe/physics-core.wasm', import.meta.url));
const swap = mask => (mask & 12) | ((mask & 1) << 1) | ((mask & 2) >> 1);
export function mirror(e) {
  return {
    ...e,
    game_value(field) { return e.game_value(({ 2: 3, 3: 2, 8: 9, 9: 8 })[field] ?? field); },
    game_player_value(side, field) { return e.game_player_value(1 - side, field); },
    game_body_value(i, field) {
      const v = e.game_body_value(i, field);
      return field === 0 ? 800 - v : field === 2 ? -v : field === 9 ? ({ 1: 2, 2: 1, 4: 5, 5: 4 })[v] ?? v : v;
    },
    ...(e.game_ai_plan ? { game_ai_plan(_side, preferred, enemy, expert) { return swap(e.game_ai_plan(0, swap(preferred), swap(enemy), expert)); } } : {}),
  };
}
export async function duel({ level, rival = 'legacy', side = 1, pitch = 8, seed = 1, ticks = 2400 }) {
  const e = (await WebAssembly.instantiate(bytes)).instance.exports;
  e.game_start_balanced_pitch(seed, 3, 0, pitch);
  const ai = createOpponent({ difficulty: level, seed }), rivalAI = (rival === 'legacy' ? legacyOpponent : createOpponent)({ difficulty: rival === 'legacy' ? 'hard' : rival, seed: seed + 123 });
  const left = mirror(e), times = [];
  let played = 0;
  for (; played < ticks && e.game_value(0) !== 3; played++) {
    const start = performance.now(), a = ai.step(side ? e : left);
    times.push(performance.now() - start);
    const b = rivalAI.step(side ? left : e);
    e.game_tick(side ? swap(b) | (a << 4) : swap(a) | (b << 4));
  }
  const own = e.game_value(side ? 3 : 2), other = e.game_value(side ? 2 : 3);
  times.sort((a, b) => a - b);
  return { level, rival, side, pitch, seed, own, other, played, ms: { mean: times.reduce((a,b)=>a+b,0)/times.length, p95: times[Math.floor(times.length*.95)], max: times.at(-1) } };
}
if (process.argv[1]?.endsWith('benchmark-ai.mjs')) {
  const levels = process.argv.includes('--expert') ? ['expert'] : AI_LEVELS.map(level => level.id);
  const rival = process.argv.find(arg => arg.startsWith('--rival='))?.split('=')[1] || 'legacy';
  const results = [];
  for (const level of levels) for (const pitch of (process.argv.includes('--validation') ? [3, 7, 10, 12] : [8, 2, 6, 18])) for (const seed of (process.argv.includes('--validation') ? [3, 4] : [1, 2])) for (const side of [0, 1]) {
    const result = await duel({ level, rival, side, pitch, seed }); results.push(result);
  }
  const summary = levels.map(level => {
    const games = results.filter(g => g.level === level);
    return { level, rival, games: games.length, ahead: games.filter(g=>g.own>g.other).length, tied: games.filter(g=>g.own===g.other).length, behind: games.filter(g=>g.own<g.other).length, completed: games.filter(g=>g.own===3||g.other===3).length,
      goalsFor: games.reduce((n,g)=>n+g.own,0), goalsAgainst: games.reduce((n,g)=>n+g.other,0), maxDecisionMs: Math.max(...games.map(g=>g.ms.max)) };
  });
  console.log(JSON.stringify({ summary, results }, null, 2));
}
