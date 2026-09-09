# Ink Rendering Study

## Scope

This is an incremental revision of the existing ink renderer. Geometry, arena
dimensions, physics, AI, damage, weapon timing, camera motion, and authored effects
are unchanged by this revision. Existing uncommitted changes from the earlier ink
conversion were preserved. The Ballpoint branch remains available.

## Current Implementation And Diagnosis

```text
Scene
  -> DoodleMaterial: NdotL + object/world-position value noise + soft wash bands
  -> EdgesGeometry: subdivided, wobbled RGBA LineSegments
  -> Separate first-person weapon render after clearDepth
  -> CSS paper overlay + HUD
```

The original is not an RGB grayscale filter. It already has material-level ink
wash, stable noise, sparse dry gaps, and pressure variation in line vertex alpha.
There is no EffectComposer, color grading pass, RGB Sobel, normal target, depth
texture, shadow map, or AO input in that pipeline. Ordinary depth testing is on.
The custom material uses transformed normals for a fixed directional-light term;
the scene's stock Three.js lights do not illuminate that shader.

Specific limitations found in the code and baseline image:

- `DoodleMaterial.ts`: `mix(uPaperColor, uSurfaceColor, 0.28)` suppresses material
  identity. Four broad, overlapping tone transitions and linear-space blending
  concentrate the visible result in gray rather than separating blank paper,
  pale ink, heavy ink, and near-black.
- The original low-frequency, unwarped `valueNoise` modulates most shaded faces.
  It produces smooth clouds; it has no separate wet core, feather, or pigment rim.
- Dry gaps share a fixed anisotropic XYZ frequency. They are stable on objects,
  but do not follow a surface-derived brush frame.
- `OutlinedMesh.ts`: every thresholded geometry edge receives roughly the same
  line hierarchy. Vertex alpha already varies pressure, but WebGL LineBasicMaterial
  generally cannot implement the requested variable pixel widths. Dense railings
  therefore read as an engineering sketch. There is no view-dependent silhouette
  classifier or separate internal-normal edge weight.
- `style.css`: faint periodic paper patterns are a final overlay, independent of
  material absorption. These are retained in Current only.

## Source References

These are reference implementations, not visual targets. No repository, old
Three.js API, complete shader, Unity ShaderLab pass, or fluid engine was imported
into the application. Source checkouts used for investigation are outside the
application, in the workspace's `work/ink-references` directory.

