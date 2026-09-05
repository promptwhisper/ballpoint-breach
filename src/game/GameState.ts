export type GameMode = 'loading' | 'start' | 'playing' | 'paused' | 'defeat' | 'victory';

export class GameState {
  mode: GameMode = 'loading';
  score = 0;
  wave = 1;
  combo = 0;
  private comboTimer = 0;
  private timeScaleTimer = 0;

  update(dt: number): void {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.timeScaleTimer = Math.max(0, this.timeScaleTimer - dt);
  }

  get timeScale(): number {
    return this.timeScaleTimer > 0 ? 0.28 : 1;
  }

  triggerHitStop(duration = 0.075): void {
    this.timeScaleTimer = Math.max(this.timeScaleTimer, duration);
  }

  awardKill(baseScore: number, bonuses: { headshot?: boolean; fall?: boolean; reflected?: boolean; boss?: boolean } = {}): number {
    this.combo = Math.min(8, this.combo + 1);
    this.comboTimer = 2.4;
    let points = baseScore + (this.combo - 1) * 10;
    if (bonuses.headshot) points += 75;
    if (bonuses.fall) points += 100;
    if (bonuses.reflected) points += 125;
    if (bonuses.boss) points += 1500;
    this.score += points;
    if (!bonuses.fall) this.triggerHitStop();
    return points;
  }

  reset(): void {
    this.mode = 'start';
    this.score = 0;
    this.wave = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.timeScaleTimer = 0;
  }
}
