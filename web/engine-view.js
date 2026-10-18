import { MATCH, BUFF, PICKUP_FIELDS, BOMB_FIELDS, EFFECT_FIELDS, readMatch, readPlayer, readCollection } from './engine-contract.js';
import { BONUS_FIELD_COUNT } from './bonuses.js';
const effectNames = ['ring', 'ring-good', 'ring-bad', 'explosion', 'dust', 'trail'];

export function readRenderState(engine, app) {
  const state = { started: app.started, paused: app.paused, skins: app.config.skins.slice(),
    balancedPitches: app.mode === 'online' && app.role === 'guest' ? app.remoteBalancedPitches : true,
    blueprintFrame: app.started ? engine?.game_value(MATCH.pitch) : app.config.pitch };
  if (!engine) return state;
  const match = readMatch(engine);
  state.goalHeights = [match.blueGoalHeight, match.redGoalHeight];
  state.goalFrames = state.goalHeights.map((height, side) => {
    const base = height / (1 - (engine.game_buff_value?.(side, BUFF.goal) || 0) / 100);
    return base > 120 ? 2 : base < 80 ? 3 : 1;
  });
  state.players = [0, 1].map(side => readPlayer(engine, side));
  // Keep the diagnostic/legacy shape while the renderer decodes named bonuses.
  state.bonus = Array.from({ length: BONUS_FIELD_COUNT }, (_, field) => engine.game_bonus_value?.(field) || 0);
  state.powerups = readCollection(engine, 'pickup', PICKUP_FIELDS);
  state.bombs = readCollection(engine, 'bomb', BOMB_FIELDS);
  state.effects = readCollection(engine, 'effect', EFFECT_FIELDS).map(effect => ({ ...effect,
    kind: effectNames[effect.kind], width: effect.kind === 4 ? 10 + effect.age / 2 : effect.width,
    height: effect.kind === 4 ? 10 + effect.age / 2 : effect.height,
    alpha: effect.kind === 4 ? Math.max(0, (1 - effect.age / 10) * .6) : effect.kind === 5 ? Math.max(0, 1 - effect.age / 7) : 1,
  }));
  state.ballBounce = match.bounce;
  return state;
}
