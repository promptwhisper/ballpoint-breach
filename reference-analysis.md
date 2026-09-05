# BALLPOINT BREACH reference analysis

Source: the 71.48-second, 1920 × 952, 60 fps gameplay video. This correction pass uses the full traversal and high-rate contact sheets rather than treating frame 01 as a static composition.

## Correction evidence

- **Map scale:** between 00:05 and 00:08 the player moves below a long raised slab past a repeated row of supports; between 00:45 and 00:52 the same complex is crossed again from another side. The previous implementation's `48 × 54` ground and landmarks packed within roughly 40 units cannot reproduce those travel distances or the long undercroft.
- **Rifle death:** around 00:09–00:12 a target disappears into a directional red spray. A wide, irregular floor pool and satellite drops remain visible after the weapon switch and after the camera has moved away.
- **Katana death:** around 00:37.5–00:38.4 the target breaks into very large red round/ovoid masses, long limb-like strokes, and smaller droplets that briefly cross close to the camera. The intact body does not simply tip over.
- **Persistent ink:** stains from earlier kills remain readable at 00:34–00:45 and a wall/floor splatter remains during the wave-clear sequence around 00:51–00:54.
- **Gait:** the clean uninterrupted rifle run at 00:57.15–00:59.95 has a lateral viewmodel cycle of `1.68–1.69 Hz` and a vertical double-frequency bounce of `3.29–3.33 Hz`. The sight travels about `32 px` peak-to-peak laterally and `14–15 px` vertically at 1920 × 952, while a fixed world feature moves only about `1–2 px`; the gait therefore belongs mainly to the held weapon, not to a strongly bobbing camera.
- **Regular NPC close-up:** at 00:43.35 the head is paper-white and circular, the belly is also paper-white and about `1.14 ×` the head width, and the complete figure is about `3.4 ×` one head diameter tall. The long legs take about `1.4 ×` one head diameter. Red curved arms end in white mittens, separate white shoes cap the legs, and every body contour is drawn in enemy red. A narrow upright weapon about `1.7 ×` one head diameter bisects the face and torso.
- **NPC face:** thick graphite brows, small dark eyes/nose/mouth marks, and a thin red horizontal eye-line remain readable at close range. The weapon is a deliberate part of the front silhouette, not a forward-pointing gun hidden by perspective.
- **NPC/building ratio:** the regular close NPC occupies about `40.5%` of the frame height and the side NPC about `30.7%`; ordinary figures read at roughly `1.0–1.13 ×` a doorway and `2.0–2.35 ×` a guardrail. The rebuilt grunt bounds are `0.86 × 2.17 × 0.69` world units, with a full-height/head-height ratio of `3.32`, so scale is solved against doors and stepped building masses rather than by shrinking the camera view.
- **Rifle reticle:** at 1920 × 952 the indigo dashed ring is about `34–36 px` across. Red ticks are `12–13 × 3–4 px` with a `4 px` centre dot; their inner edges sit about `21–23 px` from centre while idle, `30–40 px` while moving, and `75–77 px` while sprinting.
- **Player damage wash:** hits at 00:13.050, 00:13.183, and 00:13.317 reduce health `100→94→88→82` and build from a weak edge tint to a strong wash with three simultaneously visible direction chevrons. The centre paper stays near `RGB(238,235,223)` while a strong stack reaches about `RGB(224,185,185)` at the left and right edges. The mask is circular in screen-pixel distance: it stays nearly clear for roughly the central `300 px`, begins around `300–400 px`, and reaches full strength around `700–800 px`, so the horizontal edges are redder than the top and bottom at 1920 × 952. A single 5–6 point hit is only about `35–45%` strength; a 15-point hit or three closely spaced weak hits approaches the `#bf3455` / 27%-alpha peak. Each wash and chevron clears in roughly `0.65–0.75 s`; low health does not leave a permanent red overlay.
- **Firearm aftermath:** the first rifle shot begins at 00:07.850 as ammo changes `30→29`: one orange centre star, two large orange rectangular/prismatic shards, and an immediate casing are readable; most of the burst has crossed the near camera by 00:07.867. ADS rifle fire from about 00:51.117 repeats this language at roughly `0.10 s` intervals. The shotgun frame at 00:12.7667 contains about 12 radial orange strips and two white outlined smoke puffs; by 00:12.8333 the strips have expanded toward and beyond the frame. These are short near-camera muzzle/casing forms, not a persistent player tracer; the long purple-blue line in the source is an enemy shot.
- **Blood surface vocabulary:** the user-supplied 1720 × 834 close frame shows at least three distinct persistent wall-stain groups plus a broken floor trail. Each wall group combines a torn central mass, several detached medium islands, pin-sized satellites, paper-colour holes, and gravity streaks of unequal length. The fresh stain beside the living NPC is especially vertical and porous; the older left stain retains a wider body-like silhouette. Floor marks are flatter, directionally stretched, and separated by clean paper rather than merged into a carpet.
- **NPC irregularity:** the same close frame confirms that “snowman proportions” do not mean perfect spheres or bilateral symmetry. Head and belly are uneven hand-drawn loops with small local dents and different tilts; the belly is wider but not concentric with the head. The two legs differ in thickness and contain broken red fill, the shoes have mismatched toe angles, the brows/eyes/mouth are off-centre, and the upright weapon crosses the face slightly away from its geometric centre.
- **Ballpoint line quality:** major blue silhouettes use a dark committed stroke plus one or more faint displaced passes, with slight endpoint overshoot at rail and wall junctions. Cross-hatching is made from locally broken, wavering strokes whose phase, density, and dominant angle change between the wall, soffit, column, and stairs. Dense shade is layered scribble, not one perfectly periodic full-surface grid.
- **Sky scout:** one folded-paper aircraft is visible against the upper sky throughout the traversal. At 00:00.5 and 00:02.5 its banked silhouette is about `32–34 × 41–45 px`; a closer, flatter view near 00:59 reaches roughly `60–65 × 35–40 px`. It uses the same indigo contour and pale lavender cross-hatching as the architecture, with internal fold lines rather than a propeller or quadcopter frame. Relative to the drawn sun it shifts about `60 px` across the opening two seconds, so it is moving world geometry rather than a screen-space icon. The camera never holds long enough to expose an exact source lap time; the reconstruction therefore uses a source-paced, deterministic `32 s` patrol rather than claiming an unmeasurable exact loop.
- **Death timing and coverage:** the impact hold lasts about `67–83 ms`. The victim first becomes a readable `#cf3d5a`-like red silhouette before semantic head, torso, limb, and weapon pieces separate. The first settled pool is about `228 × 129 px` (`11.9%` of frame width) and remains compact; the later violent kill reaches about `8.0%` red-frame coverage through sparse directional fragments rather than one dense central burst.
- **Boss close-up:** at 01:06.2 THE DOODLER retains the same white round-body language. Its crown is a flat four-to-five-point graphite silhouette rather than radial cone spikes; the face is angry red, and the cream pencil is about `1.9 ×` one head diameter.
- **Katana idle:** at 00:40.0 the main hand is near `(0.69w, 0.84h)` and the blade tip near `(0.57w, 0.41h)`. The blade is narrow with a red edge, the guard and pommel are compact, and a paper sleeve continues below the hand.
- **Katana attack:** the visible blade sweep and the broken blue arc form one contact event. The source does not apply damage at button-down; wind-up, contact, follow-through, and return are distinct readable poses.

