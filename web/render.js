// Original vector sprites exported from the SWF; all registration points and
// timeline frames come from assets/manifest.json, without a Flash runtime.
let manifest;
const images = new Map();
const base = new URL('./assets/', import.meta.url);
let loading;

function imageFor(frame) {
  if (!images.has(frame.file)) {
    const image = new Image();
    image.src = new URL(frame.file, base).href;
    images.set(frame.file, image);
  }
  return images.get(frame.file);
}

export function loadAssets() {
  if (!loading) loading = (async () => {
    const response = await fetch(new URL('manifest.json', base));
    if (!response.ok) throw new Error('Les graphismes du jeu ne sont pas disponibles.');
    manifest = await response.json();
    const pending = [...new Map(Object.values(manifest.sprites).flatMap(sprite => sprite.frames).map(frame => [frame.file, frame])).values()];
    // Bound concurrent SVG decoding (several animation frames reuse one file).
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (pending.length) {
        const frame = pending.pop();
        let loaded=false;
        for(let attempt=0;attempt<3&&!loaded;attempt++){
          try {await imageFor(frame).decode();loaded=true;}
          catch {images.delete(frame.file);}
        }
        if(!loaded)throw new Error(`Impossible de décoder ${frame.file}`);
      }
    }));
    return manifest;
  })();
  return loading;
}

export function getAssets() { return manifest; }

/** Frame numbers are 1-based, like MovieClip.gotoAndStop. Width/height default
 * to native SVG crop dimensions; options.scale scales around the Flash origin. */
export function drawSprite(ctx, name, number, x, y, width, height, angle = 0, options = {}) {
  const sprite = manifest?.sprites[name];
  if (!sprite) return false;
  const index = Math.max(0, Math.min(sprite.frames.length - 1, Math.floor(number || 1) - 1));
  const frame = sprite.frames[index];
  const image = imageFor(frame);
  if (!image.complete || !image.naturalWidth) return false;
  const sx = (width === undefined ? 1 : width / frame.width) * (options.scale ?? 1) * (options.scaleX ?? 1) * (options.flipX ? -1 : 1);
  const sy = (height === undefined ? 1 : height / frame.height) * (options.scale ?? 1) * (options.scaleY ?? 1) * (options.flipY ? -1 : 1);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);
  ctx.globalAlpha *= options.alpha ?? 1;
  if (options.filter) ctx.filter = options.filter;
  ctx.drawImage(image, -frame.originX, -frame.originY, frame.width, frame.height);
  ctx.restore();
  return true;
}

