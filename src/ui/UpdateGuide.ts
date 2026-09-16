export const UPDATE_GUIDE_KEY = 'ballpoint-ink-update-guide-controls-v1';

export class UpdateGuide {
  private readonly panel = document.querySelector<HTMLElement>('#update-guide')!;
  private readonly dismissButton = document.querySelector<HTMLButtonElement>('#update-guide-dismiss')!;

  constructor(disabled = false) {
    const hostHasBridge = Boolean((window as Window & { xhs?: { miniTool?: unknown } }).xhs?.miniTool);
    const forcedPreview = new URLSearchParams(window.location.search).get('guide') === '1';
    let seen = disabled || (!hostHasBridge && !forcedPreview);
    try { seen ||= localStorage.getItem(UPDATE_GUIDE_KEY) === 'seen'; } catch { /* Storage is optional. */ }
    this.panel.hidden = seen;
    if (!seen) this.dismissButton.focus();
    this.dismissButton.addEventListener('click', this.dismiss);
  }

  private readonly dismiss = (): void => {
    try { localStorage.setItem(UPDATE_GUIDE_KEY, 'seen'); } catch { /* Keep the guide dismissible without storage. */ }
    this.panel.hidden = true;
    document.querySelector<HTMLButtonElement>('#start-button')?.focus();
  };

  dispose(): void { this.dismissButton.removeEventListener('click', this.dismiss); }
}
