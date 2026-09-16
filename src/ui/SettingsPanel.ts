import type { InputManager } from '../input/InputManager';

export type Difficulty = 'relaxed' | 'standard' | 'challenge';
export type ControlZone = 'move' | 'fire' | 'jump' | 'weapon' | 'aim';
export type ControlLayout = Partial<Record<ControlZone, Readonly<{ x: number; y: number }>>>;
export interface PlayerSettings {
  sensitivity: number;
  fireMode: 'screen' | 'button';
  soundEnabled: boolean;
  autoFire: boolean;
  difficulty: Difficulty;
  controlLayout: ControlLayout;
}

export const SETTINGS_KEY = 'ballpoint-player-settings-v1';

function normalizeLayout(value: unknown): ControlLayout {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: ControlLayout = {};
  for (const zone of ['move', 'fire', 'jump', 'weapon', 'aim'] as const) {
    const point = raw[zone] as { x?: unknown; y?: unknown } | undefined;
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    result[zone] = { x: Math.max(0.04, Math.min(0.96, point.x)), y: Math.max(0.08, Math.min(0.94, point.y)) };
  }
  return result;
}

export function normalizeSettings(value: unknown): PlayerSettings {
  const raw = value && typeof value === 'object' ? value as Partial<PlayerSettings> : {};
  return {
    sensitivity: typeof raw.sensitivity === 'number' && Number.isFinite(raw.sensitivity)
      ? Math.max(0.5, Math.min(4, raw.sensitivity)) : 3.5,
    fireMode: raw.fireMode === 'button' ? 'button' : 'screen',
    soundEnabled: raw.soundEnabled !== false,
    autoFire: raw.autoFire === true,
    difficulty: raw.difficulty === 'standard' || raw.difficulty === 'challenge' ? raw.difficulty : 'relaxed',
    controlLayout: normalizeLayout(raw.controlLayout),
  };
}

export function readPlayerSettings(): PlayerSettings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); }
  catch { return normalizeSettings(null); }
}

export class SettingsPanel {
  values = readPlayerSettings();
  private sliderTouchId: number | null = null;
  private appliedSensitivity = Number.NaN;
  private appliedFireMode: PlayerSettings['fireMode'] | null = null;
  private editingControls = false;
  private drag?: { zone: ControlZone; pointerId: number };
  private controlTouchId: number | null = null;
  private readonly panel = document.querySelector<HTMLElement>('#settings-panel')!;
  private readonly opener = document.querySelector<HTMLButtonElement>('#settings-toggle')!;
  private readonly closer = document.querySelector<HTMLButtonElement>('#settings-close')!;
  private readonly slider = document.querySelector<HTMLInputElement>('#look-sensitivity')!;
  private readonly output = document.querySelector<HTMLOutputElement>('#sensitivity-value')!;
  private readonly autoFire = document.querySelector<HTMLInputElement>('#auto-fire')!;
  private readonly modes = Array.from(document.querySelectorAll<HTMLInputElement>('[name="fire-mode"]'));
  private readonly difficulties = Array.from(document.querySelectorAll<HTMLInputElement>('[name="difficulty"]'));
  private readonly editor = document.querySelector<HTMLElement>('#control-layout-editor')!;
  private readonly editButton = document.querySelector<HTMLButtonElement>('#edit-controls')!;
  private readonly finishButton = document.querySelector<HTMLButtonElement>('#finish-controls')!;
  private readonly resetButton = document.querySelector<HTMLButtonElement>('#reset-controls')!;
  private readonly zones: Record<ControlZone, HTMLElement> = {
    move: document.querySelector<HTMLElement>('.touch-move')!,
    fire: document.querySelector<HTMLElement>('.action-fire')!,
    jump: document.querySelector<HTMLElement>('.action-jump')!,
    weapon: document.querySelector<HTMLElement>('.action-weapon')!,
    aim: document.querySelector<HTMLElement>('.action-aim')!,
  };

  constructor(
    private readonly input: InputManager,
    private readonly pause: () => void,
    private readonly resume: () => void,
    private readonly onChange?: (settings: Readonly<PlayerSettings>) => void,
  ) {
    this.apply();
    this.opener.addEventListener('click', this.open); this.closer.addEventListener('click', this.close);
    this.slider.addEventListener('input', this.sliderInput);
    this.slider.addEventListener('change', this.flushSave);
    this.slider.addEventListener('touchstart', this.sliderStart, { passive: false }); this.slider.addEventListener('touchmove', this.sliderMove, { passive: false });
    this.slider.addEventListener('touchend', this.sliderEnd, { passive: false }); this.slider.addEventListener('touchcancel', this.sliderEnd, { passive: false });
    this.modes.forEach(mode => mode.addEventListener('change', this.change)); this.difficulties.forEach(mode => mode.addEventListener('change', this.change));
    this.autoFire.addEventListener('change', this.change); this.editButton.addEventListener('click', this.beginControlEdit);
    this.finishButton.addEventListener('click', this.finishControlEdit); this.resetButton.addEventListener('click', this.resetControlLayout);
    for (const [zone, element] of Object.entries(this.zones) as [ControlZone, HTMLElement][]) {
      element.dataset.controlZone = zone; element.addEventListener('pointerdown', this.controlPointerDown);
      element.addEventListener('touchstart', this.controlTouchStart, { passive: false });
      element.addEventListener('touchmove', this.controlTouchMove, { passive: false });
      element.addEventListener('touchend', this.controlTouchEnd, { passive: false });
      element.addEventListener('touchcancel', this.controlTouchEnd, { passive: false });
    }
    window.addEventListener('pointermove', this.controlPointerMove, { passive: false }); window.addEventListener('pointerup', this.controlPointerUp); window.addEventListener('pointercancel', this.controlPointerUp);
    this.panel.addEventListener('keydown', this.keydown);
  }

