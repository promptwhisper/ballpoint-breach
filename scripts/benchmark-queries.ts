import * as THREE from 'three';
import { buildArena } from '../src/level/ArenaBuilder';
import { ArenaQueries } from '../src/game/ArenaQueries';
import type { EnemyView } from '../src/enemies';
const arena = buildArena();
const queries = new ArenaQueries(arena);
const enemy: EnemyView = {id:'bench',kind:'grunt',object:new THREE.Group(),position:new THREE.Vector3(),state:'seek',health:100,maxHealth:100,alive:true,collisionRadius:.3};
let checksum=0;
const batch=()=>{
  for(let i=0;i<12000;i++) {
    enemy.position.set((i*7%68)-34,(i%3)*3,(i*11%74)-37);
    checksum+=queries.groundHeight(enemy.position,enemy) ?? -9;
    checksum+=queries.resolveEnemyMovement(enemy,enemy.position.clone().add(new THREE.Vector3(.03,0,.04))).x;
  }
};
batch();
const times=[];
for(let run=0;run<5;run++){const start=performance.now();batch();times.push(performance.now()-start);}
console.log(JSON.stringify({colliders:arena.colliders.length,medianMs:times.sort((a,b)=>a-b)[2],checksum}));
arena.dispose();
