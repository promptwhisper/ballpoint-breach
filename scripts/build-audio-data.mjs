// Asset compilation, not sound synthesis. MP3 originals never enter mini-tool ZIPs.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildAudioData(audioDirectory) {
  const sounds = {};
  let total = 0;
  for (const name of readdirSync(audioDirectory).filter((name) => name.endsWith('.mp3') && name !== 'unlock.mp3').sort()) {
    const bytes = readFileSync(resolve(audioDirectory, name));
    if (!bytes.length || bytes.length > 100 * 1024) throw new Error(`Invalid audio size: ${name} (${bytes.length})`);
    total += bytes.length;
    sounds[name.slice(0, -4)] = bytes.toString('base64');
  }
  if (Object.keys(sounds).length !== 25 || total > 512 * 1024) throw new Error('Expected twenty-five small samples, at most 512 KiB total.');
  return `// Downloaded samples; see audio/credits.json. Decoded in memory, never used as media URLs.\nwindow.AUDIO_DATA = ${JSON.stringify(sounds)};\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = resolve(process.argv[2] || 'public/audio');
  const output = resolve(process.argv[3] || 'dist');
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'audio-data.js'), buildAudioData(source));
}
