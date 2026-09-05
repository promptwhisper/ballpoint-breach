# User signals

## Permanent yes

- Keep the current notebook-paper, blue-ink outline, lavender cross-hatch, sparse accent-colour art direction.
- Continue from a visual scene into a complete playable recreation of the 71-second game video.
- Use the supplied reverse-engineered implementation brief as a requirements source.

## Permanent no

- Do not reuse the first rifle silhouette: it reads as an oversized stack of rectangular blocks and does not match the source video.
- Do not stop at a static scene, mock UI, or feature checklist; the requested outcome is a playable game loop.
- Do not compress the reference into a small courtyard. The playable footprint, travel distances, long overhead routes, and spacing between landmarks must read as a large construction complex.
- Do not represent an NPC death with a short-lived generic particle burst or small red boxes. Match the reference's dismembering red-ink burst and persistent floor/wall stains.
- Do not let camera bob and viewmodel bob run on unrelated oscillators. The protagonist's visible gait must have one coherent, reference-paced step cycle.
- Do not use a red-filled spherical head, tall capsule torso, one-piece tube limbs, or omit the hands and shoes for ordinary NPCs. Those silhouettes contradict the paper-white, red-outlined reference characters.
- Do not resolve katana damage on mouse-down or fake the whole attack with one doubled root-axis rotation. Contact must occur when the blade crosses the target during a multi-axis swing.
- Do not make ordinary NPCs read as giants beside doors, railings, crates, stairs, or floor levels. Character scale must be solved in world space against architecture, not compensated with a farther showcase spawn or camera framing.
- Do not allow enemies to keep walking into the same collider or waypoint indefinitely. Navigation must detect stalled progress, abandon blocked targets, and re-route through a clear neighbouring node.
- Do not substitute a generic four-tick FPS reticle for the source reticle. Its centre mark, gap, stroke length, colour, and weapon-state behaviour must be measured from the original video.
- Do not use a radial starburst, opaque red blob, or three simultaneous oversized floor decals for an NPC death. The source uses a readable red body state, directional droplets and separated body-like pieces before a compact irregular stain develops.
- Do not reduce player damage feedback to the small directional arrow and camera shake. A source-matched red screen treatment must appear on every unblocked hit and remain readable during repeated damage.
- Do not let firearm shots end at muzzle flash and raycast impact. Reproduce the visible post-shot falling/ejection feedback from the source with procedural moving geometry and a grounded end state.
- Do not leave the paper sky empty. The source reconnaissance aircraft is a persistent world landmark with a measured silhouette and authored patrol path.
- Do not reduce blood to one clean stamp, a few round dots, or uniformly opaque red geometry. The source layers torn dry-brush masses, pin droplets, narrow sprays, gravity drips, floor streaks, and pale gaps inside each stain.
- Do not make ordinary NPCs bilaterally perfect from repeated spheres, cylinders, and mirrored limbs. Their head and belly are uneven drawn loops; the face, legs, hands, shoes, and upright weapon are deliberately off-centre and mismatched.
- Do not equate “hand-drawn” with clean CAD edges plus one tiled hatch texture. Source linework has doubled passes, small overshoots, variable ink weight, broken contours, and locally changing hatch direction and density.

## Rifle correction contract

- Slim, long, angular side silhouette running from the cropped lower-right toward the crosshair.
- Compact receiver, narrow barrel and handguard, one readable vertical foregrip/magazine.
- Tiny square holographic sight with a small red center mark.
- Use a dedicated viewmodel transform so the near stock cannot balloon from perspective.

## September 2026 correction contract

- Map scale is a physical and navigational requirement, not a camera trick: expand the footprint and route lengths while keeping the player and NPC at their current human scale.
- NPC death must read in three stages: immediate directional spray, recognizable large body/limb ink fragments, then a ground stain that remains visible through later combat.
- Player motion must use a shared distance-based gait phase for the camera and held weapon, with smoother acceleration and a slower, heavier cadence than the current double-bob.

## NPC correction contract

- Ordinary NPCs use the source video's snowman proportions: a paper-white circular head, a slightly wider paper-white round belly, and long narrow paper-white legs, all outlined in enemy red.
- Arms are curved red two-segment strokes ending in paper-white mitten hands; feet are separate paper-white angular shoes.
- The face uses a thick graphite brow/eye/nose language plus a thin red eye-line. A tall, narrow weapon is held upright in front of the face and chest while approaching.
- Gameplay classes may retain different health and behaviour, but their base visual language must remain the same; class differences are subtle scale or weapon-detail changes, not unrelated character designs.
- THE DOODLER keeps the same white snowman body language, with a flat four-to-five-point graphite crown, a red angry face, and a short cream pencil held across the torso.
- The base rig must remain below the architectural door height and near the source railing/step scale. Close-up readability comes from camera distance, never from scaling the world character up.

## Navigation correction contract

- Every moving enemy tracks progress toward its current steering target. If progress remains below a small threshold while movement is requested, it must request a different waypoint or a short deterministic escape direction.
- Waypoints are advanced by arrival radius and line-of-sight, not retained behind a wall after the enemy has passed them.
- Collision recovery must be deterministic and must not teleport enemies through cover.

## Crosshair and death-ink correction contract

- Reconstruct the reticle from measured source pixels at the 1920 × 952 reference aspect ratio; preserve the open centre and hand-drawn ink weight.
- Katana deaths stage their visuals: hit-state silhouette first, directional separation second, compact floor mark last. The floor mark appears after a delay and remains, while the initial screen-facing burst fades quickly.
- Floor ink must occupy the same bounded screen area as a reference kill at comparable distance. It cannot overlap into a single solid carpet, and satellite marks remain visibly separated.

## Katana correction contract

- Idle framing places the hand near 69% of frame width and 84% of frame height, with the thin blade tip near 57% width and 41% height at the reference aspect ratio.
- The viewmodel has a slim paper blade with a narrow red edge, compact guard, wrapped grip, rounded hands, and visible paper sleeves; no oversized dark pommel block.
- A slash uses authored wind-up, contact, follow-through, and recovery poses. Damage fires once at the contact pose, never at attack start.
- The slash trail is a short-lived broken blue-ink arc tied to the contact portion of the swing.

## Player-hit, firearm aftermath, and sky contract

- Player damage combines the directional indicator with a full-screen red ink wash/vignette whose colour, opacity, attack, and decay are measured from source hit frames. Repeated hits refresh or accumulate the treatment without obscuring the HUD indefinitely.
- Each applicable firearm emits a visible casing or source-equivalent falling shot remnant from the weapon's ejection side. It inherits view direction, receives gravity, tumbles, collides with the ground, then fades or returns to a bounded pool.
- The scout aircraft is code-only Three.js geometry, drawn with the same paper fill and blue-ink contour language as the arena. It patrols the upper sky on a deterministic loop and stays behind foreground gameplay silhouettes.

## Blood, NPC irregularity, and linework correction contract

- Persistent blood is assembled from several non-concentric stain lobes plus detached satellites. Vertical impacts add thin downward drips with unequal lengths; floor impacts add low directional smears and broken trailing drops. Interior paper-colour gaps keep the result porous rather than graphic-flat.
- The regular NPC keeps the measured human-scale bounds, but its two circular masses use independently warped outlines and slightly different depth/tilt. Left/right limbs, mittens, shoes, brows, eyes, mouth, and weapon grip may not be perfect mirrors.
- Blue architectural contours use at least a primary and a faint displaced secondary pass. Long edges may bow or overshoot slightly, while hatch layers vary phase, spacing, angle, and opacity between surfaces. The result must remain readable and performant at gameplay distance.
