import { ModeButton } from './ModeButton';
import { Hotbar } from './Hotbar';
import { PauseMenu } from './PauseMenu';
import { Inventory } from './Inventory';
import { GameMode } from '../game/Player';

export class HUD {
  readonly modeButton: ModeButton;
  readonly hotbar: Hotbar;
  readonly pauseMenu: PauseMenu;
  readonly inventory: Inventory;

  constructor() {
    this.createCrosshair();
    this.createSaveHint();
    this.modeButton = new ModeButton();
    this.hotbar = new Hotbar();
    this.pauseMenu = new PauseMenu();
    this.inventory = new Inventory();
  }

  /** モード変更コールバックを設定 */
  onModeChange(cb: (mode: GameMode) => void): void {
    this.modeButton.onModeChange(cb);
  }

  private createCrosshair(): void {
    const el = document.createElement('div');
    el.id = 'crosshair';
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

  private createSaveHint(): void {
    const el = document.createElement('div');
    el.id = 'save-hint';
    el.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      font-family: monospace;
      pointer-events: none;
      z-index: 10;
      text-align: right;
      line-height: 1.6;
    `;
    el.innerHTML = 'ESC: Menu | E: Inventory<br>Ctrl+S: Save | Ctrl+O: Load';
    document.body.appendChild(el);
  }
}
