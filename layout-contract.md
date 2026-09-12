# Layout contract — full-video correction pass

Coordinate frame: `y` is up and ground is `y = 0`. The player remains human scale (eye height about `1.58`); enlarging the level must not enlarge the player, NPC rigs, or stair rise.

## Playable footprint and traversal

- Main ground | broad construction complex | target bounds `x -36..36`, `z -46..32` (`72 × 78`) | about 2.2× the area of the previous `48 × 54` courtyard | reference 00:00–00:15 and 00:45–01:05.
- Initial player area | open south foreground | spawn near `(2, 0.32, 4.5)` facing negative `z` | the nearest core masses sit about `15–18` world units behind the first enemies, so architecture dominates the frame without enlarging the NPCs | reference 00:00–00:04 and 00:42.8–00:44.0.
- Long rear transit deck | north/rear route | at least 50 world units of continuous overhead slab/catwalk with repeated supports | must create the extended undercroft and column rhythm visible while crossing the map | reference 00:05–00:08 and 00:47–00:51.
- West return route | far west | long orange bridge plus remote return stairs/building | should take several seconds to cross on foot | reference 00:00–00:03 and 00:19–00:27.
- Core courtyard | center | scaffold, utility building, office, cover, and open fighting space | keep silhouettes readable by increasing separation, not by scaling characters down | reference 00:08–00:14 and 00:31–00:45.
- Perimeter | distant frame | rear wall near `z = -46`, side walls near `x = ±36`, front safety edge near `z = 32` | boundaries should not feel one sprint away from the start | full video.

## Landmark relationships

- Ground | arena floor | center `(0, 0, -7)`, size `72 × 78` | broad empty foreground, core courtyard, and deep rear undercroft | frames 01, 02, 10 and the full traversal.
- Left construction frame | left-midground | `x -7.4..-0.6`, `z -15.5..-9.5`, `y 0..7.2` | four open levels; dominant left landmark | frames 01, 02, 10, 11.
- Tower roof wheel | on left frame | near `(-5.7, 7.7, -13.1)` | circular doodle with short rays | frames 01, 12.
- Crane mast and boom | above/behind left frame | mast near `(-3.4, 0, -14.4)`, boom `x -5.1..2.2`, `y ~8.4` | warm hook and rail accents | frames 01, 02, 12.
- Rear catwalk | behind both structures | `x -9..5.5`, `z ~-16.4`, `y ~4.1` | thin horizontal link with rail | frames 01, 02, 11.
- Utility block | right-midground | `x 0.9..6.0`, `z -13.7..-8.5`, `y 0..5.1` | freestanding hatched shell with windows and doorway | frames 01, 05, 11, 12.
- Exterior staircase | utility block camera-right face | from `(4.5, 3.4, -10.1)` toward `(6.2, 0, -6.5)` | descends toward the viewer/right | frames 01, 12.
- Right perimeter wall | right/back | center `(10.8, 3.0, -12.2)`, size `11 × 6 × 0.45`, slight yaw | large dense-hatched mass framing the right edge | frames 01, 03, 12.
- Far left orange bridge | far-left | `x -16..-6.8`, `z ~-15.8`, `y ~4.7` | thin ochre railing and deck entering frame-left | frames 01, 10.
- Low barriers | center ground | around `(-1.4, 0.55, -6.7)` and `(0.8, 0.45, -8.0)` | sparse cover between camera and buildings | frames 01, 10, 12.
- Mint pickup | rear center | around `(0.2, 0.65, -13.9)` | small bright vertical rectangle | frames 01, 10, 11.
- Folded-paper scout | upper sky | one `1.52`-unit-span × `1.87`-unit-long five-panel paper dart, initially near `(12.8, 14.4, -30)` | pale lavender cross-hatch, indigo folds, no propeller | reference 00:00.5, 00:02.5, 00:39 and 00:59.
- Enemy | left tower ground level | around `(-5.1, 0, -11.7)` | small red doodle humanoid beneath the structure | frames 01 and 02.
- Rifle | camera child | local lower-right foreground | long barrel points near frame center, red-dot sight near lower-center-right | frames 01, 02, 10, 12.

## Dynamic placement rules

- Enemy ground spawns and navigation nodes must cover the expanded south, west, east, and rear zones; they may not remain clustered inside the old `48 × 54` footprint.
- Elevated spawns, supplies, ledges, collision bounds, and stairs must stay registered to their visible geometry after expansion.
- The safe spawn must have clear collision space and a direct line of sight to the core landmarks, with nearby cover off the crosshair.
- The expanded level must preserve at least two connected ground routes and one elevated route between the remote wings and the core.
- The sky scout follows one closed clockwise Catmull-Rom route above the roofs (`x ≈ -15..17`, `y ≈ 12.8..15.7`, `z ≈ -44..16`) in `32 s`, banks through turns, and remains non-interactive so bullets cannot hit it.

## Character and first-person silhouette rules

