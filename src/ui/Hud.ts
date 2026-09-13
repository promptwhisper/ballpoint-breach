import { ACTIVE_VISUAL_STYLE, isInkStyle } from '../render';
import { chineseMessage, waveLabel, WEAPON_COPY } from './zhCN';
import { InkDamageOverlay } from './InkDamageOverlay';

export type OverlayMode = 'loading' | 'start' | 'playing' | 'paused' | 'defeat' | 'victory';

export interface HudWeaponState {
  id: string;
  slot: number;
  name: string;
  ammo: number;
  reserve: number;
  description: string;
  selected: boolean;
}

export interface HudSnapshot {
  score: number;
  wave: number;
  enemiesLeft: number;
  health: number;
  maxHealth: number;
  weapons: HudWeaponState[];
  blockRatio?: number;
  boss?: { name: string; health: number; maxHealth: number } | null;
  scoped?: boolean;
  reticleSpread?: number;
}

const DAMAGE_STACK_DECAY_PER_SECOND = 1.49;

export function accumulateDamageStrength(
  currentStrength: number,
  damageAmount: number,
  elapsedSeconds = 0,
): number {
  const retained = Math.max(0, currentStrength) * Math.exp(-DAMAGE_STACK_DECAY_PER_SECOND * Math.max(0, elapsedSeconds));
  const hitStrength = Math.max(0.12, Math.min(1, damageAmount / 15));
  return Math.min(1, retained + hitStrength);
}

