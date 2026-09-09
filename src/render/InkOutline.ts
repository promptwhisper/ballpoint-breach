import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ACTIVE_INK_V4_STAGE, ACTIVE_INK_VERSION, inkUniforms } from './inkSettings';
import { xuanPaperTexture } from './InkTextures';

export const INK_OUTLINE_FRAGMENT = /* glsl */ `
  #include <packing>
  uniform sampler2D colorMap, normalMap, depthMap;
  uniform sampler2D uPaperTexture;
  uniform vec2 texel;
  uniform float nearPlane, farPlane;
  uniform mat4 inverseProjection, cameraWorld;
  uniform float outlineStrength, outlineWidth, depthEdgeWeight, normalEdgeWeight;
  uniform float noiseAmount, lineBreakup;
  varying vec2 vUv;
  float depthAt(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(depthMap, uv).r, nearPlane, farPlane);
  }
  float noise(vec3 p) {
    return 0.5 + 0.25 * sin(dot(p, vec3(2.7, 4.3, 3.1)))
      + 0.25 * sin(dot(p, vec3(-5.1, 2.3, 4.7)));
  }
  void main() {
    vec4 color = texture2D(colorMap, vUv);
    float rawDepth = texture2D(depthMap, vUv).r;
    float d = depthAt(vUv);
    vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
    vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
    float pressure = noise(world * 2.0);
    vec2 radius = texel * outlineWidth * mix(1.0, 0.65 + pressure * 0.65, noiseAmount);
    vec2 dx = vec2(radius.x, 0.0), dy = vec2(0.0, radius.y);
    float left = depthAt(vUv - dx), right = depthAt(vUv + dx);
    float down = depthAt(vUv - dy), up = depthAt(vUv + dy);
    // Paired second differences reject perspective slopes on continuous planes.
    float depthDiff = max(abs(left + right - 2.0 * d), abs(up + down - 2.0 * d));
    float depthEdge = smoothstep(0.012, 0.075, depthDiff / max(d, 1.0));
    vec3 n = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
    float normalDiff = 0.0;
    normalDiff = max(normalDiff, length(n - (texture2D(normalMap, vUv - dx).rgb * 2.0 - 1.0)) * step(abs(left-d), d * 0.025));
    normalDiff = max(normalDiff, length(n - (texture2D(normalMap, vUv + dx).rgb * 2.0 - 1.0)) * step(abs(right-d), d * 0.025));
    normalDiff = max(normalDiff, length(n - (texture2D(normalMap, vUv - dy).rgb * 2.0 - 1.0)) * step(abs(down-d), d * 0.025));
    normalDiff = max(normalDiff, length(n - (texture2D(normalMap, vUv + dy).rgb * 2.0 - 1.0)) * step(abs(up-d), d * 0.025));
    float normalEdge = smoothstep(0.38, 1.05, normalDiff);
    float distanceFade = 1.0 - smoothstep(18.0, 65.0, d);
    float continuity = mix(0.12, 1.0, smoothstep(lineBreakup, lineBreakup + 0.22, pressure));
    float edge = clamp(depthEdge * depthEdgeWeight + normalEdge * normalEdgeWeight, 0.0, 1.0);
    edge *= outlineStrength * distanceFade * continuity * step(rawDepth, 0.999999);
    gl_FragColor = vec4(mix(color.rgb, vec3(0.013, 0.017, 0.016), edge), color.a);
    #include <colorspace_fragment>
  }
`;

