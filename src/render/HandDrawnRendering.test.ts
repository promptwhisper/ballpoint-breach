import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DoodleMaterial } from './DoodleMaterial';
import {
  createHandDrawnEdgesGeometry,
  createOutlinedMesh,
  getOutlineCacheStats,
} from './OutlinedMesh';
import { BALLPOINT_PALETTE, DOODLE_PALETTE, INK_PALETTE } from './palette';
import { ACTIVE_VISUAL_STYLE, isInkStyle, resolveVisualStyle } from './visualStyle';

test('visual style resolution is pure, Node-safe, and defaults to ink', () => {
  assert.equal(resolveVisualStyle('?style=ballpoint'), 'ballpoint');
  assert.equal(resolveVisualStyle('?capture=1&style=ballpoint&view=rear'), 'ballpoint');
  assert.equal(resolveVisualStyle('?style=ink'), 'ink');
  assert.equal(resolveVisualStyle('?style=unknown'), 'ink');
  assert.equal(resolveVisualStyle(''), 'ink');
  assert.equal(ACTIVE_VISUAL_STYLE, 'ink');
  assert.equal(isInkStyle(), true);
  assert.equal(DOODLE_PALETTE, INK_PALETTE);
  assert.notEqual(INK_PALETTE.ink, BALLPOINT_PALETTE.ink);
});

test('hand-drawn edges subdivide straight topology and pack a pale broken second pass', () => {
  const source = new THREE.BoxGeometry(4, 2, 1);
  const exact = new THREE.EdgesGeometry(source, 20);
  const drawn = createHandDrawnEdgesGeometry(source, {
    thresholdAngle: 20,
    irregularity: 0.01,
    seed: 27.4,
    segmentLength: 0.4,
    doubleStroke: true,
    doubleStrokeOffset: 0.008,
    ghostOpacity: 0.34,
    visualStyle: 'ballpoint',
  });
  try {
    const positions = drawn.getAttribute('position');
    const colors = drawn.getAttribute('color');
    assert.ok(positions.count > exact.getAttribute('position').count * 2);
    assert.equal(colors.count, positions.count);
    assert.equal(colors.itemSize, 4);

    const alphas = Array.from({ length: colors.count }, (_, index) => colors.getW(index));
    assert.ok(alphas.some((alpha) => Math.abs(alpha - 1) < 1e-6), 'primary pen pass should be opaque');
    assert.ok(alphas.some((alpha) => Math.abs(alpha - 0.34) < 1e-6), 'secondary pass should be pale');
  } finally {
    drawn.dispose();
    exact.dispose();
    source.dispose();
  }
});

test('ink outlines vary pressure and leave sparse gaps in the same line geometry', () => {
  const source = new THREE.BoxGeometry(6, 3, 2);
  const common = {
    thresholdAngle: 20,
    irregularity: 0.01,
    seed: 18.7,
    segmentLength: 0.18,
    doubleStroke: true,
    doubleStrokeOffset: 0.006,
  } as const;
  const ballpoint = createHandDrawnEdgesGeometry(source, {
    ...common,
    visualStyle: 'ballpoint',
    ghostOpacity: 0.34,
  });
  const ink = createHandDrawnEdgesGeometry(source, {
    ...common,
    visualStyle: 'ink',
    ghostOpacity: 0.16,
    primaryOpacityVariation: 0.42,
    primaryBreakup: 0.2,
  });
  const inkAgain = createHandDrawnEdgesGeometry(source, {
    ...common,
    visualStyle: 'ink',
    ghostOpacity: 0.16,
    primaryOpacityVariation: 0.42,
    primaryBreakup: 0.2,
  });
  try {
    const colors = ink.getAttribute('color');
    const alphas = Array.from({ length: colors.count }, (_, index) => colors.getW(index));
    assert.ok(alphas.some((alpha) => alpha > 0.58 && alpha < 0.99), 'primary brush pressure should vary');
    assert.ok(alphas.some((alpha) => Math.abs(alpha - 0.16) < 1e-6), 'ink keeps a faint sparse echo');
    assert.ok(
      ink.getAttribute('position').count < ballpoint.getAttribute('position').count,
      'ink pressure gaps and sparse echoes should reduce packed segments',
    );
    assert.deepEqual(
      Array.from(inkAgain.getAttribute('position').array),
      Array.from(ink.getAttribute('position').array),
    );
    assert.deepEqual(
      Array.from(inkAgain.getAttribute('color').array),
      Array.from(ink.getAttribute('color').array),
    );
  } finally {
    ballpoint.dispose();
    ink.dispose();
    inkAgain.dispose();
    source.dispose();
  }
});

