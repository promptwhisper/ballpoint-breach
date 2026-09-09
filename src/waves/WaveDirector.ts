import type { EnemyKind } from '../enemies/types';
import type {
  SpawnedEnemyReference,
  WaveDefinition,
  WaveDirectorOptions,
  WaveDirectorSnapshot,
  WaveDirectorState,
  WaveEvent,
  WaveSpawnPoint,
} from './types';

export const DEFAULT_WAVES: readonly WaveDefinition[] = [
  {
    number: 1,
    subtitle: 'FIRST MARKS ON THE PAGE',
    composition: [{ kind: 'grunt', count: 4 }, { kind: 'rusher', count: 2 }],
    spawnInterval: 0.72,
    maxConcurrent: 6,
  },
  {
    number: 2,
    subtitle: 'THE INK FIGHTS BACK',
    composition: [{ kind: 'grunt', count: 5 }, { kind: 'rusher', count: 3 }, { kind: 'marksman', count: 1 }],
    spawnInterval: 0.62,
    maxConcurrent: 9,
  },
  {
    number: 3,
    subtitle: 'NO CLEAN MARGINS',
    composition: [
      { kind: 'grunt', count: 5 },
      { kind: 'rusher', count: 4 },
      { kind: 'heavy', count: 2 },
      { kind: 'marksman', count: 2 },
    ],
    spawnInterval: 0.52,
    maxConcurrent: 13,
  },
  {
    number: 4,
    subtitle: 'CROSS OUT EVERYTHING',
    composition: [
      { kind: 'grunt', count: 6 },
      { kind: 'rusher', count: 5 },
      { kind: 'heavy', count: 3 },
      { kind: 'marksman', count: 3 },
    ],
    spawnInterval: 0.43,
    maxConcurrent: 17,
  },
  {
    number: 5,
    subtitle: 'THE DOODLER IS COMING',
    composition: [
      { kind: 'boss', count: 1 },
      { kind: 'grunt', count: 4 },
      { kind: 'rusher', count: 3 },
      { kind: 'heavy', count: 2 },
      { kind: 'marksman', count: 2 },
    ],
    spawnInterval: 0.5,
    maxConcurrent: 15,
  },
  { number: 6, subtitle: 'SECOND DRAFT',
    composition: [{kind:'grunt',count:8},{kind:'rusher',count:7},{kind:'heavy',count:3},{kind:'marksman',count:2}],
    spawnInterval: .48, maxConcurrent: 12 },
  { number: 7, subtitle: 'CROSSFIRE IN THE MARGINS',
    composition: [{kind:'marksman',count:5},{kind:'grunt',count:7},{kind:'rusher',count:7},{kind:'heavy',count:4}],
    spawnInterval: .45, maxConcurrent: 13 },
  { number: 8, subtitle: 'HEAVY INK',
    composition: [{kind:'heavy',count:6},{kind:'rusher',count:8},{kind:'grunt',count:8},{kind:'marksman',count:4}],
    spawnInterval: .42, maxConcurrent: 14 },
  { number: 9, subtitle: 'NO ROOM TO BREATHE',
    composition: [{kind:'rusher',count:11},{kind:'grunt',count:8},{kind:'heavy',count:6},{kind:'marksman',count:4}],
    spawnInterval: .4, maxConcurrent: 15 },
  { number: 10, subtitle: 'THE FINAL DOODLE',
    composition: [{kind:'boss',count:1},{kind:'heavy',count:7},{kind:'marksman',count:6},{kind:'rusher',count:10},{kind:'grunt',count:8}],
    spawnInterval: .44, maxConcurrent: 16 },
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function enemyIdOf(reference: SpawnedEnemyReference, fallback: string): string {
  if (typeof reference === 'string') return reference;
  return reference?.id ?? fallback;
}

export class WaveDirector {
  private currentState: WaveDirectorState = 'idle';
  private waveIndex = -1;
  private stateTime = 0;
  private spawnTimer = 0;
  private spawnOrdinal = 0;
  private queuedKinds: EnemyKind[] = [];
  private readonly trackedEnemyIds = new Set<string>();
  private readonly recentSpawnPointIds: string[] = [];
  private random: () => number;

  constructor(private readonly options: WaveDirectorOptions) {
    if (options.spawnPoints.length === 0) throw new Error('WaveDirector requires at least one spawn point');
    const definitions = options.definitions ?? DEFAULT_WAVES;
    if (definitions.length === 0) throw new Error('WaveDirector requires at least one wave');
    this.validateDefinitions(definitions);
    this.random = createRandom(options.seed ?? 0x5c71bb1e);
  }

  get state(): WaveDirectorState {
    return this.currentState;
  }

  get wave(): number {
    return this.currentDefinition?.number ?? 0;
  }

  get victory(): boolean {
    return this.currentState === 'victory';
  }

  get enemiesRemaining(): number {
    return this.queuedKinds.length + this.options.getActiveEnemyCount();
  }

  start(firstWave = 1): void {
    const definitions = this.definitions;
    const index = definitions.findIndex((definition) => definition.number === firstWave);
    if (index < 0) throw new Error(`Unknown wave ${firstWave}`);
    this.options.clearEnemies?.();
    this.trackedEnemyIds.clear();
    this.recentSpawnPointIds.length = 0;
    this.waveIndex = index;
    this.enterAnnouncement();
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.25));
    if (this.currentState === 'idle' || this.currentState === 'victory') return;
    this.stateTime += delta;

    if (this.currentState === 'announcement') {
      if (this.stateTime >= (this.options.announcementDuration ?? 2.15)) this.beginSpawning();
      return;
    }

    if (this.currentState === 'spawning') {
      this.updateSpawning(delta);
      return;
    }

    if (this.currentState === 'combat') {
      if (this.queuedKinds.length === 0 && this.options.getActiveEnemyCount() === 0) this.completeWave();
      return;
    }

    if (this.currentState === 'intermission' && this.stateTime >= (this.options.intermissionDuration ?? 4.25)) {
      this.waveIndex += 1;
      this.enterAnnouncement();
    }
  }

  notifyEnemyRemoved(enemyId: string): void {
    this.trackedEnemyIds.delete(enemyId);
  }

  chooseSpawnPoint(kind: EnemyKind): WaveSpawnPoint {
    const playerPosition = this.options.getPlayerPosition?.();
    let candidates = this.preferredPoints(kind);
    if (playerPosition && candidates.length > 1) {
      const distant = candidates.filter((point) => point.position.distanceToSquared(playerPosition) >= 49);
      if (distant.length) candidates = distant;
    }
    if (candidates.length > 4 && this.recentSpawnPointIds.length) {
      const fresh = candidates.filter((point) => !this.recentSpawnPointIds.includes(point.id));
      if (fresh.length) candidates = fresh;
    }
    const totalWeight = candidates.reduce((sum, point) => sum + Math.max(0.01, point.weight ?? 1), 0);
    let choice = this.random() * totalWeight;
    let selected = candidates[candidates.length - 1] ?? this.options.spawnPoints[0];
    for (const point of candidates) {
      choice -= Math.max(0.01, point.weight ?? 1);
      if (choice <= 0) {
        selected = point;
        break;
      }
    }
    if (!selected) throw new Error('No usable spawn point');
    this.recentSpawnPointIds.push(selected.id);
    while (this.recentSpawnPointIds.length > 3) this.recentSpawnPointIds.shift();
    return selected;
  }

  getSnapshot(): WaveDirectorSnapshot {
    const definition = this.currentDefinition;
    const intermissionDuration = this.options.intermissionDuration ?? 4.25;
    return {
      state: this.currentState,
      wave: definition?.number ?? 0,
      subtitle: definition?.subtitle ?? '',
      queued: this.queuedKinds.length,
      active: this.options.getActiveEnemyCount(),
      enemiesRemaining: this.enemiesRemaining,
      intermissionRemaining: this.currentState === 'intermission' ? Math.max(0, intermissionDuration - this.stateTime) : 0,
      victory: this.victory,
    };
  }

  reset(): void {
    this.options.clearEnemies?.();
    this.currentState = 'idle';
    this.waveIndex = -1;
    this.stateTime = 0;
    this.spawnTimer = 0;
    this.spawnOrdinal = 0;
    this.queuedKinds = [];
    this.trackedEnemyIds.clear();
    this.recentSpawnPointIds.length = 0;
    this.random = createRandom(this.options.seed ?? 0x5c71bb1e);
    this.emit('reset');
  }

  private get definitions(): readonly WaveDefinition[] {
    return this.options.definitions ?? DEFAULT_WAVES;
  }

  private get currentDefinition(): WaveDefinition | null {
    return this.definitions[this.waveIndex] ?? null;
  }

  private enterAnnouncement(): void {
    const definition = this.currentDefinition;
    if (!definition) {
      this.currentState = 'victory';
      this.emit('victory');
      return;
    }
    this.currentState = 'announcement';
    this.stateTime = 0;
    this.spawnTimer = 0;
    this.spawnOrdinal = 0;
    this.queuedKinds = [];
    this.emit('announcement', { duration: this.options.announcementDuration ?? 2.15 });
  }

  private beginSpawning(): void {
    const definition = this.currentDefinition;
    if (!definition) return;
    this.queuedKinds = definition.composition.flatMap((group) => Array.from({ length: group.count }, () => group.kind));
    this.currentState = 'spawning';
    this.stateTime = 0;
    this.spawnTimer = 0;
    this.emit('wave-start');
  }

  private updateSpawning(delta: number): void {
    const definition = this.currentDefinition;
    if (!definition) return;
    this.spawnTimer -= delta;
    while (this.spawnTimer <= 0 && this.queuedKinds.length > 0) {
      if (this.options.getActiveEnemyCount() >= definition.maxConcurrent) {
        this.spawnTimer = 0.12;
        return;
      }
      const kind = this.queuedKinds.shift();
      if (!kind) break;
      const point = this.chooseSpawnPoint(kind);
      this.spawnOrdinal += 1;
      const fallbackId = `wave-${definition.number}-enemy-${this.spawnOrdinal}`;
      const reference = this.options.spawnEnemy(kind, point.position.clone(), {
        wave: definition.number,
        ordinal: this.spawnOrdinal,
        spawnPointId: point.id,
      });
      const enemyId = enemyIdOf(reference, fallbackId);
      this.trackedEnemyIds.add(enemyId);
      this.emit('enemy-spawned', { kind, enemyId, spawnPointId: point.id });
      this.spawnTimer += definition.spawnInterval;
    }
    if (this.queuedKinds.length === 0) {
      this.currentState = 'combat';
      this.stateTime = 0;
      this.emit('all-enemies-spawned');
    }
  }

  private completeWave(): void {
    const definition = this.currentDefinition;
    if (!definition) return;
    this.trackedEnemyIds.clear();
    this.emit('wave-clear');
    this.options.onRecovery?.({ wave: definition.number, healthFraction: 0.16, ammoFraction: 0.32 });
    if (this.waveIndex >= this.definitions.length - 1) {
      this.currentState = 'victory';
      this.stateTime = 0;
      this.emit('victory');
      return;
    }
    this.currentState = 'intermission';
    this.stateTime = 0;
    this.emit('intermission', { duration: this.options.intermissionDuration ?? 4.25 });
  }

  private preferredPoints(kind: EnemyKind): WaveSpawnPoint[] {
    const points = [...this.options.spawnPoints];
    const tagged = kind === 'boss'
      ? points.filter((point) => point.tags?.includes('boss'))
      : kind === 'marksman'
        ? points.filter((point) => point.tags?.includes('high'))
        : points.filter((point) => point.tags?.includes('ground') && !point.tags?.includes('boss'));
    return tagged.length ? tagged : points;
  }

  private emit(type: WaveEvent['type'], extra: Partial<WaveEvent> = {}): void {
    const definition = this.currentDefinition;
    this.options.onEvent?.({
      type,
      wave: definition?.number ?? 0,
      subtitle: definition?.subtitle ?? '',
      state: this.currentState,
      enemiesRemaining: this.enemiesRemaining,
      ...extra,
    });
  }

  private validateDefinitions(definitions: readonly WaveDefinition[]): void {
    const numbers = new Set<number>();
    for (const definition of definitions) {
      if (!Number.isInteger(definition.number) || definition.number < 1 || numbers.has(definition.number)) {
        throw new Error(`Invalid or duplicate wave number: ${definition.number}`);
      }
      numbers.add(definition.number);
      if (definition.composition.length === 0 || definition.composition.some((group) => group.count <= 0 || !Number.isInteger(group.count))) {
        throw new Error(`Wave ${definition.number} has an invalid composition`);
      }
      if (definition.spawnInterval <= 0 || definition.maxConcurrent <= 0) {
        throw new Error(`Wave ${definition.number} has invalid pacing`);
      }
    }
    const finalWave = definitions[definitions.length - 1];
    if (!finalWave?.composition.some((group) => group.kind === 'boss' && group.count >= 1)) {
      throw new Error('The final wave must include THE DOODLER boss');
    }
  }
}
