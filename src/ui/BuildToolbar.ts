/**
 * BuildToolbar.ts
 * ビルドモード専用の左側ツールバー（Undo/Redo/Fill/Copy/Paste/Replace/Mirror ボタン）
 */

import { BlockTypes, BlockDef } from '../voxel/BlockTypes';
import { getAtlas } from '../voxel/Chunk';

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
  transition: background 0.15s, opacity 0.15s;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
`;

const BTN_DISABLED_STYLE = `
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
`;

/** ミラー軸の型 */
export type MirrorAxis = 'none' | 'x' | 'z' | 'xz';

/** ミラーボタンのアクティブ時背景色 */
const MIRROR_ACTIVE_BG = 'rgba(80,140,60,0.75)';

/**
 * 置換ダイアログ
 * From/To のブロック選択グリッドを表示し、Replace 実行 or Cancel を返す
 */
class ReplaceDialog {
  private overlay: HTMLDivElement;
  private fromBlockId = -1;
  private toBlockId = -1;
  private fromCells: Map<number, HTMLDivElement> = new Map();
  private toCells: Map<number, HTMLDivElement> = new Map();
  private executeButton: HTMLButtonElement;
  private _onExecute: ((fromId: number, toId: number) => void) | null = null;
  private _onCancel: (() => void) | null = null;

  constructor() {
    // 半透明オーバーレイ
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
    `;

    // ダイアログパネル
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(20, 25, 35, 0.97);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 24px;
      width: 480px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // タイトル
    const title = document.createElement('div');
    title.textContent = 'REPLACE BLOCKS';
    title.style.cssText = `
      color: white;
      font-size: 16px;
      font-weight: bold;
      font-family: monospace;
      letter-spacing: 2px;
      text-align: center;
    `;
    panel.appendChild(title);

    // From セクション
    const fromSection = this.createSection('From:');
    const fromGrid = this.createBlockGrid((id) => {
      this.fromBlockId = id;
      this.updateGridHighlight(this.fromCells, id);
      this.updateExecuteButton();
    }, this.fromCells);
    fromSection.appendChild(fromGrid);
    panel.appendChild(fromSection);

    // To セクション
    const toSection = this.createSection('To:');
    const toGrid = this.createBlockGrid((id) => {
      this.toBlockId = id;
      this.updateGridHighlight(this.toCells, id);
      this.updateExecuteButton();
    }, this.toCells);
    toSection.appendChild(toGrid);
    panel.appendChild(toSection);

    // ボタン行
    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 4px;
    `;

    // Cancel ボタン
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      background: rgba(80, 80, 100, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: white;
      font-size: 13px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
    `;
    cancelBtn.addEventListener('click', () => {
      this.hide();
      this._onCancel?.();
    });
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(100, 100, 130, 0.8)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'rgba(80, 80, 100, 0.7)';
    });
    btnRow.appendChild(cancelBtn);

    // Replace 実行ボタン
    this.executeButton = document.createElement('button');
    this.executeButton.textContent = 'Replace';
    this.executeButton.disabled = true;
    this.executeButton.style.cssText = `
      padding: 8px 20px;
      background: rgba(60, 120, 60, 0.7);
      border: 1px solid rgba(100, 255, 100, 0.3);
      border-radius: 6px;
      color: white;
      font-size: 13px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
      opacity: 0.4;
    `;
    this.executeButton.addEventListener('click', () => {
      if (this.fromBlockId < 0 || this.toBlockId < 0) return;
      const from = this.fromBlockId;
      const to = this.toBlockId;
      this.hide();
      this._onExecute?.(from, to);
    });
    this.executeButton.addEventListener('mouseenter', () => {
      if (!this.executeButton.disabled) {
        this.executeButton.style.background = 'rgba(80, 160, 80, 0.8)';
      }
    });
    this.executeButton.addEventListener('mouseleave', () => {
      if (!this.executeButton.disabled) {
        this.executeButton.style.background = 'rgba(60, 120, 60, 0.7)';
      }
    });
    btnRow.appendChild(this.executeButton);

    panel.appendChild(btnRow);
    this.overlay.appendChild(panel);
    document.body.appendChild(this.overlay);

    // オーバーレイ自体をクリックしたときに閉じる
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
        this._onCancel?.();
      }
    });
  }

  /** セクションラベルコンテナを作成 */
  private createSection(label: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      font-family: monospace;
      font-weight: bold;
      letter-spacing: 1px;
    `;
    section.appendChild(labelEl);

    return section;
  }

  /**
   * ブロック選択グリッドを生成する
   * @param onSelect クリック時コールバック
   * @param cellMap  id → cell div のマップ（ハイライト更新に使用）
   */
  private createBlockGrid(
    onSelect: (id: number) => void,
    cellMap: Map<number, HTMLDivElement>,
  ): HTMLDivElement {
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, 40px);
      gap: 4px;
      max-height: 180px;
      overflow-y: auto;
      padding: 4px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
    `;

    const atlas = getAtlas();

    for (const block of BlockTypes.all()) {
      const cell = this.createBlockCell(block, atlas, onSelect);
      grid.appendChild(cell);
      cellMap.set(block.id, cell);
    }

    return grid;
  }

  /** 各ブロックのセル（32px × 32px カラースウォッチ）を作成 */
  private createBlockCell(
    block: BlockDef,
    atlas: ReturnType<typeof getAtlas>,
    onSelect: (id: number) => void,
  ): HTMLDivElement {
    const cell = document.createElement('div');
    cell.style.cssText = this.cellStyle(false);
    cell.title = block.name; // ツールチップ

    const swatch = document.createElement('canvas');
    swatch.width = 32;
    swatch.height = 32;
    swatch.style.cssText = `
      width: 32px;
      height: 32px;
      display: block;
      border-radius: 2px;
      image-rendering: pixelated;
      pointer-events: none;
    `;

    // テクスチャアトラスからブロックの上面テクスチャを描画
    const blockUV = atlas.blockUVs.get(block.id);
    if (blockUV) {
      const [col, row] = blockUV.top;
      const ctx = swatch.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas.canvas, col * 16, row * 16, 16, 16, 0, 0, 32, 32);
    } else {
      // フォールバック: ブロックカラーで塗りつぶし
      const ctx = swatch.getContext('2d')!;
      ctx.fillStyle = `#${block.color.getHexString()}`;
      ctx.fillRect(0, 0, 32, 32);
    }

    cell.appendChild(swatch);

    cell.addEventListener('click', () => onSelect(block.id));
    cell.addEventListener('mouseenter', () => {
      if (!cell.classList.contains('selected')) {
        cell.style.background = 'rgba(80, 100, 140, 0.6)';
      }
    });
    cell.addEventListener('mouseleave', () => {
      if (!cell.classList.contains('selected')) {
        cell.style.background = 'rgba(50, 55, 70, 0.5)';
      }
    });

    return cell;
  }

  /** グリッドの選択ハイライトを更新 */
  private updateGridHighlight(cellMap: Map<number, HTMLDivElement>, selectedId: number): void {
    for (const [id, cell] of cellMap) {
      const active = id === selectedId;
      cell.style.cssText = this.cellStyle(active);
      if (active) {
        cell.classList.add('selected');
      } else {
        cell.classList.remove('selected');
      }
    }
  }

  /** Replace ボタンの有効/無効を更新 */
  private updateExecuteButton(): void {
    const canExecute = this.fromBlockId >= 0 && this.toBlockId >= 0;
    this.executeButton.disabled = !canExecute;
    this.executeButton.style.opacity = canExecute ? '1' : '0.4';
    this.executeButton.style.cursor = canExecute ? 'pointer' : 'default';
  }

  /** セルのスタイル文字列 */
  private cellStyle(active: boolean): string {
    return `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 4px;
      cursor: pointer;
      background: ${active ? 'rgba(80, 120, 180, 0.7)' : 'rgba(50, 55, 70, 0.5)'};
      border: 2px solid ${active ? 'white' : 'transparent'};
      box-sizing: border-box;
    `;
  }

  /** ダイアログを表示（選択状態をリセット） */
  show(): void {
    this.fromBlockId = -1;
    this.toBlockId = -1;
    this.updateGridHighlight(this.fromCells, -1);
    this.updateGridHighlight(this.toCells, -1);
    this.updateExecuteButton();
    this.overlay.style.display = 'flex';
  }

  /** ダイアログを非表示 */
  hide(): void {
    this.overlay.style.display = 'none';
  }

  get visible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  /** Replace 実行コールバックを設定 */
  onExecute(cb: (fromId: number, toId: number) => void): void {
    this._onExecute = cb;
  }

  /** Cancel コールバックを設定 */
  onCancel(cb: () => void): void {
    this._onCancel = cb;
  }

  /** DOM を除去して後始末 */
  dispose(): void {
    document.body.removeChild(this.overlay);
  }
}

