import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PlaybackSession, audioTimeout } from './PlaybackSession';
import { AudioSystem } from './AudioSystem.minitool';

test('playback session is acquired before context creation and restored on suspension', () => {
  const host = { type: 'ambient', state: 'inactive' };
  const session = new PlaybackSession(() => host);
  const audio = new AudioSystem(() => {
    assert.equal(host.type, 'playback');
    return null;
  }, () => ({}), () => 0, session);
  assert.equal(host.type, 'ambient');
  audio.resume();
  audio.suspend();
  assert.equal(host.type, 'ambient');
  audio.dispose();
});

test('repeated session activation restores the original type, not playback', () => {
  const host = { type: 'auto' };
  const session = new PlaybackSession(() => host);
  session.acquire();
  session.acquire();
  assert.equal(host.type, 'playback');
  session.release();
  assert.equal(host.type, 'auto');
  host.type = 'playback';
  session.acquire();
  session.release();
  assert.equal(host.type, 'playback', 'do not restore a session owned by another consumer');
});

test('missing or restricted session APIs are a nonfatal optional enhancement', () => {
  const absent = new PlaybackSession(() => undefined);
  assert.doesNotThrow(() => { absent.acquire(); absent.release(); });
  const denied = new PlaybackSession(() => ({
    get type() { return 'ambient'; },
    set type(_value: string) { throw new Error('NotAllowedError'); },
  }));
  assert.doesNotThrow(() => denied.acquire());
  assert.doesNotThrow(() => denied.release());
});

test('audio promise timeouts are bounded and observe late promise rejections', async () => {
  assert.equal(await audioTimeout(Promise.resolve('ok'), 'test', 20), 'ok');
  await assert.rejects(audioTimeout(new Promise(() => {}), 'Resume', 10), /Resume timed out/);
  let reject!: (reason: Error) => void;
  const task = new Promise<void>((_resolve, failure) => { reject = failure; });
  await assert.rejects(audioTimeout(task, 'Decode', 10), /Decode timed out/);
  reject(new Error('late failure'));
  await Promise.resolve();
});