export class Hud {
  private readonly weaponRows = new Map<number, { row: HTMLElement; ammo: HTMLElement | null }>();
  private setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }
  readonly startButton: HTMLButtonElement;
  readonly restartButton: HTMLButtonElement;
  readonly saveCardButton: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly overlayInkTitle: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayCopy: HTMLElement;
  private readonly shareStatus: HTMLElement;
  private readonly score: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly health: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly reserve: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly weaponDescription: HTMLElement;
  private readonly blockWrap: HTMLElement;
  private readonly blockBar: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerInkTitle: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSubtitle: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly hitMarker: HTMLElement;
  private readonly damageIndicator: HTMLElement;
  private readonly scope: HTMLElement;
  private readonly inkDamage: InkDamageOverlay | null;
  private readonly foldModeButton: HTMLButtonElement;
  private readonly pagesModeButton: HTMLButtonElement;
  private levelMode: 'classic' | 'fold-foundry' | 'dual-pages' = 'classic';
  private bannerTimer = 0;
  private tipTimer = 0;
  private hitTimer = 0;
  private damageTimer = 0;
  private damageStack = 0;
  private readonly inkStyle = isInkStyle(ACTIVE_VISUAL_STYLE);
  private readonly damageChevrons: Array<{ element: HTMLElement; remaining: number }> = [];

  constructor(private readonly root: Document = document) {
    const required = <T extends Element>(selector: string): T => {
      const value = root.querySelector<T>(selector);
      if (!value) throw new Error(`Missing HUD element: ${selector}`);
      return value;
    };
    this.overlay = required('#game-overlay');
    this.overlayInkTitle = required('#overlay-ink-title');
    this.overlayTitle = required('#overlay-title');
    this.overlayCopy = required('#overlay-copy');
    this.startButton = required<HTMLButtonElement>('#start-button');
    this.restartButton = required<HTMLButtonElement>('#restart-button');
    this.saveCardButton = required<HTMLButtonElement>('#save-card-button');
    this.shareStatus = required('#share-status');
    this.score = required('[data-hud="score"]');
    this.wave = required('[data-hud="wave"]');
    this.enemies = required('[data-hud="enemies"]');
    this.health = required('[data-hud="health"]');
    this.healthBar = required('[data-hud="health-bar"]');
    this.ammo = required('[data-hud="ammo"]');
    this.reserve = required('[data-hud="reserve"]');
    this.weaponName = required('[data-hud="weapon-name"]');
    this.weaponDescription = required('[data-hud="weapon-description"]');
    this.blockWrap = required('#block-stamina');
    this.blockBar = required('[data-hud="block-bar"]');
    this.bossWrap = required('#boss-health');
    this.bossName = required('[data-hud="boss-name"]');
    this.bossBar = required('[data-hud="boss-bar"]');
    this.banner = required('#wave-banner');
    this.bannerInkTitle = required('#wave-banner-ink');
    this.bannerTitle = required('#wave-banner-title');
    this.bannerSubtitle = required('#wave-banner-subtitle');
    this.tip = required('#context-tip');
    this.hitMarker = required('#hit-marker');
    this.damageIndicator = required('#damage-indicator');
    this.scope = required('#scope-overlay');
    this.foldModeButton = required<HTMLButtonElement>('#fold-mode-button');
    this.pagesModeButton = required<HTMLButtonElement>('#pages-mode-button');
    this.inkDamage = this.inkStyle ? new InkDamageOverlay(root) : null;
    root.querySelectorAll<HTMLElement>('[data-weapon-slot]').forEach(row => {
      this.weaponRows.set(Number(row.dataset.weaponSlot), { row, ammo: row.querySelector('[data-weapon-ammo]') });
    });
  }

  setLevelMode(mode: 'classic' | 'fold-foundry' | 'dual-pages'): void {
    this.levelMode = mode;
    this.root.body.dataset.levelMode = mode;
  }

  setMode(mode: OverlayMode): void {
    this.overlay.dataset.mode = mode;
    this.root.body.dataset.gameMode = mode;
    const choices = this.root.querySelector<HTMLElement>('#level-choices');
    if (choices) choices.hidden = mode !== 'start';
    const menu = this.root.querySelector<HTMLButtonElement>('#return-menu-button');
    if (menu) menu.hidden = mode !== 'paused' && mode !== 'defeat' && mode !== 'victory';
    const visible = mode !== 'playing';
    this.overlay.classList.toggle('visible', visible);
    this.startButton.hidden = mode !== 'start' && mode !== 'loading';
    this.foldModeButton.hidden = mode !== 'start';
    this.pagesModeButton.hidden = mode !== 'start';
    this.restartButton.hidden = mode !== 'defeat' && mode !== 'victory';
    this.saveCardButton.hidden = !this.inkStyle || (mode !== 'defeat' && mode !== 'victory');
    this.root.body.dataset.gameMode = mode;
    if (mode !== 'playing') this.inkDamage?.clear();
    if (this.inkStyle) {
      const copy = {
        loading: ['入墨', '墨境将启', '正在铺纸研墨，请稍候。'],
        start: ['择卷', '三卷墨境 · 各有杀局', '选择一卷入画：守阵、突围，或攻入机枢。'],
        paused: ['暂歇', '战局已暂停', '轻触画面继续'],
        defeat: ['落墨', '此战未竟', '整顿行装，再入墨境。'],
        victory: ['破阵', this.levelMode === 'classic' ? '十阵尽破 · 墨魁已伏' : '六战皆捷 · 此卷已破', '这一纸战局，由你写下终章。'],
        playing: ['', '', ''],
      }[mode];
      this.overlayInkTitle.textContent = copy[0];
      this.overlayTitle.textContent = copy[1];
      this.overlayCopy.textContent = copy[2];
      this.startButton.disabled = mode === 'loading';
      this.restartButton.textContent = mode === 'victory' ? '再战一局' : '重新入阵';
      return;
    }
    if (mode === 'loading') {
      this.overlayInkTitle.textContent = '入墨';
      this.overlayTitle.textContent = 'BALLPOINT BREACH';
      this.overlayCopy.textContent = this.inkStyle ? 'preparing ink…' : 'sharpening pencils…';
      this.startButton.disabled = true;
    } else if (mode === 'start') {
      this.overlayInkTitle.textContent = '破阵';
      this.overlayTitle.textContent = 'BALLPOINT BREACH';
      this.overlayCopy.textContent = 'survive ten waves in a construction-yard sketchbook';
      this.startButton.textContent = 'CLICK / TAP TO ENTER THE PAGE';
      this.startButton.disabled = false;
    } else if (mode === 'paused') {
      this.overlayInkTitle.textContent = '暂停';
      this.overlayTitle.textContent = 'PAUSED';
      this.overlayCopy.textContent = 'click or tap the page to resume';
    } else if (mode === 'defeat') {
      this.overlayInkTitle.textContent = '败';
      this.overlayTitle.textContent = this.inkStyle ? 'FALLEN' : 'ERASED';
      this.overlayCopy.textContent = this.inkStyle ? 'the ink has run dry' : 'the page got the better of you';
      this.restartButton.textContent = this.inkStyle ? 'TRY AGAIN' : 'DRAW AGAIN';
    } else if (mode === 'victory') {
      this.overlayInkTitle.textContent = '胜';
      this.overlayTitle.textContent = 'PAGE CLEARED';
      this.overlayCopy.textContent = 'all ten waves cleared · THE DOODLER has been erased';
      this.restartButton.textContent = 'PLAY AGAIN';
    }
  }

  resetShareStatus(): void {
    this.saveCardButton.disabled = false;
    this.saveCardButton.textContent = '保存战帖';
    this.shareStatus.hidden = true;
    this.shareStatus.textContent = '';
    delete this.shareStatus.dataset.state;
  }

  setShareStatus(state: 'saving' | 'saved' | 'error', message: string): void {
    this.saveCardButton.disabled = state === 'saving';
    this.saveCardButton.textContent = state === 'saving' ? '正在落印…' : state === 'saved' ? '再存一张' : '重新保存';
    this.shareStatus.hidden = false;
    this.shareStatus.dataset.state = state;
    this.shareStatus.textContent = message;
  }

  render(snapshot: HudSnapshot): void {
    this.setText(this.score, String(snapshot.score));
    this.setText(this.wave, this.inkStyle ? waveLabel(snapshot.wave) : `WAVE ${snapshot.wave}`);
    this.setText(this.enemies, this.inkStyle ? `余敌 ${snapshot.enemiesLeft} 人` : `${snapshot.enemiesLeft} ${snapshot.enemiesLeft === 1 ? 'enemy' : 'enemies'} left`);
    this.setText(this.health, String(Math.ceil(snapshot.health)));
    this.healthBar.style.setProperty('--value', `${Math.max(0, snapshot.health / snapshot.maxHealth) * 100}%`);
    const current = snapshot.weapons.find((weapon) => weapon.selected) ?? snapshot.weapons[0];
    if (current) {
      this.setText(this.ammo, current.name === 'KATANA' ? '∞' : String(current.ammo));
      this.setText(this.reserve, current.name === 'KATANA' ? '' : `/${current.reserve}`);
      this.setText(this.weaponName, this.inkStyle ? WEAPON_COPY[current.name]?.name ?? current.name : current.name);
      this.setText(this.weaponDescription, this.inkStyle ? WEAPON_COPY[current.name]?.hint ?? current.description : current.description);
      if (this.root.body.dataset.reticle !== current.name.toLowerCase()) this.root.body.dataset.reticle = current.name.toLowerCase();
    }
    const visibleSlots = new Set(snapshot.weapons.map((weapon) => weapon.slot));
    for (const [slot, cached] of this.weaponRows) cached.row.hidden = !visibleSlots.has(slot);
    for (const weapon of snapshot.weapons) {
      const cached = this.weaponRows.get(weapon.slot);
      if (!cached) continue;
      const { row, ammo } = cached;
      row.classList.toggle('selected', weapon.selected);
      if (ammo) this.setText(ammo, weapon.name === 'KATANA' ? '∞' : `${weapon.ammo}/${weapon.reserve}`);
    }
    const showBlock = snapshot.blockRatio !== undefined;
    this.blockWrap.classList.toggle('visible', showBlock);
    if (showBlock) this.blockBar.style.setProperty('--value', `${Math.max(0, Math.min(1, snapshot.blockRatio ?? 0)) * 100}%`);
    this.bossWrap.classList.toggle('visible', Boolean(snapshot.boss));
    if (snapshot.boss) {
      this.setText(this.bossName, this.inkStyle ? chineseMessage(snapshot.boss.name) : snapshot.boss.name);
      this.bossBar.style.setProperty('--value', `${Math.max(0, snapshot.boss.health / snapshot.boss.maxHealth) * 100}%`);
    }
    this.scope.classList.toggle('visible', Boolean(snapshot.scoped));
    this.root.body.classList.toggle('scoped', Boolean(snapshot.scoped));
    this.root.body.style.setProperty('--reticle-spread', `${snapshot.reticleSpread ?? 22}px`);
  }

  showBanner(title: string, subtitle: string, duration = 2.2): void {
    this.bannerInkTitle.textContent = title.includes('DOODLER')
      ? '终局' : title.includes('CLEARED') ? '胜' : '破阵';
    this.bannerTitle.textContent = this.inkStyle ? chineseMessage(title) : title;
    this.bannerSubtitle.textContent = this.inkStyle ? chineseMessage(subtitle) : subtitle;
    this.banner.classList.add('visible');
    this.bannerTimer = duration;
  }

  showTip(message: string, duration = 4): void {
    this.tip.textContent = this.inkStyle ? chineseMessage(message) : message;
    this.tip.classList.add('visible');
    this.tipTimer = duration;
  }

  flashHit(headshot = false): void {
    this.hitMarker.classList.toggle('headshot', headshot);
    this.hitMarker.classList.add('visible');
    this.hitTimer = headshot ? 0.18 : 0.11;
  }

  flashDamage(screenAngleRadians: number, damageAmount: number): void {
    this.inkDamage?.hit(screenAngleRadians, damageAmount);
    const body = this.root.body;
    this.damageStack = accumulateDamageStrength(this.damageStack, damageAmount);
    body.style.setProperty('--damage-strength', this.damageStack.toFixed(3));
    body.classList.remove('player-hit');
    void body.offsetWidth;
    body.classList.add('player-hit');

    const marker = this.root.createElement('i');
    const radius = 124;
    marker.style.left = `${130 + Math.sin(screenAngleRadians) * radius}px`;
    marker.style.top = `${130 - Math.cos(screenAngleRadians) * radius}px`;
    marker.style.transform = `translate(-50%,-50%) rotate(${screenAngleRadians}rad)`;
    this.damageIndicator.append(marker);
    this.damageChevrons.push({ element: marker, remaining: 0.68 });
    while (this.damageChevrons.length > 4) this.damageChevrons.shift()?.element.remove();
    this.damageIndicator.classList.add('visible');
    this.damageTimer = 0.68;
  }

  clearDamageFeedback(): void {
    this.inkDamage?.clear();
    this.damageTimer = 0;
    this.damageStack = 0;
    this.root.body.classList.remove('player-hit');
    this.root.body.style.setProperty('--damage-strength', '0');
    for (const marker of this.damageChevrons) marker.element.remove();
    this.damageChevrons.length = 0;
    this.damageIndicator.classList.remove('visible');
  }

  dispose(): void { this.clearDamageFeedback(); this.inkDamage?.dispose(); }

  update(dt: number): void {
    this.inkDamage?.update(dt);
    this.bannerTimer -= dt;
    this.tipTimer -= dt;
    this.hitTimer -= dt;
    this.damageTimer -= dt;
    this.damageStack *= Math.exp(-DAMAGE_STACK_DECAY_PER_SECOND * dt);
    for (let index = this.damageChevrons.length - 1; index >= 0; index -= 1) {
      const marker = this.damageChevrons[index];
      marker.remaining -= dt;
      if (marker.remaining > 0) continue;
      marker.element.remove();
      this.damageChevrons.splice(index, 1);
    }
    if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    if (this.tipTimer <= 0) this.tip.classList.remove('visible');
    if (this.hitTimer <= 0) this.hitMarker.classList.remove('visible');
    if (this.damageTimer <= 0) {
      this.damageStack = 0;
      this.root.body.classList.remove('player-hit');
    }
    this.damageIndicator.classList.toggle('visible', this.damageChevrons.length > 0);
  }
}
