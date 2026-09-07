import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { AudioSystem } from './AudioSystem';
import { AUDIO_CUES } from './clips';

class FakeAudio {
  src = '';
  preload = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  readyState = 4;
  paused = true;
  plays = 0;
  loads = 0;
  blocked = false;
  result: (() => Promise<void> | undefined) | null = null;
  setAttribute(): void {}
  removeAttribute(): void { this.src = ''; }
  load(): void { this.loads += 1; }
  pause(): void { this.paused = true; }
  play(): Promise<void> | undefined {
    this.plays += 1;
    if (this.blocked) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return this.result ? this.result() : Promise.resolve();
  }
}
function fixture() {
  const elements: FakeAudio[] = [];
  const audio = new AudioSystem(() => {
    const media = new FakeAudio();
    elements.push(media);
    return media as unknown as HTMLAudioElement;
  });
  return { audio, elements };
}
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

test('no autoplay or media allocation before a user gesture', () => {
  const { audio, elements } = fixture();
  audio.play('rifle');
  assert.equal(elements.length, 0);
  assert.equal(audio.getStatus(), 'locked');
  audio.dispose();
});

test('gesture synchronously primes six unmuted local media elements', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  assert.equal(elements.length, 6);
  assert.ok(elements.every((m) => m.plays === 1 && !m.muted && m.src === './audio/unlock.mp3'));
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  assert.ok(elements.every((m) => m.paused));
  audio.resume();
  assert.ok(elements.every((m) => m.plays === 1));
  audio.dispose();
});

test('rapid fire uses a bounded pool and independent clip files', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  await settle();
  for (let i = 0; i < 80; i += 1) audio.play('rifle');
  await settle();
  assert.equal(elements.length, 6);
  assert.ok(elements.every((m) => m.src === './audio/rifle.mp3'));
  audio.play('reload');
  await settle();
  assert.ok(elements.some((m) => m.src === './audio/reload.mp3'));
  audio.dispose();
});

test('rejected autoplay is caught and retried on the next gesture', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  await settle();
  audio.suspend();
  elements.forEach((m) => { m.blocked = true; });
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'blocked');
  elements.forEach((m) => { m.blocked = false; });
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  audio.dispose();
});

test('an old prime promise cannot pause a newer shot on the same voice', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  // The prime promises are still pending here; reuse one of their voices.
  audio.play('shotgun');
  await settle();
  assert.equal(elements.filter((m) => !m.paused).length, 1);
  assert.equal(elements.find((m) => !m.paused)?.src, './audio/shotgun.mp3');
  audio.dispose();
});

test('background suspension stops playback and requires a new gesture', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  await settle();
  audio.play('sniper');
  await settle();
  audio.suspend();
  assert.ok(elements.every((m) => m.paused));
  const plays = elements.reduce((n, m) => n + m.plays, 0);
  audio.play('rifle');
  assert.equal(elements.reduce((n, m) => n + m.plays, 0), plays);
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  audio.dispose();
});

test('explicit mute survives gestures and background transitions', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  await settle();
  audio.setEnabled(false);
  audio.suspend();
  audio.resume();
  audio.play('rifle');
  assert.equal(audio.getStatus(), 'muted');
  assert.ok(elements.every((m) => m.paused && m.plays === 1));
  audio.setEnabled(true);
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  audio.dispose();
});

test('disposal cancels pending playback and releases sources', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  audio.dispose();
  await settle();
  assert.ok(elements.every((m) => m.paused && m.src === '' && m.loads === 1));
  audio.resume();
  audio.play('rifle');
  assert.equal(elements.length, 6);
});

test('legacy play returning void still stops at the clip boundary', async () => {
  const { audio, elements } = fixture();
  audio.resume();
  await settle();
  elements.forEach((m) => { m.result = () => undefined; });
  audio.play('reload');
  assert.ok(elements.some((m) => !m.paused));
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(elements.every((m) => m.paused));
  audio.dispose();
});

test('independent audio files, source attribution, and build timings are consistent', () => {
  const builder = readFileSync(new URL('../../scripts/prepare-audio.mjs', import.meta.url), 'utf8');
  Object.entries(AUDIO_CUES).forEach(([name, cue]) => {
    const bytes = statSync(new URL(`../../public/audio/${name}.mp3`, import.meta.url)).size;
    assert.ok(bytes > 1000 && bytes < 30_000);
    assert.match(builder, new RegExp(`\\['${name}', '[^']+', ${cue.duration}\\]`));
    assert.ok(cue.gain > 0 && cue.gain <= 1.5, `${name} gain must stay bounded`);
  });
  const credits = JSON.parse(readFileSync(new URL('../../public/audio/credits.json', import.meta.url), 'utf8'));
  assert.equal(credits.sources.length, 3);
  const player = readFileSync(new URL('./AudioSystem.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(player, /createOscillator|new AudioContext|fetch\(|XMLHttpRequest|data:audio|blob:/);
});

test('gameplay routes the expanded sampled feedback set', () => {
  const game = readFileSync(new URL('../game/Game.ts', import.meta.url), 'utf8');
  for (const cue of ['footstep', 'land', 'dryFire', 'weaponSwitch', 'pickup', 'enemyFire', 'worldImpact', 'enemyDeath', 'pump', 'bolt', 'waveClear', 'meleeHit', 'block']) {
    assert.match(game, new RegExp(`'${cue}'`), `missing ${cue} gameplay route`);
  }
});
