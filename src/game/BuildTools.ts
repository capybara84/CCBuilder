/**
 * BuildTools.ts
 * ビルドモード用ツール（Fill / Copy / Paste など）の実装
 */

import * as THREE from 'three';
import { World } from './World';
import { BlockTypes } from '../voxel/BlockTypes';
import { HistoryEntry } from './BuildHistory';

/** クリップボードに保持するデータ */
export interface ClipboardData {
  /** AABBのmin基準の相対座標とブロックID（AIR含む） */
  blocks: { rx: number; ry: number; rz: number; id: number }[];
  /** クリップボードの論理サイズ（ブロック数） */
  size: { x: number; y: number; z: number };
}

export class BuildTools {
  /** クリップボード（copy した内容を保持） */
  private clipboard: ClipboardData | null = null;

  /** セッション内テンプレートライブラリ（名前 → ClipboardData） */
  private savedTemplates: Map<string, ClipboardData> = new Map();
  /**
   * 選択範囲内を指定ブロックIDで充填する
   * blockId=0（AIR）で範囲内を削除
   * Water（breakable: false）はスキップする
   *
   * @param world     対象のワールド
   * @param aabb      充填範囲（min/max はブロック座標）
   * @param blockId   充填するブロックID（0 = AIR で削除）
   * @returns HistoryEntry（BuildHistory.push に渡す用）
   */
  fill(
    world: World,
    aabb: { min: THREE.Vector3; max: THREE.Vector3 },
    blockId: number,
  ): HistoryEntry {
    const { min, max } = aabb;
    const changes: HistoryEntry['changes'] = [];

    // 変更バッチ（setBlockBatch に渡す用）
    const batch: { wx: number; wy: number; wz: number; id: number }[] = [];

    // AABB 全座標をループして変更点を収集
    for (let wx = min.x; wx <= max.x; wx++) {
      for (let wy = min.y; wy <= max.y; wy++) {
        for (let wz = min.z; wz <= max.z; wz++) {
          const oldId = world.getBlock(wx, wy, wz);

          // 変更が不要なブロックはスキップ
          if (oldId === blockId) continue;

          // Water（breakable: false）は上書きしない
          const def = BlockTypes.get(oldId);
          if (def && !def.breakable) continue;

          changes.push({ wx, wy, wz, oldId, newId: blockId });
          batch.push({ wx, wy, wz, id: blockId });
        }
      }
    }

    // ブロックをバッチで書き込む（チャンク再構築を一括化）
    if (batch.length > 0) {
      world.setBlockBatch(batch);
    }

    return {
      label: blockId === 0 ? 'Fill(Delete)' : 'Fill',
      changes,
    };
  }

  /**
   * 選択範囲をクリップボードにコピーする（AIRブロックも含む）
   * AABBのminを基準とした相対座標で全ブロックを記録する
   *
   * @param world   対象のワールド
   * @param aabb    コピー範囲（min/max はブロック座標）
   */
  copy(world: World, aabb: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const { min, max } = aabb;
    const sizeX = max.x - min.x + 1;
    const sizeY = max.y - min.y + 1;
    const sizeZ = max.z - min.z + 1;

    const blocks: ClipboardData['blocks'] = [];

    for (let rx = 0; rx < sizeX; rx++) {
      for (let ry = 0; ry < sizeY; ry++) {
        for (let rz = 0; rz < sizeZ; rz++) {
          const id = world.getBlock(min.x + rx, min.y + ry, min.z + rz);
          blocks.push({ rx, ry, rz, id });
        }
      }
    }

    this.clipboard = {
      blocks,
      size: { x: sizeX, y: sizeY, z: sizeZ },
    };
  }

  /**
   * クリップボードの内容を指定位置にペーストする
   * AIR(id=0)のブロックはスキップする（上書きしない）
   * Water（breakable: false）も上書きしない
   *
   * @param world   対象のワールド
   * @param origin  ペースト基準座標（クリップボードの min に対応する位置）
   * @returns HistoryEntry（変更があった場合）、変更なしなら null
   */
  paste(world: World, origin: THREE.Vector3): HistoryEntry | null {
    if (!this.clipboard) return null;

    const changes: HistoryEntry['changes'] = [];
    const batch: { wx: number; wy: number; wz: number; id: number }[] = [];

    for (const { rx, ry, rz, id } of this.clipboard.blocks) {
      // AIRはスキップ（上書きしない）
      if (id === 0) continue;

      const wx = Math.floor(origin.x) + rx;
      const wy = Math.floor(origin.y) + ry;
      const wz = Math.floor(origin.z) + rz;

      const oldId = world.getBlock(wx, wy, wz);

      // 変更が不要なブロックはスキップ
      if (oldId === id) continue;

      // Water（breakable: false）は上書きしない
      const def = BlockTypes.get(oldId);
      if (def && !def.breakable) continue;

      changes.push({ wx, wy, wz, oldId, newId: id });
      batch.push({ wx, wy, wz, id });
    }

    if (batch.length === 0) return null;

    // バッチ書き込み（チャンク再構築を一括化）
    world.setBlockBatch(batch);

    return {
      label: 'Paste',
      changes,
    };
  }

