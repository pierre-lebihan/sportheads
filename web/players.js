// Cosmetic roster: all avatars share the same physical/jump parameters.
export const PLAYER_NAMES = ['Kylian Mbappé', 'Erling Haaland', 'Lamine Yamal', 'Ousmane Dembélé', 'Jude Bellingham', 'Cole Palmer', 'Pedri', 'Vitinha', 'Achraf Hakimi', 'Nuno Mendes', 'Virgil van Dijk', 'Gianluigi Donnarumma', 'Pierre', 'Vilma', 'Thibaud', 'Marie', 'Corentin', 'Pierre Nomad', 'Maël', 'Baptiste', 'Jerem', 'Arthur', 'Vilma Dreadlocks'];
export const PLAYER_COUNT = PLAYER_NAMES.length;
// Keep the original atlas intact; new portraits use their own transparent sheet.
export const AVATAR_SOURCE_FRAMES = [
  ...Array.from({ length: 12 }, (_, index) => ({
    file: 'modern-players.png', sourceRect: [(index % 4) / 4, Math.floor(index / 4) / 3, 1 / 4, 1 / 3],
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'pierre-vilma.png', sourceRect: [index / 2, 0, 1 / 2, 1], flipX: index === 0,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'thibaud-marie.png', sourceRect: [index / 2, 0, 1 / 2, 1],
  })),
  { file: 'corentin-v2.png', sourceRect: [0, 0, 1, 1], flipX: true },
  { file: 'pierre-nomad.png', sourceRect: [0, 0, 1, 1] },
  { file: 'mael.png', sourceRect: [0, 0, 1, 1], flipX: true },
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'baptiste-jerem.png', sourceRect: [index / 2, 0, 1 / 2, 1], flipX: index === 0,
  })),
  { file: 'arthur.png', sourceRect: [0, 0, 1, 1], flipX: true },
  { file: 'vilma-dreadlocks.png', sourceRect: [0, 0, 1, 1] },
];

export const PORTRAIT_TILE_SIZE = 192, PORTRAIT_COLUMNS = 5;
const PORTRAIT_ROWS = Math.ceil(PLAYER_COUNT / PORTRAIT_COLUMNS);
// 192px per face covers the largest preview as well as the 50px match sprite.
export const AVATAR_FRAMES = Object.freeze(AVATAR_SOURCE_FRAMES.map((source, index) => Object.freeze({
  file: 'portraits.webp', sourceRect: [(index % PORTRAIT_COLUMNS) / PORTRAIT_COLUMNS, Math.floor(index / PORTRAIT_COLUMNS) / PORTRAIT_ROWS, 1 / PORTRAIT_COLUMNS, 1 / PORTRAIT_ROWS],
  ...(source.flipX ? { flipX: true } : {}),
})));
