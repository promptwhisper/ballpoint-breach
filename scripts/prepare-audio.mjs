// Rebuild downloaded samples. No oscillators or synthesized effects.
// Usage: node scripts/prepare-audio.mjs /path/to/ballpoint-breach-audio/sources
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Pass the extracted source directory. See AUDIO_CREDITS.md.');
const clips = [
  ['rifle', 'guns/shots/cg1.wav', 0.57],
  ['shotgun', 'guns/shots/shotgun.wav', 1.2],
  ['revolver', 'guns/shots/pistol.wav', 0.99],
  ['sniper', 'guns/shots/rifle.wav', 1.5],
  ['katana', 'tinysized/sfx-cc0/tube-plastic-whoosh-01.wav', 0.65],
  ['hit', 'tinysized/sfx-cc0/apple-cut-01.wav', 0.55],
  ['headshot', 'tinysized/sfx-cc0/wood-twigs-break-01.wav', 0.55],
  ['reload', 'clipload1.wav', 0.5],
  ['grapple', 'tinysized/sfx-cc0/handcuffs-metal-lock-01.wav', 0.75],
  ['hurt', 'tinysized/sfx-cc0/boots-leather-jump-01.wav', 0.85],
  ['wave', 'tinysized/sfx-cc0/metal-hammer-hit-02.wav', 1.2],
  ['boss', 'tinysized/sfx-cc0/sword-clash-01.wav', 1.2],
  ['footstep', 'tinysized/sfx-cc0/boots-leather-step-01.wav', 0.28],
  ['land', 'tinysized/sfx-cc0/mud-steps-03.wav', 0.35],
  ['dryFire', 'tinysized/sfx-cc0/scissors-close-01.wav', 0.18],
  ['weaponSwitch', 'tinysized/sfx-cc0/knife-unsheathe-02.wav', 0.45],
  ['pickup', 'tinysized/sfx-cc0/coins-shake-01.wav', 0.55],
  ['enemyFire', 'guns/shots/pistol.wav', 0.3],
  ['worldImpact', 'tinysized/sfx-cc0/metal-hammer-hit-01.wav', 0.3],
  ['enemyDeath', 'tinysized/sfx-cc0/cover-paper-tear-01.wav', 0.5],
  ['pump', 'tinysized/sfx-cc0/drawer-close-01.wav', 0.38],
  ['bolt', 'tinysized/sfx-cc0/keyhole-lockbox-turn-01.wav', 0.3],
  ['waveClear', 'tinysized/sfx-cc0/chimes-wood-rattle.wav', 0.8],
  ['meleeHit', 'tinysized/sfx-cc0/apple-cut-02.wav', 0.4],
  ['block', 'tinysized/sfx-cc0/sword-clash-02.wav', 0.5],
];
const sampleRate = 44100;
function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(String(result.stderr));
  return result.stdout;
}
mkdirSync('public/audio', { recursive: true });
function encode(name, pcm) {
  ffmpeg(['-n', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0',
    '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', `public/audio/${name}.mp3`], pcm);
}
for (const [name, file, duration] of clips) {
  if (existsSync(`public/audio/${name}.mp3`)) {
    console.log(`${name}: keeping existing prepared sample`);
    continue;
  }
  const pcm = ffmpeg(['-i', resolve(source, file), '-t', String(duration), '-af',
    name === 'enemyFire' ? 'lowpass=f=5500,afade=t=out:st=0.26:d=0.04,volume=0.65'
      : `afade=t=out:st=${duration - 0.04}:d=0.04,volume=0.75`,
    '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', 'pipe:1']);
  encode(name, pcm);
  console.log(`${name}: ${file} (${duration}s)`);
}
// Silence is only an activation primer, not a synthesized game sound.
encode('unlock', Buffer.alloc(sampleRate * 2 * 0.2));
