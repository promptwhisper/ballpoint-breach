export function installErrorOverlay(): void {
  window.addEventListener('error', (event) => {
    console.error('Game runtime error:', event.error ?? event.message);
    if (document.querySelector('#runtime-error')) return;
    const panel = document.createElement('div');
    panel.id = 'runtime-error';
    panel.setAttribute('role', 'alert');
    panel.textContent = '战场遇到了一点问题，请退出后重新打开。';
    Object.assign(panel.style, { position: 'fixed', inset: '0 0 auto 0', background: '#640b16', color: 'white', padding: '12px', zIndex: '99' });
    document.body.append(panel);
  });
}
