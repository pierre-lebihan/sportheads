import { PHASE, MATCH, BODY_ROLE, BODY, BONUS_FIELDS, decodeFields, readBonus } from './engine-contract.js';
import { BALANCED_PITCHES, ORIGINAL_PITCHES } from './pitch-geometry.js';
import { NEW_BONUSES } from './bonuses.js';
// Original vector sprites exported from the SWF; all registration points and
// timeline frames come from assets/manifest.json, without a Flash runtime.
import { getAssets, imageFor, assetsReady } from './assets.js';
export { loadAssets, getAssets, prepareMatchAssets, matchAssetsReady, assetStats } from './assets.js';
const base = new URL('./assets/', import.meta.url);
const backgrounds = new WeakMap();

// Small canvas icons share the game's pickup scale and need no external assets.
export function drawBonusPickup(ctx, kind, x, y, scale = 1) {
  const bonus = NEW_BONUSES.find(item => item.id === kind); if (!bonus) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffffed'; ctx.strokeStyle = bonus.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  if (kind === 19) { ctx.moveTo(1,-10); ctx.lineTo(-7,2); ctx.lineTo(0,2); ctx.lineTo(-2,11); ctx.lineTo(8,-3); ctx.lineTo(2,-3); ctx.closePath(); ctx.fillStyle=bonus.color; ctx.fill(); }
  if (kind === 20) { ctx.moveTo(-8,-7); ctx.quadraticCurveTo(0,-4,8,-7); ctx.lineTo(7,3); ctx.quadraticCurveTo(5,8,0,11); ctx.quadraticCurveTo(-5,8,-7,3); ctx.closePath(); ctx.stroke(); }
  if (kind === 21) { ctx.moveTo(-5,-6); ctx.lineTo(-9,9); ctx.lineTo(9,9); ctx.lineTo(5,-6); ctx.closePath(); ctx.fillStyle=bonus.color;ctx.fill();ctx.beginPath();ctx.arc(0,-7,3,Math.PI,0);ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('2×',0,5); }
  if (kind === 22) { ctx.arc(0,-7,3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-6,-1);for(let i=0;i<5;i++)ctx.lineTo(i%2?6:-6,i*2);ctx.lineTo(6,10);ctx.stroke(); }
  if (kind === 23) { ctx.ellipse(0,-2,10,4,0,0,Math.PI*2);ctx.moveTo(-8,0);ctx.lineTo(-10,9);ctx.moveTo(8,0);ctx.lineTo(10,9);ctx.moveTo(-3,-7);ctx.lineTo(0,-10);ctx.lineTo(3,-7);ctx.stroke(); }
  ctx.restore();
}

function drawBonusArena(ctx, bonus, heights) {
  if (bonus.trampoline > 0 || bonus.trampolineFlash > 0) {
    ctx.save(); ctx.strokeStyle='#ad52b5'; ctx.lineWidth=3; ctx.fillStyle='#c76acf55';
    ctx.fillRect(320,452,160,8);ctx.beginPath();ctx.moveTo(320,452);ctx.lineTo(480,452);ctx.stroke();
    for(let x=326;x<480;x+=12){ctx.beginPath();ctx.moveTo(x,454);ctx.lineTo(x+5,458);ctx.lineTo(x,462);ctx.stroke();}
    if(bonus.trampolineFlash>0){ctx.globalAlpha=bonus.trampolineFlash/10;ctx.beginPath();ctx.ellipse(400,450-bonus.trampolineFlash,70,6,0,Math.PI,0);ctx.stroke();}ctx.restore();
  }
  for(const side of [0,1]) {
    if((side ? bonus.redShield : bonus.blueShield)<=0 && (side ? bonus.redShieldFlash : bonus.blueShieldFlash)<=0)continue;
    const x=side?715:85, top=460-heights[side];ctx.save();
    ctx.strokeStyle=(side ? bonus.redShield : bonus.blueShield)>0?'#30c3e7':'#f1b550';ctx.lineWidth=4;ctx.globalAlpha=(side ? bonus.redShield : bonus.blueShield)>0?.8:(side ? bonus.redShieldFlash : bonus.blueShieldFlash)/12;
    ctx.setLineDash((side ? bonus.redShield : bonus.blueShield)>0?[9,4]:[3,8]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,460);ctx.stroke();ctx.restore();
  }
}

