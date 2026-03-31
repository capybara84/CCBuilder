import { ModeButton } from './ModeButton';
import { Hotbar } from './Hotbar';
import { PauseMenu } from './PauseMenu';
import { Inventory } from './Inventory';
import { GameMode } from '../game/Player';

const BTN_STYLE = `
  padding: 10px 18px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  font-weight: bold;
  cursor: pointer;
  outline: none;
  background: rgba(0,0,0,0.45);
  color: rgba(255,255,255,0.85);
  transition: background 0.15s;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
`;

export class HUD {
  readonly modeButton: ModeButton;
  readonly hotbar: Hotbar;
  readonly pauseMenu: PauseMenu;
  readonly inventory: Inventory;

  // 時刻表示
  private timeDisplay: HTMLDivElement;

  // タッチ用ボタン
  readonly menuButton: HTMLButtonElement;
  readonly inventoryButton: HTMLButtonElement;

  private _onMenu: (() => void) | null = null;
  private _onInventory: (() => void) | null = null;

  constructor() {
    this.createCrosshair();
    this.modeButton = new ModeButton();
    this.hotbar = new Hotbar();
    this.pauseMenu = new PauseMenu();
    this.inventory = new Inventory();

    // 左上: MENU ボタン
    this.menuButton = this.createButton('MENU', {
      position: 'fixed',
      top: '16px',
      left: '16px',
      zIndex: '20',
    });
    this.menuButton.dataset.hud = 'true';
    this.menuButton.addEventListener('click', () => this._onMenu?.());
    this.menuButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onMenu?.();
    });

    // INVENTORY ボタン
    this.inventoryButton = this.createButton('INVENTORY', {
      position: 'fixed',
      bottom: '145px',
      right: '16px',
      zIndex: '20',
    });
    this.inventoryButton.dataset.hud = 'true';
    this.inventoryButton.addEventListener('click', () => this._onInventory?.());
    this.inventoryButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onInventory?.();
    });

    this.timeDisplay = this.createTimeDisplay();
    this.createHelpHint();
  }

  /** モード変更コールバックを設定 */
  onModeChange(cb: (mode: GameMode) => void): void {
    this.modeButton.onModeChange(cb);
  }

  onMenu(cb: () => void): void { this._onMenu = cb; }
  onInventoryButton(cb: () => void): void { this._onInventory = cb; }

  private createButton(label: string, posStyle: Record<string, string>): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = BTN_STYLE;
    for (const [key, val] of Object.entries(posStyle)) {
      (btn.style as any)[key] = val;
    }
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(60,80,120,0.7)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(0,0,0,0.45)';
    });
    document.body.appendChild(btn);
    return btn;
  }

  private createCrosshair(): void {
    const el = document.createElement('div');
    el.id = 'crosshair';
    el.dataset.hud = 'true';
    el.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      pointer-events: none;
      z-index: 10;
    `;
    const h = document.createElement('div');
    h.style.cssText = `
      position: absolute; top: 50%; left: 0; width: 100%; height: 2px;
      background: white; transform: translateY(-50%);
      mix-blend-mode: difference;
    `;
    const v = document.createElement('div');
    v.style.cssText = `
      position: absolute; left: 50%; top: 0; height: 100%; width: 2px;
      background: white; transform: translateX(-50%);
      mix-blend-mode: difference;
    `;
    el.appendChild(h);
    el.appendChild(v);
    document.body.appendChild(el);
  }

  /** 時刻表示を更新（timeOfDay: 0〜1） */
  updateTime(timeOfDay: number): void {
    // 0=6:00(日の出), 0.25=12:00(正午), 0.5=18:00(日没), 0.75=0:00(深夜)
    const hours = Math.floor((timeOfDay * 24 + 6) % 24);
    const minutes = Math.floor(((timeOfDay * 24 + 6) % 1) * 60);
    this.timeDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private createTimeDisplay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      top: 54px;
      right: 16px;
      color: rgba(255,255,255,0.8);
      font-size: 14px;
      font-family: monospace;
      font-weight: bold;
      pointer-events: none;
      z-index: 20;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.6);
    `;
    el.textContent = '12:00';
    document.body.appendChild(el);
    return el;
  }

  private createHelpHint(): void {
    const el = document.createElement('div');
    el.id = 'save-hint';
    el.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
      font-family: monospace;
      pointer-events: none;
      z-index: 10;
      text-align: right;
      line-height: 1.6;
    `;
    el.innerHTML = 'Q: Menu | E: Inventory | F: Mode | Space: Jump';
    document.body.appendChild(el);
  }
}
