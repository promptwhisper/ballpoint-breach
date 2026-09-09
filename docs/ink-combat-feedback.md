# Wet-ink combat feedback

The ink-style enemy projectile is a ragged black ink mass with three diminishing
trailing droplets. Shared deterministic RGBA stamps contain dense ink, pale
wash edges, pinholes, satellites, and thin rivulets. They are generated at runtime
by project-owned code, with no new external assets or licenses.

Projectile speed, damage, collision radius, lifetime, pooling, and reflection
rules are unchanged. The transparent visual envelope is larger than the dense
core. Reflected ink uses a muted blue-green tint. Impacts emit dark ink particles.
No ink shader changes were required; the legacy ballpoint presentation is preserved.

Player damage feeds a presentation-only canvas from the existing HUD event.
Incoming direction places the main splash; smaller splashes spread to the edges.
After visibility feedback, splash size and density were reduced and pushed toward
the outer edges. Each hit fades completely in 1.3–1.95 seconds. At most six stamps
(two hits) exist at once, with overall opacity capped at 0.68 and a larger
reticle-adjacent area cleared by a soft
mask. HUD elements remain above the overlay. Reduced motion disables spreading
and downward drift. Clear, menu transitions, and disposal remove active marks.
The existing recording compositor also includes this layer.

Performance bounds: four shared 128px projectile textures and four cached 256px
screen stamps; screen rendering is capped to 1280px width and stops when empty.
The existing projectile pool remains the only owner of collision state.

Verification: `npm test`, `npm run build`, and `scripts/capture-ink-combat.mjs`.
Browser checks cover a real game damage event, full fade, repeated hits, clear
reticle center, compact resize, reduced motion, disposal, projectile appearance,
and the legacy-style exclusion. Screenshots are in `docs/screenshots/ink-study/`
under the `ink-combat-` prefix.
