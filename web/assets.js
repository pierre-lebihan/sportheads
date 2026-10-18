import { AVATAR_FRAMES } from './players.js';

const base = new URL('./assets/', import.meta.url);
function assetURL(file) {
  const url = new URL(file, base), revision = new URL(import.meta.url).searchParams.get('v');
  if (revision) url.searchParams.set('v', revision);
  return url;
}
const images = new Map(), decoded = new Set(), pending = new Map(), queue = [];
let manifest, catalogue, metadata, boot, active = 0, bootReady = false, commonReady = false, bonusesReady = false, common, bonuses;
export const getAssets = () => manifest;
export const assetsReady = () => bootReady;

export function imageFor(frame) {
  if (!images.has(frame.file)) {
    const image = new Image(); image.decoding = 'async'; image.src = assetURL(frame.file).href;
    images.set(frame.file, image);
  }
  return images.get(frame.file);
}
function drain() {
  while (active < 2 && queue.length) {
    const { frame, resolve, reject } = queue.shift(); active++;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await imageFor(frame).decode(); decoded.add(frame.file); return; }
        catch { images.delete(frame.file); }
      }
      throw Error(`Impossible de décoder ${frame.file}`);
    })().then(resolve, reject).finally(() => { active--; drain(); });
  }
}
function ensure(frame) {
  if (decoded.has(frame.file)) return Promise.resolve();
  if (!pending.has(frame.file)) pending.set(frame.file, new Promise((resolve, reject) => { queue.push({ frame, resolve, reject }); drain(); }));
  return pending.get(frame.file);
}
async function readMetadata() {
  if (!metadata) metadata = (async () => {
    const [graphics, runtime] = await Promise.all(['manifest.json', 'runtime.json'].map(async file => {
      const response = await fetch(assetURL(file));
      if (!response.ok) throw Error('Les graphismes du jeu ne sont pas disponibles.');
      return response.json();
    }));
    manifest = graphics; catalogue = runtime;
    manifest.sprites['modern-heads'] = { frames: AVATAR_FRAMES.map(frame => ({ ...frame, width: 50, height: 50, originX: 25, originY: 25 })) };
  })();
  return metadata;
}
async function loadSprites(names) {
  await readMetadata();
  const frames = new Map(names.flatMap(spec => {
    const name = typeof spec === 'string' ? spec : spec.sprite;
    if (!manifest.sprites[name]) throw Error(`Graphisme manquant : ${name}`);
    const selected = typeof spec === 'string' ? manifest.sprites[name].frames : spec.frames.map(number => manifest.sprites[name].frames[number - 1]);
    return selected.map(frame => [frame.file, frame]);
  }));
  await Promise.all([...frames.values()].map(ensure));
}
export function loadAssets({ allStadiums = false } = {}) {
  if (!boot) boot = (async () => {
    await readMetadata(); await loadSprites([...catalogue.boot, 'modern-heads']); bootReady = true; return manifest;
  })();
  return allStadiums ? boot.then(async () => { await loadSprites(['stadium']); return manifest; }) : boot;
}
export const matchAssetsReady = mode => bootReady && commonReady && (mode === 0 || bonusesReady);
export async function prepareMatchAssets(mode) {
  await loadAssets();
  if (!common) common = loadSprites(catalogue.common).then(() => { commonReady = true; });
  await common;
  if (mode !== 0) {
    if (!bonuses) bonuses = loadSprites(catalogue.bonuses).then(() => { bonusesReady = true; });
    await bonuses;
  }
}
export function assetStats() {
  return { images: decoded.size, pending: pending.size - decoded.size,
    decodedBytes: [...decoded].reduce((sum, file) => { const image = images.get(file); return sum + image.naturalWidth * image.naturalHeight * 4; }, 0),
    bootReady, commonReady, bonusesReady };
}
