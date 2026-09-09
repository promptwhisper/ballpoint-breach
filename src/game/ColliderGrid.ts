import type { ArenaCollider } from '../level';

/** Arena bounds are static; enabled flags remain live for breakables/reset. */
export class ColliderGrid {
  private readonly cells = new Map<string, number[]>();
  constructor(private readonly colliders: readonly ArenaCollider[], private readonly size = 8) {
    colliders.forEach((collider,index) => {
      for(let x=Math.floor(collider.min.x/size);x<=Math.floor(collider.max.x/size);x++) {
        for(let z=Math.floor(collider.min.z/size);z<=Math.floor(collider.max.z/size);z++) {
          const key=`${x},${z}`;
          let cell=this.cells.get(key);
          if(!cell){cell=[];this.cells.set(key,cell);}
          cell.push(index);
        }
      }
    });
  }
  nearby(x:number,z:number,radius:number): readonly ArenaCollider[] {
    const x0=Math.floor((x-radius)/this.size),x1=Math.floor((x+radius)/this.size);
    const z0=Math.floor((z-radius)/this.size),z1=Math.floor((z+radius)/this.size);
    // Most probes occupy one cell. Avoid sets and sorting in that common case.
    if(x0===x1 && z0===z1) return (this.cells.get(`${x0},${z0}`) ?? []).map(index=>this.colliders[index]);
    const ids=new Set<number>();
    for(let cx=x0;cx<=x1;cx++) for(let cz=z0;cz<=z1;cz++) {
      for(const id of this.cells.get(`${cx},${cz}`) ?? []) ids.add(id);
    }
    return [...ids].sort((a,b)=>a-b).map(index=>this.colliders[index]);
  }
}
