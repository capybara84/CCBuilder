/**
 * タッチデバイス専用のモード依存ボタン群
 * - JUMP（Walk モード）
 * - UP / DN（Build モード）
 * - SELECT（Build モード、G キー相当のトグル）
 * - PLACE / CANCEL（ペーストプレビュー中のみ）
 */

import { GameMode } from '../game/Player';

const IS_LARGE = window.innerWidth >= 768;
const EDGE = IS_LARGE ? 24 : 16; // 画面端からの距離

const BTN_STYLE = `
  padding: ${IS_LARGE ? '14px 22px' : '10px 18px'};
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 6px;
  font-size: ${IS_LARGE ? '16px' : '14px'};
  font-family: monospace;
  font-weight: bold;
  cursor: pointer;
  outline: none;
  background: rgba(0,0,0,0.45);
  color: rgba(255,255,255,0.85);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  min-width: ${IS_LARGE ? '60px' : '52px'};
  min-height: ${IS_LARGE ? '60px' : '52px'};
  text-align: center;
`;

export class TouchHUD {
  // Walk モード用
  private jumpButton: HTMLButtonElement;

  // Build モード用
  private upButton: HTMLButtonElement;
  private downButton: HTMLButtonElement;
  private selectButton: HTMLButtonElement;

  // ペーストプレビュー用
  private placeButton: HTMLButtonElement;
  private cancelButton: HTMLButtonElement;

  // SELECT トグル状態
  private _selectActive = false;

  // コールバック
  private _onJump: (() => void) | null = null;
  private _onUp: ((pressing: boolean) => void) | null = null;
  private _onDown: ((pressing: boolean) => void) | null = null;
  private _onSelectToggle: ((active: boolean) => void) | null = null;
  private _onPlace: (() => void) | null = null;
  private _onCancel: (() => void) | null = null;

  constructor() {
    // JUMP（Walk モード、右下）
    this.jumpButton = this.createButton('JUMP', {
      position: 'fixed',
      bottom: `calc(90px + var(--sab))`,
      right: `calc(${EDGE}px + var(--sar))`,
      zIndex: '20',
    });
    this.jumpButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onJump?.();
    });

    // SELECT（Build モード、右側 — 上下ボタンの上）
    this.selectButton = this.createButton('SELECT', {
      position: 'fixed',
      bottom: `calc(210px + var(--sab))`,
      right: `calc(${EDGE}px + var(--sar))`,
      zIndex: '20',
    });
    this.selectButton.style.display = 'none';
    this.selectButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._selectActive = !this._selectActive;
      this.updateSelectStyle();
      this._onSelectToggle?.(this._selectActive);
    });

    // ▲ UP（Build モード、右下上段）
    this.upButton = this.createButton('▲', {
      position: 'fixed',
      bottom: `calc(150px + var(--sab))`,
      right: `calc(${EDGE}px + var(--sar))`,
      zIndex: '20',
    });
    this.upButton.style.display = 'none';
    const upStart = (e: Event) => { e.preventDefault(); this._onUp?.(true); };
    const upEnd = (e: Event) => { e.preventDefault(); this._onUp?.(false); };
    this.upButton.addEventListener('touchstart', upStart);
    this.upButton.addEventListener('touchend', upEnd);
    this.upButton.addEventListener('touchcancel', upEnd);

    // ▼ DN（Build モード、右下下段）
    this.downButton = this.createButton('▼', {
      position: 'fixed',
      bottom: `calc(90px + var(--sab))`,
      right: `calc(${EDGE}px + var(--sar))`,
      zIndex: '20',
    });
    this.downButton.style.display = 'none';
    const dnStart = (e: Event) => { e.preventDefault(); this._onDown?.(true); };
    const dnEnd = (e: Event) => { e.preventDefault(); this._onDown?.(false); };
    this.downButton.addEventListener('touchstart', dnStart);
    this.downButton.addEventListener('touchend', dnEnd);
    this.downButton.addEventListener('touchcancel', dnEnd);

    // PLACE（ペーストプレビュー中、右下）
    this.placeButton = this.createButton('PLACE', {
      position: 'fixed',
      bottom: `calc(90px + var(--sab))`,
      right: `calc(100px + var(--sar))`,
      zIndex: '20',
      minWidth: '80px',
    });
    this.placeButton.style.display = 'none';
    this.placeButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onPlace?.();
    });

    // CANCEL（ペーストプレビュー中、その右横）
    this.cancelButton = this.createButton('CANCEL', {
      position: 'fixed',
      bottom: `calc(90px + var(--sab))`,
      right: `calc(${EDGE}px + var(--sar))`,
      zIndex: '20',
      minWidth: '80px',
    });
    this.cancelButton.style.display = 'none';
    this.cancelButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onCancel?.();
    });
  }

  // --- コールバック登録 ---

  onJump(cb: () => void): void { this._onJump = cb; }
  onUp(cb: (pressing: boolean) => void): void { this._onUp = cb; }
  onDown(cb: (pressing: boolean) => void): void { this._onDown = cb; }
  onSelectToggle(cb: (active: boolean) => void): void { this._onSelectToggle = cb; }
  onPlace(cb: () => void): void { this._onPlace = cb; }
  onCancel(cb: () => void): void { this._onCancel = cb; }

  // --- 状態更新 ---

  /** Walk / Build モードに応じてボタンの表示/非表示を切り替える */
  setMode(mode: GameMode): void {
    if (mode === 'walk') {
      this.jumpButton.style.display = 'block';
      this.upButton.style.display = 'none';
      this.downButton.style.display = 'none';
      this.selectButton.style.display = 'none';
      // Walk に戻ったら SELECT もリセット
      this._selectActive = false;
      this.updateSelectStyle();
    } else {
      this.jumpButton.style.display = 'none';
      this.upButton.style.display = 'block';
      this.downButton.style.display = 'block';
      this.selectButton.style.display = 'block';
    }
  }

  /** ペーストプレビュー状態を反映 */
  setPastePreview(active: boolean): void {
    this.placeButton.style.display = active ? 'block' : 'none';
    this.cancelButton.style.display = active ? 'block' : 'none';
  }

  /** SELECT の外部強制リセット */
  resetSelect(): void {
    this._selectActive = false;
    this.updateSelectStyle();
  }

  get selectActive(): boolean {
    return this._selectActive;
  }

  // --- 内部 ---

  private updateSelectStyle(): void {
    this.selectButton.style.background = this._selectActive
      ? 'rgba(80,140,60,0.75)'
      : 'rgba(0,0,0,0.45)';
  }

  private createButton(label: string, posStyle: Record<string, string>): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = BTN_STYLE;
    for (const [key, val] of Object.entries(posStyle)) {
      (btn.style as any)[key] = val;
    }
    btn.dataset.hud = 'true';
    document.body.appendChild(btn);
    return btn;
  }
}