export const INK_V4_COMPOSITE_FRAGMENT = /* glsl */ `
  #include <packing>
  uniform sampler2D colorMap, normalMap, depthMap;
  uniform sampler2D uPaperTexture;
  uniform vec2 texel;
  uniform float nearPlane, farPlane;
  uniform float outlineStrength, outlineWidth, depthEdgeWeight, normalEdgeWeight;
  uniform float paperStrength, fiberScale, absorption, bleedStrength, bleedRadius;
  varying vec2 vUv;

  float rawDepthAt(vec2 uv) { return texture2D(depthMap, uv).r; }
  float depthAt(vec2 uv) {
    return -perspectiveDepthToViewZ(rawDepthAt(uv), nearPlane, farPlane);
  }
  vec3 normalAt(vec2 uv) { return texture2D(normalMap, uv).rgb * 2.0 - 1.0; }
  float pigmentAt(vec2 uv) {
    vec3 sampleColor = texture2D(colorMap, uv).rgb;
    float luma = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));
    return 1.0 - smoothstep(0.68, 0.955, luma);
  }
  float paperFiber(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }

  void main() {
    vec4 color = texture2D(colorMap, vUv);
    float rawDepth = rawDepthAt(vUv);
    #ifndef INK_V4_BLEED
    if (rawDepth >= 0.999999) {
      gl_FragColor = color;
      #include <colorspace_fragment>
      return;
    }
    #endif

    float d = depthAt(vUv);
    vec2 radius = texel * outlineWidth;
    vec2 dx = vec2(radius.x, 0.0), dy = vec2(0.0, radius.y);
    float rawL = rawDepthAt(vUv - dx), rawR = rawDepthAt(vUv + dx);
    float rawD = rawDepthAt(vUv - dy), rawU = rawDepthAt(vUv + dy);
    float left = depthAt(vUv - dx), right = depthAt(vUv + dx);
    float down = depthAt(vUv - dy), up = depthAt(vUv + dy);
    vec3 n = normalAt(vUv);

    float backgroundNeighbors = step(0.99999, rawL) + step(0.99999, rawR)
      + step(0.99999, rawD) + step(0.99999, rawU);
    float relativeDepth = max(max(abs(left - d), abs(right - d)), max(abs(down - d), abs(up - d)))
      / max(d, 1.0);
    float silhouette = max(step(0.5, backgroundNeighbors), smoothstep(0.018, 0.115, relativeDepth));

    float normalX = max(length(n - normalAt(vUv - dx)), length(n - normalAt(vUv + dx)));
    float normalY = max(length(n - normalAt(vUv - dy)), length(n - normalAt(vUv + dy)));
    float normalDifference = max(normalX, normalY);
    float majorCrease = (1.0 - silhouette) * smoothstep(0.52, 1.18, normalDifference);
    float minorEdge = (1.0 - silhouette) * (1.0 - majorCrease)
      * smoothstep(0.20, 0.54, normalDifference);

    float silhouetteFade = 1.0 - smoothstep(48.0, 105.0, d);
    float majorFade = 1.0 - smoothstep(22.0, 62.0, d);
    float minorFade = 1.0 - smoothstep(8.0, 26.0, d);
    // Thin, distant features generate several neighboring depth boundaries.
    // Suppress them before they become a railing/window-frame wire diagram.
    float thinFeature = smoothstep(1.25, 3.25, backgroundNeighbors)
      * smoothstep(7.0, 31.0, d);
    float densitySuppression = mix(1.0, 0.22, thinFeature);

    float silhouetteWeight = 1.0;
    float majorWeight = 0.72;
    float minorWeight = 0.20;
    #ifdef INK_V5_TEXTURED_PAPER
      silhouetteWeight = 0.88;
      majorWeight = 0.44;
      minorWeight = 0.07;
      densitySuppression *= mix(1.0, 0.58, thinFeature);
    #endif
    float edge = silhouette * depthEdgeWeight * silhouetteFade * densitySuppression * silhouetteWeight;
    edge = max(edge, majorCrease * normalEdgeWeight * majorFade * majorWeight);
    edge = max(edge, minorEdge * normalEdgeWeight * minorFade * minorWeight);
    edge = clamp(edge * outlineStrength, 0.0, 0.82);

    // A restrained curvature/contact cue helps geometry carry ink even when the
    // explicit outline control is zero. It is not a second contour.
    float depthBowl = max(0.0, (left + right + down + up) * 0.25 - d) / max(d, 1.0);
    float contactInk = smoothstep(0.006, 0.045, depthBowl)
      * (1.0 - smoothstep(18.0, 58.0, d)) * 0.075;
    vec3 ink = vec3(0.015, 0.017, 0.016);
    vec3 composed = mix(color.rgb, ink, max(edge, contactInk));

    #ifdef INK_V4_BLEED
      // Spatial bleed is derived from the rendered pigment boundary. Paper
      // fibers perturb only that narrow boundary; they never become a cloudy
      // full-surface texture.
      float fiber = paperFiber(floor(gl_FragCoord.xy / max(fiberScale, 0.35)));
      float crossFiber = paperFiber(floor(
        gl_FragCoord.yx * vec2(0.54, 1.73) / max(fiberScale, 0.35)
      ) + 19.7);
      float fiberBundle = fiber * 0.68 + crossFiber * 0.32;
      float brokenFiber = smoothstep(0.43, 0.69, fiberBundle);
      float radiusPixels = (0.82 + bleedRadius * 31.0)
        * mix(0.90, 1.13, fiber) * mix(0.92, 1.10, absorption);
      vec2 sampleRadius = texel * radiusPixels;
      float centerPigment = pigmentAt(vUv);
      float maxPigment = centerPigment;
      float minPigment = centerPigment;
      float p;
      p = pigmentAt(vUv + vec2( sampleRadius.x, 0.0)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + vec2(-sampleRadius.x, 0.0)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + vec2(0.0,  sampleRadius.y)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + vec2(0.0, -sampleRadius.y)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + sampleRadius * vec2( 0.707,  0.707)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + sampleRadius * vec2(-0.707,  0.707)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + sampleRadius * vec2( 0.707, -0.707)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);
      p = pigmentAt(vUv + sampleRadius * vec2(-0.707, -0.707)); maxPigment = max(maxPigment, p); minPigment = min(minPigment, p);

      float outerSpread = max(0.0, maxPigment - centerPigment);
      float innerPooling = max(0.0, centerPigment - minPigment);
      float boundary = smoothstep(0.035, 0.27, max(outerSpread, innerPooling));
      float paperBreakup = mix(0.62, mix(0.12, 1.0, brokenFiber), paperStrength);
      float bleedInk = outerSpread * bleedStrength * paperBreakup * 0.24;
      bleedInk += innerPooling * bleedStrength
        * mix(0.70, mix(0.45, 1.16, fiber), paperStrength) * 0.28;
      bleedInk += boundary * max(fiberBundle - 0.58, 0.0)
        * paperStrength * absorption * 0.018;
      composed = mix(composed, ink, clamp(bleedInk, 0.0, 0.13));

      if (rawDepth >= 0.999999 && maxPigment < 0.035) {
        composed = color.rgb;
      }
    #endif
    #ifdef INK_V5_TEXTURED_PAPER
      vec3 paperScan = texture2D(uPaperTexture, vUv * vec2(1.17, 0.76) + vec2(0.11, 0.07)).rgb;
      float paperLuma = dot(paperScan, vec3(0.2126, 0.7152, 0.0722));
      composed *= 1.0 + (paperLuma - 0.945) * paperStrength * 0.16;
    #endif
    gl_FragColor = vec4(composed, color.a);
    #include <colorspace_fragment>
  }
`;