/** Frame numbers are 1-based, like MovieClip.gotoAndStop. Width/height default
 * to native SVG crop dimensions; options.scale scales around the Flash origin. */
export function drawSprite(ctx, name, number, x, y, width, height, angle = 0, options = {}) {
  const sprite = getAssets()?.sprites[name];
  if (!sprite) return false;
  const index = Math.max(0, Math.min(sprite.frames.length - 1, Math.floor(number || 1) - 1));
  const frame = sprite.frames[index];
  const image = imageFor(frame);
  if (!image.complete || !image.naturalWidth) return false;
  const sx = (width === undefined ? 1 : width / frame.width) * (options.scale ?? 1) * (options.scaleX ?? 1) * (!!options.flipX !== !!frame.flipX ? -1 : 1);
  const sy = (height === undefined ? 1 : height / frame.height) * (options.scale ?? 1) * (options.scaleY ?? 1) * (options.flipY ? -1 : 1);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);
  ctx.globalAlpha *= options.alpha ?? 1;
  if (options.filter) ctx.filter = options.filter;
  if (frame.sourceRect) {
    const [x, y, w, h] = frame.sourceRect;
    ctx.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, w * image.naturalWidth, h * image.naturalHeight,
      -frame.originX, -frame.originY, frame.width, frame.height);
  } else ctx.drawImage(image, -frame.originX, -frame.originY, frame.width, frame.height);
  ctx.restore();
  return true;
}

// Shared by pitch previews and live matches. The light outer edge separates
// obstacles from the stands; the dark face/edge separates them from the sky.
function paintObstacle(ctx, halfWidth, halfHeight, circle = false) {
  ctx.fillStyle = '#465964'; ctx.fill();
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#f6efd8'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = '#26363e'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); ctx.clip();
  const highlight = ctx.createLinearGradient(0, -halfHeight, 0, halfHeight);
  highlight.addColorStop(0, '#ffffff30'); highlight.addColorStop(.55, '#ffffff00'); highlight.addColorStop(1, '#00000028');
  ctx.fillStyle = highlight; ctx.fillRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
  ctx.strokeStyle = '#d9e1dc'; ctx.globalAlpha *= .55; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (circle) ctx.arc(0, 0, Math.max(0, halfWidth - 4), Math.PI * 1.12, Math.PI * 1.82);
  else { ctx.moveTo(-halfWidth + 3, -halfHeight + 3); ctx.lineTo(halfWidth - 3, -halfHeight + 3); }
  ctx.stroke(); ctx.restore();
}

export function drawPitch(ctx, pitch, balanced = false) {
  const props = (balanced && BALANCED_PITCHES[pitch]) || ORIGINAL_PITCHES[pitch];
  if (!props) return drawSprite(ctx, 'blueprints', pitch, 0, 0);
  for (const [kind, x, y, size, height, angle] of props) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle || 0);
    ctx.beginPath();
    if (kind === 'circle') ctx.arc(0, 0, size, 0, Math.PI * 2);
    else ctx.rect(-size, -height, size * 2, height * 2);
    paintObstacle(ctx, size, kind === 'circle' ? size : height, kind === 'circle');
    ctx.restore();
  }
  return true;
}

function paintBackground(ctx, state, pitch) {
  // bgPitch's groundBg child is placed at (4.45,-25.1) in the original scene.
  // Root bgPitch has multiplier128/256 and additive102/255 on RGB channels.
  drawSprite(ctx, 'stadium', state.stadiumFrame || 3, 4.45, -25.1, undefined, undefined, 0, { filter: 'contrast(0.3846153846153846) brightness(1.3)' });
  drawSprite(ctx, 'bottom-bar', 1, 0, 0);
  drawSprite(ctx, 'ground-texture', 1, 400, 470, 800, 20);
  if (pitch) drawPitch(ctx, pitch, state.balancedPitches);
}

function drawBackground(ctx, state, pitch) {
  // The manifest becomes available before all SVGs have decoded. Never retain
  // an incomplete loading frame. Keep only the current scene, not all pitches.
  const stadium = getAssets()?.sprites.stadium?.frames[(state.stadiumFrame || 3) - 1];
  const image = stadium && imageFor(stadium);
  if (!assetsReady() || !image?.complete || !image.naturalWidth) { paintBackground(ctx, state, pitch); return; }
  const key = `${state.stadiumFrame || 3}:${pitch || 0}:${!!state.balancedPitches}`;
  let cached = backgrounds.get(ctx);
  if (cached?.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 540;
    paintBackground(canvas.getContext('2d'), state, pitch);
    cached = { key, canvas }; backgrounds.set(ctx, cached);
  }
  ctx.drawImage(cached.canvas, 0, 0);
}

