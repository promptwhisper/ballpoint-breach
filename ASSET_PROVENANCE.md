# Asset Provenance

## V5 Pale Sky and Ground

- Generated on 2026-09-08 with the built-in OpenAI image-generation tool.
- Sources: `assets-source/ink/pale-sky-v5-source.png` and `assets-source/ink/pale-ground-v5-source.png`.
- Runtime: `public/textures/ink/pale-sky-v5.webp` (2048 by 1024) and `public/textures/ink/pale-ground-v5.webp` (1024 square).
- Processing: resize and WebP quality 86 encoding.
- Usage: distant pale ink sky and low-contrast ground surface in V5 only.
- Prompts and implementation notes: `docs/pale-ink-atmosphere.md`.

## V5 Firearm and NPC Ink Textures

- Created on 2026-09-08 using the built-in OpenAI image-generation tool for this project.
- Original files: `assets-source/ink/weapon-dry-brush-source.png` and `assets-source/ink/npc-wet-wash-source.png`.
- Reusable runtime files: `public/textures/ink/weapon-dry-brush.webp` and `public/textures/ink/npc-wet-wash.webp`.
- V5 material files: `public/textures/ink/weapon-dry-brush-hero.webp` and `public/textures/ink/npc-wet-wash-hero.webp`.
- Processing: resized to 1024 px for standalone use; 256 px mirrored tiles packed into 2048 px maps for existing V5 small-object sampling. The firearm map is rotated 90 degrees during packing. Encoded as WebP.
- Purpose: distinct dry-brush pigment on firearm surfaces and wet ink deposits on NPC bodies; both loaded locally and shared across materials.
- Full generation prompts, build instructions and review evidence: `docs/hero-ink-textures.md`.

## Texture Ink Experiment

- Ink brush field
  - Runtime file: `public/textures/ink/ink-brush-field.webp`
  - Source file: `assets-source/ink/ink-brush-field-source.png`
  - Created: 2026-09-08 with the built-in OpenAI image-generation tool for this project
  - Modifications: resized from 1254 px to 1024 px and encoded as WebP quality 84
  - Usage: V5 world/object-space brush deposit and dry-brush mask
  - Prompt summary: tileable scanned Chinese calligraphy brush field with loaded ink, flying-white gaps, split bristles, narrow capillary edges, and no objects or text

- Xuan paper
  - Runtime file: `public/textures/ink/xuan-paper.webp`
  - Source file: `assets-source/ink/xuan-paper-source.png`
  - Created: 2026-09-08 with the built-in OpenAI image-generation tool for this project
  - Modifications: resized from 1254 px to 1024 px and encoded as WebP quality 82
  - Usage: V5 material paper color and restrained final paper medium
  - Prompt summary: tileable warm-white unpainted xuan paper scan with subtle natural fibers and no stains, marks, objects, or text

The generated source images are retained separately from the optimized runtime
files. Neither runtime texture is loaded from a remote service.

## Ink Typography

- Long Cang
  - Upstream: `google/fonts` at commit `5e35378e6bda803962ee6fd257e444a7d459660d`
  - Source file: `assets-source/fonts/LongCang-Regular.ttf` (5,162,508 bytes)
  - Runtime file: `public/fonts/bb-ink-display-cjk.woff2` (91,616 bytes)
  - Modification: converted to WOFF2 and subset to the Chinese display glyphs used by the game
  - Runtime family name: `BB Ink Display`, used for titles, menu copy, buttons, weapon names, and combat callouts
  - License: SIL Open Font License 1.1; full text at `licenses/fonts/LongCang-OFL-1.1.txt`

- LXGW WenKai
  - Upstream: `lxgw/LxgwWenKai` at commit `50f4b182415a8c33d9a456df220b66a284e2509b`
  - Source file: `assets-source/fonts/LXGWWenKai-Regular.ttf` (25,575,676 bytes)
  - Runtime files: `public/fonts/bb-wenkai-ui-latin.woff2` (26,036 bytes) and `public/fonts/bb-wenkai-ui-cjk.woff2` (57,088 bytes)
  - Modification: converted to WOFF2 and split into a Latin/common-symbol subset plus the Chinese UI glyphs used by the game
  - Runtime family name: `BB WenKai UI`, used for readable UI, menu, HUD, mission, and control copy
  - License: SIL Open Font License 1.1; full text at `licenses/fonts/LXGWWenKai-OFL-1.1.txt`

The three runtime subsets total 174,740 bytes. `font-display: swap` is used for
all local faces. The original TTF files are retained for reproducibility and are
not requested by the browser.
