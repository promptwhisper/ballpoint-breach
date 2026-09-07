import * as THREE from 'three';

function inkAsset(name: string): string {
  return `${import.meta.env.BASE_URL}textures/ink/${name}`;
}

function fallbackTexture(value: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array([value, value, value, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  return texture;
}

function loadInkTexture(path: string, fallback: number): THREE.Texture {
  if (typeof document === 'undefined') return fallbackTexture(fallback);
  const texture = new THREE.TextureLoader().load(path);
  // Mirroring hides hard joins without changing the scanned brush character.
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export const inkBrushTexture = loadInkTexture(inkAsset('ink-brush-field.webp'), 128);
export const xuanPaperTexture = loadInkTexture(inkAsset('xuan-paper.webp'), 245);

const heroTextures = new Map<'weapon' | 'npc', THREE.Texture>();

/** Shared, lazy-loaded resources: older ink versions do not request hero maps. */
export function getHeroInkTexture(role: 'weapon' | 'npc'): THREE.Texture {
  let texture = heroTextures.get(role);
  if (!texture) {
    const asset = role === 'weapon' ? 'weapon-dry-brush' : 'npc-wet-wash';
    texture = loadInkTexture(inkAsset(`${asset}-hero.webp`), 180);
    texture.name = `${role}-ink-scan`;
    heroTextures.set(role, texture);
  }
  return texture;
}

const atmosphereTextures = new Map<'ground' | 'sky', THREE.Texture>();

export function getInkAtmosphereTexture(role: 'ground' | 'sky'): THREE.Texture {
  let texture = atmosphereTextures.get(role);
  if (!texture) {
    texture = loadInkTexture(inkAsset(`pale-${role}-v5.webp`), 238);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (role === 'ground') {
      texture.repeat.set(6, 6.5);
      texture.anisotropy = 8;
    } else {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    atmosphereTextures.set(role, texture);
  }
  return texture;
}
