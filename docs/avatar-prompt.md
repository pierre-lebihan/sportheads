# Prompt de création des portraits

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/modern-players.png` (1448 × 1086, RGBA).

```text
Use case: stylized-concept. Asset type: a single production game sprite atlas containing twelve modern footballer HEAD portraits for an arcade big-head football game. Create ONE transparent PNG spritesheet, a perfectly regular 4-column by 3-row grid, all cells exactly equal, no grid lines. Each cell contains exactly one isolated head, centered at the exact center of its cell, with uniform apparent size, all hair/ears/neck inside the central 80% of cell. Transparent padding between cells. Head only, tiny neck stub, NO torso, NO jersey, NO words, NO numbers, NO labels, NO badges. Friendly polished hand-drawn cartoon caricatures with thick dark outlines, clean cel shading, expressive recognizable faces, roughly front-facing with very slight rightward three-quarter turn, consistent arcade Flash-era sports illustration style. Not pixel art, not photographs. Precise row-major order: Row 1: Kylian Mbappé (very short cropped black hair, warm brown skin, rounded smiling face), Erling Haaland (pale face, blond hair pulled back into a short tied bun, strong square jaw), Lamine Yamal (medium tan skin, dark short curls on top and close sides, youthful face), Ousmane Dembélé (dark skin, short dark tightly curled hair, narrow face, light facial hair). Row 2: Jude Bellingham (medium brown skin, short dark textured hair and fade, strong brows), Cole Palmer (fair skin, short straight brown fringe, thin long face), Pedri (olive skin, short dark hair, thick eyebrows and small dark beard), Vitinha (olive skin, short dark curly hair, neat beard, compact face). Row 3: Achraf Hakimi (tan skin, short dark curly top and fade, small trimmed beard), Nuno Mendes (dark skin, short black twist curls, broad warm smile), Virgil van Dijk (brown skin, dark hair slicked back into bun, trimmed moustache and goatee, elongated face), Gianluigi Donnarumma (fair olive skin, thick short dark hair, broad full dark beard, square face). All twelve faces distinct and recognizable. Each portrait has the same scale, one head per cell, exactly twelve total. No extra heads, no background color, no cast shadows outside the portraits. Prefer a 4:3 canvas so cells are square.
```

## Pierre et Vilma

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/pierre-vilma.png` (1774 × 887, RGBA), deux cellules carrées.
La photo fournie sert de référence d'identité ; l'atlas des footballeurs sert
uniquement de référence de style. La photo personnelle n'est pas publiée.

```text
Use case: stylized-concept. Asset type: ONE production transparent game sprite atlas, precisely TWO equal square cells side by side (2 columns, 1 row), canvas aspect ratio 2:1. Reference image 1 is the identity reference: Pierre is the man on the RIGHT of the photo; Vilma is the woman on the LEFT of the photo. Reference image 2 is STYLE ONLY: match the polished hand-drawn cartoon big-head football portraits, bold dark outlines, clean cel shading, expressive faces, tiny neck stub. Create only the two new portraits. LEFT CELL = Pierre: recognizable face of photo's man, fair skin, voluminous swept-up wavy dark brown hair with some grey streaks, dark eyebrows, brown eyes, small friendly closed-mouth smile, short full dark beard and moustache, rounded jaw. RIGHT CELL = Vilma: recognizable face of photo's woman, fair skin, dark brown hair swept back into a tied ponytail with a few loose wisps, brown/hazel eyes, warm broad smile showing upper teeth, naturally fuller rounded cheeks, feminine face. Both heads roughly front-facing with a very slight rightward three-quarter turn, matching existing atlas orientation. Each isolated head exactly centered in its square cell, equal apparent scale, ENTIRE head including all hair/ears/ponytail/tiny neck within central 86% of its cell, generous transparent padding so neither touches cell edge. Head only, NO body, NO clothes, NO goggles, NO scenery, NO grid lines, NO text, NO logos, NO background color, NO shadows outside portraits. Actual transparent alpha background. Exactly two portraits total. Retain their recognizability from the photograph; warm charming arcade caricatures, not photorealistic.
```

