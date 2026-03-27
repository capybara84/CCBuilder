import { GameMode } from '../game/Player';

/**
 * 画面右上の Walk / Build モード切替ボタン
 */
export class ModeButton {
  private walkBtn: HTMLButtonElement;
  private buildBtn: HTMLButtonElement;
  private onChange: ((mode: GameMode) => void) | null = null;

  constructor() {
    const container = document.createElement('div');
    container.id = 'mode-buttons';
    container.dataset.hud = 'true';
    container.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 4px;
      z-index: 20;
      pointer-events: auto;
    `;

    this.walkBtn = this.createButton('Walk', true);
    this.buildBtn = this.createButton('Build', false);

    this.walkBtn.addEventListener('click', () => {
      this.setActive('walk');
      this.onChange?.('walk');
    });
    this.walkBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.setActive('walk');
      this.onChange?.('walk');
    });
    this.buildBtn.addEventListener('click', () => {
      this.setActive('build');
      this.onChange?.('build');
    });
    this.buildBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.setActive('build');
      this.onChange?.('build');
    });

    container.appendChild(this.walkBtn);
    container.appendChild(this.buildBtn);
    document.body.appendChild(container);
  }

  /** モード変更時のコールバックを設定 */
  onModeChange(cb: (mode: GameMode) => void): void {
    this.onChange = cb;
  }

  /** 外部からアクティブ表示を更新 */
  setActive(mode: GameMode): void {
    const activeStyle = 'background: #4CAF50; color: white;';
    const inactiveStyle = 'background: rgba(0,0,0,0.5); color: #ccc;';
    this.walkBtn.style.cssText = this.baseStyle() + (mode === 'walk' ? activeStyle : inactiveStyle);
    this.buildBtn.style.cssText = this.baseStyle() + (mode === 'build' ? activeStyle : inactiveStyle);
  }

  private createButton(label: string, active: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    const activeStyle = 'background: #4CAF50; color: white;';
    const inactiveStyle = 'background: rgba(0,0,0,0.5); color: #ccc;';
    btn.style.cssText = this.baseStyle() + (active ? activeStyle : inactiveStyle);
    return btn;
  }

  private baseStyle(): string {
    return `
      padding: 6px 16px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      font-size: 14px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
      transition: background 0.15s;
    `;
  }
}
