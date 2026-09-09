import assert from 'node:assert/strict';
import test from 'node:test';
import { InputManager, attemptPointerLock, isRightInteractionZone, resolveJoystickDelta } from './InputManager';

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

test('touch sensitivity scales both axes and keeps portrait rotation correct', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const host = Object.assign(new EventTarget(), { innerWidth: 956, innerHeight: 430 });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null, querySelectorAll: () => [] } });
  const canvas = new EventTarget();
  const input = new InputManager(canvas as HTMLCanvasElement);
  const touch = (type: string, x: number, y: number) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'changedTouches', { value: [{ identifier: 1, clientX: x, clientY: y }] });
    canvas.dispatchEvent(event);
  };
  try {
    input.setPointerFallback(true);
    for (const sensitivity of [.5, 1, 1.8, 3, 4]) {
      input.setTouchSettings(sensitivity, 'button');
      touch('touchstart',100,100); touch('touchmove',120,110); touch('touchend',120,110);
      const frame = input.consumeFrame();
      assert.equal(frame.lookX,18*sensitivity); assert.equal(frame.lookY,9*sensitivity);
      assert.equal(frame.primary,false);
    }
    host.innerWidth=430; host.innerHeight=956;
    input.setTouchSettings(3,'button');
    touch('touchstart',100,100); touch('touchmove',120,110); touch('touchend',120,110);
    const frame=input.consumeFrame();
    assert.equal(frame.lookX,27); assert.equal(frame.lookY,-54);
  } finally {
    input.dispose();
    if (oldWindow) Object.defineProperty(globalThis,'window',oldWindow); else Reflect.deleteProperty(globalThis,'window');
    if (oldDocument) Object.defineProperty(globalThis,'document',oldDocument); else Reflect.deleteProperty(globalThis,'document');
  }
});