/**
 * テンプレートパネル
 * セッション内テンプレートの保存・ロード・削除・エクスポート・インポートを行うモーダル
 */
class TemplatesPanel {
  private overlay: HTMLDivElement;
  private listContainer: HTMLDivElement;
  private nameInput: HTMLInputElement;
  private saveButton: HTMLButtonElement;
  private _hasClipboard = false;

  private _onSave: ((name: string) => boolean) | null = null;
  private _onLoad: ((name: string) => boolean) | null = null;
  private _onDelete: ((name: string) => void) | null = null;
  private _onExport: ((name: string) => Promise<void>) | null = null;
  private _onImport: (() => Promise<void>) | null = null;
  private _onOpen: (() => void) | null = null;
  private _onClose: (() => void) | null = null;

  constructor() {
    // 半透明オーバーレイ
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
    `;

    // パネル本体
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(20, 25, 35, 0.97);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 24px;
      width: 420px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // タイトル
    const title = document.createElement('div');
    title.textContent = 'STRUCTURE TEMPLATES';
    title.style.cssText = `
      color: white;
      font-size: 16px;
      font-weight: bold;
      font-family: monospace;
      letter-spacing: 2px;
      text-align: center;
    `;
    panel.appendChild(title);

    // ---- Save セクション ----
    const saveSection = document.createElement('div');
    saveSection.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const saveLabel = document.createElement('div');
    saveLabel.textContent = 'Save current clipboard as template:';
    saveLabel.style.cssText = `
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      font-family: monospace;
      font-weight: bold;
      letter-spacing: 1px;
    `;
    saveSection.appendChild(saveLabel);

    // 名前入力 + Save ボタンの行
    const saveRow = document.createElement('div');
    saveRow.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Template name...';
    this.nameInput.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 5px;
      color: white;
      font-size: 13px;
      font-family: monospace;
      outline: none;
    `;
    this.nameInput.addEventListener('input', () => this.updateSaveButton());
    saveRow.appendChild(this.nameInput);

    this.saveButton = document.createElement('button');
    this.saveButton.textContent = 'Save';
    this.saveButton.style.cssText = `
      padding: 6px 16px;
      background: rgba(60, 120, 60, 0.7);
      border: 1px solid rgba(100, 255, 100, 0.3);
      border-radius: 5px;
      color: white;
      font-size: 13px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
      opacity: 0.4;
    `;
    this.saveButton.disabled = true;
    this.saveButton.addEventListener('click', () => {
      const name = this.nameInput.value.trim();
      if (!name || !this._hasClipboard) return;
      const ok = this._onSave?.(name);
      if (ok) {
        this.nameInput.value = '';
        this.updateSaveButton();
        // テンプレート一覧は外部から refreshList() で更新する
      }
    });
    this.saveButton.addEventListener('mouseenter', () => {
      if (!this.saveButton.disabled) {
        this.saveButton.style.background = 'rgba(80, 160, 80, 0.8)';
      }
    });
    this.saveButton.addEventListener('mouseleave', () => {
      if (!this.saveButton.disabled) {
        this.saveButton.style.background = 'rgba(60, 120, 60, 0.7)';
      }
    });
    saveRow.appendChild(this.saveButton);

    saveSection.appendChild(saveRow);
    panel.appendChild(saveSection);

    // 区切り線
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: rgba(255,255,255,0.15);
    `;
    panel.appendChild(divider);

    // ---- テンプレート一覧 ----
    const listLabel = document.createElement('div');
    listLabel.textContent = 'Saved Templates:';
    listLabel.style.cssText = `
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      font-family: monospace;
      font-weight: bold;
      letter-spacing: 1px;
    `;
    panel.appendChild(listLabel);

    this.listContainer = document.createElement('div');
    this.listContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 40px;
      max-height: 240px;
      overflow-y: auto;
    `;
    panel.appendChild(this.listContainer);

    // ---- ボタン行（Import / Close） ----
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-top: 4px;
    `;

    // Import ボタン
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import from file';
    importBtn.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      background: rgba(60, 80, 120, 0.7);
      border: 1px solid rgba(100, 150, 255, 0.3);
      border-radius: 5px;
      color: white;
      font-size: 12px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
    `;
    importBtn.addEventListener('click', async () => {
      await this._onImport?.();
    });
    importBtn.addEventListener('mouseenter', () => {
      importBtn.style.background = 'rgba(80, 110, 170, 0.8)';
    });
    importBtn.addEventListener('mouseleave', () => {
      importBtn.style.background = 'rgba(60, 80, 120, 0.7)';
    });
    bottomRow.appendChild(importBtn);

    // Close ボタン
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      padding: 8px 20px;
      background: rgba(80, 80, 100, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 5px;
      color: white;
      font-size: 13px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(100, 100, 130, 0.8)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(80, 80, 100, 0.7)';
    });
    bottomRow.appendChild(closeBtn);

