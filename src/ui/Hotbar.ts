import { BlockTypes, BlockDef } from '../voxel/BlockTypes';

/**
 * 画面下部中央のブロック選択ホットバー
 */
export class Hotbar {
  private slots: HTMLDivElement[] = [];
  private blocks: BlockDef[];
  private _selectedIndex = 0;
  private _onChange: ((blockId: number) => void) | null = null;

  constructor() {
    this.blocks = BlockTypes.all().slice(); // 全ブロック種類

    const container = document.createElement('div');
    container.id = 'hotbar';
    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      z-index: 20;
      pointer-events: auto;
    `;

    this.blocks.forEach((block, i) => {
      const slot = document.createElement('div');
      slot.style.cssText = this.slotStyle(i === 0);
      // ブロック色サンプル
      const swatch = document.createElement('div');
      swatch.style.cssText = `
        width: 28px; height: 28px;
        background: #${block.color.getHexString()};
        border-radius: 2px;
        margin-bottom: 2px;
      `;
      // ブロック名
      const label = document.createElement('div');
      label.textContent = block.name;
      label.style.cssText = `
        font-size: 9px;
        color: #ccc;
        text-align: center;
        white-space: nowrap;
      `;

      slot.appendChild(swatch);
      slot.appendChild(label);
      slot.addEventListener('click', () => this.select(i));
      container.appendChild(slot);
      this.slots.push(slot);
    });

    document.body.appendChild(container);
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  /** 選択ブロックの ID を返す */
  get selectedBlockId(): number {
    return this.blocks[this._selectedIndex].id;
  }

  /** 選択変更時のコールバックを設定 */
  onChange(cb: (blockId: number) => void): void {
    this._onChange = cb;
  }

  /** スロットを選択 */
  select(index: number): void {
    // 範囲をループ
    const len = this.blocks.length;
    this._selectedIndex = ((index % len) + len) % len;
    this.updateHighlight();
    this._onChange?.(this.selectedBlockId);
  }

  private updateHighlight(): void {
    this.slots.forEach((slot, i) => {
      slot.style.cssText = this.slotStyle(i === this._selectedIndex);
    });
  }

  private slotStyle(active: boolean): string {
    return `
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      background: ${active ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)'};
      border: 2px solid ${active ? 'white' : 'rgba(255,255,255,0.15)'};
      min-width: 44px;
      transition: border-color 0.1s, background 0.1s;
    `;
  }
}
