# Chinese ink interface

The V5 ink experience uses Chinese player-facing copy, Long Cang display
lettering across menus, buttons, weapon names, and combat callouts, readable
LXGW WenKai small instructions, restrained cinnabar accents, and soft
paper backings. This presentation update does not change the ink shader.

## Coverage

- Loading, start, pause, defeat, and victory screens.
- Score, health, ammunition, weapons, wave state, and boss information.
- Wave introductions, pickups, grapple feedback, blocking, and combat tips.
- Ink recording labels and friendly runtime error messages.
- Inspector labels; the inspector and frame-rate status are hidden by default.

Physical keyboard legends such as W/A/S/D, Q, and R remain literal so players
can identify the correct keys. Internal weapon identifiers remain unchanged;
Chinese presentation must not affect reticle selection or ammunition logic.
Central runtime copy lives in `src/ui/zhCN.ts`.

## Typography maintenance

After adding Chinese UI text, run `node scripts/build-chinese-ui-fonts.mjs`.
It gathers UI glyphs from source files and rebuilds the local CJK subsets with
FontTools via `uvx`. Both CJK faces include the collected UI glyphs. The three
shipped font subsets total 174,740 bytes. Original
font licenses and provenance remain in `licenses/fonts/` and
`ASSET_PROVENANCE.md`.

## Verification

- `npm test`: 77 tests passed.
- `npm run build`: passed; the existing bundle-size warning remains.
- `scripts/capture-chinese-ui.mjs`: checked Chinese copy, all five weapons,
  actual start/pause/resume interaction, result screens, and a compact viewport.
- Browser verification reported no page errors or failed requests.

Screenshots are in `docs/screenshots/ink-study/`: `chinese-ui-menu.png`,
`chinese-ui-gameplay.png`, `chinese-ui-paused.png`, `chinese-ui-defeat.png`,
`chinese-ui-victory.png`, and `chinese-ui-compact.png`.

Append `inkDebug=1` to the preview query string to reveal the developer inspector.
