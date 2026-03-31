/**
 * iPad / タッチデバイス向けバーチャルパッド＋カメラドラッグ
 * - 左下固定: バーチャルジョイスティック（移動）— 常時表示
 * - それ以外: ドラッグでカメラ回転 / タップでブロック設置 / 長押しでブロック破壊
 *   タップ・長押しはタッチ位置からレイキャストする（カメラ中心ではない）
 */

const MAX_RADIUS = 60;       // ジョイスティック最大半径（px）
const DEAD_ZONE = 0.15;      // デッドゾーン（0〜1）
const TAP_MAX_DURATION = 300; // 短タップ判定の最大時間（ms）
const TAP_MAX_MOVE = 12;     // 短タップ判定の最大累積移動量（px）
const DRAG_START_MOVE = 8;   // ドラッグと判定する移動量（px）
const JOYSTICK_CX = 90;      // パッド中心X（画面左端から）
const JOYSTICK_CY_RATIO = 0.72; // パッド中心Y（画面高さに対する比率）
const JOYSTICK_TOUCH_RADIUS = 90; // パッド入力受付半径（px）

export class TouchControls {
  // ジョイスティック出力（-1〜1）
  axisX = 0;
  axisY = 0;

  // カメラドラッグ出力（ピクセル差分、毎フレームリセット）
  cameraDX = 0;
  cameraDY = 0;

  // ブロック操作出力
  private _touchTap = false;      // 短タップ（1フレーム）
  private _touchHeld = false;     // 長押し中（ドラッグ未開始時のみ）
  touchHeldDuration = 0;          // 長押し経過時間（秒）

  // タッチ位置（タップ・長押し用レイキャスト座標）
  touchRayX = -1;
  touchRayY = -1;

  // タッチ状態管理
  private joystickTouchId: number | null = null;
  private joystickCX = JOYSTICK_CX;
  private joystickCY = 0;

  private cameraTouchId: number | null = null;
  private cameraPrevX = 0;
  private cameraPrevY = 0;
  private cameraStartTime = 0;
  private cameraTotalMove = 0;
  private _isDragging = false;

  // ビジュアル要素
  private outerRing: HTMLDivElement;
  private innerThumb: HTMLDivElement;

  // アクティブ状態
  private _active = false;

  constructor() {
    // パッド中心Y を計算
    this.joystickCY = window.innerHeight * JOYSTICK_CY_RATIO;

    // ジョイスティックのビジュアル要素（常時表示）
    this.outerRing = document.createElement('div');
    this.outerRing.style.cssText = `
      position: fixed;
      width: ${MAX_RADIUS * 2}px;
      height: ${MAX_RADIUS * 2}px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      z-index: 200;
      display: block;
      box-sizing: border-box;
    `;
    this.positionOuter();
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
      display: block;
      transition: left 0.1s, top 0.1s;
    `;
    this.positionThumbCenter();
    document.body.appendChild(this.innerThumb);

    // タッチイベント登録
    document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onTouchEnd(e));
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e));

    // リサイズでパッド位置を再計算
    window.addEventListener('resize', () => {
      this.joystickCY = window.innerHeight * JOYSTICK_CY_RATIO;
      this.positionOuter();
      if (this.joystickTouchId === null) {
        this.positionThumbCenter();
      }
    });
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
    return el.closest('[data-hud]') !== null;
  }

  /** タッチ位置がジョイスティック範囲内かどうか */
  private isInJoystickArea(clientX: number, clientY: number): boolean {
    const dx = clientX - this.joystickCX;
    const dy = clientY - this.joystickCY;
    return Math.sqrt(dx * dx + dy * dy) <= JOYSTICK_TOUCH_RADIUS;
  }

  private onTouchStart(e: TouchEvent): void {
    this._active = true;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      // UI要素の上ならスキップ
      if (this.isHudElement(touch.target)) continue;

      if (this.joystickTouchId === null && this.isInJoystickArea(touch.clientX, touch.clientY)) {
        // ジョイスティック入力
        this.joystickTouchId = touch.identifier;
        this.axisX = 0;
        this.axisY = 0;
        // サムのトランジションを一時無効化（即座に追従させる）
        this.innerThumb.style.transition = 'none';
        e.preventDefault();
      } else if (this.cameraTouchId === null) {
        // カメラ + ブロック操作
        this.cameraTouchId = touch.identifier;
        this.cameraPrevX = touch.clientX;
        this.cameraPrevY = touch.clientY;
        this.cameraStartTime = performance.now();
        this.cameraTotalMove = 0;
        this._isDragging = false;
        // タッチ位置を記録（レイキャスト用）
        this.touchRayX = touch.clientX;
        this.touchRayY = touch.clientY;
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
        // ジョイスティック更新（固定中心からの差分）
        const dx = touch.clientX - this.joystickCX;
        const dy = touch.clientY - this.joystickCY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, MAX_RADIUS);
        const normalized = clampedDist / MAX_RADIUS;

        if (normalized < DEAD_ZONE) {
          this.axisX = 0;
          this.axisY = 0;
        } else {
          const angle = Math.atan2(dy, dx);
          const remapped = (normalized - DEAD_ZONE) / (1 - DEAD_ZONE);
          this.axisX = Math.cos(angle) * remapped;
          this.axisY = -Math.sin(angle) * remapped; // Y軸反転（上がforward=正）
        }

        // サムのビジュアル更新
        const scale = dist > 0 ? clampedDist / dist : 0;
        const thumbX = this.joystickCX + dx * scale;
        const thumbY = this.joystickCY + dy * scale;
        this.innerThumb.style.left = `${thumbX - 25}px`;
        this.innerThumb.style.top = `${thumbY - 25}px`;
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

        // 移動量を蓄積
        this.cameraTotalMove += Math.abs(dx) + Math.abs(dy);

        // ドラッグ開始判定
        if (!this._isDragging && this.cameraTotalMove >= DRAG_START_MOVE) {
          this._isDragging = true;
          // ドラッグ確定 → 長押しを無効化
          this._touchHeld = false;
          this.touchHeldDuration = 0;
        }

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
        // サムを中心に戻す（トランジション付き）
        this.innerThumb.style.transition = 'left 0.1s, top 0.1s';
        this.positionThumbCenter();
      }

      if (touch.identifier === this.cameraTouchId) {
        const elapsed = performance.now() - this.cameraStartTime;

        // 短タップ判定（ドラッグでなかった場合のみ）
        if (!this._isDragging && elapsed < TAP_MAX_DURATION && this.cameraTotalMove < TAP_MAX_MOVE) {
          this._touchTap = true;
          // touchRayX/Y は onTouchStart で記録した座標をそのまま使用
        }

        this.cameraTouchId = null;
        this._touchHeld = false;
        this.touchHeldDuration = 0;
        this._isDragging = false;
      }
    }
  }

  // --- ビジュアル ---

  private positionOuter(): void {
    this.outerRing.style.left = `${this.joystickCX - MAX_RADIUS}px`;
    this.outerRing.style.top = `${this.joystickCY - MAX_RADIUS}px`;
  }

  private positionThumbCenter(): void {
    this.innerThumb.style.left = `${this.joystickCX - 25}px`;
    this.innerThumb.style.top = `${this.joystickCY - 25}px`;
  }

  /** 毎フレーム呼ばれる（長押し時間の更新） */
  update(dt: number): void {
    if (this._touchHeld && this.cameraTouchId !== null && !this._isDragging) {
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