## Thibaud et Marie

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/thibaud-marie.png`, deux cellules carrées (Thibaud puis Marie).
La photo fournie sert de référence d'identité et l'atlas Pierre/Vilma de référence
de style. La photo personnelle n'est pas publiée.

```text
Use case: stylized-concept. Asset type: ONE production game sprite atlas for an arcade big-head football game, TWO equal square cells side by side, 2 columns and 1 row, canvas aspect ratio exactly 2:1, true transparent background. Input image 1 is identity reference only: Thibaud is the man on the LEFT, Marie is the woman on the RIGHT. Input image 2 is the exact illustration style reference only, not identities. Generate ONLY the two new heads matching the polished hand-drawn cartoon caricature style of image 2, dark outlines, clean cel shading, expressive recognizable faces. LEFT CELL: Thibaud, fair skin, shaved/bald head with very short dark stubble along sides, oval face, dark eyebrows, short neatly trimmed dark beard and moustache, warm smile showing teeth, matching the man in photo. RIGHT CELL: Marie, fair skin, long oval feminine face, dark brown hair pulled back into TWO braided pigtails visible beside the cheeks, warm broad smile showing teeth, matching the woman in photo. Correct the strong backlighting in the photo so faces are clear, naturally colored, softly evenly lit. Both face very slightly toward the RIGHT, nearly frontal, same scale and orientation as the style reference. Each head must be exactly centered in its square cell, including hair/ears/braids/tiny neck stub entirely within the central 86 percent of cell width and height, transparent padding all around. Head only, tiny neck stub; no shoulders, no shirts, no stadium, no scarf, no background scenery, no text, no numbers, no logos, no grid lines, no cast shadows outside heads. Exactly two distinct isolated heads. Recognizable flattering caricatures from the identity reference, not photographs. Preserve the bald head and short beard for Thibaud, and two dark braids for Marie.
```

## Corentin

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/corentin.png`, une cellule carrée. L’homme au premier plan à droite
sur la photo fournie sert de référence d’identité ; l’atlas Thibaud/Marie sert
de référence de style. La photo personnelle n’est pas publiée.

```text
undefined
```

## Pierre Nomad

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/pierre-nomad.png`, une cellule carrée. La nouvelle photo de Pierre
sert de référence de visage, cheveux et expression ; le portrait Pierre existant
sert de référence de style. Le personnage original reste disponible.
La photo personnelle n’est pas publiée.

```text
undefined
```

## Maël

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/mael.png`, une cellule carrée. L’homme au premier plan en bas à droite
sur la photo fournie sert de référence d’identité ; le portrait Corentin sert
de référence de style. La photo personnelle n’est pas publiée.

```text
undefined
```

## Baptiste et Jerem

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/baptiste-jerem.png`, deux cellules carrées (Baptiste puis Jerem).
Baptiste est en haut sur la photo fournie ; Jerem est à droite avec son bonnet bleu.
L’atlas Thibaud/Marie sert de référence de style. La photo personnelle n’est pas publiée.

```text
Use case: stylized-concept. Asset type: ONE production game sprite atlas, exactly TWO equal square cells side by side, 2 columns and 1 row, canvas aspect ratio 2:1, true transparent alpha background. Input image 1 is identity reference: Baptiste is the man at the TOP of the photo leaning forward with round black glasses and tongue out; Jerem is the man at the RIGHT of the photo wearing a teal blue knitted beanie. Ignore the man at bottom left. Input image 2 is STYLE ONLY: match the polished hand-drawn arcade big-head football caricatures, clean dark outlines, clean cel shading, expressive recognizable faces, not photorealistic. LEFT CELL = Baptiste: fair warm skin, voluminous tousled curly medium brown hair, ROUND black eyeglasses, dark eyebrows, short dark beard and moustache along jaw, playful big open-mouth grin with his tongue sticking out just as in photo, lively wide eyes visible through glasses. RIGHT CELL = Jerem: fair skin, dark messy wavy hair peeking from a ribbed TEAL BLUE beanie worn back on head, narrow youthful oval face, light sparse moustache and chin stubble rather than full beard, warm broad smile showing upper teeth, gentle expressive eyes. Preserve both specific identities and expressions from reference. Both heads nearly frontal, very slightly turned toward RIGHT, consistent orientation and equal apparent scale. Each ENTIRE head including all hair/beanie/ears/glasses/tiny neck stub centered within central 86 percent of its square cell, generous transparent padding all around. Exactly TWO heads, one per cell. No shoulders, no torso, no clothes except Jerem's beanie, no kitchen, no microphone, no other people, no background, no text, no numbers, no labels, no logos, no grid lines, no shadows outside portraits. Transparent pixels separate cells. No clipped hat or hair.
```

## Arthur

Outil intégré `image_gen.imagegen`, fond transparent. Fichier final :
`web/assets/arthur.png`, une cellule carrée. La photo fournie sert de référence
d’identité ; l’atlas Thibaud/Marie sert de référence de style.
La photo personnelle n’est pas publiée.

```text
undefined
```
