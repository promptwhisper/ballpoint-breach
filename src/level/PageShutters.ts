import * as THREE from 'three';
import type { ArenaCollider } from './ArenaBuilder';

export interface PageShutter {
  root: THREE.Group;
  collider: ArenaCollider;
  meshes: readonly THREE.Mesh[];
  bank: 0 | 1;
}

/** Fold away one firing lane before closing the other; occupied lanes never close on actors. */
export class PageShutters {
  private bank: 0 | 1 = 0;
  private target: 0 | 1 = 0;
  private clock = 0;
  private transition = 1;
  private pending = false;
  private occupied = false;
  private readonly interval = 22;

  constructor(private readonly shutters: readonly PageShutter[]) { this.reset(); }

  get status(): string {
    if (this.occupied) return '通道有人 · 折墙等待收拢';
    if (this.pending) return '折墙翻动中 · 留意新的射击线';
    const remaining = Math.ceil(this.interval - this.clock);
    if (remaining <= 3) return `折墙将在 ${remaining} 秒后翻转 · 准备转移`;
    return `${this.bank === 0 ? '东西侧路开放' : '南北中路开放'} · ${remaining} 秒后翻页 · 射击红印可提前切换`;
  }

  requestFlip(): boolean {
    if (this.pending || this.clock < 3) return false;
    this.clock = this.interval - 1;
    return true;
  }

  update(dt: number, actorPositions: readonly THREE.Vector3[]): void {
    if (!this.pending) {
      this.clock += dt;
      if (this.clock < this.interval) return;
      this.target = this.bank === 0 ? 1 : 0;
      this.pending = true;
      this.transition = 0;
      // Open the old bank immediately, so at least two routes are always usable.
      for (const shutter of this.shutters) {
        shutter.collider.enabled = false;
        for (const mesh of shutter.meshes) mesh.userData.raycastDisabled = true;
      }
    }
    this.occupied = this.shutters.some((shutter) => shutter.bank === this.target
      && actorPositions.some((position) => position.y < 3.8
        && position.x > shutter.collider.min.x - 1 && position.x < shutter.collider.max.x + 1
        && position.z > shutter.collider.min.z - 1 && position.z < shutter.collider.max.z + 1));
    // Stay folded until the prospective closing volume is clear.
    this.transition = this.occupied ? Math.min(this.transition, 0.45) : Math.min(1, this.transition + dt / 1.35);
    for (const shutter of this.shutters) {
      const closing = shutter.bank === this.target;
      const raised = closing ? Math.max(0, (this.transition - 0.5) * 2) : Math.max(0, 1 - this.transition * 2);
      shutter.root.rotation.x = -(1 - raised) * Math.PI / 2;
      shutter.root.visible = raised > 0.015;
    }
    if (this.transition < 1) return;
    this.bank = this.target;
    this.pending = false;
    this.clock = 0;
    this.applySettled();
  }

  reset(): void {
    this.bank = 0; this.target = 0; this.clock = 0; this.transition = 1; this.pending = false; this.occupied = false;
    this.applySettled();
  }

  private applySettled(): void {
    for (const shutter of this.shutters) {
      const closed = shutter.bank === this.bank;
      shutter.root.visible = closed;
      shutter.root.rotation.x = closed ? 0 : -Math.PI / 2;
      shutter.collider.enabled = closed;
      for (const mesh of shutter.meshes) mesh.userData.raycastDisabled = !closed;
    }
  }
}
