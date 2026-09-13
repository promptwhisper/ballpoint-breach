# Tactical FPS level redesign

## Experience contract

- Kind / audience / task: a touch-first, handwritten FPS; clear tactical choices and sustained combat across two additional maps.
- System of record: existing Game / EnemyManager / WaveDirector state and capsule collision; Three.js presents those decisions.
- 3D role: occlusion, traversal, elevation, enemy positions and environmental feedback.
- Design variance / motion intensity / visual density: 5 / 4 / 5. Keep the notebook palette and handwritten Chinese UI; use recognizable industrial spaces and fewer decorative frames.
- Inputs and recovery: current touch and keyboard controls, start-page selection, pause, restart and unsupported-WebGL messaging.
- Budget: at most 14 simultaneously active wave enemies, bounded effects, locally embedded fonts/audio, no added remote assets. Preserve the current quality tier and target a 30 FPS mobile floor; headless measurements are not a claim about real phones.
- Acceptance: capsule routes, spawn clearance, deliberate blocked/open firing lanes, functional upper routes, six-encounter completion/restart, screenshots at mobile size, and runtime error checks.

## References and adaptation

[Valve's Train redesign](https://www.counter-strike.net/reintroducing_train/) explains deliberate clearing of hiding spots, space to regroup after tunnels, strong site landmarks and human-scale props. The freight station applies those principles through opaque train cars, offset warehouse doors, two approaches per yard and a recognizable dispatch office. No Valve geometry, textures, code or map layout is copied.

[Valve's Nuke redesign](https://www.counter-strike.net/reintroducing_nuke/) describes alternate exterior routes, control of rafters, travel times between levels and purposeful facility spaces. The turbine hall applies these ideas with a central machine, sheltered service passage, accessible balconies and limited elevated firing windows.

[id Software's DOOM combat talk](https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-) discusses movement and taking resources through combat. Here, exposed supply placements and pursuit enemies encourage changing positions without changing the game's weapon model.

## Freight station (`fold-foundry`)

Loading tracks → maintenance hall → dispatch yard. Offset bulkheads prevent a single long shot from the entrance to the final encounter. Full-height freight cars interrupt sightlines, low cargo provides partial cover, and side platforms expose a useful but vulnerable angle. Shootable plywood occupies specific service openings. Two suspended paper catwalks can fall, while ground routes remain intact.

## Turbine hall (`dual-pages`)

Entrance lobby → turbine room → north control area. A solid central core and opaque room walls form readable corners. Ground routes loop around the machine; service passages allow flanking. Stairs lead to upper firing positions that can also be approached or attacked from below. The previous timed folding partitions are removed from this map.

## Pressure and fairness

The earlier arenas were much wider than ordinary enemies' attack ranges. Distant spawning, slow pursuit, similar wave compositions and generous wave recovery left long safe intervals. New-map combat tuning therefore improves engagement distance, mixed-role arrival and pursuit before adding more enemies. Enemy health is not inflated. Classic mode keeps its original combat profile. Spawn selection must retain physical clearance, floor support and separation from the player.

New-mode ordinary hits use their configured damage instead of the classic 0.72 assistance multiplier.
Each clear restores six health and 14% reserve ammunition; physical supply pickups recharge after 45 seconds.
The six encounters queue 12 / 16 / 18 / 20 / 22 / 24 enemies, with a concurrent ceiling rising from 10 to 14.
Boss summons share that ceiling. High-position marksmen prefer usable sightlines; other roles prefer
separated, covered approaches and reposition when their firing lane is blocked.

## Verification (2026-09-13)

- `npm test`: 116 tests pass, including real arena collision and physical projectile hits.
- `ChallengeTraversal.test.ts`: every new-map staircase supports normal capsule ascent and descent.
  This caught and corrected a loading-platform overlap and an office wall crossing the return stairs.
- `ChallengeArenaCombat.test.ts`: occluded riflemen find a route and damage an unprotected stationary
  player within 12 seconds; entrance walls stop projectiles. The dispatch rooftop enemy uses a real
  landing and stairs without falling to its death.
- `verify-tactical-play.mjs`: normal controls enter the maintenance hall and turbine hall without
  teleportation, autoplay or invulnerability. The sampled runs took player health to 63 / 81.
- `verify-chinese-ui.mjs`: locally embedded Chinese fonts and HUD/settings rendering pass at 1280×720,
  956×430 and internally rotated 430×956, with remote requests blocked and no runtime errors.
- `verify-level-modes.mjs`: checks all three map cards at those viewport sizes, then uses explicitly
  accelerated autoplay to test six-encounter victory and restart integration, not difficulty.
- `npm run build:minitool`: type checking, local font coverage and upload extension/audio checks pass.
  Vite reports the existing single-bundle size warning; no package dependencies were added.

These are desktop/headless and simulation checks, not an on-device Xiaohongshu performance benchmark.
Human playtesting is still needed to tune the final difficulty curve.

## Preview delivery regression

The existing in-app browser retained the old fixed-name `assets/app.js` even after loading the new
level-selection HTML and explicitly refreshing the page. Its HUD still described the previous loading
courtyard, while that string was absent from the current source. Fresh-browser tests therefore passed
without proving that the user's existing preview had updated.

The mini-tool build now emits a content-hashed entry filename and validates the exact referenced local
script. Identical code keeps its URL; changing the bundle changes the URL. Verify both new objective
labels and actual map silhouettes in the existing browser tab after rebuilding, not only in a clean test
context. Classic mode intentionally keeps the original construction map.

Confirmed in the same previously stale in-app tab after the hashed-entry build: Freight Station changed
to the new loading-tracks objective and Turbine Hall changed to the new entrance-lobby objective. Its
screenshot shows the solid hall facade, offset opening and staircase, replacing the old gallery layout.
Two build regression tests also verify hash stability and invalidation using actual Vite output.
