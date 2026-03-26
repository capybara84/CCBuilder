import { BlockTypes, BlockDef } from '../voxel/BlockTypes';
import { getAtlas } from '../voxel/Chunk';

const SLOT_COUNT = 6;

// 初期スロット
const DEFAULT_SLOTS = [
  BlockTypes.GRASS,
  BlockTypes.DIRT,
  BlockTypes.STONE,
  BlockTypes.WOOD,
  BlockTypes.SAND,
  BlockTypes.OAK_LOG,
];

/**
 * 画面下部中央のブロック選択ホットバー（6スロット固定）
 */
export class Hotbar {
  private slotElements: HTMLDivElement[] = [];
  private swatches: HTMLCanvasElement[] = [];
  private labels: HTMLDivElement[] = [];
  private slotBlockIds: number[] = [...DEFAULT_SLOTS];
  private _selectedIndex = 0;
  private _onChange: ((blockId: number) => void) | null = null;
  private _onSlotClick: ((index: number) => void) | null = null;

  constructor() {
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

    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = this.slotStyle(i === 0);

      const swatch = document.createElement('canvas');
      swatch.width = 32;
      swatch.height = 32;
      swatch.style.cssText = `
        width: 32px; height: 32px;
        border-radius: 2px;
        margin-bottom: 2px;
        image-rendering: pixelated;
      `;

      const label = document.createElement('div');
      label.style.cssText = `
        font-size: 9px;
        color: #ccc;
        text-align: center;
        white-space: nowrap;
      `;

      slot.appendChild(swatch);
      slot.appendChild(label);
      slot.addEventListener('click', () => this._onSlotClick?.(i));
      container.appendChild(slot);

      this.slotElements.push(slot);
      this.swatches.push(swatch);
      this.labels.push(label);
    }

    document.body.appendChild(container);
    this.refreshAllSlots();
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  /** 選択されているかどうか */
  get hasSelection(): boolean {
    return this._selectedIndex >= 0;
  }

  /** 選択ブロックの ID を返す */
  get selectedBlockId(): number {
    if (this._selectedIndex < 0) return 0;
    return this.slotBlockIds[this._selectedIndex];
  }

  /** 選択変更時のコールバックを設定 */
  onChange(cb: (blockId: number) => void): void {
    this._onChange = cb;
  }

  /** スロットクリック時のコールバック */
  onSlotClick(cb: (index: number) => void): void {
    this._onSlotClick = cb;
  }

  /** スロットを選択 */
  select(index: number): void {
    const len = SLOT_COUNT;
    this._selectedIndex = ((index % len) + len) % len;
    this.updateHighlight();
    this._onChange?.(this.selectedBlockId);
  }

  /** スロットをトグル選択（同じスロットなら非選択に） */
  toggleSelect(index: number): void {
    const len = SLOT_COUNT;
    const normalized = ((index % len) + len) % len;
    if (this._selectedIndex === normalized) {
      this.deselect();
    } else {
      this.select(normalized);
    }
  }

  /** 選択を解除 */
  deselect(): void {
    this._selectedIndex = -1;
    this.updateHighlight();
  }

  /** スロットにブロックを設定 */
  setSlot(index: number, blockId: number): void {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.slotBlockIds[index] = blockId;
    this.refreshSlot(index);
    if (index === this._selectedIndex) {
      this._onChange?.(this.selectedBlockId);
    }
  }

  /** 選択中スロットにブロックを設定（選択がなければ何もしない） */
  setSelectedSlot(blockId: number): void {
    if (this._selectedIndex < 0) return;
    this.setSlot(this._selectedIndex, blockId);
  }

  private refreshSlot(index: number): void {
    const blockId = this.slotBlockIds[index];
    const block = BlockTypes.get(blockId);
    const atlas = getAtlas();
    const blockUV = atlas.blockUVs.get(blockId);

    const ctx = this.swatches[index].getContext('2d')!;
    ctx.clearRect(0, 0, 32, 32);
    if (blockUV) {
      const [col, row] = blockUV.top;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas.canvas, col * 16, row * 16, 16, 16, 0, 0, 32, 32);
    }

    this.labels[index].textContent = block?.name ?? '';
  }

  private refreshAllSlots(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      this.refreshSlot(i);
    }
  }

  private updateHighlight(): void {
    this.slotElements.forEach((slot, i) => {
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
      min-width: 48px;
      transition: border-color 0.1s, background 0.1s;
    `;
  }
}