function polygons(ctx, engine) {
  if (!engine.game_vertex_count) return;
  // Initial twelve bodies are the original arena borders already in the artwork.
  // Extra unlabelled polygon bodies describe the selected pitch's obstacles.
  for (let i = 12; i < engine.game_body_count(); i++) {
    if (engine.game_body_value(i, 9) !== 0 || engine.game_body_value(i, 10) === 0) continue;
    const n = engine.game_vertex_count(i); if (!n) continue;
    ctx.save(); ctx.translate(engine.game_body_value(i, 0), engine.game_body_value(i, 1)); ctx.rotate(engine.game_body_value(i, 4));
    const gradient = ctx.createLinearGradient(0, -12, 0, 12); gradient.addColorStop(0, '#4b4d49'); gradient.addColorStop(.45, '#252722'); gradient.addColorStop(1, '#0f110e');
    ctx.fillStyle = gradient; ctx.strokeStyle = '#70736c'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < n; j++) {
      const x = engine.game_vertex_value(i, j, 0), y = engine.game_vertex_value(i, j, 1);
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}

/** Optional state: skins [left,right], goalFrames, powerups [{kind,x,y}],
 * bombs [{x,y}], streakers [{x,y,angle}], effects [{name,frame,x,y,scale,alpha}],
 * headEffects [{ice,bombed,speed}], footFrames [left,right], blueprintFrame. */
export function drawGame(ctx, engine, state = {}) {
  ctx.clearRect(0, 0, 800, 540);
  if (!manifest) { ctx.fillStyle = '#51874d'; ctx.fillRect(0, 0, 800, 540); return; }
  // bgPitch's groundBg child is placed at (4.45,-25.1) in the original scene.
  // Root bgPitch has multiplier128/256 and additive102/255 on all RGB channels.
  drawSprite(ctx, 'stadium', state.stadiumFrame || 3, 4.45, -25.1, undefined, undefined, 0, { filter: 'contrast(0.3846153846153846) brightness(1.3)' });
  drawSprite(ctx, 'bottom-bar', 1, 0, 0);
  drawSprite(ctx, 'ground-texture', 1, 400, 470, 800, 20);
  if (!engine) return;
  if (state.blueprintFrame) drawSprite(ctx, 'blueprints', state.blueprintFrame, 0, 0);
  else polygons(ctx, engine);
  const bodies = [];
  for (let i = 0; i < engine.game_body_count(); i++) {
    if (engine.game_body_value(i, 10) === 0) continue;
    bodies.push({ i, x: engine.game_body_value(i, 0), y: engine.game_body_value(i, 1), angle: engine.game_body_value(i, 4), r: engine.game_body_value(i, 8), role: engine.game_body_value(i, 9) });
  }
  for (const pu of state.powerups || []) drawSprite(ctx, `pu-${pu.kind}`, 1, pu.x, pu.y);
  const aliases = { 'green-ring': 'ring-good', 'red-ring': 'ring-bad' };
  for (const effect of state.effects || []) {
    const name = aliases[effect.kind] || effect.name || effect.kind;
    const frame = effect.frame || (effect.age || 0) + 1;
    drawSprite(ctx, name, frame, effect.x, effect.y, effect.width, effect.height, effect.angle || 0, effect);
  }
  for (const body of bodies) {
    if (body.role === 3) {
      // updateBall maps bounce0->frame3(dead),1->frame1(normal),2->frame2.
      // B2DManager sizes the display object to the physical diameter separately.
      const bounce = state.ballBounce ?? 1;
      const frame = state.ballFrame || (bounce === 0 ? 3 : bounce === 2 ? 2 : 1);
      drawSprite(ctx, 'ball-inside', frame, body.x, body.y, body.r * 2, body.r * 2, body.angle);
    }
    if (body.role === 1 || body.role === 2) {
      const side = body.role - 1;
      const scale = body.r / 20;
      drawSprite(ctx, 'heads', state.skins?.[side] || side + 1, body.x, body.y, undefined, undefined, 0, { scale, flipX: side === 1 });
      const effect = state.players?.[side] || state.headEffects?.[side];
      if (effect?.freeze || effect?.ice || effect?.bombed) drawSprite(ctx, 'body-effect', effect.bombed ? 3 : 2, body.x, body.y, undefined, undefined, 0, { scale });
      if (effect?.speed !== undefined && effect.speed !== 1) drawSprite(ctx, 'speed-bolt', effect.speed === 0 ? 3 : 2, body.x + 12 * scale, body.y + 3 * scale, undefined, undefined, 0, { scale });
    }
  }
  for (const body of bodies) {
    if (body.role === 4 || body.role === 5) {
      const side = body.role - 4;
      const frame = state.footFrames?.[side] || (state.players?.[side]?.broken ? 2 : 1);
      drawSprite(ctx, side === 0 ? 'foot-left' : 'foot-right', frame, body.x, body.y, undefined, undefined, body.angle + Math.PI, { scale: state.footScales?.[side] || state.players?.[side]?.scale || 1 });
    }
  }
  for (const bomb of state.bombs || []) drawSprite(ctx, 'bomb', 1, bomb.x, bomb.y, undefined, undefined, bomb.angle || 0);
  for (const streaker of state.streakers || bodies.filter(body => body.role === 6)) {
    drawSprite(ctx, 'streaker', 1, streaker.x, streaker.y, undefined, undefined, streaker.angle || 0);
    drawSprite(ctx, 'streaker-head', 1, streaker.x, streaker.y, undefined, undefined, 0, { flipX: streaker.flipX });
  }
  drawSprite(ctx, 'goal', state.goalFrames?.[0] || 1, 0, 340);
  drawSprite(ctx, 'goal', state.goalFrames?.[1] || 1, 800, 340, undefined, undefined, 0, { flipX: true });
  const ball = bodies.find(body => body.role === 3);
  if (ball) drawSprite(ctx, 'shadow', 1, ball.x, 463, undefined, undefined, 0, { scaleY: .33332825 });
  if (state.started !== false && !state.paused) {
    const phase = engine.game_value(0);
    if (phase === 0) drawSprite(ctx, 'counter', Math.max(2, 91 - engine.game_value(4)), 400, 50);
    if (phase === 2) drawSprite(ctx, 'goal-words', 2, 400, 80);
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
      if (!unlocked || !manifest?.sounds[name]) return;
      const player = loop && players.has(name) ? players.get(name) : new Audio(new URL(manifest.sounds[name], base).href);
      player.loop = loop; player.volume = volume;
      if (loop) players.set(name, player);
      else { effects.add(player); player.addEventListener('ended', () => effects.delete(player), { once: true }); }
      player.play().catch(() => effects.delete(player));
      return player;
    },
    stop(name) { const player = players.get(name); if (player) { player.pause(); player.currentTime = 0; } },
    stopAll() { for (const player of [...players.values(), ...effects]) player.pause(); effects.clear(); },
  };
}
