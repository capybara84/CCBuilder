/**
 * BuildHistory.ts
 * ブロック操作の Undo/Redo 履歴を管理するクラス
 */

/** 1ブロック分の変更記録 */
export interface BlockChange {
  wx: number;
  wy: number;
  wz: number;
  oldId: number;
  newId: number;
}

/** 1操作分の履歴エントリ */
export interface HistoryEntry {
  /** 操作の種類ラベル（"Place", "Break" など） */
  label: string;
  changes: BlockChange[];
}

/** Undo/Redo スタックの最大保持件数 */
const MAX_HISTORY = 64;

export class BuildHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  /** 新しい操作を履歴に追加する */
  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    // 最大件数を超えたら最古エントリを削除
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // 新操作が追加されたら Redo スタックをクリア
    this.redoStack = [];
  }

  /**
   * Undo: 最新操作を undoStack から取り出して redoStack に積む
   * @returns 取り出した HistoryEntry、スタックが空なら undefined
   */
  undo(): HistoryEntry | undefined {
    const entry = this.undoStack.pop();
    if (entry) {
      this.redoStack.push(entry);
    }
    return entry;
  }

  /**
   * Redo: 最新の取消操作を redoStack から取り出して undoStack に積む
   * @returns 取り出した HistoryEntry、スタックが空なら undefined
   */
  redo(): HistoryEntry | undefined {
    const entry = this.redoStack.pop();
    if (entry) {
      this.undoStack.push(entry);
    }
    return entry;
  }

  /** 両スタックをクリア（マップロード時などに使用） */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Undo 可能かどうか */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Redo 可能かどうか */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
