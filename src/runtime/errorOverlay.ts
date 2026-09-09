export function installErrorOverlay(): void {
  window.addEventListener('error', event => {
    console.error('Game runtime error:', event.error ?? event.message);
    let panel = document.querySelector<HTMLElement>('#runtime-error');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'runtime-error';
      panel.setAttribute('role', 'alert');
      document.body.append(panel);
    }
    panel.textContent = '墨境暂时遇到问题，请刷新页面重试。';
  });
}
