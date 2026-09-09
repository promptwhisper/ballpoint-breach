export type InkVersion = 'current' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5';
export type InkV4Stage = 'a' | 'b' | 'c';

export function resolveInkVersion(search: string): InkVersion {
  const version = new URLSearchParams(search).get('inkVersion');
  return version === 'current' || version === 'v1' || version === 'v3' || version === 'v4' || version === 'v5'
    ? version : 'v2';
}

export function resolveInkV4Stage(search: string): InkV4Stage {
  const stage = new URLSearchParams(search).get('inkStage');
  return stage === 'a' || stage === 'b' ? stage : 'c';
}

const search = typeof window === 'undefined' ? '' : window.location.search;
export const ACTIVE_INK_VERSION = resolveInkVersion(search);
export const ACTIVE_INK_V4_STAGE = resolveInkV4Stage(search);

export const INK_PARAMETER_RANGES = {
  contrast: [0.5, 1.8, 0.01],
  lightInk: [0, 0.3, 0.01],
  darkInk: [0.6, 1, 0.01],
  outlineStrength: [0, 1, 0.01],
  outlineWidth: [0.5, 2.5, 0.05],
  depthEdgeWeight: [0, 2, 0.05],
  normalEdgeWeight: [0, 1, 0.01],
  noiseAmount: [0, 1, 0.01],
  lineBreakup: [0, 0.7, 0.01],
  paperStrength: [0, 1, 0.01],
  fiberScale: [0.4, 3, 0.05],
  absorption: [0, 1, 0.01],
  bleedStrength: [0, 0.6, 0.01],
  bleedRadius: [0, 0.12, 0.005],
  dryBrushStrength: [0, 0.5, 0.01],
} as const;
export type InkParameter = keyof typeof INK_PARAMETER_RANGES;

// Shared uniform objects let the optional inspector update every material and pass.
export const inkUniforms = {
  contrast: { value: 1.12 },
  lightInk: { value: 0.07 },
  darkInk: { value: 0.98 },
  outlineStrength: { value: new URLSearchParams(search).get('outline') === '0' ? 0 : 0.72 },
  outlineWidth: { value: 1.15 },
  depthEdgeWeight: { value: 1.0 },
  normalEdgeWeight: { value: 0.32 },
  noiseAmount: { value: 0.4 },
  lineBreakup: { value: 0.18 },
  paperStrength: { value: new URLSearchParams(search).get('paper') === '0' ? 0 : 0.65 },
  fiberScale: { value: 1 },
  absorption: { value: 0.46 },
  bleedStrength: { value: 0.22 },
  bleedRadius: { value: 0.035 },
  dryBrushStrength: { value: 0.16 },
};

export function setInkParameter(name: InkParameter, value: number): void {
  if (!Number.isFinite(value) || !Object.hasOwn(INK_PARAMETER_RANGES, name)) return;
  const [min, max] = INK_PARAMETER_RANGES[name];
  inkUniforms[name].value = Math.min(max, Math.max(min, value));
}
