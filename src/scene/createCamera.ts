import * as THREE from 'three';

export const CAMERA_POSITION = new THREE.Vector3(-0.07, 1.72, 10.4);
export const CAMERA_TARGET = new THREE.Vector3(-0.07, 2.32, -5.8);

export function createCamera(canvas: HTMLCanvasElement): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(31.9, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.01, 100);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_TARGET);
  return camera;
}
