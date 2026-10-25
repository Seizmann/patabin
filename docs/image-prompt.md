# PataBin — Image Master Prompt

Generate every image manually in ChatGPT and drop each file into its exact path below. Then follow the "After generating" section at the bottom.

## Image staging

All generated files are staged in `docs/img/` with the same file names. During frontend implementation the agent COPIES (does not move) each file to its final path listed in the checklist. If a copied file exceeds its size budget, optimize the copy with the same format and dimensions; never touch the originals in `docs/img/`.

## Checklist

| # | File name | Final path | Final size (px) | Format | Transparent | Priority |
|---|-----------|------------|-----------------|--------|-------------|----------|
| 1 | logo-mark.png | apps/web/public/brand/logo-mark.png | 1024×1024 | PNG | yes | high |
| 2 | wordmark.png | apps/web/public/brand/wordmark.png | 1600×480 | PNG | yes | high |
| 3 | empty-sales.png | apps/web/src/assets/images/empty/empty-sales.png | 1024×768 | PNG | yes | medium |
| 4 | empty-batches.png | apps/web/src/assets/images/empty/empty-batches.png | 1024×768 | PNG | yes | medium |
| 5 | empty-expenses.png | apps/web/src/assets/images/empty/empty-expenses.png | 1024×768 | PNG | yes | medium |
| 6 | empty-settlements.png | apps/web/src/assets/images/empty/empty-settlements.png | 1024×768 | PNG | yes | medium |
| 7 | empty-search.png | apps/web/src/assets/images/empty/empty-search.png | 1024×768 | PNG | yes | medium |
| 8 | offline.png | apps/web/src/assets/images/empty/offline.png | 1024×768 | PNG | yes | medium |
| 9 | login-bg.webp | apps/web/src/assets/images/backgrounds/login-bg.webp | 2400×1600 | WebP | no | high |
| 10 | 404-bg.webp | apps/web/src/assets/images/backgrounds/404-bg.webp | 2400×1600 | WebP | no | high |
| 11 | dashboard-hero.webp | apps/web/src/assets/images/backgrounds/dashboard-hero.webp | 1600×800 | WebP | no | high |
| 12 | app-texture.webp | apps/web/src/assets/images/backgrounds/app-texture.webp | 1024×1024 | WebP | no | optional |
| 13 | og-image.webp | apps/web/public/og-image.webp | 1200×630 | WebP | no | medium |

Image rule: transparent-background images are **PNG**, everything else is **WebP**. No JPG, no SVG.

Generate-at sizes available in ChatGPT: 1024×1024, 1536×1024 (3:2), 1024×1536 (2:3). Where the final aspect ratio differs, crop first, then resize (see "After generating").

## Global style brief

Paste this paragraph at the start of every prompt below.

```
Premium, warm, minimal, editorial style. Chocolate-business theme (cocoa, chocolate bars and squares, foil wrappers, ledger and coin hints). Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A, muted green #2F6B4F (positive), muted red #B3472F (negative). Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups in the image. No people's faces. No real brand packaging. Must look good on a light theme.
```

## Prompts

### 1. logo-mark

- File name: `logo-mark.png`
- Path: `apps/web/public/brand/logo-mark.png`
- Generate at: 1024×1024
- Final size: 1024×1024 (no crop or resize needed)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging.

Design a refined abstract app symbol: a geometric mark combining three stacked chocolate squares with a subtle hidden "P" monogram formed by positive space inside the squares. Flat design with a very soft brown-to-caramel gradient. Centered with 12% padding on all sides. Fully transparent background. No shadow outside the mark. The mark must stay crisp and recognizable when scaled down to 32px favicon size. Square 1:1 aspect ratio.
```

This image is the source for all PWA/app icons — the build step later derives the 192px, 512px, maskable, apple-touch and favicon versions from it.

### 2. wordmark

- File name: `wordmark.png`
- Path: `apps/web/public/brand/wordmark.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1600×480 (crop to 10:3, then upscale)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A, warm paper off-white #F5F1EA. Soft natural lighting, clean shapes, no clutter. No people's faces. No real brand packaging.

A horizontal logo: a refined abstract geometric mark combining three stacked chocolate squares with a subtle hidden "P" monogram, followed to its right by the exact text "PataBin" spelled exactly — capital P, capital B, lowercase for the rest. Premium geometric sans-serif typeface, cocoa brown color, generous letter spacing. Mark and word optically balanced on one horizontal line. Fully transparent background. Wide banner composition, logo centered with generous empty margin all around. No other text, no tagline, no shadow.
```

After generating, **check the spelling is exactly "PataBin"** — if any letter is mangled, malformed or swapped case, regenerate until it is exact.

### 3. empty-sales

- File name: `empty-sales.png`
- Path: `apps/web/src/assets/images/empty/empty-sales.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: a small neat stack of three chocolate bars with a tiny blank paper receipt and one round gold coin beside them, representing a state with no sales yet. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 4. empty-batches