function polygons(ctx, engine) {
  if (!engine.game_vertex_count) return;
  // Initial twelve bodies are the original arena borders already in the artwork.
  // Extra unlabelled polygon bodies describe the selected pitch's obstacles.
  for (let i = 12; i < engine.game_body_count(); i++) {
    if (engine.game_body_value(i, BODY.role) !== 0 || engine.game_body_value(i, BODY.active) === 0) continue;
    const n = engine.game_vertex_count(i), radius = engine.game_body_value(i, BODY.radius);
    if (!n && !radius) continue;
    ctx.save(); ctx.translate(engine.game_body_value(i, BODY.x), engine.game_body_value(i, BODY.y)); ctx.rotate(engine.game_body_value(i, BODY.angle));
    ctx.beginPath();
    let halfWidth = radius, halfHeight = radius;
    if (radius) ctx.arc(0, 0, radius, 0, Math.PI * 2);
    for (let j = 0; j < n; j++) {
      const x = engine.game_vertex_value(i, j, 0), y = engine.game_vertex_value(i, j, 1);
      halfWidth = Math.max(halfWidth, Math.abs(x)); halfHeight = Math.max(halfHeight, Math.abs(y));
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); paintObstacle(ctx, halfWidth, halfHeight, !!radius); ctx.restore();
  }
}

