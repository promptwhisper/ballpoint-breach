# BALLPOINT BREACH — Generation Prompt

Use the following prompt to regenerate this project from the original gameplay reference.

---

## Prompt

You are a senior Three.js game developer and visual reverse-engineer. Recreate the game shown in this reference video as a complete, playable browser FPS:

- Project title: `BALLPOINT BREACH`
- Reference video: <https://x.com/EvanMilenko/status/2095684248220881049>
- Source aspect ratio: `1920 × 952`
- Visual target: a warm ruled-notebook page drawn with indigo ballpoint pen, sparse red/orange/green accents, irregular hand-traced contours, and dense hand-drawn cross-hatching.
- Fidelity target: match the reference's layout, scale, silhouettes, animation timing, combat feedback, and overall drawing language—not merely its general theme.

Build the result with TypeScript, Vite, plain Three.js, HTML, and CSS. All level geometry, characters, weapons, effects, textures, and animation must be procedural and code-generated. Do not use downloaded GLB models, stock texture packs, spritesheets, game engines, React, or external art assets.

### Working method

1. Download the highest-quality available video and extract at least eight frames across the full clip, including close views of the regular NPC, rifle, katana, blood effects, architecture, HUD, damage feedback, and boss.
2. Before coding, write a reference analysis containing a spatial fact sheet, object inventory, sampled palette, character cards, motion table, and uncertain observations.
3. Write a layout contract with explicit world-space positions, sizes, relationships, and source-frame evidence. Update this contract before implementing any later visual correction.
4. Start a live Vite preview on `127.0.0.1:8901`. Add a visible stage/error indicator and keep the scene hot-reloadable.
5. Work in reviewable stages: arena and camera, visual style, regular NPC, one playable wave, weapons and feedback, expanded traversal, remaining waves and boss, then fidelity polish.
6. Compare screenshots at the reference aspect ratio. Do not claim a feature is complete until it has runtime or screenshot evidence.

### Art direction

- Use warm cream paper around `#ecebdd`–`#f6f0dc` for the sky and ground.
- Add faint horizontal blue notebook rules approximately every `60–62 px` and a subtle red vertical margin near `7%` of frame width. These belong to a fixed screen-space paper layer.
- Use indigo ink near `#29277f` for architecture, weapons, folds, and HUD; lavender-blue for shaded hatch; ochre near `#d7a049` for construction accents; enemy/blood red near `#c92f4f`; and mint near `#77c990` for pickups.
- Avoid glossy PBR rendering. Surfaces should look like paper with ballpoint shading, not plastic, concrete, clay, or cel-shaded polygons.
- Major contours need a dark committed primary stroke plus an intermittent, faint displaced pass. Long edges should bow slightly, vary pressure, and occasionally overshoot junctions.
- Cross-hatching must combine several seeded, non-identical stroke families. Vary phase, spacing, thickness, local bend, opacity, and continuity between surfaces. Dark soffits should add loose near-horizontal dense scribble.
- Keep all pen variation deterministic and static in time. It must not shimmer, crawl, or form obvious moiré fans while the camera moves.

### Camera and scale

- Use a first-person perspective camera at approximately `1.58` world-unit eye height.
- Preserve human scale. Never enlarge NPCs to make them readable; bring them closer through real world placement.
- Regular NPC bounds should remain near `0.86 × 2.17 × 0.69` world units and below a roughly `2.25`-unit doorway.
- The regular NPC's full height should be about `3.4 ×` its head diameter. The belly is only about `1.14–1.20 ×` the head width, and the legs occupy about `1.4 ×` one head diameter.
- The opening view must present a large construction complex rather than a small courtyard. The physical floor should span roughly `72 × 78` world units (`x -36..36`, `z -46..32`).
- Preserve long sight lines and multi-second travel routes; do not fake map size with field of view or distant camera placement.

### Arena

Build a connected, traversable construction complex containing:

- a dominant four-level exposed scaffold with repeated columns, slabs, rails, and exterior stair runs;
- a long rear undercroft/transit deck with at least 50 world units of repeated supports;
- a freestanding utility building with punched windows, doorway, roof rail, and exterior stairs;
- remote west and east routes, perimeter walls, elevated catwalks, roof decks, ledges, pipes, crates, low barriers, supplies, grapple anchors, and orange breakable barricades;
- a construction crane with an ochre-accented boom, brace, cable, and hook;
- one folded-paper reconnaissance aircraft in the upper sky, built from pale paper panels with indigo outlines and fold lines. It follows a deterministic approximately `32 s` world-space patrol and stays behind gameplay silhouettes.

The navigation graph must connect at least two ground routes and one elevated route between remote wings and the core. Register visible stairs, ledges, colliders, waypoints, enemy spawns, supplies, and grapple anchors to the same world layout.

