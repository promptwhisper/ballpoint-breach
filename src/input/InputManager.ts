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

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.clearHeld);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  requestPointerLock(): Promise<boolean> {
    return attemptPointerLock(this.canvas);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  get controlsActive(): boolean {
    return this.pointerLocked || this.pointerFallback;
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

  consumeFrame(): InputFrame {
    const frame: InputFrame = {
      moveX: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      moveZ: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.clearHeld);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') this.jumpPressed = true;
    if (event.code === 'KeyR') this.reloadPressed = true;
    if (event.code === 'KeyQ') this.grapplePressed = true;
    if (event.code === 'Enter') this.restartPressed = true;
    if (event.code === 'Escape') this.pausePressed = true;
    if (/^Digit[1-5]$/.test(event.code)) this.weaponSelection = Number(event.code.at(-1));
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
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
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled || !this.controlsActive) return;
    event.preventDefault();
    this.weaponWheel = event.deltaY > 0 ? 1 : -1;
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly clearHeld = (): void => {
    this.keys.clear();
    this.primary = false;
    this.primaryPressed = false;
    this.secondary = false;
    this.lookX = 0;
    this.lookY = 0;
    this.pausePressed = false;
  };
}