- Regular NPC | world character | total height about `3.4 ×` head diameter | head and belly are near-circular paper volumes with red outlines; legs occupy about `1.4 ×` head diameter | reference 00:42.8–00:44.0.
- Regular NPC scale check | grunt bounds about `0.86 × 2.17 × 0.69` world units including its upright weapon | ordinary figures remain below a `2.25`-unit doorway and read at approximately one door height, while the stepped building masses remain several character heights tall.
- Regular NPC weapon | centered just in front of the face and chest | upright length about `1.7 ×` head diameter | graphite top section, paper body, red outline, two hands close to the lower section | reference 00:43.35.
- THE DOODLER | boss character | total height about `3.0 ×` head diameter | wider round torso, four-to-five-point flat crown, angry red face, cream pencil about `1.9 ×` head diameter | reference 01:06.2.
- Katana idle | camera child | grip/hand near `(0.69w, 0.84h)`, blade tip near `(0.57w, 0.41h)` | thin diagonal silhouette with compact hand and guard | reference 00:40.0.
- Katana slash | camera child | four authored stages: wind-up, blade contact, follow-through, recovery | melee query and blue broken arc align with visual contact | reference 00:42.9–00:44.0.

## Navigation, reticle, and death-ink acceptance

- Ground enemies route on the connected authored graph using same-floor nearest nodes and shortest-path traversal. A blocked segment receives a local collider detour; a stall lasting `0.45 s` triggers forced rerouting and side escape.
- Ground spawns are reserved for grunt, rusher, and heavy enemies. Marksmen may use elevated nodes; the boss uses its dedicated ground spawn.
- Rifle reticle at the 1920 × 952 reference scale uses a `34 px` indigo dashed ring, a `4 px` red centre dot, and four `13 × 3 px` red ticks. Tick inner edges expand from roughly `22 px` idle to `38 px` while moving and `77 px` while sprinting.
- A lethal hit first holds the intact character as a red ink silhouette for about `0.10 s` under the source-like blue hit-stop frame. Head, torso, weapon, limbs, shoes, strokes, and droplets then separate directionally; a single irregular main floor pool and small satellites appear after roughly `0.18 s` and persist.
- The death effect must never fall back to a radial starburst, an opaque rectangular blob, or three overlapping full-size decals.

## Player damage and firearm aftermath acceptance

- A player hit creates a `680 ms` circular edge wash, not a flat full-screen red layer. At the 1920 × 952 reference scale the inner `~300 px` radius stays visually clear, tint begins by `300–400 px`, and reaches its `#bf3455` / `~27%` alpha peak around `700–800 px`. At peak, centre-paper RGB may change by no more than 5 per channel and the horizontal edge target is `RGB(224,185,185) ±10`.
- Wash strength is accumulated from post-mitigation damage: a single 5–6 point hit peaks at only `35–45%`; a 15-point hit or three weak hits roughly `133 ms` apart can reach full strength. Health below 60 does not keep the wash visible after the last hit.
- Every hit owns an independent double-chevron direction marker about `28–46 × 22–32 px`, positioned `124±8 px` outside the crosshair. Up to four markers may coexist and each clears within `680 ms`; attacks from screen right and left must not be mirrored.
- Rifle fire produces two immediate orange muzzle shards, one immediate tumbling casing, and two short white outlined smoke puffs. Shotgun fire produces 12 radial orange strips and three overlapping smoke sprites, then ejects one casing at the `0.27 s` pump point. Sniper fire delays one casing to the `0.31 s` bolt point; the revolver retains its cases.
- All firearm pieces come from fixed pools. Casings and shards receive directional velocity, gravity, tumble, a small ground bounce, and timed fade/retirement. The player weapon must not emit a persistent tracer because the source's long purple-blue streak belongs to enemy fire.

## Blood, NPC irregularity, and hand-drawn rendering acceptance

- One persistent stain is a deterministic composition of a porous primary mass, 2–5 secondary islands, small detached droplets, and thin directional streaks. Wall-facing stains add at least three unequal gravity drips; floor-facing stains flatten into broken smears and a separated trail. Alpha, edge roughness, rotation, and interior paper gaps vary per layer.
- Success is a recognisable old/fresh stain history like the supplied close frame: multiple independent marks remain readable at once. Failure includes a radial burst, one smooth blob, three concentric stamps, evenly spaced dots, or a continuous red carpet.
- Ordinary NPC gameplay bounds remain near `0.86 × 2.17 × 0.69`, but visible masses are independently warped. The head and belly must have different deterministic loop profiles; left/right arms, legs, mittens, shoes, facial strokes, and weapon grip must differ slightly in length, width, angle, and offset while preserving readable hit zones.
- At a close gameplay view no ordinary NPC may read as two perfect circles over four mirrored rods. The upright weapon may cross the face, but it must be visibly hand-positioned and slightly off-centre rather than bisecting every part mathematically.
- Architecture outlines use a primary ink pass and a lower-opacity displaced echo, with deterministic sub-segment wobble on long edges and small endpoint overshoots. Added linework must not enter collision or raycast geometry.
- Hatch shading combines several non-identical stroke families. Each family varies phase, spacing, thickness, continuity, and local bend by deterministic seed; dark surfaces may add a loose horizontal scribble layer. Patterns remain stable in time, with no shimmer, moiré takeover, or large frame-time regression.