### Regular NPC

Match the reference's paper-white, red-outlined snowman figure:

- one uneven circular head and a separately warped, slightly wider round belly;
- long narrow legs with broken red pen fill and separate mismatched paper-white angular shoes;
- curved red two-segment arms ending in irregular paper-white mitten hands;
- thick graphite brows/eyes/nose/mouth plus a thin red eye line;
- a tall narrow upright weapon held in front of the face and chest, slightly tilted and off-centre.

Create at least eight deterministic appearance variants. Their head and belly profiles, facial marks, limb lengths and angles, mittens, shoes, and weapon pose must differ subtly. Do not build NPCs from perfect spheres over mirrored rods, and do not rely on random scaling that changes collision or navigation behavior.

Gameplay classes may vary health, speed, timing, or small equipment details, but Grunt, Rusher, Heavy, and Marksman must retain the same base visual language.

### Enemy behavior and navigation

- Implement deterministic finite-state enemy behavior with seek, strafe, attack, stagger, death, line-of-sight checks, cooldowns, separation, knockback, headshots, reflected projectiles, and fall death.
- Ground enemies must choose same-floor navigation nodes before horizontally closer elevated nodes.
- Advance waypoints by arrival radius and line of sight.
- Detect stalled progress while movement is requested. After about `0.45 s`, abandon the blocked target, choose a clear neighboring route or deterministic escape direction, and continue without teleporting through cover.
- Resolve collision along open axes and recover from accidental penetration.

### Player motion

- Support WASD movement, Shift sprint, Space jump, grounded collision, step climbing, air control, and fall reset.
- Use one shared, distance-driven gait phase for player camera and viewmodel motion.
- At normal running speed, the reference rifle gait is about `1.68 Hz`; the held weapon moves roughly `32 px` laterally and `14–15 px` vertically at `1920 × 952`.
- Keep camera motion restrained. Most of the visible step belongs to the held weapon, not a violently bobbing world camera.
- Add smooth acceleration, landing response, view sway, and a separate recoil spring.

### Weapons

Implement five switchable weapons with guarded transitions, ammunition, reloads, recoil, muzzle feedback, and their own procedural first-person models:

1. Rifle: 30-round automatic fire, slim long angular silhouette, compact receiver, narrow barrel/handguard, readable magazine or foregrip, and a small square holographic sight with a red centre mark.
2. Shotgun: six rounds, multiple pellet rays, pump delay, strong close knockback, and effective barricade damage.
3. Revolver: six accurate high-damage rounds, controlled strong recoil, and retained cylinder cases.
4. Sniper: five rounds, bolt delay, reduced aiming FOV near `24`, and a circular scope overlay.
5. Katana: slim paper blade with a narrow red edge, compact guard, wrapped grip, rounded hands, and visible paper sleeves.

The katana attack must use authored wind-up, contact, follow-through, and recovery poses across multiple rotation axes. Apply damage once when the blade crosses the target—not on mouse-down. Alternate forward and reverse trajectories and show a short broken blue-ink arc only around contact. Right mouse holds a finite-stamina block and permits correctly timed projectile reflection.

Q fires a bounded blue grapple line. It must stop at world geometry, pull enemies toward the player, lightly pull the player toward designated anchors, and respect cooldown.

### Reticle and HUD

- Reconstruct the rifle reticle at the reference scale: an indigo dashed ring around `34–36 px` across, a `4 px` red centre dot, and four red ticks around `12–13 × 3–4 px`.
- Tick inner edges should sit roughly `22 px` from centre while idle, expand to about `38 px` while moving, and about `77 px` while sprinting.
- Do not substitute a generic four-tick FPS crosshair.
- Reproduce the handwritten score, wave/enemy count, HP bar, ammo, weapon list, contextual hint, grapple/block meters, scope, boss health, victory, defeat, and restart UI.
- Start on an explicit click-to-enter screen. If Pointer Lock is rejected, continue in a usable unlocked fallback mode rather than instantly pausing. Escape pauses and releases controls; clicking resumes.

### Combat feedback

- Every unblocked player hit must create both a directional double-chevron and a full-screen red ink wash/vignette.
- Keep the central approximately `300 px` visually clear; begin the tint around `300–400 px` and reach strongest red near the horizontal edges around `700–800 px` at the reference resolution.
- A small hit should reach only about `35–45%` strength. Rapid repeated hits should accumulate toward the peak and then clear within roughly `680 ms` after the latest hit.
- Do not leave a permanent low-health red overlay.
- Rifle fire produces two immediate orange muzzle shards, an immediate tumbling casing, and two short paper-white smoke scribbles.
- Shotgun fire produces about 12 radial orange strips, layered smoke, and a casing at the pump point around `0.27 s`.
- Sniper ejects its casing at the bolt point around `0.31 s`; revolver cases remain in the cylinder.
- Use bounded pools. Cases receive directional velocity, gravity, tumble, a small ground bounce, and retirement. Do not add a persistent player bullet tracer unsupported by the reference.

