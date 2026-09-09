import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');

// Bake small-object density into the texture, preserving the existing V5 GLSL.
// Mirrored neighboring tiles meet at the same boundary pixels.
for (const [name, rotation] of [['weapon-dry-brush', 90], ['npc-wet-wash', 0]]) {
  const source = `assets-source/ink/${name}-source.png`;
  await sharp(source).resize(1024, 1024).webp({ quality: 90 })
    .toFile(`public/textures/ink/${name}.webp`);
  const tile = await sharp(source).rotate(rotation).resize(256, 256).png().toBuffer();
  const variants = await Promise.all([0, 1, 2, 3].map(async variant => {
    let transform = sharp(tile);
    if (variant & 1) transform = transform.flop();
    if (variant & 2) transform = transform.flip();
    return transform.toBuffer();
  }));
  const overlays = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      overlays.push({ input: variants[(x % 2) + (y % 2) * 2], left: x * 256, top: y * 256 });
    }
  }
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#ffffff' } })
    .composite(overlays).webp({ quality: 86 })
    .toFile(`public/textures/ink/${name}-hero.webp`);
}