  setSound(enabled: boolean): void { this.values.soundEnabled = enabled; this.save(); this.onChange?.(this.values); }
  private save(): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.values)); } catch { /* Embedded storage is optional. */ } }
  private readonly flushSave = (): void => { this.save(); };
  private apply(): void {
    if (this.values.sensitivity !== this.appliedSensitivity || this.values.fireMode !== this.appliedFireMode) {
      this.input.setTouchSettings(this.values.sensitivity, this.values.fireMode);
      this.appliedSensitivity = this.values.sensitivity; this.appliedFireMode = this.values.fireMode;
    }
    this.slider.value = String(this.values.sensitivity); this.output.textContent = `${this.values.sensitivity.toFixed(1)} 倍`;
    this.modes.forEach(mode => { mode.checked = mode.value === this.values.fireMode; });
    this.difficulties.forEach(mode => { mode.checked = mode.value === this.values.difficulty; });
    this.autoFire.checked = this.values.autoFire;
    document.body.dataset.fireMode = this.values.fireMode; document.body.dataset.difficulty = this.values.difficulty;
    for (const zone of ['move', 'fire', 'jump', 'weapon', 'aim'] as const) this.applyControlPosition(zone);
  }
  private applyControlPosition(zone: ControlZone): void {
    const element = this.zones[zone], point = this.values.controlLayout[zone];
    if (!point) { element.classList.remove('custom-position'); element.style.removeProperty('left'); element.style.removeProperty('top'); return; }
    element.classList.add('custom-position'); element.style.left = `${point.x * 100}%`; element.style.top = `${point.y * 100}%`;
  }
  private readonly change = (): void => {
    this.values = normalizeSettings({ ...this.values, sensitivity: Number(this.slider.value), fireMode: this.modes.find(mode => mode.checked)?.value, difficulty: this.difficulties.find(mode => mode.checked)?.value, autoFire: this.autoFire.checked });
    this.apply(); this.save(); this.onChange?.(this.values);
  };
  private readonly sliderInput = (): void => {
    const sensitivity = normalizeSettings({ ...this.values, sensitivity: Number(this.slider.value) }).sensitivity;
    if (sensitivity === this.values.sensitivity) return;
    this.values = { ...this.values, sensitivity };
    this.output.textContent = `${sensitivity.toFixed(1)} 倍`;
    this.input.setTouchSettings(sensitivity, this.values.fireMode);
    this.appliedSensitivity = sensitivity;
  };

  private dragSlider(touch: Touch): void {
    const rect = this.slider.getBoundingClientRect(), rotated = window.innerHeight > window.innerWidth;
    const length = rotated ? rect.height : rect.width, coordinate = rotated ? touch.clientY - rect.top : touch.clientX - rect.left, inset = 12;
    const fraction = Math.max(0, Math.min(1, (coordinate - inset) / Math.max(1, length - inset * 2)));
    this.slider.value = (Math.round((0.5 + fraction * 3.5) * 10) / 10).toFixed(1); this.sliderInput();
  }
  private readonly sliderStart = (event: TouchEvent): void => { if (this.sliderTouchId !== null) return; const touch = event.changedTouches[0]; if (!touch) return; event.preventDefault(); event.stopPropagation(); this.sliderTouchId = touch.identifier; this.slider.focus(); this.dragSlider(touch); };
  private readonly sliderMove = (event: TouchEvent): void => { const touch = Array.from(event.changedTouches).find(item => item.identifier === this.sliderTouchId); if (!touch) return; event.preventDefault(); event.stopPropagation(); this.dragSlider(touch); };
  private readonly sliderEnd = (event: TouchEvent): void => { if (!Array.from(event.changedTouches).some(item => item.identifier === this.sliderTouchId)) return; event.preventDefault(); event.stopPropagation(); this.sliderTouchId = null; this.flushSave(); };

  private readonly beginControlEdit = (): void => { this.panel.hidden = true; this.editor.hidden = false; this.editingControls = true; document.body.classList.add('editing-controls'); };
  private readonly finishControlEdit = (): void => { this.drag = undefined; this.editingControls = false; document.body.classList.remove('editing-controls'); this.editor.hidden = true; this.panel.hidden = false; this.closer.focus(); };
  private readonly resetControlLayout = (): void => { this.values = normalizeSettings({ ...this.values, controlLayout: {} }); this.apply(); this.save(); this.onChange?.(this.values); };
  private readonly controlPointerDown = (event: PointerEvent): void => {
    if (!this.editingControls) return;
    const element = (event.target as Element).closest<HTMLElement>('[data-control-zone]'), zone = element?.dataset.controlZone as ControlZone | undefined; if (!element || !zone) return;
    event.preventDefault(); event.stopPropagation(); this.drag = { zone, pointerId: event.pointerId }; element.setPointerCapture?.(event.pointerId); this.moveControl(zone, event.clientX, event.clientY);
  };
  private readonly controlPointerMove = (event: PointerEvent): void => { if (!this.drag || event.pointerId !== this.drag.pointerId) return; event.preventDefault(); event.stopPropagation(); this.moveControl(this.drag.zone, event.clientX, event.clientY); };
  private readonly controlPointerUp = (event: PointerEvent): void => { if (!this.drag || event.pointerId !== this.drag.pointerId) return; event.preventDefault(); event.stopPropagation(); this.drag = undefined; this.save(); this.onChange?.(this.values); };
  private readonly controlTouchStart = (event: TouchEvent): void => {
    if (!this.editingControls || this.controlTouchId !== null) return;
    const element = (event.currentTarget as HTMLElement), zone = element.dataset.controlZone as ControlZone | undefined, touch = event.changedTouches[0];
    if (!zone || !touch) return;
    event.preventDefault(); event.stopPropagation(); this.controlTouchId = touch.identifier; this.moveControl(zone, touch.clientX, touch.clientY);
  };
  private readonly controlTouchMove = (event: TouchEvent): void => {
    if (!this.editingControls || this.controlTouchId === null) return;
    const zone = (event.currentTarget as HTMLElement).dataset.controlZone as ControlZone | undefined;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === this.controlTouchId);
    if (!zone || !touch) return;
    event.preventDefault(); event.stopPropagation(); this.moveControl(zone, touch.clientX, touch.clientY);
  };
  private readonly controlTouchEnd = (event: TouchEvent): void => {
    if (this.controlTouchId === null || !Array.from(event.changedTouches).some(item => item.identifier === this.controlTouchId)) return;
    event.preventDefault(); event.stopPropagation(); this.controlTouchId = null; this.save(); this.onChange?.(this.values);
  };
  private moveControl(zone: ControlZone, clientX: number, clientY: number): void {
    const shell = document.querySelector<HTMLElement>('#landscape-shell')!, rotated = window.innerHeight > window.innerWidth;
    const x = rotated ? clientY : clientX, y = rotated ? window.innerWidth - clientX : clientY;
    this.values.controlLayout = { ...this.values.controlLayout, [zone]: { x: Math.max(0.05, Math.min(0.95, x / Math.max(1, shell.clientWidth))), y: Math.max(0.1, Math.min(0.92, y / Math.max(1, shell.clientHeight))) } };
    this.applyControlPosition(zone);
  }

  get isOpen(): boolean { return !this.panel.hidden || this.editingControls; }
  private readonly open = (): void => { this.pause(); this.panel.hidden = false; document.body.classList.add('settings-open'); this.opener.setAttribute('aria-expanded', 'true'); this.closer.focus(); };
  private readonly close = (): void => { this.sliderTouchId = null; this.flushSave(); this.panel.hidden = true; document.body.classList.remove('settings-open'); this.opener.setAttribute('aria-expanded', 'false'); this.resume(); this.opener.focus(); };
  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.panel.querySelectorAll<HTMLElement>('button:not(:disabled), input')), first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  dispose(): void {
    this.opener.removeEventListener('click', this.open); this.closer.removeEventListener('click', this.close); this.slider.removeEventListener('input', this.sliderInput); this.slider.removeEventListener('change', this.flushSave);
    this.slider.removeEventListener('touchstart', this.sliderStart); this.slider.removeEventListener('touchmove', this.sliderMove); this.slider.removeEventListener('touchend', this.sliderEnd); this.slider.removeEventListener('touchcancel', this.sliderEnd);
    this.modes.forEach(mode => mode.removeEventListener('change', this.change)); this.difficulties.forEach(mode => mode.removeEventListener('change', this.change)); this.autoFire.removeEventListener('change', this.change);
    this.editButton.removeEventListener('click', this.beginControlEdit); this.finishButton.removeEventListener('click', this.finishControlEdit); this.resetButton.removeEventListener('click', this.resetControlLayout);
    Object.values(this.zones).forEach(element => {
      element.removeEventListener('pointerdown', this.controlPointerDown); element.removeEventListener('touchstart', this.controlTouchStart);
      element.removeEventListener('touchmove', this.controlTouchMove); element.removeEventListener('touchend', this.controlTouchEnd); element.removeEventListener('touchcancel', this.controlTouchEnd);
    }); window.removeEventListener('pointermove', this.controlPointerMove); window.removeEventListener('pointerup', this.controlPointerUp); window.removeEventListener('pointercancel', this.controlPointerUp);
    this.panel.removeEventListener('keydown', this.keydown);
  }
}
