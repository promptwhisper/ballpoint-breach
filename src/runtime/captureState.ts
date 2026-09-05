import * as THREE from 'three';
const KEY='doodle-arena.camera.v1';
export function persistCamera(camera:THREE.PerspectiveCamera,target?:THREE.Vector3):void{localStorage.setItem(KEY,JSON.stringify({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,target:target?.toArray()}));}
export function restoreCamera(camera:THREE.PerspectiveCamera,target?:THREE.Vector3):boolean{const raw=localStorage.getItem(KEY);if(!raw)return false;const v=JSON.parse(raw) as {position:number[];quaternion:number[];fov:number;target?:number[]};camera.position.fromArray(v.position);camera.quaternion.fromArray(v.quaternion);camera.fov=v.fov;if(target&&v.target)target.fromArray(v.target);camera.updateProjectionMatrix();return true;}
