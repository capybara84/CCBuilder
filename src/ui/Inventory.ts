import { BlockTypes, BlockDef } from '../voxel/BlockTypes';
import { getAtlas } from '../voxel/Chunk';

/**
 * インベントリ画面（全ブロック一覧）
 * クリックでブロックを選択、ホットバーとの両方が選択されたときに入れ替え
 */
export class Inventory {
  private container: HTMLDivElement;
  private _visible = false;
  private _onSelect: ((blockId: number) => void) | null = null;
  private _onClose: (() => void) | null = null;

  private cells: HTMLDivElement[] = [];
  private blockIds: number[] = [];
  private _selectedBlockId = -1; // -1 = 未選択

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'inventory';
    this.container.dataset.hud = 'true';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: none;
      display: none;
      justify-content: center;
      align-items: flex-start;
      padding-top: 60px;
      z-index: 50;
      pointer-events: none;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(30, 30, 40, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 24px;
      pointer-events: auto;
    `;

    // タイトル
    const title = document.createElement('div');
    title.textContent = 'INVENTORY';
    title.style.cssText = `
      color: white;
      font-size: 20px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 16px;
      letter-spacing: 3px;
    `;
    panel.appendChild(title);

    // ヒント
    const hint = document.createElement('div');
    hint.textContent = 'Select a block, then click a hotbar slot';
    hint.style.cssText = `
      color: #aaa;
      font-size: 12px;
      text-align: center;
      margin-bottom: 12px;
    `;
    panel.appendChild(hint);

    // ブロックグリッド（6列）
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
    `;

    const allBlocks = BlockTypes.all();
    for (const block of allBlocks) {
      const cell = this.createBlockCell(block);
      grid.appendChild(cell);
      this.cells.push(cell);
      this.blockIds.push(block.id);
    }

    panel.appendChild(grid);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close (E / ESC)';
    closeBtn.style.cssText = `
      display: block;
      margin: 16px auto 0;
      padding: 8px 24px;
      font-size: 14px;
      color: white;
      background: rgba(80, 80, 100, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      cursor: pointer;
    `;
    closeBtn.addEventListener('click', () => this._onClose?.());
    closeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onClose?.();
    });
    panel.appendChild(closeBtn);

    this.container.appendChild(panel);
    document.body.appendChild(this.container);
  }

  private createBlockCell(block: BlockDef): HTMLDivElement {
    const cell = document.createElement('div');
    cell.style.cssText = this.cellStyle(false);

    // テクスチャプレビュー
    const swatch = document.createElement('canvas');
    swatch.width = 40;
    swatch.height = 40;
    swatch.style.cssText = `
      width: 40px; height: 40px;
      border-radius: 3px;
      margin-bottom: 4px;
      image-rendering: pixelated;
    `;

    const atlas = getAtlas();
    const blockUV = atlas.blockUVs.get(block.id);
    if (blockUV) {
      const [col, row] = blockUV.top;
      const ctx = swatch.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas.canvas, col * 16, row * 16, 16, 16, 0, 0, 40, 40);
    }

    // ブロック名
    const label = document.createElement('div');
    label.textContent = block.name;
    label.style.cssText = `
      font-size: 10px;
      color: #ccc;
      text-align: center;
      white-space: nowrap;
    `;

    cell.appendChild(swatch);
    cell.appendChild(label);
    cell.addEventListener('click', () => {
      this.toggleSelect(block.id);
    });
    cell.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.toggleSelect(block.id);
    });

    return cell;
  }

  /** 選択をトグル */
  private toggleSelect(blockId: number): void {
    if (this._selectedBlockId === blockId) {
      this._selectedBlockId = -1;
    } else {
      this._selectedBlockId = blockId;
    }
    this.updateHighlight();
    this._onSelect?.(this._selectedBlockId);
  }

  private updateHighlight(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const active = this.blockIds[i] === this._selectedBlockId;
      this.cells[i].style.cssText = this.cellStyle(active);
    }
  }

  private cellStyle(active: boolean): string {
    return `
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      background: ${active ? 'rgba(80, 120, 180, 0.7)' : 'rgba(60, 60, 80, 0.6)'};
      border: 2px solid ${active ? 'white' : 'transparent'};
      transition: border-color 0.1s, background 0.1s;
    `;
  }

  get visible(): boolean {
    return this._visible;
  }

  get selectedBlockId(): number {
    return this._selectedBlockId;
  }

  get hasSelection(): boolean {
    return this._selectedBlockId >= 0;
  }

  /** 選択を解除 */
  deselect(): void {
    this._selectedBlockId = -1;
    this.updateHighlight();
  }

  show(): void {
    this._visible = true;
    this.deselect();
    this.container.style.display = 'flex';
  }

  hide(): void {
    this._visible = false;
    this.container.style.display = 'none';
  }

  onSelect(cb: (blockId: number) => void): void { this._onSelect = cb; }
  onClose(cb: () => void): void { this._onClose = cb; }
}