## Spatial fact sheet

- The camera stands at human eye height in a broad, open concrete arena and looks toward a cluster of mid-rise structures. This is confirmed by frames 01, 02, 10, 11, and 12.
- A four-level exposed concrete frame is the dominant left landmark. It has three main vertical bays, open floors, many rails, and an irregular exterior stair/ramp silhouette. Frames 01, 02, 10, and 11 show it from multiple sides.
- A long construction crane rises above that frame. Its horizontal boom, short hanging cable, and warm ochre accent recur in frames 01, 02, and 12.
- A smaller solid utility block sits right of center. It has punched rectangular windows, a roof rail, a doorway, and an external staircase descending toward the camera-right side. Frames 01, 05, 11, and 12 confirm the volume.
- Narrow elevated catwalks join or pass behind the main structures. They are visible in frames 01, 02, 11, and 12.
- Large perimeter walls close the far and right edges, while low barriers and crates break up the empty ground plane. Frames 01, 02, 07, 10, and 12 confirm these relationships.
- The reference is deliberately non-photoreal: warm ruled notebook paper, indigo pen outlines, lavender cross-hatching on shaded faces, sparse ochre construction accents, mint pickups, and saturated red enemies or impact marks.

## Object inventory

- Left construction frame / left-midground / four levels / concrete posts and slabs / roof rail and exposed stairs.
- Tower roof machinery / above left tower / circular doodle-like wheel and small roof boxes.
- Crane / behind and above left tower / mast, long boom, diagonal brace, cable, hook / ochre highlights.
- Elevated catwalk / rear middle / thin slab and rail / links the left frame toward the center block.
- Utility block / right-midground / two to three levels / punched windows, door opening, roof rail.
- Exterior stairs / utility block front-right / narrow descending run / repeated paper-white treads with indigo edges.
- Right perimeter wall / right background / large hatched plane / strongest lavender cross-hatch mass.
- Ground cover / foreground and center / low concrete barriers, two crates, one mint pickup marker.
- Folded-paper scout / upper sky / one pale-lavender, indigo-outlined paper dart / five readable folded panels / slow banked patrol around the construction roofs.
- Enemy / left tower ground level / very thin red humanoid / round white head, red torso and limbs.
- First-person rifle / camera-locked foreground / paper-white angular body, long barrel, vertical magazine, red-dot sight.
- HUD / screen-space / score, wave/enemy count, health, ammo, weapon list, contextual hint.

