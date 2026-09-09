import { createInkStamp, inkRandom } from '../render/InkSplat';

interface Splash { x: number; y: number; size: number; rotation: number; opacity: number; stamp: number; age: number; life: number }
export const MAX_SCREEN_INK_SPLASHES = 6;

/** A bounded presentation-only layer. No hit tests or health are stored here. */
export class InkDamageOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly stamps: HTMLCanvasElement[];
  private readonly splashes: Splash[] = [];
  private serial = 0;
  private readonly reducedMotion: boolean;

  constructor(private readonly root: Document) {
    this.canvas = root.createElement('canvas');
    this.canvas.id = 'ink-damage-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d');
    this.reducedMotion = root.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    this.stamps = Array.from({ length: 4 }, (_, i) => {
      const stamp = root.createElement('canvas');
      stamp.width = stamp.height = 256;
      const ctx = stamp.getContext('2d');
      if (ctx) {
        const bitmap = ctx.createImageData(256, 256);
        bitmap.data.set(createInkStamp(256, 91 + i * 37));
        ctx.putImageData(bitmap, 0, 0);
      }
      return stamp;
    });
    root.body.append(this.canvas);
  }

  hit(angle: number, amount: number): void {
    if (amount <= 0 || !Number.isFinite(angle) || !Number.isFinite(amount)) return;
    const random = inkRandom(++this.serial * 7919);
    const strength = Math.min(1, amount / 18);
    for (let i = 0; i < 3; i += 1) {
      const direction = angle + (i === 0 ? 0 : (i === 1 ? 1 : -1) * (1.15 + random() * .9));
      this.splashes.push({
        x: .5 + Math.sin(direction) * (.48 + random() * .08),
        y: .5 - Math.cos(direction) * (.45 + random() * .08),
        size: (i === 0 ? .8 : .45) + random() * .12,
        rotation: (random() - .5) * .8,
        opacity: (i === 0 ? .55 : .28) * (.55 + strength * .45),
        stamp: Math.floor(random() * this.stamps.length), age: 0,
        life: 1.3 + strength * .45 + random() * .2,
      });
    }
    this.splashes.splice(0, Math.max(0, this.splashes.length - MAX_SCREEN_INK_SPLASHES));
    this.update(0);
  }

  clear(): void {
    this.splashes.length = 0;
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.dataset.splashes = '0';
  }

  dispose(): void { this.clear(); this.canvas.remove(); }

  update(dt: number): void {
    if (!this.context || !this.splashes.length) return;
    const context = this.context;
    const width = this.root.defaultView?.innerWidth ?? 1280;
    const height = this.root.defaultView?.innerHeight ?? 720;
    const resolution = Math.min(1, 1280 / width);
    if (this.canvas.width !== Math.round(width * resolution) || this.canvas.height !== Math.round(height * resolution)) {
      this.canvas.width = Math.round(width * resolution); this.canvas.height = Math.round(height * resolution);
    }
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save(); context.scale(resolution, resolution);
    const unit = Math.min(width, height);
    for (let i = this.splashes.length - 1; i >= 0; i -= 1) {
      const splash = this.splashes[i];
      splash.age += Math.max(0, dt);
      if (splash.age >= splash.life) { this.splashes.splice(i, 1); continue; }
      const fade = Math.min(1, (splash.life - splash.age) / .85);
      const spread = this.reducedMotion ? 1 : .87 + .13 * (1 - Math.exp(-splash.age * 12));
      const size = splash.size * unit * spread;
      context.save(); context.globalAlpha = splash.opacity * fade;
      context.translate(splash.x * width, splash.y * height + (this.reducedMotion ? 0 : splash.age * unit * .011));
      context.rotate(splash.rotation);
      context.drawImage(this.stamps[splash.stamp], -size / 2, -size / 2, size, size);
      context.restore();
    }
    // Keep the reticle and nearby targets unobscured, with no hard circular cutout.
    context.globalCompositeOperation = 'destination-out';
    const clearCenter = context.createRadialGradient(width / 2, height / 2, unit * .2, width / 2, height / 2, unit * .46);
    clearCenter.addColorStop(0, 'rgba(0,0,0,1)'); clearCenter.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = clearCenter; context.fillRect(0, 0, width, height);
    context.restore();
    this.canvas.dataset.splashes = String(this.splashes.length);
  }
}
