/** Shared, deterministic wet-ink stamp for world sprites and screen impacts. */
export function inkRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createInkStamp(size = 256, seed = 1, color = [20, 24, 23]): Uint8ClampedArray {
  const random = inkRandom(seed);
  const phase = random() * Math.PI * 2;
  const droplets = Array.from({ length: 34 }, () => {
    const angle = random() * Math.PI * 2;
    const distance = .22 + random() * .23;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
      r: .003 + random() ** 3 * .027, stretch: 1 + random() * 1.8 };
  });
  const drips = Array.from({ length: 5 }, () => ({
    x: (random() - .5) * .32, length: .21 + random() * .23, width: .002 + random() * .005,
  }));
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = (x + .5) / size - .5;
    const v = (y + .5) / size - .5;
    const angle = Math.atan2(v, u);
    const radius = Math.hypot(u, v);
    const edge = .21 + .041 * Math.sin(angle * 5 + phase) + .026 * Math.sin(angle * 9 - phase)
      + .018 * Math.sin(angle * 17 + phase) + .009 * Math.sin(angle * 39);
    const grain = random();
    const distance = radius - edge + (grain - .5) * .013;
    let alpha = Math.max(0, Math.min(1, (.026 - distance) / .05)) * .25;
    alpha = Math.max(alpha, Math.max(0, Math.min(1, -distance / .012)) * (.77 + grain * .2));
    // Uneven wet wash and exposed pinholes, not a flat disk or a Gaussian glow.
    alpha *= .81 + .19 * Math.sin(u * 42 + Math.sin(v * 33)) ** 2;
    if (grain > .983) alpha *= .2;
    for (const drop of droplets) {
      const d = Math.hypot(u - drop.x, (v - drop.y) / drop.stretch);
      alpha = Math.max(alpha, Math.max(0, Math.min(.88, (drop.r - d) * size)));
    }
    for (const drip of drips) {
      if (v < .07 || v > drip.length) continue;
      const bend = Math.sin(v * 16 + phase) * .006;
      const width = drip.width * (1.2 - v / drip.length * .7);
      alpha = Math.max(alpha, Math.max(0, 1 - Math.abs(u - drip.x - bend) / width) * .65);
    }
    const i = (y * size + x) * 4;
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2];
    data[i + 3] = Math.round(alpha * 255);
  }
  return data;
}