    panel.appendChild(bottomRow);
    this.overlay.appendChild(panel);
    document.body.appendChild(this.overlay);

    // オーバーレイ自体をクリックしたときに閉じる
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });
  }

  /** Save ボタンの有効/無効を更新する */
  private updateSaveButton(): void {
    const canSave = this._hasClipboard && this.nameInput.value.trim().length > 0;
    this.saveButton.disabled = !canSave;
    this.saveButton.style.opacity = canSave ? '1' : '0.4';
    this.saveButton.style.cursor = canSave ? 'pointer' : 'default';
  }

  /**
   * テンプレート一覧を再構築する
   * パネルが開いている間にリアルタイムで呼ばれる
   *
   * @param names   テンプレート名の配列
   */
  refreshList(names: string[]): void {
    // 既存の一覧をクリア
    while (this.listContainer.firstChild) {
      this.listContainer.removeChild(this.listContainer.firstChild);
    }

    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '（テンプレートなし）';
      empty.style.cssText = `
        color: rgba(255,255,255,0.35);
        font-size: 12px;
        font-family: monospace;
        text-align: center;
        padding: 12px 0;
      `;
      this.listContainer.appendChild(empty);
      return;
    }

    for (const name of names) {
      const row = this.createTemplateRow(name);
      this.listContainer.appendChild(row);
    }
  }

  /** テンプレート1件分の行 DOM を生成する */
  private createTemplateRow(name: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 5px;
      border: 1px solid rgba(255,255,255,0.1);
    `;

    // テンプレート名ラベル
    const nameLabel = document.createElement('div');
    nameLabel.textContent = name;
    nameLabel.style.cssText = `
      flex: 1;
      color: rgba(255,255,255,0.85);
      font-size: 13px;
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    row.appendChild(nameLabel);

    // Use ボタン
    const useBtn = this.createSmallButton('Use', 'rgba(60,100,160,0.7)', 'rgba(80,130,210,0.85)');
    useBtn.addEventListener('click', () => {
      const ok = this._onLoad?.(name);
      if (ok) {
        this.hide();
      }
    });
    row.appendChild(useBtn);

    // Export ボタン
    const exportBtn = this.createSmallButton('Export', 'rgba(80,80,100,0.7)', 'rgba(110,110,140,0.85)');
    exportBtn.addEventListener('click', async () => {
      await this._onExport?.(name);
    });
    row.appendChild(exportBtn);

    // Delete ボタン
    const deleteBtn = this.createSmallButton('Delete', 'rgba(120,40,40,0.7)', 'rgba(170,60,60,0.85)');
    deleteBtn.addEventListener('click', () => {
      this._onDelete?.(name);
      // 一覧から行を削除（一覧更新は外部から refreshList で行う）
      this.listContainer.removeChild(row);
      // 一覧が空になった場合の表示
      if (this.listContainer.childElementCount === 0) {
        this.refreshList([]);
      }
    });
    row.appendChild(deleteBtn);

    return row;
  }

  /** 小さなボタンを生成するユーティリティ */
  private createSmallButton(label: string, bg: string, hoverBg: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding: 4px 10px;
      background: ${bg};
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      color: white;
      font-size: 11px;
      font-family: monospace;
      cursor: pointer;
      outline: none;
      white-space: nowrap;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = hoverBg;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = bg;
    });
    return btn;
  }

  /** パネルを表示する */
  show(hasClipboard: boolean, templateNames: string[]): void {
    this._hasClipboard = hasClipboard;
    this.nameInput.value = '';
    this.updateSaveButton();
    this.refreshList(templateNames);
    this.overlay.style.display = 'flex';
    this._onOpen?.();
  }

  /** パネルを非表示にする */
  hide(): void {
    this.overlay.style.display = 'none';
    this._onClose?.();
  }

  get visible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  /** クリップボード有無をリアルタイムで更新する */
  setHasClipboard(hasClipboard: boolean): void {
    this._hasClipboard = hasClipboard;
    this.updateSaveButton();
  }

  /** Save コールバック（戻り値が true なら成功） */
  onSave(cb: (name: string) => boolean): void {
    this._onSave = cb;
  }

  /** Use コールバック（テンプレートをクリップボードにロード、戻り値が true なら成功） */
  onLoad(cb: (name: string) => boolean): void {
    this._onLoad = cb;
  }

  /** Delete コールバック */
  onDelete(cb: (name: string) => void): void {
    this._onDelete = cb;
  }

  /** Export コールバック（非同期） */
  onExport(cb: (name: string) => Promise<void>): void {
    this._onExport = cb;
  }

  /** Import コールバック（非同期） */
  onImport(cb: () => Promise<void>): void {
    this._onImport = cb;
  }

  /** パネルが開いたときのコールバック（Pointer Lock 解除などに使用） */
  onOpen(cb: () => void): void {
    this._onOpen = cb;
  }

  /** パネルが閉じたときのコールバック（Pointer Lock 再取得などに使用） */
  onClose(cb: () => void): void {
    this._onClose = cb;
  }

  /** DOM を除去して後始末 */
  dispose(): void {
    document.body.removeChild(this.overlay);
  }
}

