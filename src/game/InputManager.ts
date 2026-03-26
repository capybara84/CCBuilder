export class InputManager {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  private _locked = false;

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

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  // フレーム末尾でデルタをリセット
  resetDelta(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
