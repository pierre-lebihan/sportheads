// Cosmetic roster: all avatars share the same physical/jump parameters.
export const PLAYER_NAMES = ['Kylian Mbappé', 'Erling Haaland', 'Lamine Yamal', 'Ousmane Dembélé', 'Jude Bellingham', 'Cole Palmer', 'Pedri', 'Vitinha', 'Achraf Hakimi', 'Nuno Mendes', 'Virgil van Dijk', 'Gianluigi Donnarumma', 'Pierre', 'Vilma', 'Thibaud', 'Marie', 'Corentin', 'Pierre Nomad', 'Maël', 'Baptiste', 'Jerem', 'Arthur'];
export const PLAYER_COUNT = PLAYER_NAMES.length;
// Keep the original atlas intact; new portraits use their own transparent sheet.
export const AVATAR_FRAMES = [
  ...Array.from({ length: 12 }, (_, index) => ({
    file: 'modern-players.png', sourceRect: [(index % 4) / 4, Math.floor(index / 4) / 3, 1 / 4, 1 / 3],
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'pierre-vilma.png', sourceRect: [index / 2, 0, 1 / 2, 1], flipX: index === 0,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'thibaud-marie.png', sourceRect: [index / 2, 0, 1 / 2, 1],
  })),
  { file: 'corentin.png', sourceRect: [0, 0, 1, 1], flipX: true },
  { file: 'pierre-nomad.png', sourceRect: [0, 0, 1, 1] },
  { file: 'mael.png', sourceRect: [0, 0, 1, 1], flipX: true },
  ...Array.from({ length: 2 }, (_, index) => ({
    file: 'baptiste-jerem.png', sourceRect: [index / 2, 0, 1 / 2, 1], flipX: index === 0,
  })),
  { file: 'arthur.png', sourceRect: [0, 0, 1, 1], flipX: true },
];