  /** クリップボードにデータがあるか */
  get hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  /** クリップボードのデータを取得（null の場合はクリップボード未設定） */
  get clipboardData(): ClipboardData | null {
    return this.clipboard;
  }

  /**
   * 外部から ClipboardData をセットする（ファイルロード時などに使用）
   *
   * @param data  セットするクリップボードデータ
   */
  setClipboard(data: ClipboardData): void {
    this.clipboard = data;
  }

  /**
   * 現在のクリップボード内容をセッション内テンプレートとして保存する
   * クリップボードが空の場合は false を返す
   *
   * @param name  テンプレート名
   * @returns 保存成功なら true、クリップボードが空なら false
   */
  saveTemplate(name: string): boolean {
    if (!this.clipboard) return false;
    // クリップボードのディープコピーを保存する
    this.savedTemplates.set(name, {
      blocks: this.clipboard.blocks.map((b) => ({ ...b })),
      size: { ...this.clipboard.size },
    });
    return true;
  }

  /**
   * セッション内テンプレートの名前一覧を返す
   *
   * @returns テンプレート名の配列（登録順）
   */
  getTemplateNames(): string[] {
    return Array.from(this.savedTemplates.keys());
  }

  /**
   * セッション内テンプレートをクリップボードにロードする
   * 指定した名前のテンプレートが存在しない場合は false を返す
   *
   * @param name  テンプレート名
   * @returns ロード成功なら true、存在しない場合は false
   */
  loadTemplate(name: string): boolean {
    const data = this.savedTemplates.get(name);
    if (!data) return false;
    // ディープコピーをクリップボードにセット
    this.clipboard = {
      blocks: data.blocks.map((b) => ({ ...b })),
      size: { ...data.size },
    };
    return true;
  }

  /**
   * セッション内テンプレートを削除する
   *
   * @param name  削除するテンプレート名
   */
  deleteTemplate(name: string): void {
    this.savedTemplates.delete(name);
  }

  /**
   * 指定した名前のテンプレートの ClipboardData を返す（Export 用）
   * 存在しない場合は null を返す
   *
   * @param name  テンプレート名
   */
  getTemplateData(name: string): ClipboardData | null {
    return this.savedTemplates.get(name) ?? null;
  }

  /**
   * 選択範囲内の fromId ブロックを toId に置き換える
   * Water（breakable: false）が fromId の場合はスキップする
   *
   * @param world   対象のワールド
   * @param aabb    置換範囲（min/max はブロック座標）
   * @param fromId  置換元のブロックID
   * @param toId    置換先のブロックID
   * @returns HistoryEntry（BuildHistory.push に渡す用）
   */
  replace(
    world: World,
    aabb: { min: THREE.Vector3; max: THREE.Vector3 },
    fromId: number,
    toId: number,
  ): HistoryEntry {
    const { min, max } = aabb;
    const changes: HistoryEntry['changes'] = [];

    // 変更バッチ（setBlockBatch に渡す用）
    const batch: { wx: number; wy: number; wz: number; id: number }[] = [];

    // fromId が破壊不可ブロック（Water など）の場合は何もしない
    const fromDef = BlockTypes.get(fromId);
    if (fromDef && !fromDef.breakable) {
      return { label: 'Replace', changes: [] };
    }

    // AABB 全座標をループして fromId のブロックのみ toId に変更
    for (let wx = min.x; wx <= max.x; wx++) {
      for (let wy = min.y; wy <= max.y; wy++) {
        for (let wz = min.z; wz <= max.z; wz++) {
          const oldId = world.getBlock(wx, wy, wz);

          // fromId と一致しないブロックはスキップ
          if (oldId !== fromId) continue;

          // 変更内容が同じ場合はスキップ
          if (oldId === toId) continue;

          changes.push({ wx, wy, wz, oldId, newId: toId });
          batch.push({ wx, wy, wz, id: toId });
        }
      }
    }

    // ブロックをバッチで書き込む（チャンク再構築を一括化）
    if (batch.length > 0) {
      world.setBlockBatch(batch);
    }

    return {
      label: 'Replace',
      changes,
    };
  }
}
