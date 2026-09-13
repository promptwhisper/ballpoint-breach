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

Open `http://127.0.0.1:8901`. The development server intentionally uses port 8901.

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
| 1–6 / wheel | Switch weapon |
| Escape | Release pointer and pause |

Click **CLICK TO ENTER THE PAGE** to acquire pointer lock. A paused game resumes when the page is clicked again.
If the browser rejects Pointer Lock, the game automatically continues in unlocked fallback mode: move the cursor to look, use the same keyboard/mouse controls, and press Escape to pause.

## Game loop

Ten automatically advancing waves combine Grunts, Rushers, Heavies, and Marksmen. Wave five introduces **THE DOODLER**, whose telegraphed move set includes a charge, pencil sweep, ground slam, projectile volley, and summons. Wave ten brings the boss back for the final battle. Clears restore some health and ammunition. Defeat and victory both support a clean in-place restart.

The construction complex spans a `72 × 78` playable floor, with a long rear undercroft, remote west return route, separated buildings, and connected elevated paths. Enemy deaths break into directional ink fragments and leave persistent procedural splats instead of intact ragdolls. Camera and weapon motion share one distance-driven gait phase, tuned to the reference rifle cadence.

The arsenal contains:

- an automatic 30-round rifle with a compact square holographic sight;
- a six-round pump shotgun with pellet rays and heavy knockback;
- a precise heavy revolver;
- a five-round bolt-action sniper with a circular scope;
- a katana with an arc slash, finite block stamina, and timed projectile returns.

The start page has three illustrated level cards; clicking a card starts its level immediately in the same
document. Pause and results screens offer a return to that start page, with no extra level confirmation.

**Freight Station** (`fold-foundry`, 60 × 88) connects loading tracks, a maintenance hall and a dispatch
yard. Opaque freight cars require clearing corners; two offset warehouse entrances offer alternative
approaches. Loading platforms, machinery, accessible roof stairs and two destructible catwalks create
contested firing positions. Ground routes remain intact if a catwalk collapses.

**Turbine Hall** (`dual-pages`, 64 × 68) connects an entrance lobby, a machine room and a rear control
area. The solid central turbine interrupts crossfire; covered service passages and a U-shaped balcony
offer different rotations. Low parapets, stair approaches and exposed supplies reward controlled movement.
There are no timed room shutters. See [the design reference and validation contract](docs/FPS_LEVEL_REDESIGN.md).

Each new map has three sequential combat sectors and six encounters, ending in a boss battle. After a
sector is cleared, a directional distance hint guides the player to the next sector; entering its approach
starts the next encounter automatically. All modes use the same five weapons. The classic construction
arena retains its ten-wave survival loop. New-map waves mix riflemen, flankers, heavies and marksmen,
with up to 14 active enemies including boss summons. Their engagement ranges and pursuit are tuned to
these larger spaces, while clear rewards are reduced to six health and 14% reserve ammunition.

The mini-tool version has no grapple action or HOOK control. World ray tests prevent gunfire from passing through walls.

## Architecture

- `src/game/` owns the main loop, state, world queries, and supplies. The legacy grapple module is not connected to gameplay.
- `src/render/` contains the shared cross-hatch shader and cached outline helper.
- `src/level/` procedurally assembles the construction arena, colliders, waypoint graph, ledges, supplies, grapple anchors, and breakables.
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
of `dist/`. The package allowlist check and sampled-audio verification still
apply. Mini-tool app entries use content-hashed names (`assets/app-[hash].js`)
so an embedded browser cannot pair fresh level-selection HTML with cached gameplay
from a previous build. The cache regression is `node --test scripts/check-minitool.test.mjs`;
it builds in memory without replacing a running preview's `dist/`.
`scripts/verify-settings.mjs` expects the built directory served at
`http://127.0.0.1:8912/` and exercises portrait, landscape, pause, persistence,
aimed firing, multi-touch holding, and touch cancellation.

The host keeps simulation and visuals separate: weapons emit hitscan/melee requests, enemies emit attacks and lifecycle events, and `Game` resolves those requests against the shared arena queries.

## Notebook rendering

The cream paper, blue horizontal rules, red margin, and subtle grain are screen-space CSS layers and therefore remain fixed while the camera moves. Geometry uses a shared indigo outline cache plus a custom `DoodleMaterial`:

1. `dot(normal, lightDirection)` produces a stable light value.
2. The value is quantized into four tonal bands.
3. `gl_FragCoord` generates two non-identical diagonal stroke families plus a denser, near-horizontal dark-band family.
4. Seeded phase, bend, pressure, and short continuity gaps keep the strokes irregular while remaining static in time.
5. `fwidth` and `smoothstep` antialias the strokes to reduce shimmer.

Visible mesh edges are subdivided once into deterministic wobbled primary strokes and intermittent, faint displaced pen passes. The duplicate pass is stored in the same line geometry, so the hand-traced look does not add a second draw call per object.

The arena uses cream/lavender paper surfaces, enemies and damage use red ink, construction and breakables use orange, and supplies use green. Viewmodels render on a dedicated camera layer so they preserve self-occlusion without disappearing into nearby world geometry.

## QA modes

`?capture=1` starts an unlocked, deterministic visual-review run. `?capture=1&stress=1` adds 20 active enemies for a bounded performance check. `?capture=1&ink=1` triggers a deterministic reference-style death after the opening banner for multi-timepoint visual review. `?capture=1&view=rear` and `view=west` expose the remote routes for multi-view geometry review. These modes do not replace the normal pointer-lock game.

## Project documents

- [Generation prompt](GENERATION_PROMPT.md)
- [Reference analysis](reference-analysis.md)
- [Layout contract](layout-contract.md)
- [Acceptance contract](ACCEPTANCE.md)
- [Fidelity self-review](self-review.md)
- [Permanent user feedback signals](user-signals.md)

## License and attribution

The project is licensed under Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, including the MIT-licensed `video2threejs` workflow that informed the reconstruction process. Runtime dependencies retain their respective upstream licenses.
