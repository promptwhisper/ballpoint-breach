# Chinese UI typography

The game interface uses two offline font subsets:

- **Ballpoint Marker**: a renamed subset of [MaokenAssortedSans](https://github.com/maoken-fonts/MaokenAssortedSans), for level headings, banners, dialog headings and active weapon names.
- **Ballpoint Hand**: a renamed subset of [Yozai Medium v0.868](https://github.com/lxgw/yozai-font), for buttons, HUD, settings and instructions.

Both fonts retain their SIL Open Font License 1.1. Full upstream notices, source hashes and modification details are recorded in `src/assets/fonts/licenses.json` and included in every production bundle as `fonts/licenses.json`. Subsets have new internal names to respect upstream reserved font names. Glyph outlines are unchanged.

Normal builds use committed WOFF2 files and require no font download or Python. A build-time coverage check rejects newly introduced Chinese characters absent from the subsets.

## Regenerating the subsets

Install `fonttools[woff]` in an external Python environment. Download the upstream fonts and licenses into a cache outside the repository, named:

```
MaokenAssortedSans.ttf
Yozai-Medium.ttf
maoken-OFL.txt
yozai-OFL.txt
```

Run `python scripts/build-ui-fonts.py /path/to/font-cache`, then `npm run build:minitool`. Do not add full source TTF files to the upload ZIP.

Run `node scripts/verify-chinese-ui.mjs` with the existing preview at port 8912 and Playwright available (`PLAYWRIGHT_PATH` can point to an installed module). The check blocks external network resources and inspects actual browser-rendered fonts, not just CSS declarations, at desktop, landscape-mobile and rotated-portrait sizes. It also checks that translated weapon labels do not affect weapon IDs, katana ammo or reticle selection.
