export type VisualStyle = 'ballpoint' | 'ink';

/** Resolves the reload-time visual style without consulting browser globals. */
export function resolveVisualStyle(search: string): VisualStyle {
  return new URLSearchParams(search).get('style') === 'ballpoint' ? 'ballpoint' : 'ink';
}

const browserSearch = typeof window === 'undefined' ? '' : window.location.search;

/** Active for the lifetime of the page; changing the query string requires a reload. */
export const ACTIVE_VISUAL_STYLE: VisualStyle = resolveVisualStyle(browserSearch);

export function isInkStyle(style: VisualStyle = ACTIVE_VISUAL_STYLE): boolean {
  return style === 'ink';
}
