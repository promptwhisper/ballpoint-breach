import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArena } from '../level/ArenaBuilder';
import { ColliderGrid } from './ColliderGrid';
test('spatial broadphase contains every possible collision in stable order',()=>{
  const arena=buildArena();
  const grid=new ColliderGrid(arena.colliders);
  try {
    for(let i=0;i<2000;i++) {
      const x=(i*7%90)-45,z=(i*13%90)-45,r=[.3,.8,1.6][i%3];
      const candidates=grid.nearby(x,z,r);
      for(const collider of arena.colliders) {
        if(collider.max.x>=x-r && collider.min.x<=x+r && collider.max.z>=z-r && collider.min.z<=z+r)
          assert.ok(candidates.includes(collider));
      }
      const ids=candidates.map(collider=>arena.colliders.indexOf(collider));
      assert.deepEqual(ids,[...new Set(ids)].sort((a,b)=>a-b));
    }
    const collider=arena.colliders[0];
    collider.enabled=false;
    assert.ok(grid.nearby(collider.min.x,collider.min.z,.3).includes(collider));
    collider.enabled=true;
    assert.ok(grid.nearby(collider.min.x,collider.min.z,.3).find(item=>item===collider)?.enabled);
  } finally {arena.dispose();}
});
