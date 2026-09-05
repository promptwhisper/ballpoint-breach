import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DoodleMaterial } from './DoodleMaterial';
import {
  createHandDrawnEdgesGeometry,
  createOutlinedMesh,
  getOutlineCacheStats,
} from './OutlinedMesh';

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
    hatchAngle: 0.18,
    hatchVariation: 2,
    grainStrength: -1,
  });
  try {
    assert.equal(material.uniforms.uHatchAngle.value, 0.18);
    assert.equal(material.uniforms.uHatchVariation.value, 1.5);
    assert.equal(material.uniforms.uGrainStrength.value, 0);
    assert.ok(Number.isFinite(material.uniforms.uSeedTurn.value));
  } finally {
    material.dispose();
  }
});