- File name: `empty-batches.png`
- Path: `apps/web/src/assets/images/empty/empty-batches.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: an open cardboard carton containing a few foil-wrapped chocolate packets with crinkled gold foil wrappers, representing a state with no batches yet. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 5. empty-expenses

- File name: `empty-expenses.png`
- Path: `apps/web/src/assets/images/empty/empty-expenses.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: a small delivery box beside a tiny toy-like delivery van with one round gold coin next to them, representing a state with no expenses yet. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 6. empty-settlements

- File name: `empty-settlements.png`
- Path: `apps/web/src/assets/images/empty/empty-settlements.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A, muted green #2F6B4F. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: two round gold coins balanced perfectly level on a gentle minimal balance scale, calm and positive mood, representing money fully settled. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 7. empty-search

- File name: `empty-search.png`
- Path: `apps/web/src/assets/images/empty/empty-search.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: a single chocolate square under a tilted magnifying glass with a brass handle, representing nothing found in a search. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 8. offline

- File name: `offline.png`
- Path: `apps/web/src/assets/images/empty/offline.png`
- Generate at: 1536×1024 (3:2)
- Final size: 1024×768 (crop to 4:3, then resize)
- Format: PNG, transparent background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging. Must look good on a light theme.

A soft isolated 3D-clay style illustration: a chocolate bar lying next to a small fluffy cloud, with a small power plug disconnected and pulled apart between them, representing being offline. Object group centered with generous empty margin on all sides. Only a soft contact shadow directly under the objects. Fully transparent background, no scene, no floor plane, no gradients in the background.
```

### 9. login-bg

- File name: `login-bg.webp`
- Path: `apps/web/src/assets/images/backgrounds/login-bg.webp`
- Generate at: 1536×1024 (3:2)
- Final size: 2400×1600 (upscale from the generated image, no crop — aspect already 3:2)
- Format: WebP, opaque background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: deep espresso #1F1611, cocoa brown #4A2C1D, caramel/gold accent #B9854A, warm paper off-white #F5F1EA. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging.

A premium atmospheric photographic still life: pieces of dark chocolate, scattered cocoa nibs and crumpled gold foil on a warm stone and paper surface, lit by soft window light from one side. Compared to a normal photo, keep contrast low and tones soft; this is an atmospheric background, not a product hero.

Composition is critical: keep the main subject cluster and the calmest visual space within the central safe zone — the middle 50% of the width and middle 60% of the height — because this image is cropped to portrait on mobile phones and landscape on desktop screens. The left and right edge fifths must be very low-contrast, softly falling into near-uniform warm tone so a white login card can be placed over them and read perfectly. Landscape 3:2 aspect ratio.
```

### 10. 404-bg

- File name: `404-bg.webp`
- Path: `apps/web/src/assets/images/backgrounds/404-bg.webp`
- Generate at: 1536×1024 (3:2)
- Final size: 2400×1600 (upscale from the generated image, no crop — aspect already 3:2)
- Format: WebP, opaque background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: deep espresso #1F1611, cocoa brown #4A2C1D, caramel/gold accent #B9854A, warm paper off-white #F5F1EA. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging.

A premium still-life image: one broken chocolate bar with a slightly melted edge and a few loose chocolate squares scattered across warm off-white paper, playful but premium.

Composition is critical: keep the broken bar and squares around the middle 50% of the width and middle 60% of the height as the safe zone — this image is cropped to portrait on mobile and landscape on desktop — but leave the very center itself visually calm, with lots of negative space where white text will sit. Keep contrast soft and edges low-contrast. Landscape 3:2 aspect ratio.
```

### 11. dashboard-hero

- File name: `dashboard-hero.webp`
- Path: `apps/web/src/assets/images/backgrounds/dashboard-hero.webp`
- Generate at: 1536×1024 (3:2)
- Final size: 1600×800 (crop to 2:1, then resize)
- Format: WebP, opaque background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: deep espresso #1F1611, cocoa brown #4A2C1D, caramel/gold accent #B9854A, warm paper off-white #F5F1EA. Soft natural lighting, subtle depth, clean shapes, no clutter. No text, letters, numbers, logos, watermarks or UI mockups. No people's faces. No real brand packaging.

A premium product-banner style photograph: arranged chocolate bars, squares and cocoa nibs in moody warm light, like the hero image of a luxury chocolate brand. Subject cluster composed slightly offset to the right side of the frame. The lower third of the image falls darker (deep espresso shadows), so white overlay text placed there later stays readable. Clear contrast between lit subject and dark lower area. No clutter, few large shapes, editorial lighting. Landscape 3:2 aspect ratio.
```