export class BuildToolbar {
  private container: HTMLDivElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;
  private fillButton: HTMLButtonElement;
  private copyButton: HTMLButtonElement;
  private pasteButton: HTMLButtonElement;
  private replaceButton: HTMLButtonElement;
  private mirrorButton: HTMLButtonElement;
  private templatesButton: HTMLButtonElement;
  private replaceDialog: ReplaceDialog;
  private templatesPanel: TemplatesPanel;

  private _onFill: (() => void) | null = null;
  private _onUndo: (() => void) | null = null;
  private _onRedo: (() => void) | null = null;
  private _onCopy: (() => void) | null = null;
  private _onPaste: (() => void) | null = null;
  private _onReplace: ((fromId: number, toId: number) => void) | null = null;
  private _onReplaceCancel: (() => void) | null = null;
  private _onMirror: ((axis: MirrorAxis) => void) | null = null;
  private _onTemplateSave: ((name: string) => boolean) | null = null;
  private _onTemplateLoad: ((name: string) => boolean) | null = null;
  private _onTemplateDelete: ((name: string) => void) | null = null;
  private _onTemplateExport: ((name: string) => Promise<void>) | null = null;
  private _onTemplateImport: (() => Promise<void>) | null = null;
  /** Templates パネルを開く際に現在のテンプレート名一覧を取得するコールバック */
  private _onGetTemplateNames: (() => string[]) | null = null;

