import { ACTIVE_VISUAL_STYLE } from './visualStyle';
import { ACTIVE_INK_VERSION, INK_PARAMETER_RANGES, inkUniforms, setInkParameter, type InkParameter } from './inkSettings';

export function installInkInspector(): void {
  if (ACTIVE_VISUAL_STYLE !== 'ink') return;
  document.documentElement.dataset.inkVersion = ACTIVE_INK_VERSION;
  document.documentElement.dataset.paper = inkUniforms.paperStrength.value === 0 ? 'off' : 'on';
  const controls = document.createElement('div');
  controls.id = 'ink-controls';
  const debug = new URLSearchParams(window.location.search).get('inkDebug') === '1';
  document.documentElement.dataset.inkDebug = String(debug);
  controls.hidden = !debug;
  const version = document.createElement('select');
  version.setAttribute('aria-label', '水墨画风版本');
  for (const [value, label] of [['current', '初稿'], ['v1', '一稿 · 墨色线条'], ['v2', '二稿 · 湿墨边缘'], ['v3', '三稿 · 干笔飞白'], ['v4', '四稿 · 笔触'], ['v5', '五稿 · 水墨贴图']]) {
    version.add(new Option(label, value));
  }
  version.value = ACTIVE_INK_VERSION;
  version.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('inkVersion', version.value);
    window.location.assign(url.href);
  });
  controls.append(version);
  const set = (name: InkParameter, value: number): void => {
    setInkParameter(name, value);
    if (name === 'paperStrength') document.documentElement.dataset.paper = inkUniforms.paperStrength.value === 0 ? 'off' : 'on';
  };
  Object.assign(window, { __INK_DEBUG__: {
    set,
    snapshot: () => Object.fromEntries(Object.entries(inkUniforms).map(([name, uniform]) => [name, uniform.value])),
    version: ACTIVE_INK_VERSION,
  } });
  if (new URLSearchParams(window.location.search).get('inkDebug') === '1' && ACTIVE_INK_VERSION !== 'current') {
    const panel = document.createElement('details');
    panel.open = false;
    const summary = document.createElement('summary');
    summary.textContent = '水墨调校';
    panel.append(summary);
    for (const name of Object.keys(INK_PARAMETER_RANGES) as InkParameter[]) {
      if (name === 'dryBrushStrength' && ACTIVE_INK_VERSION !== 'v3') continue;
      if (ACTIVE_INK_VERSION === 'v1' && ['paperStrength', 'fiberScale', 'absorption', 'bleedStrength', 'bleedRadius'].includes(name)) continue;
      const label = document.createElement('label');
      const title = document.createElement('span');
      const labels: Record<InkParameter, string> = {
        contrast: '墨色对比', lightInk: '淡墨', darkInk: '浓墨', outlineStrength: '轮廓浓度',
        outlineWidth: '轮廓粗细', depthEdgeWeight: '远近边缘', normalEdgeWeight: '转折边缘',
        noiseAmount: '墨粒', lineBreakup: '断笔', paperStrength: '纸纹浓度', fiberScale: '纤维尺度',
        absorption: '吸墨', bleedStrength: '晕染浓度', bleedRadius: '晕染范围', dryBrushStrength: '飞白',
      };
      title.textContent = labels[name];
      const value = document.createElement('output');
      const slider = document.createElement('input');
      const [min, max, step] = INK_PARAMETER_RANGES[name];
      slider.type = 'range';
      slider.min = String(min); slider.max = String(max); slider.step = String(step);
      slider.value = String(inkUniforms[name].value);
      value.textContent = slider.value;
      slider.addEventListener('input', () => { set(name, Number(slider.value)); value.textContent = slider.value; });
      label.append(title, value, slider);
      panel.append(label);
    }
    controls.append(panel);
  }
  for (const type of ['pointerdown', 'mousedown', 'click', 'keydown', 'keyup', 'wheel']) {
    controls.addEventListener(type, event => event.stopPropagation());
  }
  document.body.append(controls);
}
