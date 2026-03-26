import { ModeButton } from './ModeButton';
import { Hotbar } from './Hotbar';
import { GameMode } from '../game/Player';

export class HUD {
  readonly modeButton: ModeButton;
  readonly hotbar: Hotbar;

  constructor() {
    this.createCrosshair();
    this.modeButton = new ModeButton();
    this.hotbar = new Hotbar();
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
    // 十字線
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
}