  /** 現在のミラー軸状態 */
  private _mirrorAxis: MirrorAxis = 'none';

  /** クリップボードにデータがあるか（Templates パネルの Save ボタン有効化に使用） */
  private _hasClipboardForPanel = false;

  constructor() {
    // ツールバーコンテナ（画面左側に縦並び）
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      left: 16px;
      top: 60px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 20;
      width: 90px;
    `;
    // 初期状態は非表示（ビルドモード時のみ表示）
    this.container.style.display = 'none';

    // Undo ボタン
    this.undoButton = this.createButton('↩ Undo', () => this._onUndo?.());
    // Redo ボタン
    this.redoButton = this.createButton('↪ Redo', () => this._onRedo?.());

    // 区切り線
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: rgba(255,255,255,0.2);
      margin: 2px 0;
    `;

    // Fill ボタン
    this.fillButton = this.createButton('✦ Fill', () => this._onFill?.());

    // Replace ボタン（ダイアログを開く）
    this.replaceButton = this.createButton('⇄ Replace', () => {
      // Pointer Lock を解除してダイアログ操作を可能にする
      document.exitPointerLock();
      this.replaceDialog.show();
    });
    // 初期状態: 選択範囲なしで無効
    this.setButtonEnabled(this.replaceButton, false, 'G+Click で選択範囲を指定してください');

    // Copy / Paste ボタン
    this.copyButton = this.createButton('⎘ Copy', () => this._onCopy?.());
    this.pasteButton = this.createButton('⎗ Paste', () => this._onPaste?.());

    // 初期状態: Copy は選択範囲なしで無効、Paste はクリップボードなしで無効
    this.setButtonEnabled(this.copyButton, false, 'G+Click で選択範囲を指定してください');
    this.setButtonEnabled(this.pasteButton, false, 'まずコピーしてください');

    // 区切り線2（Mirror ボタン用）
    const divider2 = document.createElement('div');
    divider2.style.cssText = `
      height: 1px;
      background: rgba(255,255,255,0.2);
      margin: 2px 0;
    `;

    // Mirror ボタン（クリックで軸をサイクル: none → x → z → xz → none）
    this.mirrorButton = this.createButton('⟺ Mirror: OFF', () => this.cycleMirrorAxis());

    // 区切り線3（Templates ボタン用）
    const divider3 = document.createElement('div');
    divider3.style.cssText = `
      height: 1px;
      background: rgba(255,255,255,0.2);
      margin: 2px 0;
    `;

    // Templates ボタン（テンプレートパネルを開く）
    this.templatesButton = this.createButton('Templates', () => {
      // Pointer Lock を解除してパネル操作を可能にする
      document.exitPointerLock();
      const names = this._onGetTemplateNames?.() ?? [];
      this.templatesPanel.show(this._hasClipboardForPanel, names);
    });

    // ヒントテキスト（操作説明）
    const hint = document.createElement('div');
    hint.style.cssText = `
      font-size: 10px;
      font-family: monospace;
      color: rgba(255,255,255,0.45);
      text-align: center;
      line-height: 1.5;
      margin-top: 4px;
      pointer-events: none;
    `;
    hint.textContent = 'G+Click:\nSelect';
    hint.style.whiteSpace = 'pre';

    this.container.appendChild(this.undoButton);
    this.container.appendChild(this.redoButton);
    this.container.appendChild(divider);
    this.container.appendChild(this.fillButton);
    this.container.appendChild(this.replaceButton);
    this.container.appendChild(this.copyButton);
    this.container.appendChild(this.pasteButton);
    this.container.appendChild(divider2);
    this.container.appendChild(this.mirrorButton);
    this.container.appendChild(divider3);
    this.container.appendChild(this.templatesButton);
    this.container.appendChild(hint);

    document.body.appendChild(this.container);

    // 置換ダイアログを生成（非表示状態で DOM に追加）
    this.replaceDialog = new ReplaceDialog();
    // Replace 実行時: コールバックを呼んだ後 Pointer Lock を再取得
    this.replaceDialog.onExecute((fromId, toId) => {
      this._onReplace?.(fromId, toId);
    });
    // Cancel 時: キャンセルコールバックを呼ぶ（Pointer Lock 再取得は呼び出し元で行う）
    this.replaceDialog.onCancel(() => {
      this._onReplaceCancel?.();
    });

    // テンプレートパネルを生成（非表示状態で DOM に追加）
    this.templatesPanel = new TemplatesPanel();
    // 各コールバックを TemplatesPanel に接続
    this.templatesPanel.onSave((name) => {
      const ok = this._onTemplateSave?.(name) ?? false;
      if (ok) {
        // 保存成功後に一覧を更新する
        const names = this._onGetTemplateNames?.() ?? [];
        this.templatesPanel.refreshList(names);
      }
      return ok;
    });
    this.templatesPanel.onLoad((name) => {
      return this._onTemplateLoad?.(name) ?? false;
    });
    this.templatesPanel.onDelete((name) => {
      this._onTemplateDelete?.(name);
      // 削除後に一覧を更新する
      const names = this._onGetTemplateNames?.() ?? [];
      this.templatesPanel.refreshList(names);
    });
    this.templatesPanel.onExport(async (name) => {
      await this._onTemplateExport?.(name);
    });
    this.templatesPanel.onImport(async () => {
      await this._onTemplateImport?.();
    });
    // パネルが閉じたら Pointer Lock を再取得するコールバック（外部から設定）
  }

