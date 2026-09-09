export interface InputFrame {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  primary: boolean;
  secondary: boolean;
  jumpPressed: boolean;
  reloadPressed: boolean;
  grapplePressed: boolean;
  restartPressed: boolean;
  weaponSelection: number | null;
  weaponWheel: -1 | 0 | 1;
  lookX: number;
  lookY: number;
  pointerLocked: boolean;
  controlsActive: boolean;
  pausePressed: boolean;
}

export interface JoystickVector {
  moveX: number;
  moveZ: number;
}

export function resolveJoystickDelta(
  deltaX: number,
  deltaY: number,
  internallyRotated: boolean,
  maxDistance: number,
): JoystickVector {
  const localX = internallyRotated ? deltaY : deltaX;
  const localY = internallyRotated ? -deltaX : deltaY;
  const distance = Math.hypot(localX, localY);
  const radius = Math.max(1, maxDistance);
  if (distance < radius * 0.1) return { moveX: 0, moveZ: 0 };
  const strength = Math.min(1, distance / radius);
  return {
    moveX: (localX / distance) * strength,
    moveZ: (-localY / distance) * strength,
  };
}

export function isRightInteractionZone(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const internallyRotated = viewportHeight > viewportWidth;
  const logicalX = internallyRotated ? clientY : clientX;
  const logicalWidth = internallyRotated ? viewportHeight : viewportWidth;
  return logicalX >= logicalWidth * 0.48;
}

const TOUCH_FIRE_MOVE_THRESHOLD = 10;
const TOUCH_FIRE_HOLD_MS = 160;

interface PointerLockDocument {
  readonly pointerLockElement: Element | null;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/** Attempts Pointer Lock without leaking a rejected browser promise to the console. */
export function attemptPointerLock(
  canvas: HTMLCanvasElement,
  pointerDocument: PointerLockDocument = document,
  timeoutMs = 350,
): Promise<boolean> {
  if (pointerDocument.pointerLockElement === canvas) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (locked: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      pointerDocument.removeEventListener('pointerlockchange', onChange);
      pointerDocument.removeEventListener('pointerlockerror', onError);
      resolve(locked);
    };
    const onChange = (): void => finish(pointerDocument.pointerLockElement === canvas);
    const onError = (): void => finish(false);

    pointerDocument.addEventListener('pointerlockchange', onChange);
    pointerDocument.addEventListener('pointerlockerror', onError);
    timer = setTimeout(() => finish(pointerDocument.pointerLockElement === canvas), Math.max(0, timeoutMs));

    try {
      const request = canvas.requestPointerLock();
      if (request && typeof request.then === 'function') {
        void request.then(() => {
          if (pointerDocument.pointerLockElement === canvas) finish(true);
        }).catch(() => finish(false));
      }
    } catch {
      finish(false);
    }
  });
}

