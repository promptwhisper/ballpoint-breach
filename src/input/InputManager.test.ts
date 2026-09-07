import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptPointerLock, isRightInteractionZone, resolveJoystickDelta } from './InputManager';

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

test('joystick maps local circular movement to analog strafe and forward axes', () => {
  assert.deepEqual(resolveJoystickDelta(0, -40, false, 40), { moveX: 0, moveZ: 1 });
  assert.deepEqual(resolveJoystickDelta(40, 0, false, 40), { moveX: 1, moveZ: -0 });
});

test('joystick preserves physical directions when the game is internally rotated', () => {
  assert.deepEqual(resolveJoystickDelta(40, 0, true, 40), { moveX: 0, moveZ: 1 });
  assert.deepEqual(resolveJoystickDelta(0, 40, true, 40), { moveX: 1, moveZ: 0 });
});

test('right interaction zone follows the logical landscape axis', () => {
  assert.equal(isRightInteractionZone(600, 200, 1000, 500), true);
  assert.equal(isRightInteractionZone(400, 200, 1000, 500), false);
  assert.equal(isRightInteractionZone(200, 600, 430, 956), true);
  assert.equal(isRightInteractionZone(200, 400, 430, 956), false);
});
