const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-render-cache.cjs URL');
(async () => {
  for (const [name, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch(name === 'chromium' ? { channel: 'chrome', headless: true, args: ['--no-proxy-server'] } : { headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      const result = await page.evaluate(async () => {
        const gameURL = document.querySelector('script[type="module"]').src;
        const source = await (await fetch(gameURL)).text();
        const ref = source.match(/from ['"]([^'"]*render\.js[^'"]*)['"]/)[1];
        const r = await import(new URL(ref, gameURL)); await r.loadAssets({ allStadiums: true });
        // Keep the same rendering path as the live canvas and cache. Forcing a
        // CPU context changes SVG/filter antialiasing in Chromium itself.
        const makeContext = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 540; return c.getContext('2d', { willReadFrequently: false }); };
        const actual = makeContext(), reference = makeContext();
        const engine = { game_body_count: () => 0, game_value: field => field === 8 || field === 9 ? 100 : 1 };
        let state, active = true;
        const original = reference.drawImage;
        // Independent uncached background, using the original drawing order.
        reference.drawImage = function(image, ...args) {
          if (!(image instanceof HTMLCanvasElement)) return original.call(this, image, ...args);
          r.drawSprite(this, 'stadium', state.stadiumFrame || 3, 4.45, -25.1, undefined, undefined, 0, { filter: 'contrast(0.3846153846153846) brightness(1.3)' });
          r.drawSprite(this, 'bottom-bar', 1, 0, 0);
          r.drawSprite(this, 'ground-texture', 1, 400, 470, 800, 20);
          if (active && state.blueprintFrame) r.drawPitch(this, state.blueprintFrame, state.balancedPitches);
        };
        const cases = [null, ...[2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18], 3, 8, null];
        let compared = 0, maxDifference = 0, changedPixels = 0, maxSignificantRatio = 0;
        for (let i = 0; i < cases.length; i++) {
          active = cases[i] !== null;
          state = { stadiumFrame: i % 3 + 1, blueprintFrame: cases[i] || 8, balancedPitches: i % 2 === 0, started: false };
          for (let frame = 0; frame < 2; frame++) {
            r.drawGame(actual, active ? engine : null, state);
            r.drawGame(reference, active ? engine : null, state);
            const a = actual.getImageData(0,0,800,540).data, b = reference.getImageData(0,0,800,540).data;
            let significant = 0;
            for (let p = 0; p < a.length; p++) { const d = Math.abs(a[p] - b[p]); if(d)changedPixels++; if(d>1)significant++; maxDifference = Math.max(maxDifference, d); }
            maxSignificantRatio = Math.max(maxSignificantRatio, significant / a.length);
            compared++;
          }
        }
        const draw = CanvasRenderingContext2D.prototype.drawImage; let stadiumPaints = 0;
        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
          if (image.src?.includes('/stadium-')) stadiumPaints++;
          return draw.call(this, image, ...args);
        };
        try {
          const ctx = makeContext(); active = true; state = { blueprintFrame: 8, balancedPitches: true, started: false };
          r.drawGame(ctx, engine, state); const cold = stadiumPaints;
          for(let i=0;i<120;i++)r.drawGame(ctx,engine,state);
          const warm = stadiumPaints - cold;
          r.drawGame(ctx,engine,{...state,blueprintFrame:3});
          const pitchChange = stadiumPaints - cold - warm;
          const measure = context => { const start=performance.now(); for(let i=0;i<60;i++){r.drawGame(context,engine,state);context.getImageData(0,0,1,1);} return (performance.now()-start)/60; };
          return { compared, maxDifference, changedPixels, maxSignificantRatio, cold, warm, pitchChange, cachedMs: measure(actual), uncachedMs: measure(reference), physicalDeviceTested: false };
        } finally { CanvasRenderingContext2D.prototype.drawImage = draw; }
      });
      // Chromium can antialias short translucent highlight strokes differently
      // in an intermediate canvas. Bound both amplitude and affected area per
      // frame: at least 99.99% of channels must still match within one level.
      assert.ok(result.maxDifference <= 20 && result.maxSignificantRatio <= .0001,
        `cached rendering must match uncached pixels within antialiasing: ${JSON.stringify(result)}`);
      assert.equal(result.cold, 1); assert.equal(result.warm, 0, 'stable background must never redraw SVGs'); assert.equal(result.pitchChange, 1);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ browser: name, passed: true, ...result }));
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
