import * as THREE from 'three';
export function createLighting(): THREE.Group { const root=new THREE.Group();root.name='lighting';const sun=new THREE.DirectionalLight(0xfff3dd,3);sun.name='direct-sun';sun.position.set(4,8,3);sun.castShadow=true;root.add(sun,new THREE.HemisphereLight(0xbfd8ff,0x463a2c,1));return root; }
