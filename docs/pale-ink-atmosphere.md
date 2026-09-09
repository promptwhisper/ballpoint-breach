# V5 Pale Ink Atmosphere

User feedback: the floor and sky did not match the ink style, and the firearm and NPC ink was too heavy.

## Changes

- A generated pale ink sky replaces the V5 flat clear color and outlined cartoon sun/clouds. The local 2048 by 1024 WebP uses an equirectangular background so looking around reveals the surrounding wash.
- A generated pale earth/paper surface covers the existing ground mesh. UV repetition is 6 by 6.5 across the 72 by 78 meter ground. The opaque MeshBasicMaterial uses normal depth and fog; the ground collision, raycast geometry and blood decal surface remain the same.
- Distant geometry begins fading at 30 meters and fully merges with paper at 85 meters in V5.
- Firearms and NPCs retain their generated ink-deposit textures but restore the pale paper slot. Their base ink loads and wash strengths are reduced. See `hero-ink-textures.md` for the current factors.
- All changes are scoped to ink V5. No ink fragment or outline shader formulas were changed.

## Generated assets

Created with the built-in image generation tool on 2026-09-08. Original PNGs are in `assets-source/ink/pale-sky-v5-source.png` and `assets-source/ink/pale-ground-v5-source.png`. Runtime assets are `public/textures/ink/pale-sky-v5.webp` (2048 by 1024) and `public/textures/ink/pale-ground-v5.webp` (1024 square), encoded at WebP quality 86.

### Sky prompt

Use case: stylized-concept. Asset type: background texture for a Chinese ink wash first person game. Flat artwork of an extremely restrained pale ink sky on off-white xuan paper, panoramic 2:1 aspect ratio. Mostly clean warm ivory paper RGB approximately 239 238 231. Broad soft horizontal wisps of highly diluted cool gray ink in the upper half, a barely visible distant atmospheric wash band near the middle, lower half fades to untouched ivory. Cloud forms created only by soft pale washes, no outlines. Very subtle paper fibers, quiet luminous air and lots of negative space. The darkest washes stay light gray, approximately RGB 201 205 201, no black. Left and right edges blend seamlessly; top edge almost blank. Flat painting not a photographed sheet, no shadows, no objects, no mountains, no buildings, no sun disc, no cartoon clouds, no blue sky, no text, no frame.

### Ground prompt

Use case: stylized-concept. Asset type: seamless ground surface color texture for Chinese ink wash game, top down orthographic 1024 square. Pale warm gray dry earth suggested with extremely diluted Chinese ink brushwork on ivory xuan paper. Dominant base near RGB 229 228 220, irregular gentle pale gray broad horizontal scumble marks, occasional faint short dry brush scratches and scattered tiny pigment deposits, large areas untouched. Forms vague and abstract rather than realistic soil. Restrained contrast darkest marks no darker than RGB 174 180 174 and very sparse. Subtle paper fibers. Even coverage to edges, seamless tileable pattern, flat unlit color texture, no horizon, no perspective, no objects, no rocks, no grid, no floor tiles, no dark stain clusters, no text, no shadows, no vignette.

## Review images

- `docs/screenshots/ink-study/pale-atmosphere-gameplay.png`
- `docs/screenshots/ink-study/pale-atmosphere-npc.png`
- `docs/screenshots/ink-study/pale-atmosphere-rear.png`

The NPC showcase includes live combat damage feedback; its red edge tint is gameplay feedback, not part of the new sky or ground asset.