## Palette sampled and inferred from the selected frame

- Paper sky: `#ecebde`.
- Paper ground: `#eeecde`.
- Warm paper variation: `#e9e6dc`.
- Primary ink: `#29277f`.
- HUD blue: approximately `#636fb8`.
- Light hatch: `#c7cadd`.
- Dense lavender hatch: approximately `#a5a8d6`.
- Construction ochre: approximately `#d7a049`.
- Enemy/impact red: approximately `#c92f4f`.
- Pickup mint: approximately `#77c990`.

## Character cards

- Regular enemy: deliberately snowman-like rather than anatomical; white circular head, slightly wider white round belly, red curved arms, white mitten hands, long white legs, separate white shoes, red contour lines, graphite/red face, and a centered upright weapon.
- THE DOODLER: larger white round head and belly, long white limbs, flat graphite crown, angry red face, and a cream pencil held diagonally across the torso.

## Motion scene table

| Time | Scene state | This pass |
|---|---|---|
| 00:00–00:08 | Rifle traversal from open foreground into/under long construction routes | Expand the physical footprint and synchronize gait |
| 00:09–00:12 | Rifle kill in the core courtyard | Directional spray, dismembering fragments, persistent pool |
| 00:19–00:29 | Sniper traversal across long sight lines and remote structures | Preserve long sight lines and remote spawns |
| 00:34–00:45 | Katana rush through the courtyard with several close deaths | Large near-camera fragments and accumulating persistent stains |
| 00:45–00:54 | Rifle cleanup and wave-clear traversal | Earlier stains remain; remote wings still readable |
| 00:59–01:11 | Wave 5 / boss movement across the same large arena | Expanded routes and anchors remain connected |
| Full traversal | A single folded-paper scout crosses the open upper sky at changing bank angles | Procedural world-space aircraft on a slow deterministic patrol |

## Style contract for the playable reconstruction

- Every architectural mass is real geometry with indigo edge lines.
- Shaded faces use generated cross-hatch textures; no downloaded textures or models.
- Notebook rules, red margin, HUD, and vignette are screen-space layers because they belong to the game's rendering language rather than the physical arena.
- The first-person rifle is real procedural geometry parented to the camera.
- Death ink is procedural geometry and generated canvas texture, with no downloaded assets.
- Player-hit feedback uses a clear-centre circular edge wash plus separately timed directional chevrons; its peak is driven by accumulated, post-mitigation damage rather than current health.
- Firearm aftermath uses pooled procedural shards, smoke, and weapon-specific casing timing; there is no player bullet tracer unsupported by the source.
- Camera and viewmodel share one distance-driven gait phase; firing recoil remains a separate spring.
