import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DoodleMaterial } from './DoodleMaterial';
import { InkOutline, INK_OUTLINE_FRAGMENT, INK_V4_COMPOSITE_FRAGMENT } from './InkOutline';
import { INK_V5_TONE_FRAGMENT } from './InkTone';
import { CURRENT_INK_PALETTE } from './palette';
import { resolveInkV4Stage, resolveInkVersion, inkUniforms, setInkParameter } from './inkSettings';

test('ink versions preserve current and select incremental compile-time stages', () => {
  assert.equal(resolveInkVersion(''), 'v5');
  assert.equal(resolveInkVersion('?inkVersion=wrong'), 'v5');
  assert.equal(resolveInkV4Stage('?inkStage=a'), 'a');
  assert.equal(resolveInkV4Stage('?inkStage=b'), 'b');
  assert.equal(resolveInkV4Stage('?inkStage=wrong'), 'c');
  for (const version of ['current', 'v1', 'v2', 'v3', 'v4', 'v5'] as const) {
    assert.equal(resolveInkVersion(`?inkVersion=${version}`), version);
    const material = new DoodleMaterial({ visualStyle: 'ink', inkVersion: version });
    assert.equal(Boolean(material.defines.INK_PAPER), version === 'v2' || version === 'v3');
    assert.equal(Boolean(material.defines.INK_DRY_BRUSH), version === 'v3');
    assert.doesNotMatch(material.fragmentShader, /uTime|gl_FragCoord/);
    if (version === 'current') {
      assert.match(material.fragmentShader, /cloudyMass/);
      assert.equal(material.surfaceColor.getHex(), CURRENT_INK_PALETTE.paperLight);
    } else if (version === 'v4') {
      assert.match(material.fragmentShader, /inkMass/);
      assert.match(material.fragmentShader, /normalVariation/);
      assert.match(material.fragmentShader, /alongStroke/);
      assert.match(material.fragmentShader, /acrossStroke/);
      assert.doesNotMatch(material.fragmentShader, /brokenShade|edgePigment/);
    } else if (version === 'v5') {
      assert.match(material.fragmentShader, /uInkBrushTexture/);
      assert.match(material.fragmentShader, /broadBrush/);
      assert.match(material.fragmentShader, /dryReveal/);
      assert.doesNotMatch(material.fragmentShader, /cloudyMass|valueNoise/);
    } else {
      assert.match(material.fragmentShader, /baseLoad/);
      assert.match(material.fragmentShader, /edgePigment/);
    }
    material.dispose();
  }
});

test('v5 texture ink keeps geometry in charge of coverage and scans decide mark shape', () => {
  assert.match(INK_V5_TONE_FRAGMENT, /inkMass/);
  assert.match(INK_V5_TONE_FRAGMENT, /textureCoordinates/);
  assert.match(INK_V5_TONE_FRAGMENT, /texture2D\(uInkBrushTexture/);
  assert.match(INK_V5_TONE_FRAGMENT, /texture2D\(uPaperTexture/);
  assert.doesNotMatch(INK_V5_TONE_FRAGMENT, /cloudyMass|hatchLine|uTime/);
});

test('inspector uniforms are shared, clamped, and reject non-finite values', () => {
  const a = new DoodleMaterial(), b = new DoodleMaterial();
  const previous = inkUniforms.outlineWidth.value;
  try {
    setInkParameter('outlineWidth', 999);
    assert.equal(inkUniforms.outlineWidth.value, 2.5);
    assert.equal(a.uniforms['outlineWidth' as keyof typeof a.uniforms], inkUniforms.outlineWidth);
    assert.equal(b.uniforms['outlineWidth' as keyof typeof b.uniforms], inkUniforms.outlineWidth);
    setInkParameter('outlineWidth', Number.NaN);
    assert.equal(inkUniforms.outlineWidth.value, 2.5);
    setInkParameter('outlineWidth', -1);
    assert.equal(inkUniforms.outlineWidth.value, 0.5);
  } finally {
    setInkParameter('outlineWidth', previous);
    a.dispose(); b.dispose();
  }
});

test('outline detects geometry depth and normal differences, never color gradients', () => {
  assert.match(INK_OUTLINE_FRAGMENT, /perspectiveDepthToViewZ/);
  assert.match(INK_OUTLINE_FRAGMENT, /left \+ right - 2.0 \* d/);
  assert.match(INK_OUTLINE_FRAGMENT, /normalDiff/);
  assert.equal((INK_OUTLINE_FRAGMENT.match(/texture2D\(colorMap/g) ?? []).length, 1);
  assert.doesNotMatch(INK_OUTLINE_FRAGMENT, /uTime|Sobel/);
});

test('v4 composite ranks silhouettes, major creases, minor edges and distance', () => {
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /silhouette/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /majorCrease/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /minorEdge/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /thinFeature/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /minorFade/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /INK_V4_BLEED/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /outerSpread/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /innerPooling/);
  assert.match(INK_V4_COMPOSITE_FRAGMENT, /brokenFiber/);
  assert.doesNotMatch(INK_V4_COMPOSITE_FRAGMENT, /uTime|Sobel|Gaussian/);
});

test('normal pass excludes transparent effects and restores state, including on failure', () => {
  for (const fail of [false, true]) {
    const pass = new InkOutline();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    const background = scene.background;
    const camera = new THREE.PerspectiveCamera(68, 1, 0.025, 150);
    const geometry = new THREE.BoxGeometry();
    const solid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const effect = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true }));
    const inactive = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    inactive.visible = false;
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
    scene.add(solid, effect, inactive, line);
    let target: THREE.WebGLRenderTarget | null = null;
    let clear = new THREE.Color(0x123456), alpha = 0.7;
    let renders = 0;
    const renderer = {
      getDrawingBufferSize: (size: THREE.Vector2) => size.set(800, 600),
      getPixelRatio: () => 1,
      getRenderTarget: () => target,
      setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
      getClearColor: (color: THREE.Color) => color.copy(clear),
      getClearAlpha: () => alpha,
      setClearColor: (color: THREE.ColorRepresentation, nextAlpha: number) => { clear = new THREE.Color(color); alpha = nextAlpha; },
      render: () => {
        renders++;
        if (target === pass.normalTarget) {
          assert.ok(scene.overrideMaterial instanceof THREE.MeshNormalMaterial);
          assert.equal(effect.visible, false);
          assert.equal(line.visible, false);
          assert.equal(solid.visible, true);
          if (fail) throw new Error('simulated GPU failure');
        }
      },
    } as unknown as THREE.WebGLRenderer;
    try {
      if (fail) assert.throws(() => pass.render(renderer, scene, camera), /simulated/);
      else pass.render(renderer, scene, camera);
      assert.equal(scene.background, background);
      assert.equal(scene.overrideMaterial, null);
      assert.equal(effect.visible, true);
      assert.equal(line.visible, true);
      assert.equal(inactive.visible, false);
      assert.equal(target, null);
      assert.equal(clear.getHex(), 0x123456);
      assert.equal(alpha, 0.7);
      assert.equal(pass.colorTarget.width, 800);
      assert.equal(pass.normalTarget.height, 600);
      assert.equal(renders, fail ? 2 : 3);
    } finally {
      pass.dispose(); geometry.dispose();
      solid.material.dispose(); effect.material.dispose(); inactive.material.dispose(); line.material.dispose();
    }
  }
});
