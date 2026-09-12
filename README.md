# BALLPOINT BREACH

**Drawn in ink. Built to break.**

BALLPOINT BREACH is a complete procedural browser FPS inspired by a [short gameplay reference](https://x.com/EvanMilenko/status/2095684248220881049). The arena, first-person weapons, enemies, boss, effects, textures, and UI are generated in TypeScript; the project contains no downloaded models or texture packs.

![Three irregular ink enemies facing the player's katana](docs/screenshots/enemies.jpg)

## Screenshots

| Construction arena | Persistent death ink |
| --- | --- |
| ![Large notebook-paper construction arena](docs/screenshots/arena.jpg) | ![Layered wall and floor ink stains](docs/screenshots/death-ink.jpg) |

## Generation prompt

The complete reconstruction prompt—including the visual contract, measured scale, gameplay systems, rejection list, QA modes, and definition of done—is available in [GENERATION_PROMPT.md](GENERATION_PROMPT.md).

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8901`. The development server intentionally uses port 8901. The default visual style is the Chinese ink-wash treatment. Use these URLs for a direct A/B comparison:

- `http://127.0.0.1:8901/?style=ink` - rice paper, ink washes, dry-brush breakup, and cinnabar accents;
- `http://127.0.0.1:8901/?style=ballpoint` - the original ruled-notebook and indigo cross-hatch treatment.

Production verification:

```bash
npm run typecheck
npm test
npm run build
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look |
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Left mouse | Fire / slash |
| Right mouse | Aim / katana block |
| R | Reload |
| 1–5 / wheel | Switch weapon |
| Escape | Release pointer and pause |

Click or tap the start button to enter the arena. This mini-tool branch uses unlocked cursor/touch controls so it works inside embedded WebViews. On phones, use the circular movement area on the left; drag the playfield to look; tap or hold the right side to fire. The settings button can switch to a dedicated firing button and adjust look sensitivity.

## Game loop

Ten automatically advancing waves combine Grunts, Rushers, Heavies, and Marksmen. Wave five introduces **THE DOODLER**, whose telegraphed move set includes a charge, pencil sweep, ground slam, projectile volley, and summons. Wave ten brings the boss back for the final battle. Clears restore some health and ammunition. Defeat and victory both support a clean in-place restart.

The construction complex spans a `72 × 78` playable floor, with a long rear undercroft, remote west return route, separated buildings, and connected elevated paths. Enemy deaths break into directional ink fragments and leave persistent procedural splats instead of intact ragdolls. Camera and weapon motion share one distance-driven gait phase, tuned to the reference rifle cadence.

The arsenal contains:

- an automatic 30-round rifle with a compact square holographic sight;
- a six-round pump shotgun with pellet rays and heavy knockback;
- a precise heavy revolver;
- a five-round bolt-action sniper with a circular scope;
- a katana with an arc slash, finite block stamina, and timed projectile returns.

## Architecture

- `src/game/` owns the main loop, state, world queries, and supplies.
- `src/render/` contains the selectable ballpoint and ink-wash materials, shared palettes, and cached outline helper.
- `src/level/` procedurally assembles the construction arena, colliders, waypoint graph, ledges, supplies, and breakables.
- `src/player/` and `src/physics/` implement the kinematic capsule controller.
- `src/combat/` contains weapon definitions, state machines, and procedural viewmodels.
- `src/enemies/` contains reusable doodle rigs, finite-state AI, hit zones, boss logic, and the projectile pool.
- `src/waves/` owns deterministic ten-wave pacing.
- `src/effects/`, `src/audio/`, and `src/ui/` provide bounded feedback systems.

Audio uses downloaded samples, not synthesized effects. Normal web builds use
local MP3 files; experimental mini-tool builds compile those samples into external
JavaScript data and decode them with Web Audio, without shipping MP3 files. Click
Start to unlock playback; the right-side gear button opens sound and touch controls.
Mini-tool builds retain optional iOS playback-session routing. Gameplay includes
sampled movement, weapon handling, impacts, enemy, pickup and wave feedback.
Both paths limit overlap to six voices. Source attribution, licenses, build
instructions and client-validation limits are in [AUDIO_CREDITS.md](AUDIO_CREDITS.md).

### Mobile settings

The settings panel pauses an active round and resumes it when closed. Sound
preferences, touch-look sensitivity (0.5–4.0×, default 1.8× the original speed),
and firing mode persist locally when the host allows storage. Mouse sensitivity
and movement joystick speed are unchanged.

Right-screen firing remains the default: tap to fire, hold for automatic fire,
and drag to look. Dedicated-button mode makes the screen look-only and shows
a large firing button alongside the existing aim/jump controls. A second finger
can aim while the firing button is held. Semi-automatic weapons retain their
existing trigger behavior.

Build the upload artifact with `npm run build:minitool`, then ZIP the contents
of `dist/`. The mini-tool build embeds sampled sounds in JavaScript, emits the
V5 ink textures and Chinese font subsets with relative paths, and rejects
unsupported upload extensions. `scripts/verify-settings.mjs` expects the built directory served at
`http://127.0.0.1:8912/` by default; set `QA_BASE_URL` to use another preview address. It exercises
portrait, landscape, pause, persistence, aimed firing, multi-touch holding, and touch cancellation,
and writes screenshots to a temporary directory outside the repository.

The host keeps simulation and visuals separate: weapons emit hitscan/melee requests, enemies emit attacks and lifecycle events, and `Game` resolves those requests against the shared arena queries.

## Rendering styles

Both styles preserve the same arena, weapons, enemies, collision, navigation, and gameplay. The `style` URL parameter only selects a rendering language when the page loads.

The original ballpoint branch keeps its cream paper, blue horizontal rules, red margin, and subtle screen-space grain. Geometry uses a shared indigo outline cache plus the original `DoodleMaterial`:

1. `dot(normal, lightDirection)` produces a stable light value.
2. The value is quantized into four tonal bands.
3. `gl_FragCoord` generates two non-identical diagonal stroke families plus a denser, near-horizontal dark-band family.
4. Seeded phase, bend, pressure, and short continuity gaps keep the strokes irregular while remaining static in time.
5. `fwidth` and `smoothstep` antialias the strokes to reduce shimmer.

Visible mesh edges are subdivided once into deterministic wobbled primary strokes and intermittent, faint displaced pen passes. The duplicate pass is stored in the same line geometry, so the hand-traced look does not add a second draw call per object.

The default ink-wash branch replaces the ruled notebook layer with warm rice paper and very subtle fixed fibres. Its shader builds form with continuous pale-to-dark ink washes, world-space absorption breakup, pigment granulation, and sparse dry-brush gaps rather than cross-hatch density. Charcoal and gray ink carry most of the image; dark indigo supports interactive readability and muted cinnabar is reserved for enemies, danger, and critical feedback.

Viewmodels render on a dedicated camera layer in both styles, so they preserve self-occlusion without disappearing into nearby world geometry. All procedural variation is deterministic and contains no time-varying noise.

## QA modes

`?capture=1` starts an unlocked, deterministic visual-review run. `?capture=1&stress=1` adds 20 active enemies for a bounded performance check. `?capture=1&ink=1` triggers a deterministic reference-style death after the opening banner for multi-timepoint visual review. `?capture=1&view=rear` and `view=west` expose the remote routes for multi-view geometry review. These modes do not replace the normal touch or unlocked mouse controls.

Style and QA parameters compose, so matching before/after captures can use:

- `?capture=1&style=ink` and `?capture=1&style=ballpoint` for the core view;
- `?capture=1&style=ink&view=rear` and `?capture=1&style=ink&view=west` for distant architecture and fog;
- `?capture=1&style=ink&stress=1` for enemy readability and bounded performance;
- `?capture=1&style=ink&ink=1` for the integrated death-ink wall and floor composition.

## Project documents

- [Generation prompt](GENERATION_PROMPT.md)
- [Reference analysis](reference-analysis.md)
- [Layout contract](layout-contract.md)
- [Acceptance contract](ACCEPTANCE.md)
- [Fidelity self-review](self-review.md)
- [Ink typography system](docs/typography.md)
- [Permanent user feedback signals](user-signals.md)

## License and attribution

The project is licensed under Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, including the MIT-licensed `video2threejs` workflow that informed the reconstruction process. Runtime dependencies retain their respective upstream licenses.
