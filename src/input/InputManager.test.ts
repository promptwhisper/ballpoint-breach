import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptPointerLock } from './InputManager';

function fakeDocument(getPointerLockElement: () => Element | null): {
  document: Parameters<typeof attemptPointerLock>[1];
  events: EventTarget;
} {
  const events = new EventTarget();
  return {
    document: {
      get pointerLockElement() {
        return getPointerLockElement();
      },
      addEventListener: (type, listener) => events.addEventListener(type, listener),
      removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    },
    events,
  };
}

test('pointer-lock rejection resolves false instead of leaking an unhandled error', async () => {
  const canvas = {
    requestPointerLock: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
  } as unknown as HTMLCanvasElement;
  const fake = fakeDocument(() => null);

  assert.equal(await attemptPointerLock(canvas, fake.document, 20), false);
});

test('pointer-lock change resolves true when the requested canvas becomes active', async () => {
  let active: Element | null = null;
  const fake = fakeDocument(() => active);
  const canvas = {
    requestPointerLock: () => {
      active = canvas as unknown as Element;
      queueMicrotask(() => fake.events.dispatchEvent(new Event('pointerlockchange')));
      return Promise.resolve();
    },
  } as unknown as HTMLCanvasElement;

  assert.equal(await attemptPointerLock(canvas, fake.document, 20), true);
});

test('legacy void pointer-lock requests can still resolve from the change event', async () => {
  let active: Element | null = null;
  const fake = fakeDocument(() => active);
  const canvas = {
    requestPointerLock: () => {
      queueMicrotask(() => {
        active = canvas as unknown as Element;
        fake.events.dispatchEvent(new Event('pointerlockchange'));
      });
      return undefined;
    },
  } as unknown as HTMLCanvasElement;

  assert.equal(await attemptPointerLock(canvas, fake.document, 20), true);
});
