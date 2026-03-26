/**
 * ESCメニュー（一時停止画面）
 * 再開 / インベントリ / 保存 / ロード
 */
export class PauseMenu {
  private container: HTMLDivElement;
  private _visible = false;

  private _onResume: (() => void) | null = null;
  private _onInventory: (() => void) | null = null;
  private _onSave: (() => void) | null = null;
  private _onLoad: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'pause-menu';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 100;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(30, 30, 40, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 32px 48px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 200px;
    `;

    // タイトル
    const title = document.createElement('div');
    title.textContent = 'PAUSED';
    title.style.cssText = `
      color: white;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 16px;
      letter-spacing: 4px;
    `;
    panel.appendChild(title);

    // ボタン
    const buttons: [string, () => void][] = [
      ['Resume', () => this._onResume?.()],
      ['Inventory', () => this._onInventory?.()],
      ['Save Map', () => this._onSave?.()],
      ['Load Map', () => this._onLoad?.()],
    ];

    for (const [label, handler] of buttons) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        padding: 10px 24px;
        font-size: 16px;
        color: white;
        background: rgba(80, 80, 100, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(100, 120, 180, 0.9)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(80, 80, 100, 0.8)';
      });
      btn.addEventListener('click', handler);
      panel.appendChild(btn);
    }

    this.container.appendChild(panel);
    document.body.appendChild(this.container);
  }

  get visible(): boolean {
    return this._visible;
  }

  show(): void {
    this._visible = true;
    this.container.style.display = 'flex';
  }

  hide(): void {
    this._visible = false;
    this.container.style.display = 'none';
  }

  onResume(cb: () => void): void { this._onResume = cb; }
  onInventory(cb: () => void): void { this._onInventory = cb; }
  onSave(cb: () => void): void { this._onSave = cb; }
  onLoad(cb: () => void): void { this._onLoad = cb; }
}
