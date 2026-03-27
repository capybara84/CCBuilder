/**
 * iPad / タッチデバイス向けバーチャルパッド＋カメラドラッグ
 * - 画面左半分: バーチャルジョイスティック（移動）
 * - 画面右半分: ドラッグでカメラ回転 + タップ/長押しでブロック操作
 */

const MAX_RADIUS = 60;       // ジョイスティック最大半径（px）
const DEAD_ZONE = 0.15;      // デッドゾーン（0〜1）
const TAP_MAX_DURATION = 300; // 短タップ判定の最大時間（ms）
const TAP_MAX_MOVE = 15;     // 短タップ判定の最大移動距離（px）
const HOLD_THRESHOLD = 500;  // 長押し判定の閾値（ms）

export class TouchControls {
  // ジョイスティック出力（-1〜1）
  axisX = 0;
  axisY = 0;

  // カメラドラッグ出力（ピクセル差分、毎フレームリセット）
  cameraDX = 0;
  cameraDY = 0;

  // ブロック操作出力
  private _touchTap = false;      // 短タップ（1フレーム）
  private _touchHeld = false;     // 長押し中
  touchHeldDuration = 0;          // 長押し経過時間（秒）

  // タッチ状態管理
  private joystickTouchId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;

  private cameraTouchId: number | null = null;
  private cameraPrevX = 0;
  private cameraPrevY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;
  private cameraStartTime = 0;
  private cameraTotalMove = 0;

  // ビジュアル要素
  private outerRing: HTMLDivElement;
  private innerThumb: HTMLDivElement;

  // アクティブ状態
  private _active = false;

  constructor() {
    // ジョイスティックのビジュアル要素
    this.outerRing = document.createElement('div');
    this.outerRing.style.cssText = `
      position: fixed;
      width: ${MAX_RADIUS * 2}px;
      height: ${MAX_RADIUS * 2}px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      z-index: 200;
      display: none;
      box-sizing: border-box;
    `;
    document.body.appendChild(this.outerRing);

    this.innerThumb = document.createElement('div');
    this.innerThumb.style.cssText = `
      position: fixed;
      width: 50px;
      height: 50px;
      background: rgba(255, 255, 255, 0.35);
      border-radius: 50%;
      pointer-events: none;
      z-index: 201;
      display: none;
    `;
    document.body.appendChild(this.innerThumb);

    // タッチイベント登録
    document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onTouchEnd(e));
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
  }

  get active(): boolean {
    return this._active;
  }

  get touchTap(): boolean {
    return this._touchTap;
  }

  get touchHeld(): boolean {
    return this._touchHeld;
  }

  /** UIボタンの上かどうかを判定 */
  private isHudElement(el: EventTarget | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    // data-hud 属性を持つ要素またはその子孫
    return el.closest('[data-hud]') !== null;
  }

  private onTouchStart(e: TouchEvent): void {
    this._active = true;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      // UI要素の上ならスキップ（通常のクリックイベントに任せる）
      if (this.isHudElement(touch.target)) continue;

      const halfW = window.innerWidth / 2;

      if (touch.clientX < halfW && this.joystickTouchId === null) {
        // 左半分 → ジョイスティック
        this.joystickTouchId = touch.identifier;
        this.joystickOriginX = touch.clientX;
        this.joystickOriginY = touch.clientY;
        this.axisX = 0;
        this.axisY = 0;
        this.showJoystick(touch.clientX, touch.clientY);
        e.preventDefault();
      } else if (touch.clientX >= halfW && this.cameraTouchId === null) {
        // 右半分 → カメラ + ブロック操作
        this.cameraTouchId = touch.identifier;
        this.cameraPrevX = touch.clientX;
        this.cameraPrevY = touch.clientY;
        this.cameraStartX = touch.clientX;
        this.cameraStartY = touch.clientY;
        this.cameraStartTime = performance.now();
        this.cameraTotalMove = 0;
        this._touchHeld = true;
        this.touchHeldDuration = 0;
        e.preventDefault();
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        // ジョイスティック更新
        const dx = touch.clientX - this.joystickOriginX;
        const dy = touch.clientY - this.joystickOriginY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, MAX_RADIUS);
        const normalized = clampedDist / MAX_RADIUS;

        if (normalized < DEAD_ZONE) {
          this.axisX = 0;
          this.axisY = 0;
        } else {
          const angle = Math.atan2(dy, dx);
          // デッドゾーンを差し引いてリマップ
          const remapped = (normalized - DEAD_ZONE) / (1 - DEAD_ZONE);
          this.axisX = Math.cos(angle) * remapped;
          this.axisY = -Math.sin(angle) * remapped; // Y軸反転（上がforward=正）
        }

        // ビジュアル更新
        this.updateThumbPosition(dx, dy, clampedDist, dist);
        e.preventDefault();
      }

      if (touch.identifier === this.cameraTouchId) {
        // カメラドラッグ
        const dx = touch.clientX - this.cameraPrevX;
        const dy = touch.clientY - this.cameraPrevY;
        this.cameraDX += dx;
        this.cameraDY += dy;
        this.cameraPrevX = touch.clientX;
        this.cameraPrevY = touch.clientY;

        // 移動量を蓄積（タップ判定用）
        this.cameraTotalMove += Math.abs(dx) + Math.abs(dy);
        e.preventDefault();
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.axisX = 0;
        this.axisY = 0;
        this.hideJoystick();
      }

      if (touch.identifier === this.cameraTouchId) {
        const elapsed = performance.now() - this.cameraStartTime;

        // 短タップ判定
        if (elapsed < TAP_MAX_DURATION && this.cameraTotalMove < TAP_MAX_MOVE) {
          this._touchTap = true;
        }

        this.cameraTouchId = null;
        this._touchHeld = false;
        this.touchHeldDuration = 0;
      }
    }
  }

  // --- ビジュアル ---

  private showJoystick(cx: number, cy: number): void {
    this.outerRing.style.display = 'block';
    this.outerRing.style.left = `${cx - MAX_RADIUS}px`;
    this.outerRing.style.top = `${cy - MAX_RADIUS}px`;

    this.innerThumb.style.display = 'block';
    this.innerThumb.style.left = `${cx - 25}px`;
    this.innerThumb.style.top = `${cy - 25}px`;
  }

  private hideJoystick(): void {
    this.outerRing.style.display = 'none';
    this.innerThumb.style.display = 'none';
  }

  private updateThumbPosition(dx: number, dy: number, clampedDist: number, rawDist: number): void {
    const scale = rawDist > 0 ? clampedDist / rawDist : 0;
    const thumbX = this.joystickOriginX + dx * scale;
    const thumbY = this.joystickOriginY + dy * scale;
    this.innerThumb.style.left = `${thumbX - 25}px`;
    this.innerThumb.style.top = `${thumbY - 25}px`;
  }

  /** 毎フレーム呼ばれる（長押し時間の更新） */
  update(dt: number): void {
    if (this._touchHeld && this.cameraTouchId !== null) {
      this.touchHeldDuration += dt;
    }
  }

  /** フレーム末にリセット */
  resetDelta(): void {
    this.cameraDX = 0;
    this.cameraDY = 0;
    this._touchTap = false;
  }
}