| Source Read | Relevant Logic | Decision / Problem Addressed |
| --- | --- | --- |
| [THREE.Watercolor / Watercolor.js](https://github.com/mattatz/THREE.Watercolor/blob/243432da53613db4de6c452f47627349d81e565e/Watercolor.js), WatercolorPass.js | Paper-dependent pigment dispersion and nonlinear edge darkening | Use local pigment accumulation at wash boundaries. Do not adopt its RGB Sobel or full-screen UV wobble. |
| [formwork-sumi / main.js](https://github.com/shellcat-com/formwork-sumi/blob/4ca15e6b1c41c6a24e943da8206daff40701d516/main.js) | Domain-warped noise, thresholded core and separate feather | Irregular material-space wash boundaries. Remove time/mouse animation; preserve surface attachment. |
| [webgl-outlines / CustomOutlinePass.js](https://github.com/OmarShehata/webgl-outlines/blob/42e210346abdb2dab78de20df9dffc369297340f/threejs/src/CustomOutlinePass.js) | Separate surface buffer and linearized depth, neighbor differences | Actual normal + depth pass, independent silhouette/internal-edge weights. Source defaults to surface IDs; its normal mode is the relevant branch. Our implementation uses paired depth differences to suppress continuous planar slopes. |
| [brush-renderer / brush.vertex.glsl](https://github.com/madblade/brush-renderer/blob/53dfb65c78dd0049fa42d426045521eba21c73dc/src/shaders/brush.vertex.glsl), uvgradx.fragment.glsl, BrushPass.js | Stroke orientation from the gradient of a UV coordinate field; depth-dependent point size | Borrow the principle of geometry-directed marks for optional V3 triplanar bristles. No color Sobel outline, UV G-buffer, brush particles, or renderer replacement. |
| [Chinese Ink Shader / CIPR_2_Ran_And_Other_Diffuse.shader](https://github.com/sacshadow/3D_ChineseInkPaintingStyleShader/blob/2d83191e5c43c182241bae161ad6a2f2bf2854a5/Assets/Chinese%20Ink%20Painting%20Rendering/CIPR%20Shaders/CIPR_2_Ran_And_Other_Diffuse.shader) | NdotL-derived ink area, view rim, noise-gated strokes, distance-sensitive outline | Unequal soft ink steps and restrained internal structure. Rewrite the mathematical ideas in GLSL, not ShaderLab. Do not claim its matcap texture as real lighting/AO. |
| [three-fluid-fx / FluidSimulation.ts](https://github.com/artcodev/three-fluid-fx/blob/7b178a8ddf983480f9b4f0c805cdea28ff1f8941/src/core/glsl/simulation/FluidSimulation.ts) | Velocity/density/pressure ping-pong targets, pressure solve, advection | Deferred: the balanced profile has 12 pressure iterations plus other passes. Static walls do not justify dynamic fluid state, and existing combat splats remain intact. |

## New Pipeline

```text
Scene normals + BaseColor + fixed lighting + stable object/world position
  -> InkTone: unequal soft ink steps, perceptual reflectance mixing
  -> V2: warped absorption + fiber-modulated thresholds + narrow wet-edge pigment
  -> V3 only: normal-directed, derivative-faded dry bristles
  -> Linear color target (4x MSAA), with existing translucent effects and faint lines

Opaque world meshes
  -> One extra normal + depth render (lines, sprites, transparent effects excluded)
  -> Linearized depth discontinuity + normal discontinuity
  -> World-anchored pressure/breakup + distance fade

Color + structural ink edges
  -> Composite and sRGB output
  -> Original first-person weapon layer, with the new tone material
  -> HUD (no final paper texture overlay in New)
```

Depth silhouettes receive more weight than internal normal changes. Existing
geometry lines remain at 25% of their old opacity for authored structural hints.
The screen-space line width is in CSS pixels and varies with stable world noise.
Color is read once by the outline shader; no color-gradient detection is performed.

V2 does not blur scene color. A density-space band below each ink threshold forms
the wet feather, with a smaller inward pigment rim. Paper fiber changes thresholds
and pigment load before the final color. High-frequency detail fades under
minification. Geometric lighting controls most of the final density: a side-view
review exposed camouflage-like long walls, so absorption was reduced to a bounded
contribution instead of letting noise repaint entire surfaces.

## Versions And Controls

- `?style=ink&inkVersion=current`: preserved original material, palette, lines and CSS paper.
- `?style=ink&inkVersion=v1`: tone interpretation, structural outline and neutral paper base.
- `?style=ink&inkVersion=v2`: V1 plus paper interaction and localized wet edges. Default New.
- `?style=ink&inkVersion=v3`: V2 plus light dry bristles on near, middle/dark surfaces.
- `?style=ink&inkVersion=v4`: separate experimental Chinese-ink pipeline; defaults to V4-C.
- `?style=ink&inkVersion=v5`: texture-driven ink experiment using scanned brush and xuan-paper assets.
- `&inkStage=a|b|c`: V4 development cuts for ink mass, directional brush, and spatial bleed/paper.
- `&outline=0`: disable authored and screen-space outline weight while preserving ink mass.
- `?style=ballpoint`: legacy Ballpoint rendering.
- `&paper=0`: disable paper fiber influence and the CSS paper overlay. Warped ink
  masses, tones, outlines, and blank regions remain; this is not a grayscale-filter toggle.
- `&inkDebug=1`: optional, collapsible live parameter inspector. Irrelevant controls
  are omitted for each version. The normal page only shows the version selector.

Version switching reloads the page and resets the round; it does not mutate a
running game's materials in place. Parameter sliders update shared uniforms live
and reset on reload. No GUI dependency was added. The browser inspection API is
`window.__INK_DEBUG__.set(name, value)` and `.snapshot()`.

| Parameter | Default | Meaning |
| --- | --- | --- |
| contrast / lightInk / darkInk | 1.12 / 0.07 / 0.98 | Light-to-ink response, first pale step, maximum density |
| outlineStrength / outlineWidth | 0.72 / 1.15 | Structural edge opacity and CSS-pixel sampling radius |
| depthEdgeWeight / normalEdgeWeight | 1 / 0.32 | Silhouette emphasis vs internal structure |
| noiseAmount / lineBreakup | 0.4 / 0.18 | Tone/line pressure variation and sparse weak line segments |
| paperStrength / fiberScale | 0.65 / 1 | Fiber influence and object/world-space fiber frequency |
| absorption | 0.46 | Bounded macro absorption contribution to ink density |
| bleedStrength / bleedRadius | 0.22 / 0.035 | Local pigment rim strength and width in density units, not blur pixels |
| dryBrushStrength | 0.16 | V3 near-surface fly-white amount; respects per-material dry strength |

The five tonal stages are deliberately unequal soft bands, not a generic editable
toon quantizer. Per-material light direction, wash strength/bias/contrast,
absorption scale and grain/dry controls remain in `DoodleMaterial`.

## Comparison

Same 1440 x 900 viewport, default capture camera, DPR 1. Transient wave-banner and
tip text are hidden by the screenshot harness only; gameplay code is unchanged.
The sky aircraft remains animated, so this is same-camera comparison rather than
a frozen identical simulation frame.

- [Current](screenshots/ink-study/before.png)
- [V1: tone and outline](screenshots/ink-study/after-v1.png)
- [V2: paper and wet edge](screenshots/ink-study/after-v2.png)
- [V3: restrained dry brush](screenshots/ink-study/after-v3.png)
- [Paper disabled](screenshots/ink-study/paper-off.png)
- [Rear view](screenshots/ink-study/rear.png)
- [Enemy stress](screenshots/ink-study/stress-new.png)
- [Mobile](screenshots/ink-study/mobile.png)

V1 separates blank planes, shaded undersides and weapon darks more clearly than
Current. V2 adds modest local ink variation without the initial oversized rings
and heavy grain, which were rejected during iteration. V3 improves close weapon
surfaces slightly but adds little at arena distance, so it is available as an
optional comparison rather than enabled by default.

## V4: Ink Mass Before Line

V4 is an isolated experiment rather than another V2/V3 parameter preset. V2/V3
made low-frequency warped noise visible across large planes, so the right building
read as cloudy marble; their wet edge also followed a local tone threshold rather
than the spatial boundary of deposited pigment. Similar line weight on silhouettes,
creases, rails, stairs and authored geometry made the arena read like CAD.

V4 changes the order of operations:

```text
geometric coverage -> ink mass -> directional brush -> dry/wet breakup
-> structural edge -> localized spatial bleed -> paper absorption -> blank space
```

- V4-A derives continuous ink coverage from light, view angle, material value and
  normal derivatives. It contains no surface-noise wash or toon quantization.
- V4-B projects a stable stroke direction onto the dominant surface plane. Broad
  loaded bundles have a head and tail; fine bristles remove pigment only within
  those bundles and fade when their projected footprint becomes too small.
- V4-C samples the already rendered pigment coverage around each pixel. Only a
  narrow coverage boundary can spread or pool; paper fibers break up that boundary
  locally and never shade an entire wall.
- The outline composite ranks silhouettes, major creases and minor edges, then
  reduces minor and thin-feature lines with distance. Arena rails, steps, braces
  and windows receive lower authored-line opacity than primary masses.

Mechanisms were studied from the exact MIT-licensed revisions recorded during the
experiment: THREE.Watercolor (pigment/paper separation), formwork-sumi (soft ink
thresholding), webgl-outlines (depth/normal structure), brush-renderer (a geometry-
conditioned direction field), and 3D_ChineseInkPaintingStyleShader (distance-aware
line hierarchy). No fluid simulation, particle solver, or mechanically translated
ShaderLab code was added.

- `mattatz/THREE.Watercolor` at `243432da53613db4de6c452f47627349d81e565e`
- `shellcat-com/formwork-sumi` at `4ca15e6b1c41c6a24e943da8206daff40701d516`
- `OmarShehata/webgl-outlines` at `42e210346abdb2dab78de20df9dffc369297340f`
- `madblade/brush-renderer` at `53dfb65c78dd0049fa42d426045521eba21c73dc`
- `sacshadow/3D_ChineseInkPaintingStyleShader` at `2d83191e5c43c182241bae161ad6a2f2bf2854a5`

The first V4-B trial produced glossy full-height stripes and was rejected. The
first V4-C trial produced a uniform gray halo and was also rejected. The retained
captures are the visually reviewed revisions:

- [V4-A: geometric ink mass](screenshots/ink-study/after-v4a.png)
- [V4-B: directional brush bundles](screenshots/ink-study/after-v4b.png)
- [V4-C: localized bleed and paper](screenshots/ink-study/after-v4c.png)
- [V4 without explicit outline](screenshots/ink-study/v4-no-outline.png)
- [V4 without paper influence](screenshots/ink-study/v4-no-paper.png)
- [V3 (left) vs V4 (right)](screenshots/ink-study/v3-vs-v4.png)

## V5: Texture-Driven Ink

V5 addresses the remaining synthetic CAD quality in V4. It keeps geometric light,
view angle and normal variation as the source of ink coverage, but delegates the
shape of pigment deposits to two local bitmap assets:

- `public/textures/ink/ink-brush-field.webp`: broad loaded marks, split bristles,
  wet pools and flying-white gaps. It is projected in a stable surface-aligned
  direction rather than screen space.
- `public/textures/ink/xuan-paper.webp`: restrained material fibers and final paper
  medium. It does not drive large wall tones.

The first texture integration gave the scan too much authority and looked like a
whole artwork pasted onto the geometry. The retained version lets the texture
perturb geometric ink mass only in middle and dark coverage. V5 additionally
reduces authored small-detail lines and internal screen-space creases so that ink
masses lead rails and stairs.

- [V5 texture-ink sample](screenshots/ink-study/after-v5-texture.png)
- [V4 shader-only (left) vs V5 textured (right)](screenshots/ink-study/v4-vs-v5-texture.png)

Generated source PNGs are retained under `assets-source/ink`; optimized runtime
WebP files total about 166 KB and are served locally. Creation and modification
details are recorded in `ASSET_PROVENANCE.md`.

## Files Changed In This Revision

- `src/render/inkSettings.ts`: version resolution, bounded shared parameters.
- `src/render/InkTone.ts`: revised tone, absorption, wet-edge and optional dry-brush GLSL.
- `src/render/InkOutline.ts`: world color, normal/depth targets and structural composite.
- `src/render/inkInspector.ts`: version selector and optional live controls.
- `src/render/InkRendering.test.ts`: version, uniform and pass-state regression tests.
- `src/render/DoodleMaterial.ts`: retained Current shader, incremental shader selection.
- `src/render/OutlinedMesh.ts`: reduce New geometry-line opacity only.
- `src/render/palette.ts`: preserve Current palette and add a less yellow New paper base.
- `src/game/Game.ts`: optional world pass, disposal, full-frame draw-call statistics.
- `src/main.ts`, `src/style.css`: inspector setup and narrowly scoped New paper/UI rules.
- This document and `docs/screenshots/ink-study`: comparison and verification artifacts.

## Validation And Limits

`npm test` passes 75 tests; `npm run typecheck` and `npm run build` pass. The four new
tests cover version isolation, bounded shared uniforms, geometry-based edge logic,
and visibility/background/render-target restoration even if the auxiliary render
fails. Browser verification compiles the real GLSL and checks nonblank canvas
pixels, not merely successful TypeScript compilation.

The browser matrix includes Current/V1/V2/V3, paper off, rear/west, enemy stress,
gunfire, death splats, both katana directions, Ballpoint, desktop and mobile
portrait/landscape. Interaction checks exercise live sliders, version reloads,
start, weapon selection, firing input, movement input and pause. See
[verification.json](screenshots/ink-study/verification.json) for actual snapshots,
pixel distributions, runtime errors and frame-interval samples.

The settled, static wall crop has zero pixel difference across a 500 ms interval.
Live tone, paper and outline controls each produce measurable image changes;
see [stability.json](screenshots/ink-study/stability.json). The stability crop
excludes the existing animated pickup visible through the lower window.

Hardware-enabled headless Chromium on Apple M4 Pro measured about 33.3 ms median
frame intervals for both Current and New in these tests. The RAF samples cluster
at this interval; this is not a claim of 60 FPS or a precise GPU-time
benchmark. The initial software-rendered samples were slower and were not used
for the comparison. Default-view whole-frame draw calls increased from 1,145 to
1,682. `rendererObjects` now counts the whole frame, not just the former final
64-call weapon pass. There is one additional opaque-world render and one composite,
two render targets, no temporal history, no CPU pixel reads in gameplay, no blur
chain and no new particle population. Stress results are not identical simulation
frames, so draw-call counts there also reflect living enemies/effects.

This remains NPR over the existing industrial arena and cartoon character geometry,
not an authored landscape painting. No real AO, cast shadows, curvature buffer,
physical paper solver or dynamic fluid diffusion was added. Weapon tone changes,
but its original independent geometric lines are retained; the new depth/normal
pass applies to the world only. Mobile layout/rendering is verified in a desktop
browser viewport, not on physical mobile GPUs, and no touch-control system was added.