test('hand-drawn edge perturbation is deterministic and seed-sensitive', () => {
  const source = new THREE.BoxGeometry(2, 2, 2);
  const options = {
    irregularity: 0.012,
    seed: 4.25,
    segmentLength: 0.32,
    doubleStroke: true,
  } as const;
  const first = createHandDrawnEdgesGeometry(source, options);
  const second = createHandDrawnEdgesGeometry(source, options);
  const alternate = createHandDrawnEdgesGeometry(source, { ...options, seed: 5.25 });
  try {
    const firstPositions = Array.from(first.getAttribute('position').array);
    assert.deepEqual(Array.from(second.getAttribute('position').array), firstPositions);
    assert.notDeepEqual(Array.from(alternate.getAttribute('position').array), firstPositions);
  } finally {
    first.dispose();
    second.dispose();
    alternate.dispose();
    source.dispose();
  }
});

test('outlined meshes reuse one RGBA line pass and release cached resources', () => {
  const source = new THREE.BoxGeometry(1, 1, 1);
  const surface = new THREE.MeshBasicMaterial();
  const before = getOutlineCacheStats();
  const outlined = createOutlinedMesh(source, surface, {
    irregularity: 0.01,
    segmentLength: 0.3,
    doubleStroke: true,
    ghostOpacity: 0.3,
  });
  try {
    const lineMaterial = outlined.outline.material;
    assert.ok(lineMaterial instanceof THREE.LineBasicMaterial);
    assert.equal(lineMaterial.vertexColors, true);
    assert.equal(outlined.children.filter((child) => child instanceof THREE.LineSegments).length, 1);
    assert.equal(getOutlineCacheStats().references, before.references + 1);
  } finally {
    outlined.releaseOutlineResources();
    source.dispose();
    surface.dispose();
  }
  assert.equal(getOutlineCacheStats().references, before.references);
});

test('doodle material exposes bounded variation, angle, and paper grain controls', () => {
  const material = new DoodleMaterial({
    visualStyle: 'ballpoint',
    hatchAngle: 0.18,
    hatchVariation: 2,
    grainStrength: -1,
  });
  try {
    assert.equal(material.uniforms.uHatchAngle.value, 0.18);
    assert.equal(material.uniforms.uHatchVariation.value, 1.5);
    assert.equal(material.uniforms.uGrainStrength.value, 0);
    assert.ok(Number.isFinite(material.uniforms.uSeedTurn.value));
    assert.equal(material.visualStyle, 'ballpoint');
    assert.equal(material.surfaceColor.getHex(), BALLPOINT_PALETTE.paperLight);
    assert.equal(material.inkColor.getHex(), BALLPOINT_PALETTE.ink);
    assert.match(material.fragmentShader, /strokeA/);
    assert.match(material.fragmentShader, /gl_FragCoord/);
  } finally {
    material.dispose();
  }
});

test('ink material exposes bounded wash controls and surface-stable pattern spaces', () => {
  const worldMaterial = new DoodleMaterial({
    visualStyle: 'ink',
    patternSpace: 'world',
    washBias: 4,
    washStrength: 9,
    washContrast: -2,
    absorptionScale: 0,
    dryBrushStrength: -1,
    granulationStrength: 4,
  });
  const movingMaterial = new DoodleMaterial({ visualStyle: 'ink' });
  try {
    assert.equal(worldMaterial.visualStyle, 'ink');
    assert.equal(worldMaterial.isInkWashMaterial, true);
    assert.equal(worldMaterial.surfaceColor.getHex(), INK_PALETTE.paperLight);
    assert.equal(worldMaterial.inkColor.getHex(), INK_PALETTE.ink);
    assert.equal(worldMaterial.uniforms.uPatternSpace.value, 1);
    assert.equal(movingMaterial.uniforms.uPatternSpace.value, 0);
    assert.equal(worldMaterial.uniforms.uWashBias.value, 0.5);
    assert.equal(movingMaterial.uniforms.uWashBias.value, 0);
    assert.equal(worldMaterial.uniforms.uWashStrength.value, 1.5);
    assert.equal(worldMaterial.uniforms.uWashContrast.value, 0.25);
    assert.equal(worldMaterial.uniforms.uAbsorptionScale.value, 0.04);
    assert.equal(worldMaterial.uniforms.uDryBrushStrength.value, 0);
    assert.equal(worldMaterial.uniforms.uGranulationStrength.value, 1);
    assert.match(worldMaterial.fragmentShader, /brokenShade/);
    assert.match(worldMaterial.fragmentShader, /paperBreak/);
    assert.doesNotMatch(worldMaterial.fragmentShader, /gl_FragCoord/);
    assert.doesNotMatch(worldMaterial.fragmentShader, /uTime/);
    worldMaterial.setWashBias(-1);
    assert.equal(worldMaterial.uniforms.uWashBias.value, 0);
  } finally {
    worldMaterial.dispose();
    movingMaterial.dispose();
  }
});