  /** ツールバーを表示する（ビルドモード時） */
  show(): void {
    this.container.style.display = 'flex';
  }

  /** ツールバーを非表示にする（ウォークモード時） */
  hide(): void {
    this.container.style.display = 'none';
  }

  /** Fill ボタンのコールバックを設定 */
  onFill(cb: () => void): void {
    this._onFill = cb;
  }

  /** Undo ボタンのコールバックを設定 */
  onUndo(cb: () => void): void {
    this._onUndo = cb;
  }

  /** Redo ボタンのコールバックを設定 */
  onRedo(cb: () => void): void {
    this._onRedo = cb;
  }

  /**
   * Replace コールバックを設定
   * ダイアログで Replace が実行されると cb(fromId, toId) が呼ばれる
   */
  onReplace(cb: (fromId: number, toId: number) => void): void {
    this._onReplace = cb;
  }

  /**
   * Replace キャンセルコールバックを設定
   * ダイアログで Cancel が押されると cb() が呼ばれる
   */
  onReplaceCancel(cb: () => void): void {
    this._onReplaceCancel = cb;
  }

  /** Undo ボタンの enabled/disabled 状態を更新 */
  setUndoEnabled(enabled: boolean): void {
    this.setButtonEnabled(this.undoButton, enabled);
  }

