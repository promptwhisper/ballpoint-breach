import * as THREE from 'three';

/** Adapted from GameBlocks WorldBasis for the arena's +X right, +Y up, -Z forward convention. */
export const WORLD_BASIS = Object.freeze({
  right(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(1, 0, 0);
  },
  up(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(0, 1, 0);
  },
  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(0, 0, -1);
  },
  fromBasis(right: number, up: number, forward: number, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(right, up, -forward);
  },
});
