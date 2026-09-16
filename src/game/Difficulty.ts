import type { WaveDefinition } from '../waves/types';
import type { Difficulty } from '../ui/SettingsPanel';

export interface DifficultyProfile {
  concurrencyScale: number;
  spawnIntervalScale: number;
  incomingDamageScale: number;
  enemyTimeScale: number;
  outgoingDamageScale: number;
  supplyScale: number;
  healthRecovery: number;
  ammoRecovery: number;
}

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = Object.freeze({
  relaxed: Object.freeze({ concurrencyScale: 0.35, spawnIntervalScale: 2, incomingDamageScale: 0.18, enemyTimeScale: 0.62, outgoingDamageScale: 1.35, supplyScale: 1.5, healthRecovery: 0.6, ammoRecovery: 0.75 }),
  standard: Object.freeze({ concurrencyScale: 0.78, spawnIntervalScale: 1.16, incomingDamageScale: 0.68, enemyTimeScale: 0.9, outgoingDamageScale: 1.1, supplyScale: 1.15, healthRecovery: 0.24, ammoRecovery: 0.4 }),
  challenge: Object.freeze({ concurrencyScale: 1, spawnIntervalScale: 1, incomingDamageScale: 1, enemyTimeScale: 1, outgoingDamageScale: 1, supplyScale: 1, healthRecovery: 0.16, ammoRecovery: 0.32 }),
});

export function scaleWaveDefinitions(definitions: readonly WaveDefinition[], difficulty: Difficulty): readonly WaveDefinition[] {
  const profile = DIFFICULTY_PROFILES[difficulty];
  if (difficulty === 'challenge') return definitions;
  return definitions.map(definition => ({
    ...definition,
    maxConcurrent: Math.max(difficulty === 'relaxed' ? 2 : 3, Math.ceil(definition.maxConcurrent * profile.concurrencyScale)),
    spawnInterval: definition.spawnInterval * profile.spawnIntervalScale,
  }));
}
