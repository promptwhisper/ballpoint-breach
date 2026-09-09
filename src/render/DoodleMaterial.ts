import * as THREE from 'three';
import { CURRENT_INK_PALETTE, paletteForStyle } from './palette';
import { ACTIVE_VISUAL_STYLE, type VisualStyle } from './visualStyle';
import {
  ACTIVE_INK_V4_STAGE,
  ACTIVE_INK_VERSION,
  inkUniforms,
  type InkVersion,
} from './inkSettings';
import { inkBrushTexture, xuanPaperTexture } from './InkTextures';
import { INK_TONE_FRAGMENT, INK_V4_TONE_FRAGMENT, INK_V5_TONE_FRAGMENT } from './InkTone';

function fraction(value: number): number {
  return value - Math.floor(value);
}

/** CPU equivalent of the tiny GLSL hash used for one material-wide angle. */
function seedTurnFor(seed: number): number {
  const x = Math.floor(seed * 13);
  const y = Math.floor(seed * 7);
  let px = fraction(x * 0.1031);
  let py = fraction(y * 0.1030);
  let pz = fraction(x * 0.0973);
  const bias = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += bias;
  py += bias;
  pz += bias;
  return (fraction((px + py) * pz) - 0.5) * 0.18;
}

const BALLPOINT_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  #include <fog_pars_vertex>

  void main() {
    // Arena geometry is authored at its final dimensions instead of non-uniformly
    // scaling meshes, so this is a stable world-space normal transform.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const BALLPOINT_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSurfaceColor;
  uniform vec3 uPaperColor;
  uniform vec3 uInkColor;
  uniform vec3 uShadowColor;
  uniform vec3 uLightDirection;
  uniform float uHatchScale;
  uniform float uHatchStrength;
  uniform float uHatchAngle;
  uniform float uHatchVariation;
  uniform float uGrainStrength;
  uniform float uSeedTurn;
  uniform float uOpacity;
  uniform float uSeed;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  #include <fog_pars_fragment>

  float hash21(vec2 value) {
    vec3 p3 = fract(vec3(value.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Parabolic sine approximation with a small shape correction. It is smooth
  // enough for irregular pen pressure and line bending while avoiding dozens
  // of expensive transcendental instructions for every shaded pixel.
  float fastWave(float angle) {
    float phase = fract(angle * 0.15915494 + 0.5) * 2.0 - 1.0;
    float wave = 4.0 * phase * (1.0 - abs(phase));
    return wave * (0.775 + 0.225 * abs(wave));
  }

  mat2 rotate2d(float angle) {
    float sine = fastWave(angle);
    float cosine = fastWave(angle + 1.5707963);
    return mat2(cosine, -sine, sine, cosine);
  }

  float hatchLine(float coordinate, float spacing, float thickness) {
    float distanceToLine = abs(fract(coordinate / spacing) - 0.5) * spacing;
    float antialiasWidth = max(fwidth(coordinate) * 0.72, 0.28);
    return 1.0 - smoothstep(
      thickness - antialiasWidth,
      thickness + antialiasWidth,
      distanceToLine
    );
  }

  float ballpointStroke(
    vec2 pixel,
    float angle,
    float spacing,
    float thickness,
    float seed,
    float worldPhase
  ) {
    vec2 strokeSpace = rotate2d(angle) * pixel;
    float along = strokeSpace.y;
    float lineIndex = floor(strokeSpace.x / spacing);
    float linePhase = hash21(vec2(lineIndex + seed * 7.3, seed * 11.1)) * 6.2831853;

    // Two frequencies bend each stroke independently. The very slow world-space
    // term keeps the imperfection attached to the surface instead of reading as
    // a perfectly registered screen filter.
    float wobble = fastWave(along * 0.031 + seed * 2.73 + worldPhase + linePhase) * 0.78;
    wobble += fastWave(along * 0.113 - seed * 1.31 + linePhase * 0.37) * 0.25;
    float spacingPhase = fastWave(along * 0.015 + seed * 4.17) * spacing * 0.1;
    float pressure = 0.82 + fastWave(along * 0.073 + linePhase + seed * 0.41) * 0.13;
    pressure += fastWave(lineIndex * 1.91 + floor(along * 0.11) * 2.37 + seed) * 0.05;

    float stroke = hatchLine(
      strokeSpace.x + wobble + spacingPhase,
      spacing,
      thickness * pressure
    );

    // Ballpoint hatching is never a mathematically unbroken stripe. This leaves
    // most of the mark intact while introducing short pale skips and pressure loss.
    float skipSignal = fastWave(along * 0.21 + linePhase + seed * 0.73);
    skipSignal += fastWave(along * 0.53 - linePhase * 0.7) * 0.32;
    float continuity = mix(0.62, 1.0, smoothstep(-0.86, -0.12, skipSignal));
    return stroke * continuity;
  }

  void main() {
    vec2 pixel = gl_FragCoord.xy;
    float scale = max(uHatchScale, 2.0);

    vec3 normal = normalize(vWorldNormal);
    vec3 normalWeight = abs(normal);
    float seedTurn = uSeedTurn;

    // Upward planes receive long, nearly horizontal pen strokes; upright planes
    // retain the crossed diagonals visible on the reference walls. Curved and
    // sloped geometry blends between the two instead of sharing one global grid.
    float surfaceTurn = normalWeight.y * 0.62 + normalWeight.x * 0.13 - normalWeight.z * 0.07;
    float angleA = 0.70 + surfaceTurn + uHatchAngle + seedTurn;
    float angleB = -0.70 + normalWeight.y * 0.31 + uHatchAngle * 0.54 - seedTurn * 0.6;
    float angleDense = 1.31 + normalWeight.y * 0.21 + uHatchAngle * 0.35 + seedTurn * 0.35;

    float worldPhase = dot(vWorldPosition, vec3(0.43, 0.71, -0.37));
    // Density varies by material and dominant surface orientation, but stays
    // constant across a planar face. A per-fragment spacing change would create
    // moire fans instead of pen lines on large walls.
    float densityWave = fastWave(
      uSeed * 2.1
      + normalWeight.x * 1.7
      + normalWeight.y * 3.1
      + normalWeight.z * 5.3
    ) * uHatchVariation;
    float scaleA = scale * (1.0 + densityWave * 0.12);
    float scaleB = scale * (0.94 - densityWave * 0.08);

    float strokeA = ballpointStroke(pixel, angleA, scaleA, 0.52, uSeed + 1.1, worldPhase);
    float strokeB = ballpointStroke(pixel, angleB, scaleB, 0.49, uSeed + 7.3, -worldPhase * 0.7);
    float strokeDense = ballpointStroke(
      pixel,
      angleDense,
      scale * (0.49 + densityWave * 0.035),
      0.38,
      uSeed + 13.9,
      worldPhase * 1.3
    );

    float light = clamp(dot(normal, normalize(uLightDirection)) * 0.5 + 0.5, 0.0, 1.0);

    // Surface-scale pressure variation softens the perfectly straight boundary
    // between lighting bands while remaining deterministic under animation.
    float tonalDrift = fastWave(worldPhase * 1.21 + uSeed) * 0.015;
    tonalDrift += fastWave(dot(vWorldPosition, vec3(-0.91, 0.37, 0.63)) * 0.47) * 0.009;
    light = clamp(light + tonalDrift * uHatchVariation, 0.0, 1.0);

    // Four softly blended tonal bands: clean paper, one diagonal, crossed
    // diagonals, then dense crossed ink.
    float bandOne = 1.0 - smoothstep(0.73, 0.79, light);
    float bandTwo = 1.0 - smoothstep(0.49, 0.55, light);
    float bandThree = 1.0 - smoothstep(0.25, 0.31, light);

    float hatch = max(strokeA * bandOne * 0.57, strokeB * bandOne * 0.25);
    hatch = max(hatch, strokeB * bandTwo * 0.69);
    hatch = max(hatch, strokeDense * bandTwo * 0.22);
    hatch = max(hatch, strokeDense * bandThree * 0.79);

    float shadowWash = bandTwo * 0.075 + bandThree * 0.13;
    vec3 baseColor = mix(uSurfaceColor, uPaperColor, 0.08);
    vec3 shadedBase = mix(baseColor, uShadowColor, shadowWash * uHatchStrength);
    vec3 finalColor = mix(shadedBase, uInkColor, clamp(hatch * uHatchStrength, 0.0, 0.92));

    // Fine fibre/grain modulation prevents large pale faces from looking like
    // flat vector fills. It is intentionally much weaker than the ink strokes.
    float grain = hash21(floor(pixel * 0.58) + uSeed * 19.7) - 0.5;
    float fibre = fastWave(
      pixel.y * 0.43 + fastWave(pixel.x * 0.027 + uSeed) * 1.3
    ) * 0.5;
    finalColor += vec3((grain * 0.012 + fibre * 0.004) * uGrainStrength);

    gl_FragColor = vec4(finalColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const INK_VERTEX_SHADER = /* glsl */ `
  uniform float uPatternSpace;

  varying vec3 vWorldNormal;
  varying vec3 vPatternPosition;
  varying vec3 vPatternNormal;
  varying vec3 vInkViewDirection;

  #include <fog_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 modelScale = max(
      vec3(
        length(modelMatrix[0].xyz),
        length(modelMatrix[1].xyz),
        length(modelMatrix[2].xyz)
      ),
      vec3(0.0001)
    );

    // Object-space marks move with animated meshes. Static arena materials opt
    // into world space so repeated shared geometries do not repeat one stamp.
    vec3 scaledObjectPosition = position * modelScale;
    vPatternPosition = mix(scaledObjectPosition, worldPosition.xyz, step(0.5, uPatternSpace));

    // Correct the normal for the non-uniform scales used by procedural parts
    // while keeping the result in the world space used by uLightDirection.
    vec3 scaleSquared = max(modelScale * modelScale, vec3(0.0001));
    vWorldNormal = normalize(mat3(modelMatrix) * (normal / scaleSquared));
    vPatternNormal = mix(normalize(normal / modelScale), vWorldNormal, step(0.5, uPatternSpace));
    vInkViewDirection = cameraPosition - worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const INK_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSurfaceColor;
  uniform vec3 uPaperColor;
  uniform vec3 uInkColor;
  uniform vec3 uShadowColor;
  uniform vec3 uLightDirection;
  uniform float uWashBias;
  uniform float uWashStrength;
  uniform float uWashContrast;
  uniform float uAbsorptionScale;
  uniform float uDryBrushStrength;
  uniform float uGranulationStrength;
  uniform float uOpacity;
  uniform float uSeed;

  varying vec3 vWorldNormal;
  varying vec3 vPatternPosition;

  #include <fog_pars_fragment>

  float hash31(vec3 value) {
    vec3 p3 = fract(value * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec3 value) {
    vec3 cell = floor(value);
    vec3 local = fract(value);
    vec3 curve = local * local * (3.0 - 2.0 * local);

    float x00 = mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), curve.x);
    float x10 = mix(
      hash31(cell + vec3(0.0, 1.0, 0.0)),
      hash31(cell + vec3(1.0, 1.0, 0.0)),
      curve.x
    );
    float x01 = mix(
      hash31(cell + vec3(0.0, 0.0, 1.0)),
      hash31(cell + vec3(1.0, 0.0, 1.0)),
      curve.x
    );
    float x11 = mix(
      hash31(cell + vec3(0.0, 1.0, 1.0)),
      hash31(cell + vec3(1.0, 1.0, 1.0)),
      curve.x
    );
    return mix(mix(x00, x10, curve.y), mix(x01, x11, curve.y), curve.z);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float light = clamp(dot(normal, normalize(uLightDirection)) * 0.5 + 0.5, 0.0, 1.0);
    float shade = pow(max(1.0 - light, 0.0001), uWashContrast);

    vec3 seedOffset = vec3(uSeed * 0.37, uSeed * 0.61, uSeed * -0.43);
    vec3 macroCoordinate = vPatternPosition * uAbsorptionScale + seedOffset;
    float absorption = valueNoise(macroCoordinate);

    // Broad absorption perturbs the illumination boundary instead of drawing a
    // precise CG contour between tones. Four overlapping soft masses build up
    // from mostly bare paper to pooled near-black ink.
    float shapedAbsorption = smoothstep(0.16, 0.84, absorption);
    float brokenShade = clamp(
      shade + uWashBias + (shapedAbsorption - 0.5) * (0.28 + shade * 0.10),
      0.0,
      1.0
    );
    float wash = smoothstep(0.08, 0.33, brokenShade) * 0.14;
    wash += smoothstep(0.27, 0.51, brokenShade) * 0.20;
    wash += smoothstep(0.47, 0.71, brokenShade) * 0.25;
    wash += smoothstep(0.67, 0.90, brokenShade) * 0.27;
    float pooling = smoothstep(0.62, 0.91, shapedAbsorption)
      * smoothstep(0.24, 0.86, brokenShade)
      * 0.14;
    float cloudyMass = (shapedAbsorption - 0.5)
      * mix(0.20, 0.36, brokenShade)
      * smoothstep(0.045, 0.34, shade);
    wash = clamp((wash + pooling + cloudyMass) * uWashStrength, 0.0, 0.97);

    // An anisotropic second scale creates sparse dry-brush paper breaks. The
    // same stable detail also supplies restrained pigment granulation.
    vec3 detailCoordinate = vPatternPosition
      * vec3(0.72, 4.15, 1.08)
      * (uAbsorptionScale * 2.35)
      + seedOffset.zyx
      + vec3(7.1, -3.7, 11.3);
    float brushDetail = valueNoise(detailCoordinate);
    float detailFootprint = max(length(dFdx(detailCoordinate)), length(dFdy(detailCoordinate)));
    float detailFade = 1.0 - smoothstep(0.45, 1.35, detailFootprint);
    float dryGate = smoothstep(0.34, 0.78, wash);
    float paperBreak = (1.0 - smoothstep(0.25, 0.49, brushDetail))
      * dryGate
      * uDryBrushStrength
      * detailFade;
    wash *= 1.0 - paperBreak;

    float granulation = (brushDetail - 0.5)
      * uGranulationStrength
      * detailFade
      * (0.035 + wash * 0.055);
    wash = clamp(wash + granulation, 0.0, 0.97);

    vec3 paperBase = mix(uPaperColor, uSurfaceColor, 0.28);
    vec3 middleInk = mix(uInkColor, uShadowColor, 0.28);
    vec3 inkTone = mix(middleInk, uShadowColor, smoothstep(0.68, 0.96, brokenShade));
    vec3 finalColor = mix(paperBase, inkTone, wash);

    gl_FragColor = vec4(finalColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export type DoodlePatternSpace = 'world' | 'object';

export interface DoodleMaterialOptions {
  surfaceColor?: THREE.ColorRepresentation;
  paperColor?: THREE.ColorRepresentation;
  inkColor?: THREE.ColorRepresentation;
  shadowColor?: THREE.ColorRepresentation;
  lightDirection?: THREE.Vector3;
  hatchScale?: number;
  hatchStrength?: number;
  /** Radians added to the surface-aware hatch direction. */
  hatchAngle?: number;
  /** Amount of deterministic spacing and tone drift. */
  hatchVariation?: number;
  /** Strength of the fine paper-fibre modulation. */
  grainStrength?: number;
  /** Selects the legacy hatch shader or the rice-paper ink-wash shader. */
  visualStyle?: VisualStyle;
  inkVersion?: InkVersion;
  /** World space avoids repetition on static architecture; object space follows moving meshes. */
  patternSpace?: DoodlePatternSpace;
  /** Optional V5 scans for authored small-object brushwork. */
  inkBrushMap?: THREE.Texture;
  paperMap?: THREE.Texture;
  /** Overall density of the continuous ink wash. */
  washStrength?: number;
  /** Adds a bounded base ink load before the soft wash masses are evaluated. */
  washBias?: number;
  /** Shapes the light-to-wash response without introducing hard toon bands. */
  washContrast?: number;
  /** World/object-unit frequency of the broad paper absorption field. */
  absorptionScale?: number;
  /** Amount of local paper reveal through dark brush masses. */
  dryBrushStrength?: number;
  /** Strength of fine, derivative-faded pigment variation. */
  granulationStrength?: number;
  opacity?: number;
  seed?: number;
  side?: THREE.Side;
  depthTest?: boolean;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

type DoodleUniforms = {
  uSurfaceColor: THREE.IUniform<THREE.Color>;
  uPaperColor: THREE.IUniform<THREE.Color>;
  uInkColor: THREE.IUniform<THREE.Color>;
  uShadowColor: THREE.IUniform<THREE.Color>;
  uLightDirection: THREE.IUniform<THREE.Vector3>;
  uHatchScale: THREE.IUniform<number>;
  uHatchStrength: THREE.IUniform<number>;
  uHatchAngle: THREE.IUniform<number>;
  uHatchVariation: THREE.IUniform<number>;
  uGrainStrength: THREE.IUniform<number>;
  uSeedTurn: THREE.IUniform<number>;
  uPatternSpace: THREE.IUniform<number>;
  uWashBias: THREE.IUniform<number>;
  uWashStrength: THREE.IUniform<number>;
  uWashContrast: THREE.IUniform<number>;
  uAbsorptionScale: THREE.IUniform<number>;
  uDryBrushStrength: THREE.IUniform<number>;
  uGranulationStrength: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uSeed: THREE.IUniform<number>;
  uInkBrushTexture: THREE.IUniform<THREE.Texture>;
  uPaperTexture: THREE.IUniform<THREE.Texture>;
};

/**
 * Shared non-PBR material facade for the legacy ballpoint and current ink-wash styles.
 */
export class DoodleMaterial extends THREE.ShaderMaterial {
  declare uniforms: DoodleUniforms;
  readonly isDoodleMaterial = true;
  readonly visualStyle: VisualStyle;
  readonly isInkWashMaterial: boolean;

  constructor(options: DoodleMaterialOptions = {}) {
    const opacity = THREE.MathUtils.clamp(options.opacity ?? 1, 0, 1);
    const seed = options.seed ?? 0;
    const visualStyle = options.visualStyle ?? ACTIVE_VISUAL_STYLE;
    const patternSpace = options.patternSpace ?? 'object';
    const palette = visualStyle === 'ink' && (options.inkVersion ?? ACTIVE_INK_VERSION) === 'current'
      ? CURRENT_INK_PALETTE : paletteForStyle(visualStyle);
    const doodleUniforms: DoodleUniforms = {
      uSurfaceColor: { value: new THREE.Color(options.surfaceColor ?? palette.paperLight) },
      uPaperColor: { value: new THREE.Color(options.paperColor ?? palette.paper) },
      uInkColor: { value: new THREE.Color(options.inkColor ?? palette.ink) },
      uShadowColor: { value: new THREE.Color(options.shadowColor ?? palette.darkInk) },
      uLightDirection: {
        value: (options.lightDirection ?? new THREE.Vector3(-0.42, 0.82, 0.38)).clone().normalize(),
      },
      uHatchScale: { value: Math.max(options.hatchScale ?? 8.4, 2) },
      uHatchStrength: { value: THREE.MathUtils.clamp(options.hatchStrength ?? 0.78, 0, 1.5) },
      uHatchAngle: { value: options.hatchAngle ?? 0 },
      uHatchVariation: { value: THREE.MathUtils.clamp(options.hatchVariation ?? 0.72, 0, 1.5) },
      uGrainStrength: { value: THREE.MathUtils.clamp(options.grainStrength ?? 0.72, 0, 1.5) },
      uSeedTurn: { value: seedTurnFor(seed) },
      uPatternSpace: { value: patternSpace === 'world' ? 1 : 0 },
      uWashBias: { value: THREE.MathUtils.clamp(options.washBias ?? 0, 0, 0.5) },
      uWashStrength: {
        value: THREE.MathUtils.clamp(options.washStrength ?? options.hatchStrength ?? 0.78, 0, 1.5),
      },
      uWashContrast: { value: THREE.MathUtils.clamp(options.washContrast ?? 1, 0.25, 2.5) },
      uAbsorptionScale: { value: THREE.MathUtils.clamp(options.absorptionScale ?? 0.42, 0.04, 4) },
      uDryBrushStrength: { value: THREE.MathUtils.clamp(options.dryBrushStrength ?? 0.22, 0, 1) },
      uGranulationStrength: { value: THREE.MathUtils.clamp(options.granulationStrength ?? 0.18, 0, 1) },
      uOpacity: { value: opacity },
      uSeed: { value: seed },
      uInkBrushTexture: { value: options.inkBrushMap ?? inkBrushTexture },
      uPaperTexture: { value: options.paperMap ?? xuanPaperTexture },
    };
    // ShaderMaterial does not add fog uniforms automatically. Three's renderer
    // still refreshes them when `fog` is true, so merge the standard block once.
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      doodleUniforms,
    ]) as unknown as DoodleUniforms;
    // UniformsUtils clones textures; retain shared loading and GPU ownership.
    uniforms.uInkBrushTexture.value = doodleUniforms.uInkBrushTexture.value;
    uniforms.uPaperTexture.value = doodleUniforms.uPaperTexture.value;

    super({
      name: 'DoodleMaterial',
      defines: {
        ...(['v2', 'v3'].includes(options.inkVersion ?? ACTIVE_INK_VERSION) ? { INK_PAPER: 1 } : {}),
        ...((options.inkVersion ?? ACTIVE_INK_VERSION) === 'v3' ? { INK_DRY_BRUSH: 1 } : {}),
        ...((options.inkVersion ?? ACTIVE_INK_VERSION) === 'v4'
          && ACTIVE_INK_V4_STAGE !== 'a' ? { INK_V4_BRUSH: 1 } : {}),
      },
      uniforms,
      vertexShader: visualStyle === 'ballpoint' ? BALLPOINT_VERTEX_SHADER : INK_VERTEX_SHADER,
      fragmentShader: visualStyle === 'ballpoint' ? BALLPOINT_FRAGMENT_SHADER
        : (options.inkVersion ?? ACTIVE_INK_VERSION) === 'current' ? INK_FRAGMENT_SHADER
          : (options.inkVersion ?? ACTIVE_INK_VERSION) === 'v5' ? INK_V5_TONE_FRAGMENT
            : (options.inkVersion ?? ACTIVE_INK_VERSION) === 'v4' ? INK_V4_TONE_FRAGMENT
            : INK_TONE_FRAGMENT,
      side: options.side ?? THREE.FrontSide,
      transparent: opacity < 1,
      depthTest: options.depthTest ?? true,
      depthWrite: options.depthWrite ?? opacity >= 1,
      fog: true,
      polygonOffset: options.polygonOffset ?? false,
      polygonOffsetFactor: options.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: options.polygonOffsetUnits ?? 0,
    });
    this.visualStyle = visualStyle;
    this.isInkWashMaterial = visualStyle === 'ink';
    Object.assign(this.uniforms, inkUniforms);
  }

  get surfaceColor(): THREE.Color {
    return this.uniforms.uSurfaceColor.value;
  }

  get inkColor(): THREE.Color {
    return this.uniforms.uInkColor.value;
  }

  get opacityValue(): number {
    return this.uniforms.uOpacity.value;
  }

  set opacityValue(value: number) {
    const opacity = THREE.MathUtils.clamp(value, 0, 1);
    this.uniforms.uOpacity.value = opacity;
    this.transparent = opacity < 1;
    this.depthWrite = opacity >= 1;
  }

  setLightDirection(direction: THREE.Vector3): this {
    this.uniforms.uLightDirection.value.copy(direction).normalize();
    return this;
  }

  setHatch(scale: number, strength = this.uniforms.uHatchStrength.value): this {
    this.uniforms.uHatchScale.value = Math.max(scale, 2);
    this.uniforms.uHatchStrength.value = THREE.MathUtils.clamp(strength, 0, 1.5);
    if (this.visualStyle === 'ink') {
      this.uniforms.uWashStrength.value = THREE.MathUtils.clamp(strength, 0, 1.5);
    }
    return this;
  }

  setWash(
    strength: number,
    dryBrushStrength = this.uniforms.uDryBrushStrength.value,
    granulationStrength = this.uniforms.uGranulationStrength.value,
  ): this {
    this.uniforms.uWashStrength.value = THREE.MathUtils.clamp(strength, 0, 1.5);
    this.uniforms.uDryBrushStrength.value = THREE.MathUtils.clamp(dryBrushStrength, 0, 1);
    this.uniforms.uGranulationStrength.value = THREE.MathUtils.clamp(granulationStrength, 0, 1);
    return this;
  }

  setWashBias(value: number): this {
    this.uniforms.uWashBias.value = THREE.MathUtils.clamp(value, 0, 0.5);
    return this;
  }

  setSurfaceColor(color: THREE.ColorRepresentation): this {
    this.uniforms.uSurfaceColor.value.set(color);
    return this;
  }
}
