import { BlockTypes, BlockDef } from '../voxel/BlockTypes';
import { getAtlas } from '../voxel/Chunk';

/** カテゴリ定義 */
interface Category {
  name: string;
  blockIds: number[];
}

const CATEGORIES: Category[] = [
  {
    name: 'All',
    blockIds: BlockTypes.all().map(b => b.id),
  },
  {
    name: 'Nature',
    blockIds: [1, 2, 3, 19, 5, 22, 21, 20, 4, 7, 35, 36, 37, 8, 38, 39, 9, 23, 24, 25, 40, 41, 42, 10, 11, 49, 50, 51, 52, 53, 6, 43, 44, 45, 46, 47, 48, 54, 55, 56, 57, 58],
  },
  {
    name: 'Building',
    blockIds: [12, 13, 59, 60, 61, 62, 26, 27, 28, 14, 15, 33, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 34],
  },
  {
    name: 'Decoration',
    blockIds: [16, 17, 18, 86, 87, 88, 89, 90, 91, 92, 93, 29, 30, 31, 32, 94, 95, 96, 97, 98, 99, 100, 101, 102],
  },
];

/**
 * インベントリ画面（カテゴリタブ付き）
 * クリックでブロックを選択、ホットバーとの両方が選択されたときに入れ替え
 */
export class Inventory {
  private container: HTMLDivElement;
  private _visible = false;
  private _onSelect: ((blockId: number) => void) | null = null;
  private _onClose: (() => void) | null = null;

  private grid: HTMLDivElement;
  private cells: HTMLDivElement[] = [];
  private blockIds: number[] = [];
  private _selectedBlockId = -1;
  private tabButtons: HTMLButtonElement[] = [];
  private activeTab = 0;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'inventory';
    this.container.dataset.hud = 'true';
    const isMobile = 'ontouchstart' in window && window.innerHeight < 500;
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: none;
      display: none;
      justify-content: center;
      align-items: flex-start;
      padding-top: ${isMobile ? '4px' : '40px'};
      z-index: 50;
      pointer-events: none;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(30, 30, 40, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: ${isMobile ? '8px 12px' : '20px'};
      pointer-events: auto;
      max-height: ${isMobile ? 'calc(100vh - 8px)' : '80vh'};
      display: flex;
      flex-direction: column;
    `;

    // タイトル
    const title = document.createElement('div');
    title.textContent = 'INVENTORY';
    title.style.cssText = `
      color: white;
      font-size: ${isMobile ? '13px' : '18px'};
      font-weight: bold;
      text-align: center;
      margin-bottom: ${isMobile ? '4px' : '10px'};
      letter-spacing: 3px;
    `;
    panel.appendChild(title);

    // ヒント
    const hint = document.createElement('div');
    hint.textContent = 'Select a block, then click a hotbar slot';
    hint.style.cssText = `
      color: #aaa;
      font-size: ${isMobile ? '10px' : '11px'};
      text-align: center;
      margin-bottom: ${isMobile ? '4px' : '10px'};
    `;
    panel.appendChild(hint);

    // カテゴリタブ
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      justify-content: center;
    `;
    CATEGORIES.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.textContent = cat.name;
      btn.style.cssText = this.tabStyle(i === 0);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(i);
      });
      tabBar.appendChild(btn);
      this.tabButtons.push(btn);
    });
    panel.appendChild(tabBar);

    // ブロックグリッド（6列、スクロール可能）
    this.grid = document.createElement('div');
    this.grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${isMobile ? 8 : 6}, 1fr);
      gap: ${isMobile ? '4px' : '6px'};
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      flex: 1;
      min-height: 0;
    `;
    panel.appendChild(this.grid);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close (E / ESC)';
    closeBtn.style.cssText = `
      display: block;
      margin: 12px auto 0;
      padding: 8px 24px;
      font-size: 13px;
      color: white;
      background: rgba(80, 80, 100, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      cursor: pointer;
    `;
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._onClose?.();
    });
    panel.appendChild(closeBtn);

    this.container.appendChild(panel);
    document.body.appendChild(this.container);

    // 初期タブを描画
    this.renderGrid(CATEGORIES[0].blockIds);
  }

  private switchTab(index: number): void {
    this.activeTab = index;
    this.tabButtons.forEach((btn, i) => {
      btn.style.cssText = this.tabStyle(i === index);
    });
    this._selectedBlockId = -1;
    this.renderGrid(CATEGORIES[index].blockIds);
  }

  private renderGrid(ids: number[]): void {
    this.grid.innerHTML = '';
    this.cells = [];
    this.blockIds = [];

    for (const id of ids) {
      const block = BlockTypes.get(id);
      if (!block) continue;
      const cell = this.createBlockCell(block);
      this.grid.appendChild(cell);
      this.cells.push(cell);
      this.blockIds.push(block.id);
    }
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
      margin-bottom: 3px;
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
      font-size: 9px;
      color: #ccc;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 56px;
    `;

    cell.appendChild(swatch);
    cell.appendChild(label);
    cell.addEventListener('click', (e) => {
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
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      background: ${active ? 'rgba(80, 120, 180, 0.7)' : 'rgba(60, 60, 80, 0.6)'};
      border: 2px solid ${active ? 'white' : 'transparent'};
      transition: border-color 0.1s, background 0.1s;
    `;
  }

  private tabStyle(active: boolean): string {
    return `
      padding: 6px 14px;
      font-size: 12px;
      font-weight: bold;
      color: ${active ? 'white' : '#999'};
      background: ${active ? 'rgba(80, 120, 180, 0.7)' : 'rgba(50, 50, 60, 0.6)'};
      border: 1px solid ${active ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'};
      border-radius: 4px;
      cursor: pointer;
      outline: none;
      font-family: sans-serif;
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