  /** Redo ボタンの enabled/disabled 状態を更新 */
  setRedoEnabled(enabled: boolean): void {
    this.setButtonEnabled(this.redoButton, enabled);
  }

  /** Copy ボタンの enabled/disabled 状態を更新（選択範囲確定時のみ有効） */
  setCopyEnabled(enabled: boolean): void {
    this.setButtonEnabled(this.copyButton, enabled, 'G+Click で選択範囲を指定してください');
  }

  /** Paste ボタンの enabled/disabled 状態を更新（クリップボードありの時のみ有効） */
  setPasteEnabled(enabled: boolean): void {
    this.setButtonEnabled(this.pasteButton, enabled);
  }

  /** Replace ボタンの enabled/disabled 状態を更新（選択範囲確定時のみ有効） */
  setReplaceEnabled(enabled: boolean): void {
    this.setButtonEnabled(this.replaceButton, enabled, 'G+Click で選択範囲を指定してください');
  }

  /** Copy ボタンのコールバックを設定 */
  onCopy(cb: () => void): void {
    this._onCopy = cb;
  }

  /** Paste ボタンのコールバックを設定 */
  onPaste(cb: () => void): void {
    this._onPaste = cb;
  }

  /** Mirror ボタンのコールバックを設定 */
  onMirror(cb: (axis: MirrorAxis) => void): void {
    this._onMirror = cb;
  }

  /** ミラー軸を外部から設定してボタン表示を更新する（M キーショートカット用） */
  setMirrorAxis(axis: MirrorAxis): void {
    this._mirrorAxis = axis;
    this.updateMirrorButton();
  }

  /** ミラー軸をサイクルさせる（クリック時に呼ばれる） */
  private cycleMirrorAxis(): void {
    const cycle: MirrorAxis[] = ['none', 'x', 'z', 'xz'];
    const currentIndex = cycle.indexOf(this._mirrorAxis);
    const nextAxis = cycle[(currentIndex + 1) % cycle.length];
    this.setMirrorAxis(nextAxis);
    this._onMirror?.(nextAxis);
  }

