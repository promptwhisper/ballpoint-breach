# Ink Typography System

## Direction

The ink presentation should feel like a modern arena FPS redrawn on xuan paper.
It must not read as a traditional wuxia mobile interface. Typography therefore
uses a three-role system instead of one decorative face everywhere.

## Previous State

- Patrick Hand was the global family for the original ballpoint theme.
- The ink theme replaced it with a generic system sans stack.
- The ink overlay title used Georgia.
- HUD, menu, controls, and capture-overlay typography had no shared role tokens.

The result was readable but visually disconnected from the new ink materials.

## Role Tokens

The source of truth is in `src/style.css`:

```css
--font-ink-display: "BB Ink Display", "BB WenKai UI", "Kaiti SC", serif;
--font-ui: "BB WenKai UI", "Kaiti SC", ui-serif, serif;
--font-number: "Avenir Next Condensed", "Arial Narrow", ui-sans-serif, system-ui, sans-serif;
```

The legacy `--font-title-en` token is retained but is not used for the Chinese
menu. Small instructions and fast-changing metrics are deliberate exceptions
to the shared brush-lettering voice.

| Role | Face | Use |
| --- | --- | --- |
| Ink display | Long Cang subset | Titles, menu copy, buttons, HUD labels, weapon names, combat callouts |
| UI | LXGW WenKai subsets | Small control help, weapon instructions, secondary counts |
| Number | Condensed system sans | Score, health, ammunition, weapon counts |

Ink colors reuse the neutral ink and paper values established by
`src/render/palette.ts`. The typography adds no glow, blur, faux brush filter,
distortion, or heavy shadow. The Ink Shader was not changed.

## Runtime Assets

| Runtime file | Bytes | Purpose |
| --- | ---: | --- |
| `public/fonts/bb-ink-display-cjk.woff2` | 120,832 | Long Cang Chinese UI glyph subset |
| `public/fonts/bb-wenkai-ui-latin.woff2` | 26,036 | LXGW WenKai Latin and common symbols |
| `public/fonts/bb-wenkai-ui-cjk.woff2` | 74,748 | LXGW WenKai Chinese UI glyph subset |
| **Total** | **221,616** | Local runtime font payload |

All faces are local WOFF2 files with `font-display: swap`. Full source TTF files
are kept under `assets-source/fonts/` for reproducibility, not loaded at runtime.
Exact source revisions and hashes are recorded in `ASSET_PROVENANCE.md`.

## Licensing

- Long Cang: SIL Open Font License 1.1. Local license:
  `licenses/fonts/LongCang-OFL-1.1.txt`.
- LXGW WenKai: SIL Open Font License 1.1. Local license:
  `licenses/fonts/LXGWWenKai-OFL-1.1.txt`.

Modified subsets use internal family names (`BB Ink Display` and `BB WenKai UI`)
so they are not presented as complete upstream font builds.

## Validation

- **A — Long Cang difference:** browser font loading passed for the display face;
  a canvas raster signature for `破阵` differs from the system-sans baseline.
- **B — unified brush revision:** the user requested the title's brush style
  throughout the main UI. The display subset now covers all collected Chinese
  UI glyphs; menu and combat text sizes were increased to support that role.
- **C — HUD readability:** score, health, and ammunition retain the number stack;
  small control help retains WenKai. `scripts/capture-chinese-ui.mjs` asserts
  these exceptions, brush family assignments, and compact menu bounds.

The capture script also asserts local display, Latin UI, and CJK UI font loading,
checks the raster difference, and fails on browser, console, or network errors.

## Screenshots

- `docs/screenshots/ink-study/font-before.png`
- `docs/screenshots/ink-study/font-after-gameplay.png`
- `docs/screenshots/ink-study/font-after-menu.png`
- `docs/screenshots/ink-study/font-after-title.png`
- `docs/screenshots/ink-study/font-comparison.png`

## Changed Files

- `index.html`: ink display title hooks.
- `src/style.css`: local faces, role tokens, and role-scoped typography.
- `src/ui/Hud.ts`: mode-aware Chinese display marks.
- `src/runtime/canvasRecorder.ts`: capture overlay uses the same UI/number roles.
- `scripts/capture-typography.mjs`: deterministic font and screenshot validation.
- `ASSET_PROVENANCE.md` and `THIRD_PARTY_NOTICES.md`: source and license records.
