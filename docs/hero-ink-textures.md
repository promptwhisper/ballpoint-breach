# V5 Firearm and NPC Texture Assets

Two project-specific raster assets were generated with the built-in image generation tool on 2026-09-08. No external asset pack was used.

## Assets and integration

- `assets-source/ink/weapon-dry-brush-source.png`: original firearm dry-brush scan.
- `assets-source/ink/npc-wet-wash-source.png`: original NPC wet-wash scan.
- `public/textures/ink/weapon-dry-brush.webp` and `npc-wet-wash.webp`: reusable 1024 px maps.
- `public/textures/ink/weapon-dry-brush-hero.webp` and `npc-wet-wash-hero.webp`: 2048 px maps baked at small-object density for the current V5 coordinate scale.

The existing V5 sampling frequency was designed for large architecture. On sub-meter parts it exposed only a small patch of the original brush scan. The build script packs an 8 by 8 mirrored field into each hero map. This makes deposits and dry gaps visible at the current material scale without editing the shader formulas. The weapon source is rotated for brush alignment in this coordinate space.

V5 firearms use their dry-brush field in the ink-deposit slot. NPCs use their separate wet-wash field. Both keep the original pale xuan-paper underpainting: the first iteration used the dark maps in both slots and was rejected for excessive ink. Firearm wash strength is now multiplied by 0.80 and base ink bias by 0.50; NPC wash strength is multiplied by 0.78 and base ink bias by 0.45. Texture resources are lazy-loaded and shared across materials. Hands, katana blade and optical marks retain their existing materials. Older render versions continue using their original texture selection.

The two hero GPU textures are 2048 square with mipmaps (approximately 43 MiB together). This is a desktop V5 experiment; the separate Xiaohongshu package has not been changed.

## Rebuild

Run `node scripts/build-hero-ink-textures.mjs` with Sharp available, or set `SHARP_PATH` to its installed module path. This is offline image resizing and mirrored texture packing; all authored brush shapes come from the generated source images.

## Generation prompts

### Firearm

Use case: stylized-concept. Asset type: seamless square grayscale texture map for first-person firearm material in a Chinese ink wash FPS. Generate a flat scanned texture, NOT a gun or scene. White unpainted xuan paper with bold directional horizontal Chinese ink dry-brush strokes. Distributed varied thick-to-thin long horizontal stroke fragments, rich black ink deposits on about 22 percent of surface, mid-gray wash on about 25 percent, clean white negative space about 53 percent. Several scales of split bristles, obvious flying-white white breaks INSIDE the dark strokes, ragged natural brush endings, narrow capillary feathering and pooling rims. Purpose: close camera gun receiver and stock surfaces should look physically painted by a calligraphy brush. Strong legible medium scale marks rather than tiny noise. Flat orthographic scan, neutral grayscale only, seamless edges with even density, no lighting, no shadows, no 3D form, no objects, no text, no calligraphy characters, no frame, no grid, no watermark. 1024x1024 square.

### NPC

Use case: stylized-concept. Asset type: seamless square grayscale texture map for stylized NPC body surfaces in a Chinese ink wash FPS. Generate a flat scanned pigment texture, NOT a person or scene. Broad irregular hand brushed Chinese sumi ink wash on pure white xuan paper; loosely vertical and diagonally leaning broad brush deposits, organic asymmetric connected islands of pale wash, medium ink and deep charcoal black. Approximate coverage 45 percent white negative space, 35 percent soft pale-to-mid-gray washed ink, 20 percent deep black pooled pigment. Visible water tide rims, wet-on-wet cauliflower edges, feathered capillary spreading, soft internal tonal variation, occasional dry-brush white gaps and lifted broken brush tips. Designed to wrap rounded cartoon humanoid volumes and break regular smooth geometry with readable painterly patches, not camouflage. Medium and large marks; very subtle paper fibers. Flat orthographic scan, grayscale only, tileable even edge distribution, no lighting or cast shadows, no faces, no figures, no scenery, no symbols, no text, no border, no watermark. 1024x1024 square.

## Review evidence

- `docs/screenshots/ink-study/hero-textures-before.png`
- `docs/screenshots/ink-study/hero-textures-after.png`
- `docs/screenshots/ink-study/hero-npc-before.png`
- `docs/screenshots/ink-study/hero-npc-after.png`

The default V5 view and close NPC showcase were captured without WebGL context loss or browser errors. The runtime images are style approximations, not physical scans. Existing V5 world-normal projection can still change brush orientation as a character turns; addressing that requires a separate mapping change.