  /** ミラーボタンのテキストと背景色を現在の状態に合わせて更新する */
  private updateMirrorButton(): void {
    const labelMap: Record<MirrorAxis, string> = {
      none: '⟺ Mirror: OFF',
      x: '⟺ Mirror: X',
      z: '⟺ Mirror: Z',
      xz: '⟺ Mirror: XZ',
    };
    this.mirrorButton.textContent = labelMap[this._mirrorAxis];

    if (this._mirrorAxis !== 'none') {
      // アクティブ状態: 緑みがかった背景でハイライト
      this.mirrorButton.style.background = MIRROR_ACTIVE_BG;
      this.mirrorButton.style.borderColor = 'rgba(100,220,80,0.6)';
    } else {
      // 非アクティブ状態: 通常スタイルに戻す
      this.mirrorButton.style.background = 'rgba(0,0,0,0.45)';
      this.mirrorButton.style.borderColor = 'rgba(255,255,255,0.3)';
    }
  }

  /** ダイアログが表示されているか */
  get isDialogVisible(): boolean {
    return this.replaceDialog.visible;
  }

  /** Templates パネルが表示されているか */
  get isTemplatePanelVisible(): boolean {
    return this.templatesPanel.visible;
  }

  /**
   * クリップボード有無を更新する
   * Templates パネルの Save ボタンの有効/無効に反映する
   */
  setHasClipboard(hasClipboard: boolean): void {
    this._hasClipboardForPanel = hasClipboard;
    if (this.templatesPanel.visible) {
      this.templatesPanel.setHasClipboard(hasClipboard);
    }
  }

  /** Template Save コールバックを設定 */
  onTemplateSave(cb: (name: string) => boolean): void {
    this._onTemplateSave = cb;
  }

  /** Template Load コールバックを設定（Use ボタン） */
  onTemplateLoad(cb: (name: string) => boolean): void {
    this._onTemplateLoad = cb;
  }

  /** Template Delete コールバックを設定 */
  onTemplateDelete(cb: (name: string) => void): void {
    this._onTemplateDelete = cb;
  }

  /** Template Export コールバックを設定（非同期） */
  onTemplateExport(cb: (name: string) => Promise<void>): void {
    this._onTemplateExport = cb;
  }

  /** Template Import コールバックを設定（非同期） */
  onTemplateImport(cb: () => Promise<void>): void {
    this._onTemplateImport = cb;
  }

  /**
   * Templates パネルを開く際に現在のテンプレート名一覧を取得するコールバックを設定
   * Game.ts 側でテンプレート一覧を返す関数を渡す
   */
  onGetTemplateNames(cb: () => string[]): void {
    this._onGetTemplateNames = cb;
  }

  /**
   * Templates パネルが開いたときのコールバックを設定
   * Pointer Lock の解除などに使用する
   */
  onTemplatePanelOpen(cb: () => void): void {
    this.templatesPanel.onOpen(cb);
  }

  /**
   * Templates パネルが閉じたときのコールバックを設定
   * Pointer Lock の再取得などに使用する
   */
  onTemplatePanelClose(cb: () => void): void {
    this.templatesPanel.onClose(cb);
  }

  /** ボタンを生成してコンテナに追加 */
  private createButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = BTN_STYLE;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) {
        btn.style.background = 'rgba(60,80,120,0.7)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      // Mirror ボタンはアクティブ時にアクティブ色を維持する
      if (btn === this.mirrorButton && this._mirrorAxis !== 'none') {
        btn.style.background = MIRROR_ACTIVE_BG;
      } else {
        btn.style.background = 'rgba(0,0,0,0.45)';
      }
    });
    return btn;
  }

  /** ボタンの有効/無効状態を切り替え（cssText 完全上書きをしないことでアクティブ色を保持する） */
  private setButtonEnabled(btn: HTMLButtonElement, enabled: boolean, disabledReason = ''): void {
    btn.disabled = !enabled;
    if (enabled) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.pointerEvents = 'auto';
      btn.title = '';
    } else {
      btn.style.opacity = '0.35';
      btn.style.cursor = 'default';
      btn.style.pointerEvents = 'none';
      btn.title = disabledReason;
    }
  }

  /** DOM を除去して後始末 */
  dispose(): void {
    this.replaceDialog.dispose();
    this.templatesPanel.dispose();
    document.body.removeChild(this.container);
  }
}
