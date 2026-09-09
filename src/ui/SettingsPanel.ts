import type { InputManager } from '../input/InputManager';

export interface PlayerSettings { sensitivity: number; fireMode: 'screen' | 'button'; soundEnabled: boolean }
export const SETTINGS_KEY = 'ballpoint-player-settings-v1';
export function normalizeSettings(value: unknown): PlayerSettings {
  const raw = value && typeof value === 'object' ? value as Partial<PlayerSettings> : {};
  return {
    sensitivity: typeof raw.sensitivity === 'number' && Number.isFinite(raw.sensitivity)
      ? Math.max(0.5, Math.min(4, raw.sensitivity)) : 1.8,
    fireMode: raw.fireMode === 'button' ? 'button' : 'screen',
    soundEnabled: raw.soundEnabled !== false,
  };
}

export class SettingsPanel {
  values = normalizeSettings(null);
  private sliderTouchId: number | null = null;
  private readonly panel = document.querySelector<HTMLElement>('#settings-panel')!;
  private readonly opener = document.querySelector<HTMLButtonElement>('#settings-toggle')!;
  private readonly closer = document.querySelector<HTMLButtonElement>('#settings-close')!;
  private readonly slider = document.querySelector<HTMLInputElement>('#look-sensitivity')!;
  private readonly output = document.querySelector<HTMLOutputElement>('#sensitivity-value')!;
  private readonly modes = Array.from(document.querySelectorAll<HTMLInputElement>('[name="fire-mode"]'));
  constructor(private readonly input: InputManager, private readonly pause: () => void, private readonly resume: () => void) {
    try { this.values = normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); } catch { /* Storage is optional in embedded hosts. */ }
    this.apply();
    this.opener.addEventListener('click', this.open);
    this.closer.addEventListener('click', this.close);
    this.slider.addEventListener('input', this.change);
    this.slider.addEventListener('touchstart', this.sliderStart, { passive: false });
    this.slider.addEventListener('touchmove', this.sliderMove, { passive: false });
    this.slider.addEventListener('touchend', this.sliderEnd, { passive: false });
    this.slider.addEventListener('touchcancel', this.sliderEnd, { passive: false });
    this.modes.forEach(mode => mode.addEventListener('change', this.change));
    this.panel.addEventListener('keydown', this.keydown);
  }
  setSound(enabled: boolean): void { this.values.soundEnabled = enabled; this.save(); }
  private save(): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.values)); } catch { /* Keep session settings if storage is denied. */ } }
  private apply(): void {
    this.input.setTouchSettings(this.values.sensitivity, this.values.fireMode);
    this.slider.value = String(this.values.sensitivity);
    this.output.textContent = `${this.values.sensitivity.toFixed(1)} 倍`;
    this.modes.forEach(mode => { mode.checked = mode.value === this.values.fireMode; });
    document.body.dataset.fireMode = this.values.fireMode;
  }
  private readonly change = (): void => {
    this.values = normalizeSettings({ ...this.values, sensitivity: Number(this.slider.value), fireMode: this.modes.find(mode => mode.checked)?.value });
    this.apply(); this.save();
  };
  // Native range gestures do not consistently follow a rotated WebView control.
  // Keep keyboard/mouse behavior native; map touch to the visible track axis.
  private dragSlider(touch: Touch): void {
    const rect = this.slider.getBoundingClientRect();
    const rotated = window.innerHeight > window.innerWidth;
    const length = rotated ? rect.height : rect.width;
    const coordinate = rotated ? touch.clientY - rect.top : touch.clientX - rect.left;
    const inset = 12;
    const fraction = Math.max(0, Math.min(1, (coordinate - inset) / Math.max(1, length - inset * 2)));
    this.slider.value = (Math.round((0.5 + fraction * 3.5) * 10) / 10).toFixed(1);
    this.change();
  }
  private readonly sliderStart = (event: TouchEvent): void => {
    if (this.sliderTouchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault(); event.stopPropagation();
    this.sliderTouchId = touch.identifier;
    this.slider.focus(); this.dragSlider(touch);
  };
  private readonly sliderMove = (event: TouchEvent): void => {
    const touch = Array.from(event.changedTouches).find(item => item.identifier === this.sliderTouchId);
    if (!touch) return;
    event.preventDefault(); event.stopPropagation(); this.dragSlider(touch);
  };
  private readonly sliderEnd = (event: TouchEvent): void => {
    if (!Array.from(event.changedTouches).some(item => item.identifier === this.sliderTouchId)) return;
    event.preventDefault(); event.stopPropagation(); this.sliderTouchId = null;
  };
  private readonly open = (): void => {
    this.pause(); this.panel.hidden = false;
    this.opener.setAttribute('aria-expanded', 'true');
    this.closer.focus();
  };
  private readonly close = (): void => {
    this.sliderTouchId = null;
    this.panel.hidden = true; this.opener.setAttribute('aria-expanded', 'false');
    this.resume(); this.opener.focus();
  };
  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.panel.querySelectorAll<HTMLElement>('button:not(:disabled), input'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  dispose(): void {
    this.opener.removeEventListener('click', this.open); this.closer.removeEventListener('click', this.close);
    this.slider.removeEventListener('input', this.change);
    this.slider.removeEventListener('touchstart', this.sliderStart);
    this.slider.removeEventListener('touchmove', this.sliderMove);
    this.slider.removeEventListener('touchend', this.sliderEnd);
    this.slider.removeEventListener('touchcancel', this.sliderEnd);
    this.modes.forEach(mode => mode.removeEventListener('change', this.change));
    this.panel.removeEventListener('keydown', this.keydown);
  }
}
