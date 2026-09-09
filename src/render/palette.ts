import * as THREE from 'three';
import { ACTIVE_VISUAL_STYLE, type VisualStyle } from './visualStyle';
import { ACTIVE_INK_VERSION } from './inkSettings';

export interface DoodlePalette {
  readonly paper: number;
  readonly paperLight: number;
  readonly paperShade: number;
  readonly ink: number;
  readonly darkInk: number;
  readonly softInk: number;
  readonly lavender: number;
  readonly red: number;
  readonly orange: number;
  readonly green: number;
}

/** Shared ink-and-paper palette sampled from the reference video. */
export const BALLPOINT_PALETTE: Readonly<DoodlePalette> = Object.freeze({
  paper: 0xf6f0dc,
  paperLight: 0xfffbeb,
  paperShade: 0xdeddd7,
  ink: 0x27348f,
  darkInk: 0x18246f,
  softInk: 0x6872b3,
  lavender: 0xb8bddd,
  red: 0xd63b55,
  orange: 0xe79a32,
  green: 0x69b887,
});

/** Warm rice paper, neutral ink, and restrained mineral-pigment accents. */
export const CURRENT_INK_PALETTE: Readonly<DoodlePalette> = Object.freeze({
  paper: 0xe8e0cf,
  paperLight: 0xeee7d8,
  paperShade: 0xded4c0,
  ink: 0x292c2b,
  darkInk: 0x151716,
  softInk: 0x666d6d,
  lavender: 0x92999a,
  red: 0xa94738,
  orange: 0xb28b50,
  green: 0x74877a,
});

export const INK_PALETTE: Readonly<DoodlePalette> = ACTIVE_INK_VERSION === 'current'
  ? CURRENT_INK_PALETTE : Object.freeze({
    ...CURRENT_INK_PALETTE,
    paper: 0xefeee7,
    paperLight: 0xf5f4ee,
    paperShade: 0xd9dad5,
  });

export function paletteForStyle(style: VisualStyle): Readonly<DoodlePalette> {
  return style === 'ballpoint' ? BALLPOINT_PALETTE : INK_PALETTE;
}

/** Compatibility name used across the game; resolves once from the page style. */
export const DOODLE_PALETTE = paletteForStyle(ACTIVE_VISUAL_STYLE);

export type DoodlePaletteKey = keyof DoodlePalette;

export function paletteColor(key: DoodlePaletteKey): THREE.Color {
  return new THREE.Color(DOODLE_PALETTE[key]);
}
