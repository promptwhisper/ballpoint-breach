export const INK_TONE_FRAGMENT = /* glsl */ `
  uniform vec3 uSurfaceColor, uPaperColor, uInkColor, uShadowColor, uLightDirection;
  uniform float uWashBias, uWashStrength, uWashContrast, uAbsorptionScale;
  uniform float uOpacity, uSeed;
  uniform float uDryBrushStrength, uGranulationStrength;
  uniform float contrast, lightInk, darkInk, noiseAmount;
  uniform float paperStrength, fiberScale, absorption, bleedStrength, bleedRadius, dryBrushStrength;
  varying vec3 vWorldNormal, vPatternPosition;
  varying vec3 vPatternNormal, vInkViewDirection;
  #include <fog_pars_fragment>

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float valueNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                   mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                   mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float inkRamp(float shade) {
    float wash = lightInk * smoothstep(0.08, 0.18, shade);
    wash += 0.17 * smoothstep(0.26, 0.35, shade);
    wash += 0.35 * smoothstep(0.45, 0.55, shade);
    wash += 0.37 * smoothstep(0.66, 0.77, shade);
    return wash;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 p = vPatternPosition * uAbsorptionScale + vec3(uSeed * 0.37, uSeed * 0.61, -uSeed * 0.43);
    float mass = valueNoise(p * 1.7);
    float detail = valueNoise(p * 5.3 + vec3(9.2, 3.1, 7.3));
    float fiber = 0.5;
    float fiberFade = 1.0;
    #ifdef INK_PAPER
      // Static, two-scale domain warp: an irregular ink boundary, not animated cloud noise.
      vec3 warp = vec3(valueNoise(p + 3.7), valueNoise(p + 19.1), valueNoise(p - 7.3));
      vec3 inkDomain = p * 3.0 + (warp - 0.5) * 3.2;
      mass = valueNoise(inkDomain) * 0.68 + valueNoise(inkDomain * 2.7 + 5.1) * 0.32;
      vec3 fiberDomain = vPatternPosition * vec3(17.0, 39.0, 23.0) * fiberScale;
      float footprint = max(length(dFdx(fiberDomain)), length(dFdy(fiberDomain)));
      fiberFade = 1.0 - smoothstep(0.4, 1.4, footprint);
      fiber = mix(0.5, valueNoise(fiberDomain), fiberFade);
    #endif
    float ndl = dot(normal, normalize(uLightDirection));
    float shade = pow(clamp(0.48 - ndl * 0.55, 0.0, 1.0), uWashContrast);
    float baseLuma = dot(uSurfaceColor, vec3(0.2126, 0.7152, 0.0722));
    float baseLoad = (1.0 - smoothstep(0.08, 0.85, baseLuma)) * 0.26;
    float structure = clamp((shade + baseLoad + uWashBias - 0.13) * contrast, 0.0, 1.0);
    float brokenShade = clamp((shade + baseLoad + uWashBias - 0.13) * contrast
      + (mass - 0.5) * noiseAmount * 0.36 + (detail - 0.5) * 0.025, 0.0, 1.0);

    #ifdef INK_PAPER
      // Absorption changes the density before tone thresholds, not the final RGB.
      brokenShade = clamp(brokenShade + (mass - 0.5) * absorption * 0.8
        * smoothstep(0.08, 0.3, brokenShade)
        + (fiber - 0.5) * paperStrength * 0.025, 0.0, 1.0);
    #endif

    // Unequal soft ink steps keep pale planes open and compress shade into dense ink.
    float wash = inkRamp(brokenShade);
    #ifdef INK_PAPER
      // Geometry owns most of the ink load. Absorption cannot repaint an entire
      // planar face as camouflage merely because it sits near a ramp threshold.
      wash = mix(inkRamp(structure), wash, 0.22 + absorption * 0.15);
    #endif
    wash = clamp(wash * uWashStrength, 0.0, darkInk);
    #ifdef INK_PAPER
      // A narrow asymmetric halo and pigment rim around each interior wash boundary.
      // Radius is in ink-density units; this never samples/blurs the scene color.
      vec3 thresholds = vec3(0.30, 0.50, 0.71);
      vec3 offset = vec3(brokenShade) - thresholds;
      float spread = max(0.001, bleedRadius * (0.55 + mass + fiber * paperStrength));
      vec3 wetEdge = smoothstep(vec3(-spread * 2.2), vec3(0.0), offset)
        * (1.0 - smoothstep(vec3(0.0), vec3(spread * 0.65), offset));
      float edgePigment = dot(wetEdge, vec3(0.22, 0.46, 0.62));
      wash += edgePigment * bleedStrength * uWashStrength * 0.4;
      wash += (fiber - 0.5) * paperStrength * wash * 0.035 * (uGranulationStrength / 0.18);
      wash = clamp(wash, 0.0, darkInk);
    #endif
    float paperBreak = 0.0;
    #ifdef INK_DRY_BRUSH
      // Triplanar bristle fields follow the surface frame; no screen-aligned stroke grid.
      vec3 weights = pow(abs(normalize(vPatternNormal)), vec3(6.0));
      weights /= max(dot(weights, vec3(1.0)), 0.001);
      vec3 brush = vPatternPosition * 3.4;
      vec3 marks = vec3(
        valueNoise(brush * vec3(0.8, 1.1, 19.0)),
        valueNoise(brush * vec3(1.1, 0.8, 19.0)),
        valueNoise(brush * vec3(19.0, 1.1, 0.8))
      );
      float brushFootprint = max(length(dFdx(brush)), length(dFdy(brush))) * 19.0;
      float grazing = abs(dot(normal, normalize(vInkViewDirection)));
      float detailFade = (1.0 - smoothstep(0.45, 1.8, brushFootprint)) * smoothstep(0.12, 0.4, grazing);
      float bristle = 1.0 - smoothstep(0.3, 0.53, dot(marks, weights));
      paperBreak = bristle * dryBrushStrength * (uDryBrushStrength / 0.22) * detailFade
        * smoothstep(0.28, 0.65, wash) * smoothstep(0.4, 0.7, detail);
    #endif
    wash *= 1.0 - clamp(paperBreak, 0.0, 0.85);

    // Mix optical reflectance in perceptual space, then return to linear for fog/output.
    vec3 paper = pow(max(uPaperColor, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 ink = pow(max(mix(uInkColor, uShadowColor, 0.72), vec3(0.0)), vec3(1.0 / 2.2));
    vec3 pigment = pow(max(uSurfaceColor, vec3(0.0)), vec3(1.0 / 2.2));
    float chroma = max(pigment.r, max(pigment.g, pigment.b)) - min(pigment.r, min(pigment.g, pigment.b));
    paper = mix(paper, pigment, smoothstep(0.12, 0.4, chroma) * 0.22);
    vec3 finalColor = pow(mix(paper, ink, wash), vec3(2.2));
    gl_FragColor = vec4(finalColor, uOpacity);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * V4 starts from geometric ink mass. Lighting and facing carry the composition;
 * procedural fields are deliberately absent from the A stage.
 */
export const INK_V4_TONE_FRAGMENT = /* glsl */ `
  uniform vec3 uSurfaceColor, uPaperColor, uInkColor, uShadowColor, uLightDirection;
  uniform float uWashBias, uWashStrength, uWashContrast, uAbsorptionScale;
  uniform float uOpacity, uSeed, uDryBrushStrength;
  uniform float contrast, lightInk, darkInk;
  varying vec3 vWorldNormal, vPatternPosition, vInkViewDirection;
  #include <fog_pars_fragment>

  float inkHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float inkNoise(vec2 p) {
    vec2 cell = floor(p), local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(inkHash(cell), inkHash(cell + vec2(1.0, 0.0)), local.x),
      mix(inkHash(cell + vec2(0.0, 1.0)), inkHash(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  vec3 brushCoordinates(vec3 position, vec3 normal, vec3 lightDirection) {
    vec3 weight = abs(normal);
    vec2 surface;
    vec2 projectedLight;
    if (weight.y >= weight.x && weight.y >= weight.z) {
      surface = position.xz;
      projectedLight = lightDirection.xz;
    } else if (weight.x >= weight.z) {
      surface = position.zy;
      projectedLight = vec2(lightDirection.z, lightDirection.y);
    } else {
      surface = position.xy;
      projectedLight = lightDirection.xy;
    }
    projectedLight = normalize(projectedLight + vec2(0.001, 0.001));
    // Upright planes prefer a falling stroke; horizontal planes follow the
    // projected light. This is a stable surface field, not a screen-space grid.
    float upright = 1.0 - smoothstep(0.42, 0.82, weight.y);
    vec2 strokeDirection = normalize(mix(projectedLight, vec2(0.16, 0.987), upright * 0.72));
    vec2 acrossDirection = vec2(-strokeDirection.y, strokeDirection.x);
    return vec3(dot(surface, strokeDirection), dot(surface, acrossDirection), upright);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(vInkViewDirection);
    float ndl = dot(normal, normalize(uLightDirection)) * 0.5 + 0.5;
    float lit = smoothstep(0.10, 0.94, ndl);
    float shadowMass = pow(max(1.0 - lit, 0.0), mix(1.2, 0.72, uWashContrast * 0.5));

    float ndv = abs(dot(normal, viewDirection));
    float grazingMass = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.8) * 0.24;
    float normalVariation = clamp(
      (length(dFdx(normal)) + length(dFdy(normal))) * 1.45,
      0.0,
      1.0
    );
    float baseLuma = dot(uSurfaceColor, vec3(0.2126, 0.7152, 0.0722));
    float materialMass = (1.0 - smoothstep(0.10, 0.88, baseLuma)) * 0.28;
    float upwardBlank = smoothstep(0.62, 0.96, normal.y)
      * smoothstep(0.58, 0.98, ndl) * 0.16;

    float inkMass = clamp(
      shadowMass * 0.78
      + grazingMass
      + normalVariation * 0.14
      + materialMass
      + uWashBias
      - upwardBlank,
      0.0,
      1.0
    );
    // A single continuous response avoids cel-shader bands. The lower shoulder
    // keeps light-facing planes open while the upper shoulder pools heavy ink.
    float coverage = smoothstep(0.025, 0.96, pow(inkMass, 0.92));
    coverage = clamp(coverage * uWashStrength * contrast, lightInk * 0.18, darkInk);

    #ifdef INK_V4_BRUSH
      vec3 brush = brushCoordinates(vPatternPosition, normal, normalize(uLightDirection));
      float scale = mix(0.85, 1.18, brush.z) / max(uAbsorptionScale, 0.08);
      float alongStroke = brush.x / scale;
      float acrossStroke = brush.y / scale;
      float lane = inkNoise(vec2(acrossStroke * 1.12, alongStroke * 0.075) + uSeed * 0.71);
      float laneShoulder = inkNoise(vec2(acrossStroke * 3.45, alongStroke * 0.19) + vec2(6.7, -2.8) + uSeed);
      float bristle = inkNoise(vec2(acrossStroke * 7.2, alongStroke * 0.42) + vec2(11.7, -4.2) + uSeed);
      float brokenLength = inkNoise(vec2(
        alongStroke * 0.82 + acrossStroke * 0.08,
        floor(acrossStroke * 1.05) * 0.47
      ) + uSeed * 1.9);
      float footprint = max(
        length(dFdx(vec2(alongStroke, acrossStroke))),
        length(dFdy(vec2(alongStroke, acrossStroke)))
      );
      float brushFade = 1.0 - smoothstep(0.65, 2.2, footprint);
      float brushGate = smoothstep(0.24, 0.82, coverage) * brushFade;
      float lengthEnvelope = smoothstep(0.30, 0.52, brokenLength);
      float strokeBody = mix(lane, laneShoulder, 0.26);
      // The stroke field has a head and tail along the stroke as well as broad
      // lateral variation. It reads as loaded brush bundles instead of an
      // infinite procedural stripe laid over the wall.
      float broadLoad = (strokeBody - 0.5) * 0.125 * brushGate
        * mix(0.38, 1.0, lengthEnvelope);
      float loadedEdge = smoothstep(0.62, 0.82, lane)
        * smoothstep(0.34, 0.63, lengthEnvelope) * 0.038 * brushGate;
      float dryBristle = smoothstep(0.70, 0.87, bristle)
        * smoothstep(0.43, 0.72, laneShoulder)
        * lengthEnvelope
        * smoothstep(0.34, 0.88, coverage)
        * uDryBrushStrength * 0.42 * brushFade;
      coverage = clamp(coverage + broadLoad + loadedEdge - dryBristle, lightInk * 0.12, darkInk);
    #endif
    float heavy = smoothstep(0.46, 0.92, coverage);

    vec3 paper = pow(max(uPaperColor, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 surface = pow(max(uSurfaceColor, vec3(0.0)), vec3(1.0 / 2.2));
    float chroma = max(surface.r, max(surface.g, surface.b)) - min(surface.r, min(surface.g, surface.b));
    paper = mix(paper, surface, smoothstep(0.10, 0.38, chroma) * 0.18);
    vec3 middleInk = pow(max(mix(uInkColor, uShadowColor, 0.32), vec3(0.0)), vec3(1.0 / 2.2));
    vec3 pooledInk = pow(max(uShadowColor, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 pigment = mix(middleInk, pooledInk, heavy * 0.82);
    vec3 finalColor = pow(mix(paper, pigment, coverage), vec3(2.2));

    gl_FragColor = vec4(finalColor, uOpacity);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const INK_V5_TONE_FRAGMENT = /* glsl */ `
  uniform sampler2D uInkBrushTexture, uPaperTexture;
  uniform vec3 uSurfaceColor, uPaperColor, uInkColor, uShadowColor, uLightDirection;
  uniform float uWashBias, uWashStrength, uWashContrast, uAbsorptionScale;
  uniform float uOpacity, uSeed, uDryBrushStrength;
  uniform float contrast, lightInk, darkInk, paperStrength;
  varying vec3 vWorldNormal, vPatternPosition, vInkViewDirection;
  #include <fog_pars_fragment>

  vec3 textureCoordinates(vec3 position, vec3 normal, vec3 lightDirection) {
    vec3 weight = abs(normal);
    vec2 surface;
    vec2 projectedLight;
    if (weight.y >= weight.x && weight.y >= weight.z) {
      surface = position.xz;
      projectedLight = lightDirection.xz;
    } else if (weight.x >= weight.z) {
      surface = position.zy;
      projectedLight = vec2(lightDirection.z, lightDirection.y);
    } else {
      surface = position.xy;
      projectedLight = lightDirection.xy;
    }
    projectedLight = normalize(projectedLight + vec2(0.001));
    float upright = 1.0 - smoothstep(0.42, 0.82, weight.y);
    vec2 strokeDirection = normalize(mix(projectedLight, vec2(0.14, 0.99), upright * 0.78));
    vec2 acrossDirection = vec2(-strokeDirection.y, strokeDirection.x);
    return vec3(dot(surface, acrossDirection), dot(surface, strokeDirection), upright);
  }

  float inkFromTexture(vec2 uv) {
    vec3 scan = texture2D(uInkBrushTexture, uv).rgb;
    float luma = dot(scan, vec3(0.2126, 0.7152, 0.0722));
    return 1.0 - smoothstep(0.36, 0.91, luma);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(vInkViewDirection);
    float ndl = dot(normal, normalize(uLightDirection)) * 0.5 + 0.5;
    float lit = smoothstep(0.10, 0.94, ndl);
    float shadowMass = pow(max(1.0 - lit, 0.0), mix(1.18, 0.70, uWashContrast * 0.5));
    float ndv = abs(dot(normal, viewDirection));
    float grazingMass = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.75) * 0.21;
    float normalVariation = clamp(
      (length(dFdx(normal)) + length(dFdy(normal))) * 1.35,
      0.0,
      1.0
    );
    float baseLuma = dot(uSurfaceColor, vec3(0.2126, 0.7152, 0.0722));
    float materialMass = (1.0 - smoothstep(0.10, 0.88, baseLuma)) * 0.24;
    float upwardBlank = smoothstep(0.62, 0.96, normal.y)
      * smoothstep(0.58, 0.98, ndl) * 0.18;
    float inkMass = clamp(
      shadowMass * 0.76 + grazingMass + normalVariation * 0.12
      + materialMass + uWashBias - upwardBlank,
      0.0,
      1.0
    );

    vec3 brushCoordinates = textureCoordinates(vPatternPosition, normal, normalize(uLightDirection));
    float worldScale = mix(0.073, 0.088, brushCoordinates.z)
      * mix(0.92, 1.08, uAbsorptionScale);
    vec2 brushUv = brushCoordinates.xy * worldScale + vec2(uSeed * 0.071, uSeed * 0.113);
    float primaryBrush = inkFromTexture(brushUv);
    float secondaryBrush = inkFromTexture(brushUv * vec2(0.71, 0.83) + vec2(0.53, 0.29));
    float broadBrush = mix(primaryBrush, secondaryBrush, 0.18);
    float bristleBrush = inkFromTexture(brushUv * vec2(2.28, 1.64) + vec2(0.37, 0.61));
    float baseCoverage = smoothstep(0.025, 0.96, pow(inkMass, 0.92));
    baseCoverage = clamp(baseCoverage * uWashStrength * contrast, lightInk * 0.14, darkInk);

    // A real scanned mark supplies the shape. Geometry decides where ink is
    // needed; the texture decides how a loaded brush deposits or skips it.
    float textureGate = smoothstep(0.30, 0.82, baseCoverage);
    float textureLoad = (broadBrush - 0.46) * 0.34 * textureGate;
    float dryReveal = (1.0 - bristleBrush) * smoothstep(0.36, 0.82, baseCoverage)
      * uDryBrushStrength * 0.30;
    float coverage = clamp(
      baseCoverage + textureLoad
      + broadBrush * shadowMass * 0.035
      - dryReveal,
      lightInk * 0.10,
      darkInk
    );

    vec2 paperUv = brushCoordinates.xy * 0.19 + vec2(uSeed * 0.019, -uSeed * 0.027);
    vec3 paperScan = texture2D(uPaperTexture, paperUv).rgb;
    vec3 paper = pow(max(uPaperColor, vec3(0.0)), vec3(1.0 / 2.2));
    paper = mix(paper, pow(max(paperScan, vec3(0.0)), vec3(1.0 / 2.2)), paperStrength * 0.52);
    vec3 surface = pow(max(uSurfaceColor, vec3(0.0)), vec3(1.0 / 2.2));
    float chroma = max(surface.r, max(surface.g, surface.b)) - min(surface.r, min(surface.g, surface.b));
    paper = mix(paper, surface, smoothstep(0.08, 0.34, chroma) * 0.16);
    vec3 middleInk = pow(max(mix(uInkColor, uShadowColor, 0.34), vec3(0.0)), vec3(1.0 / 2.2));
    vec3 pooledInk = pow(max(uShadowColor, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 pigment = mix(middleInk, pooledInk, smoothstep(0.48, 0.91, coverage) * 0.84);
    vec3 finalColor = pow(mix(paper, pigment, coverage), vec3(2.2));

    gl_FragColor = vec4(finalColor, uOpacity);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
