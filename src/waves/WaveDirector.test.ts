import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DEFAULT_WAVES, WaveDirector } from './WaveDirector';
import type { WaveEvent, WaveSpawnPoint } from './types';

function makeSpawnPoints(): WaveSpawnPoint[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `spawn-${index}`,
    position: new THREE.Vector3(Math.sin(index) * 12, index % 3 === 0 ? 4 : 0, Math.cos(index) * 12),
    tags: index === 11 ? ['boss'] : index % 3 === 0 ? ['high'] : ['ground'],
  }));
}

test('spawn selection is deterministic and respects specialist tags', () => {
  const points = makeSpawnPoints();
  const options = {
    spawnPoints: points,
    spawnEnemy: () => undefined,
    getActiveEnemyCount: () => 0,
    seed: 91,
  };
  const first = new WaveDirector(options);
  const second = new WaveDirector(options);

  const kinds = ['grunt', 'rusher', 'heavy', 'grunt'] as const;
  const sequenceA = kinds.map((kind) => first.chooseSpawnPoint(kind).id);
  const sequenceB = kinds.map((kind) => second.chooseSpawnPoint(kind).id);
  assert.deepEqual(sequenceA, sequenceB);
  for (const kind of ['grunt', 'rusher', 'heavy'] as const) {
    for (let pick = 0; pick < 24; pick += 1) {
      assert.ok(first.chooseSpawnPoint(kind).tags?.includes('ground'), `${kind} should remain on ground spawns`);
    }
  }
  assert.ok(first.chooseSpawnPoint('marksman').tags?.includes('high'));
  assert.ok(first.chooseSpawnPoint('boss').tags?.includes('boss'));
});

test('director completes ten waves, with bosses at five and ten and recovery after each clear', () => {
  const active = new Set<string>();
  const events: WaveEvent[] = [];
  const recoveries: number[] = [];
  let serial = 0;
  const director = new WaveDirector({
    spawnPoints: makeSpawnPoints(),
    seed: 7,
    announcementDuration: 0.05,
    intermissionDuration: 0.05,
    spawnEnemy: (kind) => {
      const id = `${kind}-${++serial}`;
      active.add(id);
      return id;
    },
    getActiveEnemyCount: () => active.size,
    onEvent: (event) => events.push(event),
    onRecovery: (recovery) => recoveries.push(recovery.wave),
  });
  director.start();

  for (let tick = 0; tick < 1600 && !director.victory; tick += 1) {
    director.update(0.25);
    if (director.state === 'spawning' && active.size >= 3) active.clear();
    if (director.state === 'combat') active.clear();
    director.update(0.01);
  }

  assert.equal(director.victory, true);
  assert.equal(events.filter((event) => event.type === 'announcement').length, 10);
  assert.equal(events.filter((event) => event.type === 'wave-clear').length, 10);
  assert.ok(events.some((event) => event.type === 'enemy-spawned' && event.wave === 5 && event.kind === 'boss'));
  assert.ok(events.some(event => event.type === 'enemy-spawned' && event.wave === 10 && event.kind === 'boss'));
  assert.deepEqual(recoveries, [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(events.filter(event => event.type === 'victory').length,1);
  assert.equal(events.find(event => event.type === 'victory')?.wave,10);
  assert.equal(serial, DEFAULT_WAVES.reduce((total,wave)=>total+wave.composition.reduce((sum,group)=>sum+group.count,0),0));
  assert.equal(director.getSnapshot().enemiesRemaining, 0);
});

test('reset clears enemies and restores an idle deterministic director', () => {
  let clears = 0;
  const director = new WaveDirector({
    spawnPoints: makeSpawnPoints(),
    spawnEnemy: () => undefined,
    getActiveEnemyCount: () => 0,
    clearEnemies: () => { clears += 1; },
  });
  director.start();
  director.update(3);
  director.reset();

  assert.equal(director.state, 'idle');
  assert.equal(director.wave, 0);
  assert.equal(director.enemiesRemaining, 0);
  assert.equal(clears, 2);
});

test('late waves queue reinforcements instead of exceeding their concurrent budget',()=>{
  for(const wave of DEFAULT_WAVES.slice(5)) {
    let active=0,total=0;
    const director=new WaveDirector({spawnPoints:makeSpawnPoints(),announcementDuration:0,
      getActiveEnemyCount:()=>active,spawnEnemy:()=>{active++;total++;}});
    director.start(wave.number);
    for(let tick=0;tick<200;tick++) director.update(.25);
    assert.equal(active,wave.maxConcurrent);
    assert.ok(director.getSnapshot().queued>0);
    active--;
    for(let tick=0;tick<4;tick++) director.update(.25);
    assert.equal(active,wave.maxConcurrent);
    assert.equal(total,wave.maxConcurrent+1);
  }
});