export class InputManager {
  private readonly keys = new Set<string>();
  private primary = false;
  private primaryPressed = false;
  private secondary = false;
  private jumpPressed = false;
  private reloadPressed = false;
  private grapplePressed = false;
  private restartPressed = false;
  private weaponSelection: number | null = null;
  private weaponWheel: -1 | 0 | 1 = 0;
  private lookX = 0;
  private lookY = 0;
  private enabled = true;
  private pointerFallback = false;
  private pausePressed = false;
  private touchLookId: number | null = null;
  private touchLookX = 0;
  private touchLookY = 0;
  private touchLookStartX = 0;
  private touchLookStartY = 0;
  private touchLookMoved = false;
  private touchLookCanFire = false;
  private touchLookFiring = false;
  private touchFireTimer: number | null = null;
  private touchSensitivity = 1.8;
  private fireMode: 'screen' | 'button' = 'screen';
  private buttonFireId: number | null = null;
  private joystickTouchId: number | null = null;
  private joystickStartX = 0;
  private joystickStartY = 0;
  private joystickMoveX = 0;
  private joystickMoveZ = 0;
  private readonly joystickElement: HTMLElement | null;
  private readonly joystickThumb: HTMLElement | null;
  private readonly touchButtons: HTMLElement[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.clearHeld);
    window.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('touchstart', this.onTouchLookStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchLookMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchLookEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.onTouchLookEnd, { passive: false });
    this.joystickElement = document.querySelector<HTMLElement>('[data-touch-joystick]');
    this.joystickThumb = this.joystickElement?.querySelector<HTMLElement>('.touch-stick') ?? null;
    this.joystickElement?.addEventListener('touchstart', this.onJoystickStart, { passive: false });
    this.joystickElement?.addEventListener('touchmove', this.onJoystickMove, { passive: false });
    this.joystickElement?.addEventListener('touchend', this.onJoystickEnd, { passive: false });
    this.joystickElement?.addEventListener('touchcancel', this.onJoystickEnd, { passive: false });
    document.querySelectorAll<HTMLElement>('[data-touch-action]').forEach((button) => {
      button.addEventListener('touchstart', this.onTouchButtonStart, { passive: false });
      button.addEventListener('touchend', this.onTouchButtonEnd, { passive: false });
      button.addEventListener('touchcancel', this.onTouchButtonEnd, { passive: false });
      this.touchButtons.push(button);
    });
  }

  get pointerLocked(): boolean {
    return false;
  }

  get controlsActive(): boolean {
    return this.pointerFallback;
  }

  get usingPointerFallback(): boolean {
    return this.pointerFallback;
  }

  setPointerFallback(value: boolean): void {
    if (this.pointerFallback === value) return;
    this.pointerFallback = value;
    if (!value) this.clearHeld();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.clearHeld();
  }

  setTouchSettings(sensitivity: number, fireMode: 'screen' | 'button'): void {
    this.clearHeld();
    this.touchSensitivity = Number.isFinite(sensitivity) ? Math.max(0.5, Math.min(4, sensitivity)) : 1.8;
    this.fireMode = fireMode;
  }

  consumeFrame(): InputFrame {
    const keyboardX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const keyboardZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const frame: InputFrame = {
      moveX: Math.max(-1, Math.min(1, keyboardX + this.joystickMoveX)),
      moveZ: Math.max(-1, Math.min(1, keyboardZ + this.joystickMoveZ)),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
        || (this.joystickMoveZ > 0.82 && Math.hypot(this.joystickMoveX, this.joystickMoveZ) > 0.9),
      primary: this.primary || this.primaryPressed,
      secondary: this.secondary,
      jumpPressed: this.jumpPressed,
      reloadPressed: this.reloadPressed,
      grapplePressed: this.grapplePressed,
      restartPressed: this.restartPressed,
      weaponSelection: this.weaponSelection,
      weaponWheel: this.weaponWheel,
      lookX: this.lookX,
      lookY: this.lookY,
      pointerLocked: this.pointerLocked,
      controlsActive: this.controlsActive,
      pausePressed: this.pausePressed,
    };
    this.jumpPressed = false;
    this.reloadPressed = false;
    this.grapplePressed = false;
    this.restartPressed = false;
    this.weaponSelection = null;
    this.weaponWheel = 0;
    this.primaryPressed = false;
    this.lookX = 0;
    this.lookY = 0;
    this.pausePressed = false;
    return frame;
  }

  dispose(): void {
    this.cancelTouchFireTimer();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.clearHeld);
    window.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('touchstart', this.onTouchLookStart);
    this.canvas.removeEventListener('touchmove', this.onTouchLookMove);
    this.canvas.removeEventListener('touchend', this.onTouchLookEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchLookEnd);
    this.joystickElement?.removeEventListener('touchstart', this.onJoystickStart);
    this.joystickElement?.removeEventListener('touchmove', this.onJoystickMove);
    this.joystickElement?.removeEventListener('touchend', this.onJoystickEnd);
    this.joystickElement?.removeEventListener('touchcancel', this.onJoystickEnd);
    this.touchButtons.forEach((button) => {
      button.removeEventListener('touchstart', this.onTouchButtonStart);
      button.removeEventListener('touchend', this.onTouchButtonEnd);
      button.removeEventListener('touchcancel', this.onTouchButtonEnd);
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement | null)?.closest?.('#settings-panel, #settings-toggle')) return;
    if (!this.enabled) return;
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') this.jumpPressed = true;
    if (event.code === 'KeyR') this.reloadPressed = true;
    if (event.code === 'KeyQ') this.grapplePressed = true;
    if (event.code === 'Enter') this.restartPressed = true;
    if (event.code === 'Escape') this.pausePressed = true;
    if (/^Digit[1-5]$/.test(event.code)) this.weaponSelection = Number(event.code.charAt(event.code.length - 1));
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if ((event.target as HTMLElement | null)?.closest?.('button')) return;
    if (!this.enabled || !this.controlsActive) return;
    if (event.button === 0) {
      this.primary = true;
      this.primaryPressed = true;
    }
    if (event.button === 2) this.secondary = true;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.primary = false;
    if (event.button === 2) this.secondary = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled || !this.controlsActive) return;
    if (window.innerHeight > window.innerWidth) {
      this.lookX += event.movementY;
      this.lookY -= event.movementX;
    } else {
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled || !this.controlsActive) return;
    event.preventDefault();
    this.weaponWheel = event.deltaY > 0 ? 1 : -1;
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly onTouchLookStart = (event: TouchEvent): void => {
    if (!this.enabled || !this.controlsActive || this.touchLookId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    this.touchLookId = touch.identifier;
    this.touchLookX = touch.clientX;
    this.touchLookY = touch.clientY;
    this.touchLookStartX = touch.clientX;
    this.touchLookStartY = touch.clientY;
    this.touchLookMoved = false;
    this.touchLookFiring = false;
    this.touchLookCanFire = this.fireMode === 'screen' && isRightInteractionZone(
      touch.clientX,
      touch.clientY,
      window.innerWidth,
      window.innerHeight,
    );
    if (this.touchLookCanFire) {
      const touchId = touch.identifier;
      this.touchFireTimer = window.setTimeout(() => {
        this.touchFireTimer = null;
        if (!this.enabled || !this.controlsActive || this.touchLookId !== touchId || this.touchLookMoved) return;
        this.touchLookFiring = true;
        this.primary = true;
        this.primaryPressed = true;
      }, TOUCH_FIRE_HOLD_MS);
    }
  };

  private readonly onTouchLookMove = (event: TouchEvent): void => {
    if (!this.enabled || this.touchLookId === null) return;
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === this.touchLookId);
    if (!touch) return;
    event.preventDefault();
    const deltaX = touch.clientX - this.touchLookX;
    const deltaY = touch.clientY - this.touchLookY;
    const totalX = touch.clientX - this.touchLookStartX;
    const totalY = touch.clientY - this.touchLookStartY;
    if (!this.touchLookMoved && Math.hypot(totalX, totalY) >= TOUCH_FIRE_MOVE_THRESHOLD) {
      this.touchLookMoved = true;
      if (!this.touchLookFiring) this.cancelTouchFireTimer();
    }
    if (window.innerHeight > window.innerWidth) {
      this.lookX += deltaY * 0.9 * this.touchSensitivity;
      this.lookY -= deltaX * 0.9 * this.touchSensitivity;
    } else {
      this.lookX += deltaX * 0.9 * this.touchSensitivity;
      this.lookY += deltaY * 0.9 * this.touchSensitivity;
    }
    this.touchLookX = touch.clientX;
    this.touchLookY = touch.clientY;
  };

  private readonly onTouchLookEnd = (event: TouchEvent): void => {
    if (this.touchLookId === null) return;
    const ended = Array.from(event.changedTouches).some((touch) => touch.identifier === this.touchLookId);
    if (!ended) return;
    event.preventDefault();
    if (this.touchLookFiring) {
      this.primary = false;
    } else if (this.touchLookCanFire && !this.touchLookMoved && event.type !== 'touchcancel') {
      this.primaryPressed = true;
    }
    this.resetTouchLook();
  };

  private readonly onJoystickStart = (event: TouchEvent): void => {
    if (!this.enabled || this.joystickTouchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    event.stopPropagation();
    this.joystickTouchId = touch.identifier;
    this.joystickStartX = touch.clientX;
    this.joystickStartY = touch.clientY;
    this.joystickElement?.classList.add('active');
  };

  private readonly onJoystickMove = (event: TouchEvent): void => {
    if (!this.enabled || this.joystickTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === this.joystickTouchId);
    if (!touch) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = this.joystickElement?.getBoundingClientRect();
    const radius = Math.max(24, Math.min(bounds?.width ?? 100, bounds?.height ?? 100) * 0.34);
    const movement = resolveJoystickDelta(
      touch.clientX - this.joystickStartX,
      touch.clientY - this.joystickStartY,
      window.innerHeight > window.innerWidth,
      radius,
    );
    this.joystickMoveX = movement.moveX;
    this.joystickMoveZ = movement.moveZ;
    this.joystickElement?.classList.toggle('sprinting', movement.moveZ > 0.82 && Math.hypot(movement.moveX, movement.moveZ) > 0.9);
    const thumbTravel = (this.joystickElement?.offsetWidth ?? 132) * 0.27;
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(${movement.moveX * thumbTravel}px, ${-movement.moveZ * thumbTravel}px)`;
    }
  };

  private readonly onJoystickEnd = (event: TouchEvent): void => {
    if (this.joystickTouchId === null) return;
    const ended = Array.from(event.changedTouches).some((touch) => touch.identifier === this.joystickTouchId);
    if (!ended) return;
    event.preventDefault();
    event.stopPropagation();
    this.resetJoystick();
  };

  private readonly onTouchButtonStart = (event: TouchEvent): void => {
    if (!this.enabled) return;
    event.preventDefault();
    event.stopPropagation();
    const action = (event.currentTarget as HTMLElement).dataset.touchAction;
    if (action === 'fire' && this.fireMode === 'button' && this.controlsActive) {
      this.buttonFireId = event.changedTouches[0]?.identifier ?? null;
      this.primary = true; this.primaryPressed = true;
      (event.currentTarget as HTMLElement).classList.add('active');
    }
    if (action === 'forward') this.keys.add('KeyW');
    if (action === 'back') this.keys.add('KeyS');
    if (action === 'left') this.keys.add('KeyA');
    if (action === 'right') this.keys.add('KeyD');
    if (action === 'jump') this.jumpPressed = true;
    if (action === 'grapple') this.grapplePressed = true;
    if (action === 'weapon') this.weaponWheel = 1;
    if (action === 'aim') {
      this.secondary = !this.secondary;
      (event.currentTarget as HTMLElement).classList.toggle('active', this.secondary);
    }
  };

  private readonly onTouchButtonEnd = (event: TouchEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const action = (event.currentTarget as HTMLElement).dataset.touchAction;
    if (action === 'fire' && Array.from(event.changedTouches).some(touch => touch.identifier === this.buttonFireId)) {
      this.buttonFireId = null; this.primary = false;
      (event.currentTarget as HTMLElement).classList.remove('active');
    }
    if (action === 'forward') this.keys.delete('KeyW');
    if (action === 'back') this.keys.delete('KeyS');
    if (action === 'left') this.keys.delete('KeyA');
    if (action === 'right') this.keys.delete('KeyD');
  };

  private readonly clearHeld = (): void => {
    this.buttonFireId = null;
    document.querySelector('[data-touch-action="fire"]')?.classList.remove('active');
    this.keys.clear();
    this.primary = false;
    this.primaryPressed = false;
    this.secondary = false;
    this.lookX = 0;
    this.lookY = 0;
    this.pausePressed = false;
    this.resetTouchLook();
    document.querySelector<HTMLElement>('[data-touch-action="aim"]')?.classList.remove('active');
    this.resetJoystick();
  };

  private cancelTouchFireTimer(): void {
    if (this.touchFireTimer === null) return;
    window.clearTimeout(this.touchFireTimer);
    this.touchFireTimer = null;
  }

  private resetTouchLook(): void {
    this.cancelTouchFireTimer();
    this.touchLookId = null;
    this.touchLookMoved = false;
    this.touchLookCanFire = false;
    this.touchLookFiring = false;
  }

  private resetJoystick(): void {
    this.joystickTouchId = null;
    this.joystickMoveX = 0;
    this.joystickMoveZ = 0;
    this.joystickElement?.classList.remove('active');
    this.joystickElement?.classList.remove('sprinting');
    if (this.joystickThumb) this.joystickThumb.style.transform = 'translate(0, 0)';
  }
}