/** State comes from engine-view.js; pitch previews supply their own geometry. */
export function drawGame(ctx, engine, state = {}) {
  ctx.clearRect(0, 0, 800, 540);
  if (!getAssets()) { ctx.fillStyle = '#51874d'; ctx.fillRect(0, 0, 800, 540); return; }
  drawBackground(ctx, state, engine && state.blueprintFrame);
  if (!engine) return;
  if (!state.blueprintFrame) polygons(ctx, engine);
  const bonus = state.bonus ? decodeFields(BONUS_FIELDS, state.bonus) : readBonus(engine);
  drawBonusArena(ctx, bonus, state.goalHeights || [engine.game_value(MATCH.blueGoalHeight), engine.game_value(MATCH.redGoalHeight)]);
  const bodies = [];
  for (let i = 0; i < engine.game_body_count(); i++) {
    if (engine.game_body_value(i, BODY.active) === 0) continue;
    bodies.push({ i, x: engine.game_body_value(i, BODY.x), y: engine.game_body_value(i, BODY.y), angle: engine.game_body_value(i, BODY.angle), r: engine.game_body_value(i, BODY.radius), role: engine.game_body_value(i, BODY.role) });
  }
  for (const pu of state.powerups || []) {
    if (pu.kind > 18) drawBonusPickup(ctx, pu.kind, pu.x, pu.y);
    else drawSprite(ctx, `pu-${pu.kind}`, 1, pu.x, pu.y);
  }
  for (const effect of state.effects || []) {
    drawSprite(ctx, effect.kind, (effect.age || 0) + 1, effect.x, effect.y, effect.width, effect.height, 0, effect);
  }
  for (const body of bodies) {
    if (body.role === BODY_ROLE.ball) {
      // updateBall maps bounce0->frame3(dead),1->frame1(normal),2->frame2.
      // B2DManager sizes the display object to the physical diameter separately.
      const bounce = state.ballBounce ?? 1;
      const frame = bounce === 0 ? 3 : bounce === 2 ? 2 : 1;
      if(bonus.shotTrail>0){ctx.save();ctx.strokeStyle='#f2a72a';ctx.globalAlpha=bonus.shotTrail/12;ctx.lineWidth=body.r*1.7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(body.x-engine.game_body_value(body.i, BODY.vx)*.08,body.y-engine.game_body_value(body.i, BODY.vy)*.08);ctx.lineTo(body.x,body.y);ctx.stroke();ctx.restore();}
      drawSprite(ctx, 'ball-inside', frame, body.x, body.y, body.r * 2, body.r * 2, body.angle);
      if(bonus.heavy>0){ctx.save();ctx.strokeStyle='#455a73';ctx.lineWidth=3;ctx.beginPath();ctx.arc(body.x,body.y,body.r+1,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
    if (body.role === BODY_ROLE.blue || body.role === BODY_ROLE.red) {
      const side = body.role - BODY_ROLE.blue;
      const scale = body.r / 20;
      drawSprite(ctx, 'modern-heads', state.skins?.[side] || side + 1, body.x, body.y, undefined, undefined, 0, { scale, flipX: side === 1 });
      const effect = state.players?.[side];
      if (effect?.freeze || effect?.bombed) drawSprite(ctx, 'body-effect', effect.bombed ? 3 : 2, body.x, body.y, undefined, undefined, 0, { scale });
      if (effect?.speed !== undefined && effect.speed !== 1) drawSprite(ctx, 'speed-bolt', effect.speed === 0 ? 3 : 2, body.x + 12 * scale, body.y + 3 * scale, undefined, undefined, 0, { scale });
      for(const [timer,max,color,offset] of [[(side ? bonus.redCharge : bonus.blueCharge),240,'#eba323',8],[(side ? bonus.redSpring : bonus.blueSpring),180,'#88b733',4]]) {
        if(timer<=0)continue;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=offset===4?3+((side ? bonus.redSpringFlash : bonus.blueSpringFlash)||0)/3:3;ctx.beginPath();ctx.arc(body.x,body.y,body.r+offset,-Math.PI/2,-Math.PI/2+Math.PI*2*timer/max);ctx.stroke();ctx.restore();
      }
    }
  }
  for (const body of bodies) {
    if (body.role === BODY_ROLE.blueFoot || body.role === BODY_ROLE.redFoot) {
      const side = body.role - BODY_ROLE.blueFoot;
      const frame = state.players?.[side]?.broken ? 2 : 1;
      drawSprite(ctx, side === 0 ? 'foot-left' : 'foot-right', frame, body.x, body.y, undefined, undefined, body.angle + Math.PI, { scale: state.players?.[side]?.scale || 1 });
    }
  }
  for (const bomb of state.bombs || []) drawSprite(ctx, 'bomb', 1, bomb.x, bomb.y);
  for (const streaker of bodies.filter(body => body.role === BODY_ROLE.streaker)) {
    drawSprite(ctx, 'streaker', 1, streaker.x, streaker.y, undefined, undefined, streaker.angle || 0);
    drawSprite(ctx, 'streaker-head', 1, streaker.x, streaker.y);
  }
  for (const side of [0, 1]) {
    const frame = state.goalFrames?.[side] || 1, baseHeight = frame === 2 ? 140 : frame === 3 ? 60 : 100;
    const factor = state.goalHeights ? (state.goalHeights[side] + 20) / (baseHeight + 20) : 1;
    ctx.save(); ctx.translate(0, 460); ctx.scale(1, factor); ctx.translate(0, -460);
    drawSprite(ctx, 'goal', frame, side ? 800 : 0, 340, undefined, undefined, 0, { flipX: !!side });
    ctx.restore();
  }
  const ball = bodies.find(body => body.role === BODY_ROLE.ball);
  if (ball) drawSprite(ctx, 'shadow', 1, ball.x, 463, undefined, undefined, 0, { scaleY: .33332825 });
  if (state.started !== false && !state.paused) {
    const phase = engine.game_value(MATCH.phase);
    if (phase === PHASE.countdown) drawSprite(ctx, 'counter', Math.max(2, 91 - engine.game_value(MATCH.countdown)), 400, 50);
    if (phase === PHASE.goal) drawSprite(ctx, 'goal-words', 2, 400, 80);
  }
}

// Caller invokes once per simulation event, after a user gesture unlocks audio.
export function createAudio() {
  let unlocked = false;
  const players = new Map();
  const effects = new Set();
  return {
    unlock() { unlocked = true; },
    play(name, { loop = false, volume = .5 } = {}) {
      if (!unlocked || !getAssets()?.sounds[name]) return;
      const player = loop && players.has(name) ? players.get(name) : new Audio(new URL(getAssets().sounds[name], base).href);
      player.loop = loop; player.volume = volume;
      if (loop) players.set(name, player);
      else { effects.add(player); player.addEventListener('ended', () => effects.delete(player), { once: true }); }
      player.play().catch(() => effects.delete(player));
      return player;
    },
    stopAll() { for (const player of [...players.values(), ...effects]) player.pause(); effects.clear(); },
  };
}
