import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AudioSystem } from './AudioSystem.minitool';
import { AUDIO_CUES, type GameSound } from './clips';

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  disconnected = false;
  connect(): void {}
  disconnect(): void { this.disconnected = true; }
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; }
}
class FakeContext {
  state = 'suspended';
  destination = {};
  onstatechange: (() => void) | null = null;
  resumeCalls = 0;
  decodeCalls = 0;
  rejectedResume = false;
  deferResume = false;
  finishResume: (() => void) | null = null;
  rejectedDecode = false;
  callbacksOnly = false;
  deferred: Array<() => void> | null = null;
  sources: FakeSource[] = [];
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  resume() {
    this.resumeCalls += 1;
    if (this.rejectedResume) return Promise.reject(new Error('NotAllowedError'));
    if (this.deferResume) return new Promise<void>((resolve) => { this.finishResume = () => { this.state = 'running'; resolve(); }; });
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  decodeAudioData(bytes: ArrayBuffer, success: (value: unknown) => void, failure: (error: Error) => void) {
    this.decodeCalls += 1;
    if (this.rejectedDecode) { failure(new Error('Invalid sample')); return; }
    const value = { length: bytes.byteLength };
    if (this.deferred) { this.deferred.push(() => success(value)); return; }
    success(value);
    return this.callbacksOnly ? undefined : Promise.resolve(value);
  }
}
const settle = async () => { for (let i = 0; i < 120; i += 1) await Promise.resolve(); };
function fixture(context = new FakeContext()) {
  let time = 0;
  let creates = 0;
  const data = Object.fromEntries(Object.keys(AUDIO_CUES).map((name) => [name, 'AQID']));
  const audio = new AudioSystem(() => { creates += 1; return context as unknown as AudioContext; }, () => data, () => time);
  return { audio, context, get creates() { return creates; }, advance: (ms: number) => { time += ms; } };
}

test('mini-tool creates and resumes a context synchronously only on activation', async () => {
  const f = fixture();
  f.audio.play('rifle');
  assert.equal(f.creates, 0);
  f.audio.resume();
  assert.equal(f.creates, 1);
  assert.equal(f.context.resumeCalls, 1);
  await settle();
  assert.equal(f.audio.getStatus(), 'ready');
  assert.equal(f.context.sources.length, 0, 'prewarming never plays audio');
  f.audio.dispose();
});

test('mini-tool decodes once per cue and supports callback-only decoders', async () => {
  const context = new FakeContext();
  context.callbacksOnly = true;
  const { audio } = fixture(context);
  audio.resume();
  await settle();
  assert.equal(context.decodeCalls, Object.keys(AUDIO_CUES).length);
  for (const sound of Object.keys(AUDIO_CUES) as GameSound[]) { audio.play(sound); await settle(); }
  assert.equal(context.decodeCalls, Object.keys(AUDIO_CUES).length);
  assert.equal(context.sources.length, Object.keys(AUDIO_CUES).length);
  assert.equal(context.sources.filter((source) => !source.stopped).length, 6);
  audio.dispose();
  assert.ok(context.sources.every((source) => source.stopped && source.disconnected));
});

test('mini-tool resume rejection is caught and a later gesture retries', async () => {
  const { audio, context } = fixture();
  context.rejectedResume = true;
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'blocked');
  context.rejectedResume = false;
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  audio.dispose();
});

test('mini-tool bad decodes are evicted and recover on retry', async () => {
  const { audio, context } = fixture();
  context.rejectedDecode = true;
  audio.resume();
  await settle();
  assert.equal(audio.getStatus(), 'blocked');
  context.rejectedDecode = false;
  audio.play('rifle');
  await settle();
  assert.equal(audio.getStatus(), 'ready');
  assert.equal(context.sources.length, 1);
  audio.dispose();
});

test('mini-tool retry preview waits for a pending context resume', async () => {
  const { audio, context } = fixture();
  audio.resume();
  await settle();
  audio.suspend();
  context.deferResume = true;
  audio.resume();
  audio.play('reload');
  await settle();
  assert.equal(context.sources.length, 0);
  context.finishResume?.();
  await settle();
  assert.equal(context.sources.length, 1);
  audio.dispose();
});

test('mini-tool late decoding cannot play after mute, pause or dispose', async () => {
  for (const action of ['mute', 'pause', 'dispose']) {
    const { audio, context } = fixture();
    context.deferred = [];
    audio.resume();
    audio.play('rifle');
    await settle();
    if (action === 'mute') audio.setEnabled(false);
    else if (action === 'pause') audio.suspend();
    else audio.dispose();
    context.deferred.forEach((finish) => finish());
    await settle();
    assert.equal(context.sources.length, 0, action);
    audio.dispose();
  }
});

test('mini-tool discards stale requests instead of playing delayed gunfire', async () => {
  const f = fixture();
  f.context.deferred = [];
  f.audio.resume();
  f.audio.play('rifle');
  await settle();
  f.advance(500);
  f.context.deferred.forEach((finish) => finish());
  await settle();
  assert.equal(f.context.sources.length, 0);
  f.audio.dispose();
});

test('mini-tool coalesces waiting shots and preserves mute across gestures', async () => {
  const { audio, context } = fixture();
  context.deferred = [];
  audio.resume();
  for (let i = 0; i < 20; i += 1) audio.play('rifle');
  await settle();
  context.deferred.forEach((finish) => finish());
  await settle();
  assert.equal(context.sources.length, 1);
  audio.setEnabled(false);
  audio.resume();
  audio.play('rifle');
  await settle();
  assert.equal(audio.getStatus(), 'muted');
  assert.equal(context.sources.length, 1);
  audio.dispose();
});

test('mini-tool lacks Web Audio gracefully without breaking gameplay', () => {
  const audio = new AudioSystem(() => null, () => ({}));
  audio.resume();
  assert.equal(audio.getStatus(), 'unsupported');
  assert.doesNotThrow(() => audio.play('rifle'));
  audio.dispose();
});
