export class InputManager {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  scrollDelta = 0;
  private _scrollAccum = 0;
  private static readonly SCROLL_THRESHOLD = 150; // deltaY の累積閾値
  private _locked = false;

  // マウスボタン状態
  private _mouseLeft = false;
  private _mouseLeftJustReleased = false;
  private _mouseLeftReleaseDuration = 0; // 離した時点での押下時間
  mouseLeftDuration = 0;
  private _mouseLeftFired = false; // 長押し発火済みフラグ

  // カーソルキーによるカメラ回転（プレビュー / Pointer Lock 不可環境用）
  private static readonly ARROW_ROTATE_SPEED = 3; // rad/sec

  // Cキーによるクリック代替
  private _cKeyDown = false;
  private _cKeyJustReleased = false;
  private _cKeyReleaseDuration = 0;
  cKeyDuration = 0;
  private _cKeyFired = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      // 修飾キー付きの場合はゲーム入力として登録しない
      if (e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
      // Cキー → マウス左クリック代替
      if (e.code === 'KeyC' && !this._cKeyDown) {
        this._cKeyDown = true;
        this.cKeyDuration = 0;
        this._cKeyFired = false;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyC') {
        this._cKeyJustReleased = true;
        this._cKeyReleaseDuration = this.cKeyDuration;
        this._cKeyDown = false;
        this.cKeyDuration = 0;
        this._cKeyFired = false;
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    // スクロール（累積して閾値を超えたら1ステップ）
    document.addEventListener('wheel', (e) => {
      this._scrollAccum += e.deltaY;
      if (Math.abs(this._scrollAccum) >= InputManager.SCROLL_THRESHOLD) {
        this.scrollDelta += Math.sign(this._scrollAccum);
        this._scrollAccum = 0;
      }
    });

    // マウスボタン
    document.addEventListener('mousedown', (e) => {
      if (!this._locked) return;
      if (e.button === 0) {
        this._mouseLeft = true;
        this.mouseLeftDuration = 0;
        this._mouseLeftFired = false;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._mouseLeftJustReleased = true;
        this._mouseLeftReleaseDuration = this.mouseLeftDuration;
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
    return this._mouseLeft || this._cKeyDown;
  }

  /** 短クリック（離した瞬間 & 長押し閾値未満） */
  get mouseLeftClicked(): boolean {
    return (this._mouseLeftJustReleased && this._mouseLeftReleaseDuration < 0.3) ||
           (this._cKeyJustReleased && this._cKeyReleaseDuration < 0.3);
  }

  /** 長押し発火済みかどうか */
  get mouseLeftFired(): boolean {
    return this._mouseLeftFired || this._cKeyFired;
  }

  set mouseLeftFired(v: boolean) {
    // アクティブな入力ソースのみフラグを立てる
    if (this._mouseLeft) this._mouseLeftFired = v;
    if (this._cKeyDown) this._cKeyFired = v;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** フレーム更新（dt秒） */
  update(dt: number): void {
    if (this._mouseLeft) {
      this.mouseLeftDuration += dt;
    }
    // Cキー長押し計測
    if (this._cKeyDown) {
      this.cKeyDuration += dt;
    }
    // カーソルキーでカメラ回転（Pointer Lock 不要）
    const rotateAmount = InputManager.ARROW_ROTATE_SPEED * dt * 100;
    if (this.keys.has('ArrowLeft'))  this.mouseDX -= rotateAmount;
    if (this.keys.has('ArrowRight')) this.mouseDX += rotateAmount;
    if (this.keys.has('ArrowUp'))    this.mouseDY -= rotateAmount;
    if (this.keys.has('ArrowDown'))  this.mouseDY += rotateAmount;
  }

  // フレーム末尾でデルタをリセット
  resetDelta(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.scrollDelta = 0;
    this._mouseLeftJustReleased = false;
    this._cKeyJustReleased = false;
  }
}