/** One extra opaque scene pass. Translucent effects and pen lines stay in the color pass only. */
export class InkOutline {
  readonly colorTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
  });
  readonly normalTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly hidden: THREE.Object3D[] = [];
  private readonly size = new THREE.Vector2();
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      ...inkUniforms,
      colorMap: { value: this.colorTarget.texture },
      normalMap: { value: this.normalTarget.texture },
      depthMap: { value: this.normalTarget.depthTexture },
      texel: { value: new THREE.Vector2(1, 1) },
      nearPlane: { value: 0.025 }, farPlane: { value: 150 },
      inverseProjection: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      uPaperTexture: { value: xuanPaperTexture },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: ACTIVE_INK_VERSION === 'v4' || ACTIVE_INK_VERSION === 'v5'
      ? INK_V4_COMPOSITE_FRAGMENT : INK_OUTLINE_FRAGMENT,
    defines: {
      ...((ACTIVE_INK_VERSION === 'v4' && ACTIVE_INK_V4_STAGE === 'c') || ACTIVE_INK_VERSION === 'v5'
        ? { INK_V4_BLEED: 1 } : {}),
      ...(ACTIVE_INK_VERSION === 'v5' ? { INK_V5_TEXTURED_PAPER: 1 } : {}),
    },
    depthTest: false, depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.material);

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(this.size);
    if (this.colorTarget.width !== this.size.x || this.colorTarget.height !== this.size.y) {
      this.colorTarget.setSize(this.size.x, this.size.y);
      this.normalTarget.setSize(this.size.x, this.size.y);
    }
    this.material.uniforms.texel.value.set(renderer.getPixelRatio() / this.size.x, renderer.getPixelRatio() / this.size.y);
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.nearPlane.value = camera.near;
    this.material.uniforms.farPlane.value = camera.far;
    const target = renderer.getRenderTarget();
    const background = scene.background;
    const override = scene.overrideMaterial;
    const clearAlpha = renderer.getClearAlpha();
    const clearColor = renderer.getClearColor(new THREE.Color());
    try {
      renderer.setRenderTarget(this.colorTarget);
      renderer.render(scene, camera);
      this.material.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      scene.traverseVisible((object) => {
        const renderable = object as THREE.Mesh;
        if (!renderable.material) return;
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        if (!(object instanceof THREE.Mesh) || materials.some(m => m.transparent || !m.depthWrite || m.side === THREE.BackSide)) {
          this.hidden.push(object);
        }
      });
      for (const object of this.hidden) object.visible = false;
      scene.background = null;
      scene.overrideMaterial = this.normalMaterial;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.normalTarget);
      renderer.render(scene, camera);
    } finally {
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.setRenderTarget(target);
    }
    this.quad.render(renderer);
  }

  dispose(): void {
    this.colorTarget.dispose();
    this.normalTarget.depthTexture?.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