### 12. app-texture (optional)

- File name: `app-texture.webp`
- Path: `apps/web/src/assets/images/backgrounds/app-texture.webp`
- Generate at: 1024×1024
- Final size: 1024×1024 (no crop or resize needed)
- Format: WebP, opaque background

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D. No text, letters, numbers, logos, watermarks or UI mockups.

An extremely subtle seamless tileable texture: near-white warm paper with a whisper of fine paper grain and the lightest scattering of cocoa dust particles. Very low contrast, almost flat — it should read as a barely-there tone shift, visible only up close. Must tile perfectly with no visible seams at the edges (top edge must match bottom edge, left must match right). Even lighting, no vignette, no directional shadows. Square 1:1 aspect ratio.
```

If the tiled edges do not connect seamlessly when the human tests it, skip this asset — the app works without it.

### 13. og-image

- File name: `og-image.webp`
- Path: `apps/web/public/og-image.webp`
- Generate at: 1536×1024 (3:2)
- Final size: 1200×630 (crop to 1.91:1 — crop to 1536×804, trimming ~110px evenly from top and bottom, then resize to 1200×630)
- Format: WebP, opaque background, quality 80–85, under 200 KB

```
Premium, warm, minimal, editorial style. Chocolate-business theme. Palette: warm paper off-white #F5F1EA, white #FFFFFF, cocoa brown #4A2C1D, deep espresso #1F1611, caramel/gold accent #B9854A. Soft natural lighting, subtle depth, clean shapes, no clutter. No people's faces. No real brand packaging. No numbers, no tagline, no watermark, no UI mockups.

A premium, minimal social share card layout for "PataBin", a chocolate-business money ledger. Warm paper background #F5F1EA fills the frame. Left half: calm negative space with the refined abstract logo mark (three stacked chocolate squares with a subtle hidden "P" monogram) above the text "PataBin" spelled exactly — capital P, capital B — large, cocoa brown #4A2C1D, premium geometric sans-serif. Right half: a refined still life of chocolate bars, chocolate squares and cocoa nibs with one round gold coin, soft natural light from one side, subtle depth, caramel accent #B9854A. Keep all important content inside a 60px safe margin from every edge because social platforms crop the borders. Balanced horizontal composition, wide landscape aspect ratio.
```

After generating, **verify the spelling is exactly "PataBin"**. If the model keeps mangling the text, generate an art-only version with the left half left empty (cocoa squares and still life on the right, negative space on the left) — the build step will then composite `wordmark.png` onto it.

## After generating

1. Save each generated image into the exact path from the checklist (already created in this repo; each empty folder holds a `.gitkeep`).
2. Crop / resize to final size:
   - `wordmark.png`: crop 1536×1024 down to 10:3 — crop to 1536×460 centered on the logo line (nudge vertically if the logo is off-center), then upscale to 1600×480. Keep the background transparent.
   - All five `empty-*.png` and `offline.png`: crop 1536×1024 (3:2) to 4:3 — trim ~85px from the left and ~86px from the right (1536 → 1365), keeping the centered subject, then resize to 1024×768.
   - `login-bg.webp` and `404-bg.webp`: no crop, upscale 1536×1024 → 2400×1600.
   - `dashboard-hero.webp`: crop 1536×1024 (3:2) to 2:1 — trim the image vertically: crop to 1536×768 (cut ~128px evenly from top and bottom, keeping the darker lower third in frame), then resize to 1600×800.
   - `og-image.webp`: crop 1536×1024 (3:2) to 1.91:1 — crop to 1536×804 (trim ~110px evenly from top and bottom, keeping the 60px safe margin content), then resize to 1200×630.
   - `logo-mark.png` and `app-texture.webp`: already at final size, no change.
3. Convert every non-transparent image to **WebP, quality 80–85**. Keep transparent originals as **PNG** (32-bit, alpha preserved).
4. File-size budgets: backgrounds (`login-bg`, `404-bg`) under 300 KB; `dashboard-hero` under 250 KB; transparent PNGs under 600 KB each; `app-texture` under 50 KB; `og-image` under 200 KB.
5. Verify the exact placement paths again before committing:
   - `apps/web/public/brand/logo-mark.png`
   - `apps/web/public/brand/wordmark.png`
   - `apps/web/public/og-image.webp`
   - `apps/web/src/assets/images/empty/empty-sales.png` / `empty-batches.png` / `empty-expenses.png` / `empty-settlements.png` / `empty-search.png` / `offline.png`
   - `apps/web/src/assets/images/backgrounds/login-bg.webp` / `404-bg.webp` / `dashboard-hero.webp` / `app-texture.webp`
