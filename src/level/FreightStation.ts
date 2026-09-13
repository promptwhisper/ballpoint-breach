import * as THREE from 'three';
import type { ArenaColliderCategory, SupplyPoint } from './ArenaBuilder';

type Material = 'paper' | 'shade' | 'lavender' | 'orange' | 'deep' | 'green' | 'red';

export interface FreightStationBuilder {
  box(id: string, x: number, y: number, z: number, w: number, h: number, d: number, material?: Material, collider?: ArenaColliderCategory | false): void;
  pipe(id: string, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: Material): void;
  stairs(id: string, x: number, startZ: number, endZ: number, height: number, width?: number): void;
  bridge(id: string, x: number, z: number, height: number, length: number): void;
  paperWall(id: string, x: number, z: number, width: number): void;
  crate(id: string, x: number, z: number, tall?: boolean): void;
  spawn(id: string, x: number, y: number, z: number, sector: number, high?: boolean): void;
  supply(id: string, x: number, y: number, z: number, kind: SupplyPoint['kind']): void;
  objective(name: string, x: number, z: number, firstWave: number, hint: string): void;
  route(id: string, x: number, y: number, z: number): void;
}

/** Original station layout: offset room entrances, opaque cars and two contestable catwalks. */
export function buildFreightStation(b: FreightStationBuilder): void {
  const box = b.box;
  const rail = (id: string, x: number, fromZ: number, toZ: number) => {
    for (const side of [-1, 1]) box(`${id}-rail-${side}`, x + side * 1.65, 0.035, (fromZ + toZ) / 2, 0.08, 0.06, Math.abs(fromZ - toZ), 'deep', false);
    for (let z = fromZ; z >= toZ; z -= 2.4) box(`${id}-tie-${z}`, x, 0.016, z, 4.1, 0.03, 0.23, 'shade', false);
  };
  const freight = (id: string, x: number, z: number, length: number, material: Material) => {
    box(id, x, 1.85, z, 5.2, 3.7, length, material, 'cover');
    box(id + '-roof', x, 3.77, z, 5.45, 0.16, length + 0.25, 'paper', 'cover');
    for (const side of [-1, 1]) {
      for (let dz = -length / 2 + 0.7; dz < length / 2; dz += 2.2) box(`${id}-rib-${side}-${dz}`, x + side * 2.63, 2.1, z + dz, 0.09, 2.9, 0.075, 'shade', false);
      for (const end of [-1, 1]) {
        const axleZ = z + end * (length / 2 - 1.5);
        b.pipe(`${id}-wheel-${side}-${end}`, new THREE.Vector3(x + side * 2.6, 0.52, axleZ), new THREE.Vector3(x + side * 2.86, 0.52, axleZ), 0.5, 'deep');
      }
      box(`${id}-door-${side}`, x + side * 2.68, 1.9, z, 0.08, 2.8, 2.8, 'shade', false);
      box(`${id}-handle-${side}`, x + side * 2.76, 1.55, z + 0.9, 0.12, 0.35, 0.07, 'deep', false);
    }
  };
  const portalWall = (id: string, z: number, openings: readonly [number, number][]) => {
    let left = -29.8;
    for (const [x, width] of openings) {
      const edge = x - width / 2;
      if (edge > left) box(`${id}-solid-${x}`, (left + edge) / 2, 3.65, z, edge - left, 7.3, 0.7, 'shade', 'wall');
      box(`${id}-lintel-${x}`, x, 6.85, z, width, 0.9, 0.7, 'shade', 'wall');
      for (const side of [-1, 1]) box(`${id}-jamb-${x}-${side}`, x + side * (width / 2 + 0.13), 2.55, z + 0.42, 0.24, 5.1, 0.2, 'orange', false);
      b.route(`${id}-approach-${x}`, x, 0.14, z + 2.3);
      b.route(`${id}-door-${x}`, x, 0.14, z);
      b.route(`${id}-exit-${x}`, x, 0.14, z - 2.3);
      left = x + width / 2;
    }
    box(`${id}-solid-end`, (left + 29.8) / 2, 3.65, z, 29.8 - left, 7.3, 0.7, 'shade', 'wall');
  };

  // Loading tracks. Cars are solid visual cover, not a field of window frames.
  rail('track-west', -8, 22, -1);
  rail('track-east', 8, 22, -1);
  freight('freight-west', -8, 10, 14, 'orange');
  freight('freight-east', 8, 7, 12, 'lavender');
  box('arrival-cover', 0, 1.4, 21, 4.8, 2.8, 2.2, 'shade', 'cover');
  b.crate('yard-center-low', 0, 12);
  b.crate('yard-east-turn', 17, 17, true);
  b.crate('yard-west-turn', -17, 6);
  // Loading platform on one side, service kiosk on the other gives asymmetry and orientation.
  box('loading-platform', -23, 2.72, 14.5, 7, 0.3, 11, 'shade', 'platform');
  b.stairs('loading-platform-stairs', -23, 29, 20, 2.87, 4.2);
  box('platform-back-wall', -27, 3, 14.5, 0.4, 6, 11, 'paper', 'wall');
  box('platform-window-cover', -20.1, 3.35, 15, 0.25, 0.9, 4, 'orange', 'cover');
  box('platform-awning', -23, 6, 14.5, 7.3, 0.18, 11.5, 'shade', false);
  box('service-kiosk', 25, 2, 9, 6, 4, 8, 'paper', 'wall');
  box('kiosk-window', 21.94, 2.2, 9, 0.04, 1.2, 3, 'deep', false);
  b.paperWall('paper-wall-loading-service', -26, 1, 6);
  portalWall('depot-entry', -3, [[-21, 8], [21, 8]]);
  // A central solid partition denies a spawn-to-exit shooting lane.
  box('depot-entry-office', 0, 2.4, -6, 12, 4.8, 5.3, 'paper', 'wall');

  // Maintenance hall: two opaque machines, floor-level flank loops and high observation lanes.
  for (const [id, x, z] of [['west', -8, -16], ['east', 8, -23]] as const) {
    box('engine-' + id, x, 1.6, z, 6.5, 3.2, 9, 'lavender', 'cover');
    for (const dx of [-1.8, 1.8]) b.pipe(`engine-${id}-roller-${dx}`, new THREE.Vector3(x + dx, 3.3, z - 3.5), new THREE.Vector3(x + dx, 3.3, z + 3.5), 0.38, 'paper');
    box('engine-' + id + '-panel', x, 1.6, z + 4.55, 2.5, 1.2, 0.08, 'deep', false);
  }
  for (const [side, x] of [['west', -21], ['east', 21]] as const) {
    box(side + '-upper-dock', x, 4.07, -8, 6, 0.3, 6, 'shade', 'platform');
    box(side + '-far-dock', x, 4.07, -27, 6, 0.3, 8, 'shade', 'platform');
    b.stairs('binding-' + side + '-stairs', x, 7, -5, 4.22, 4);
    b.stairs('binding-' + side + '-return', x, -41, -31, 4.22, 4);
    b.bridge('fold-' + side + '-bridge', x, -11, 4.22, 12);
    box(side + '-high-cover', x + (x < 0 ? -1 : 1), 4.7, -26, 2.5, 0.8, 1, 'orange', 'cover');
  }
  b.paperWall('paper-wall-machine-shortcut', 0, -13, 5.5);
  b.paperWall('paper-wall-east-service', 17, -26, 4);
  b.crate('hall-center-low', 1, -23);
  b.crate('hall-west-low', -15, -29);
  portalWall('dispatch-entry', -32, [[-21, 8], [21, 8]]);
  // A partial roof, beams and gantry turn the middle room into a recognizable depot.
  for (const x of [-28, 28]) box('hall-wall-' + x, x, 4.15, -18, 0.6, 8.3, 28, 'paper', 'wall');
  for (const z of [-7, -19, -30]) {
    box('hall-crossbeam-' + z, 0, 8.5, z, 57, 0.4, 0.65, 'orange', false);
    for (const x of [-27, 27]) box(`hall-column-${x}-${z}`, x, 4.2, z, 0.6, 8.4, 0.6, 'shade', 'column');
  }
  box('hall-roof-west', -19, 8.8, -18, 19, 0.25, 28, 'paper', false);
  box('hall-roof-east', 19, 8.8, -18, 19, 0.25, 28, 'paper', false);

  // Final yard. A short flank behind the freight car opens an angle on the dispatch balcony.
  rail('dispatch-track', -8, -36, -53);
  freight('dispatch-freight', -8, -44, 11, 'orange');
  box('dispatch-office-roof', 14, 4.08, -48, 14, 0.24, 10, 'shade', 'platform');
  for (const x of [7, 21]) box('dispatch-office-side-' + x, x, 2, -48, 0.45, 4, 10, 'paper', 'wall');
  box('dispatch-office-back', 14, 2, -53, 14, 4, 0.45, 'paper', 'wall');
  for (const x of [8.7, 19.3]) box('dispatch-office-front-' + x, x, 2, -43, 3.1, 4, 0.45, 'paper', 'wall');
  box('dispatch-office-lintel', 14, 3.7, -43, 7.5, 0.6, 0.45, 'shade', 'wall');
  box('dispatch-counter', 16, 0.65, -47.5, 4, 1.3, 1, 'orange', 'cover');
  b.stairs('dispatch-roof-stairs', 24.5, -34, -47, 4.2, 4);
  box('dispatch-roof-connection', 23, 4.08, -48.5, 5, 0.24, 4, 'shade', 'platform');
  // The east roof exit meets a real landing. Rails also prevent diagonal nav
  // links from cutting across the empty space between the roof and the stairs.
  const roofRail = (id: string, x: number, z: number, width: number, depth: number) => {
    box(id + '-top', x, 5.12, z, width, 0.16, depth, 'deep', 'wall');
    box(id + '-lower', x, 4.65, z, width, 0.1, depth, 'shade', false);
    const alongX = width > depth;
    const length = Math.max(width, depth);
    const posts = Math.ceil(length / 3);
    for (let index = 0; index <= posts; index += 1) {
      const offset = -length / 2 + length * index / posts;
      box(`${id}-post-${index}`, x + (alongX ? offset : 0), 4.67,
        z + (alongX ? 0 : offset), 0.12, 1.05, 0.12, 'deep', false);
    }
  };
  roofRail('dispatch-roof-front-rail', 14, -42.95, 14.2, 0.16);
  roofRail('dispatch-roof-west-rail', 6.95, -48, 0.16, 10.2);
  roofRail('dispatch-roof-back-rail', 14, -53.05, 14.2, 0.16);
  roofRail('dispatch-roof-east-front-rail', 21.05, -44.7, 0.16, 3.5);
  roofRail('dispatch-roof-east-back-rail', 21.05, -51.75, 0.16, 2.6);
  roofRail('dispatch-landing-back-rail', 23.2, -50.45, 4.5, 0.16);
  roofRail('dispatch-landing-east-rail', 25.55, -48.5, 0.16, 4.1);
  for (const side of [-1, 1]) for (let step = 0; step < 8; step += 1) {
    const fraction = (step + 0.5) / 8;
    box(`dispatch-stair-rail-${side}-${step}`, 24.5 + side * 2.08, 4.2 * fraction + 0.82,
      -34 - 13 * fraction, 0.12, 0.5, 13 / 8 + 0.06, 'deep', 'wall');
  }
  for (const [index, x, z] of [[0, 10, -48], [1, 14, -48], [2, 18, -48],
    [3, 20, -48.5], [4, 23, -48.5], [5, 24.5, -47]] as const) {
    b.route('dispatch-landing-route-' + index, x, 4.34, z);
  }
  box('dispatch-roof-shield', 12, 4.75, -43.4, 4, 1.1, 0.35, 'orange', 'cover');
  b.crate('dispatch-front-cover', 5, -37, true);
  b.crate('dispatch-west-cover', -22, -48);
  b.crate('dispatch-exit-cover', 0, -51);
  box('exit-door', 0, 1.6, -55.65, 4, 3.2, 0.1, 'green', false);

  b.objective('装卸货场', 0, 15, 1, '逐个清理车厢两侧 · 高台可以绕到背后');
  b.objective('检修车间', 0, -16, 3, '从双门切入 · 红色桥扣可击断');
  b.objective('调度站台', 2, -40, 5, '压制调度楼 · 车厢后方可绕射');
  const ground: readonly [number, number, number][] = [
    [0,-16,13],[0,16,10],[0,0,3],[0,-25,4],[0,19,0],[0,2,17],
    [1,-15,-14],[1,14,-17],[1,0,-19],[1,-25,-28],[1,25,-23],[1,-1,-28],
    [2,-17,-39],[2,0,-44],[2,-22,-51],[2,14,-49],[2,27,-53],[2,-1,-53],
  ];
  ground.forEach(([sector,x,z],i) => b.spawn(`foundry-s${sector}-ground-${i}`,x,0.25,z,sector));
  for (const [id,x,y,z,sector] of [
    ['loading-platform',-22,3.06,12,0],
    ['bridge-west',-21,4.43,-16,1],['bridge-east',21,4.43,-19,1],
    ['dock-west',-21,4.43,-28,1],['dock-east',21,4.43,-29,1],
    ['office-west',9,4.4,-46,2],['office-east',18,4.4,-46,2],
  ] as const) b.spawn('foundry-high-' + id,x,y,z,sector,true);
  b.spawn('foundry-boss',0,0.25,-47.5,2);
  b.supply('yard-platform-ammo',-24,3.02,14,'ammo');
  b.supply('yard-health',19,0.25,4,'health');
  b.supply('hall-center-ammo',0,0.25,-21,'ammo');
  b.supply('hall-west-health',-25,0.25,-22,'health');
  b.supply('dispatch-office-ammo',17,0.25,-50,'ammo');
  b.supply('dispatch-roof-health',16,4.4,-50,'health');
}
