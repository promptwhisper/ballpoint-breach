import * as THREE from 'three';
import { DOODLE_PALETTE } from './palette';

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

const VERTEX_SHADER = /* glsl */ `
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

const FRAGMENT_SHADER = /* glsl */ `
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
  uOpacity: THREE.IUniform<number>;
  uSeed: THREE.IUniform<number>;
};

/**
 * Four-band, screen-space crosshatch material used by level, weapon, and enemy geometry.
 * It deliberately avoids PBR highlights so every surface reads as ink on warm paper.
 */
export class DoodleMaterial extends THREE.ShaderMaterial {
  declare uniforms: DoodleUniforms;
  readonly isDoodleMaterial = true;

  constructor(options: DoodleMaterialOptions = {}) {
    const opacity = THREE.MathUtils.clamp(options.opacity ?? 1, 0, 1);
    const seed = options.seed ?? 0;
    const doodleUniforms: DoodleUniforms = {
      uSurfaceColor: { value: new THREE.Color(options.surfaceColor ?? DOODLE_PALETTE.paperLight) },
      uPaperColor: { value: new THREE.Color(options.paperColor ?? DOODLE_PALETTE.paper) },
      uInkColor: { value: new THREE.Color(options.inkColor ?? DOODLE_PALETTE.ink) },
      uShadowColor: { value: new THREE.Color(options.shadowColor ?? DOODLE_PALETTE.darkInk) },
      uLightDirection: {
        value: (options.lightDirection ?? new THREE.Vector3(-0.42, 0.82, 0.38)).clone().normalize(),
      },
      uHatchScale: { value: Math.max(options.hatchScale ?? 8.4, 2) },
      uHatchStrength: { value: THREE.MathUtils.clamp(options.hatchStrength ?? 0.78, 0, 1.5) },
      uHatchAngle: { value: options.hatchAngle ?? 0 },
      uHatchVariation: { value: THREE.MathUtils.clamp(options.hatchVariation ?? 0.72, 0, 1.5) },
      uGrainStrength: { value: THREE.MathUtils.clamp(options.grainStrength ?? 0.72, 0, 1.5) },
      uSeedTurn: { value: seedTurnFor(seed) },
      uOpacity: { value: opacity },
      uSeed: { value: seed },
    };
    // ShaderMaterial does not add fog uniforms automatically. Three's renderer
    // still refreshes them when `fog` is true, so merge the standard block once.
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      doodleUniforms,
    ]) as unknown as DoodleUniforms;

    super({
      name: 'DoodleMaterial',
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: options.side ?? THREE.FrontSide,
      transparent: opacity < 1,
      depthTest: options.depthTest ?? true,
      depthWrite: options.depthWrite ?? opacity >= 1,
      fog: true,
      polygonOffset: options.polygonOffset ?? false,
      polygonOffsetFactor: options.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: options.polygonOffsetUnits ?? 0,
    });
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
    return this;
  }

  setSurfaceColor(color: THREE.ColorRepresentation): this {
    this.uniforms.uSurfaceColor.value.set(color);
    return this;
  }
}
