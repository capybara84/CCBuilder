export class InputManager {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  private _locked = false;

  // マウスボタン状態
  private _mouseLeft = false;
  private _mouseLeftJustPressed = false;
  mouseLeftDuration = 0;
  private _mouseLeftFired = false; // 長押し発火済みフラグ

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    // マウスボタン
    document.addEventListener('mousedown', (e) => {
      if (!this._locked) return;
      if (e.button === 0) {
        this._mouseLeft = true;
        this._mouseLeftJustPressed = true;
        this.mouseLeftDuration = 0;
        this._mouseLeftFired = false;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._mouseLeft = false;
        this.mouseLeftDuration = 0;
        this._mouseLeftFired = false;
      }
    });

    // クリックで Pointer Lock
    canvas.addEventListener('click', () => {
      if (!this._locked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === canvas;
    });
  }

  get locked(): boolean {
    return this._locked;
  }

  get mouseLeft(): boolean {
    return this._mouseLeft;
  }

  get mouseLeftJustPressed(): boolean {
    return this._mouseLeftJustPressed;
  }

  /** 長押し発火済みかどうか */
  get mouseLeftFired(): boolean {
    return this._mouseLeftFired;
  }

  set mouseLeftFired(v: boolean) {
    this._mouseLeftFired = v;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** フレーム更新（dt秒） */
  update(dt: number): void {
    if (this._mouseLeft) {
      this.mouseLeftDuration += dt;
    }
  }

  // フレーム末尾でデルタをリセット
  resetDelta(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._mouseLeftJustPressed = false;
  }
}
