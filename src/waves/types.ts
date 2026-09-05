import type * as THREE from 'three';
import type { EnemyKind } from '../enemies/types';

export type WaveDirectorState = 'idle' | 'announcement' | 'spawning' | 'combat' | 'intermission' | 'victory';

export type SpawnPointTag = 'ground' | 'high' | 'boss' | 'covered';

export interface WaveSpawnPoint {
  id: string;
  position: THREE.Vector3;
  tags?: readonly SpawnPointTag[];
  weight?: number;
}

export interface WaveEnemyGroup {
  kind: EnemyKind;
  count: number;
}

export interface WaveDefinition {
  number: number;
  subtitle: string;
  composition: readonly WaveEnemyGroup[];
  spawnInterval: number;
  maxConcurrent: number;
}

export interface WaveSpawnContext {
  wave: number;
  ordinal: number;
  spawnPointId: string;
}

export type SpawnedEnemyReference = string | { readonly id: string } | void;

export type WaveEventType =
  | 'announcement'
  | 'wave-start'
  | 'enemy-spawned'
  | 'all-enemies-spawned'
  | 'wave-clear'
  | 'intermission'
  | 'victory'
  | 'reset';

export interface WaveEvent {
  type: WaveEventType;
  wave: number;
  subtitle: string;
  state: WaveDirectorState;
  enemiesRemaining: number;
  kind?: EnemyKind;
  enemyId?: string;
  spawnPointId?: string;
  duration?: number;
}

export interface WaveRecovery {
  wave: number;
  healthFraction: number;
  ammoFraction: number;
}

export interface WaveDirectorOptions {
  spawnPoints: readonly WaveSpawnPoint[];
  spawnEnemy: (kind: EnemyKind, position: THREE.Vector3, context: WaveSpawnContext) => SpawnedEnemyReference;
  getActiveEnemyCount: () => number;
  getPlayerPosition?: () => THREE.Vector3;
  onEvent?: (event: WaveEvent) => void;
  onRecovery?: (recovery: WaveRecovery) => void;
  clearEnemies?: () => void;
  definitions?: readonly WaveDefinition[];
  seed?: number;
  announcementDuration?: number;
  intermissionDuration?: number;
}

export interface WaveDirectorSnapshot {
  state: WaveDirectorState;
  wave: number;
  subtitle: string;
  queued: number;
  active: number;
  enemiesRemaining: number;
  intermissionRemaining: number;
  victory: boolean;
}