### Death ink and persistent blood

Treat blood as red ballpoint ink, not gore realism and not a generic particle burst.

- A lethal hit briefly holds the intact character as a readable red silhouette for about `0.10 s`, then separates recognizable irregular head, torso, limb, weapon, stroke, and droplet pieces in the impact direction.
- Transient fragments fade, but surface history persists for roughly one minute.
- One regular floor stain should combine a porous primary pool, a smaller offset echo, at least three directional streaks, and around seven separated satellite islands/drops.
- A wall-backed death should add two torn impact masses, at least three unequal gravity drips, and several detached medium and pin-sized droplets.
- Generate ragged edges, non-concentric lobes, dry-brush holes, uneven alpha, tapered strokes, bent drips, and clean paper gaps between marks.
- Floor marks should be flatter and directionally stretched; wall marks should have visible downward mass and rivulets.
- Support multiple deterministic variants so accumulated kills produce a history of distinct old and fresh stains.
- Never use one clean stamp, radial starburst, round dots, smooth opaque blob, concentric decals, evenly spaced marks, or one continuous red carpet.

### Waves and boss

- Build five automatically advancing waves combining Grunts, Rushers, Heavies, and Marksmen.
- Wave clears show a short intermission and restore moderate health and ammunition.
- Wave five introduces THE DOODLER.
- The boss keeps the same paper-white round-body language, with a flat four-to-five-point graphite crown, angry red face, and short cream pencil held across the torso.
- Implement telegraphed charge, pencil sweep, slam, thrown projectile, summon, stagger, and a faster second phase below half health.
- Boss death produces victory; defeat and victory both restart cleanly.

### Architecture and performance

- Separate simulation from visuals. Weapons emit attack requests, enemies emit damage/lifecycle events, and the game resolves them through shared world queries.
- Use real geometry for visual architecture and separate simple collider geometry for movement and ray tests.
- Cache shared geometries and materials. Pool transient effects, projectiles, casings, smoke, debris, death fragments, and decals.
- Keep the irregular outline's primary and displaced passes in the same line geometry so they do not add a second draw call per object.
- Keep shader variation deterministic and efficient. Avoid per-fragment time uniforms and expensive noise stacks.
- A 15–20 enemy stress scene must remain responsive without unbounded object or draw-call growth.

### Required QA modes

Provide these URL parameters without changing normal gameplay:

- `?capture=1` — unlocked deterministic visual review.
- `?capture=1&stress=1` — bounded 20-enemy performance review.
- `?capture=1&ink=1` — close integrated death-ink review showing wall and floor layers.
- `?capture=1&view=rear` and `?capture=1&view=west` — remote-route geometry views.
- Optional deterministic weapon/aim/damage/slash review parameters for reproducible screenshots.

Expose a small capture API on `window` with `start`, `snapshot`, and `capturePass`, and surface runtime errors visibly in the page.

### Non-negotiable rejection list

Do not:

- reduce the map to a small courtyard;
- enlarge NPCs relative to doors, rails, crates, stairs, or floor levels;
- use perfect mirrored NPC primitives;
- return to the oversized blocky rifle silhouette;
- fake katana contact at mouse-down;
- let enemies walk forever into the same collider or waypoint;
- omit the red player-hit screen treatment, firearm ejection/falling feedback, or sky aircraft;
- represent death with red boxes, a short generic burst, or a simple stain;
- treat one tiled hatch texture and clean CAD edges as sufficient hand drawing;
- stop at a static mock-up or feature checklist.

### Definition of done

The project is complete only when:

- the large arena, architectural relationships, NPC/building scale, first-person framing, palette, hatch density, and HUD survive side-by-side screenshot comparison with the reference;
- every regular NPC reads as the same source character family while showing bounded individual drawing variation;
- death ink clearly passes through silhouette, directional breakup, wall/floor deposition, and persistent-history stages;
- all controls, five weapons, grapple, enemy classes, navigation recovery, five waves, boss, victory, defeat, and restart work in the browser;
- normal start/resume does not immediately pause when Pointer Lock is unavailable;
- `npm run typecheck`, `npm test`, and `npm run build` pass;
- the browser shows no sustained runtime or shader errors;
- the stress mode remains bounded and responsive;
- a final scored self-review lists evidence and remaining gaps instead of declaring vague improvement.

Deliver the source project, README, reference analysis, layout contract, user-signal rejection list, automated tests, QA parameters, and final comparison screenshots. Do not record an effect video unless explicitly requested.

---

## Expected local commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The development URL must be <http://127.0.0.1:8901/>.
