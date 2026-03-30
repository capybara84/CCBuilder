/**
 * TemplateSerializer.ts
 * 構造テンプレートの保存・ロードを担当する
 * ファイル拡張子: .voxtemplate（JSON フォーマット）
 */

import { ClipboardData } from '../game/BuildTools';

/** 構造テンプレートのファイルフォーマット */
export interface StructureTemplate {
  version: 1;
  name: string;
  size: { x: number; y: number; z: number };
  blocks: { rx: number; ry: number; rz: number; id: number }[];
}

export class TemplateSerializer {
  /**
   * ClipboardData を JSON ファイルに保存する（.voxtemplate 拡張子）
   * File System Access API が使える場合はネイティブ保存ダイアログ、
   * それ以外は <a download> フォールバックを使う
   *
   * @param data  保存するクリップボードデータ
   * @param name  テンプレート名（ファイル名のデフォルト値に使用）
   */
  static async save(data: ClipboardData, name: string): Promise<void> {
    const template = this.fromClipboard(data, name);
    const json = JSON.stringify(template);
    const blob = new Blob([json], { type: 'application/json' });
    const safeFileName = name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'template';

    // File System Access API が使える場合
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: `${safeFileName}.voxtemplate`,
          types: [{
            description: 'Voxel Template',
            accept: { 'application/json': ['.voxtemplate'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return; // ユーザーがキャンセル
        // フォールバックへ
      }
    }

    // フォールバック: <a download>
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName}.voxtemplate`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * .voxtemplate ファイルを読み込んで ClipboardData に変換する
   * File System Access API が使える場合はネイティブファイル選択ダイアログ、
   * それ以外は <input type="file"> フォールバックを使う
   *
   * @returns ロード結果（名前と ClipboardData）、キャンセル時は null
   */
  static async load(): Promise<{ name: string; data: ClipboardData } | null> {
    // File System Access API が使える場合
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
        }).showOpenFilePicker({
          types: [{
            description: 'Voxel Template',
            accept: { 'application/json': ['.voxtemplate'] },
          }],
        });
        const file = await handle.getFile();
        const json = await file.text();
        return this.parseJson(json);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return null;
        // フォールバックへ
      }
    }

    // フォールバック: <input type="file">
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.voxtemplate';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const json = await file.text();
        const result = TemplateSerializer.parseJson(json);
        resolve(result);
      };
      // ファイル選択がキャンセルされた場合への対応
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * StructureTemplate を ClipboardData に変換する
   *
   * @param template  変換元のテンプレート
   * @returns ClipboardData
   */
  static toClipboard(template: StructureTemplate): ClipboardData {
    return {
      blocks: template.blocks.map((b) => ({
        rx: b.rx,
        ry: b.ry,
        rz: b.rz,
        id: b.id,
      })),
      size: { ...template.size },
    };
  }

  /**
   * ClipboardData を StructureTemplate に変換する
   *
   * @param data  変換元のクリップボードデータ
   * @param name  テンプレート名
   * @returns StructureTemplate
   */
  static fromClipboard(data: ClipboardData, name: string): StructureTemplate {
    return {
      version: 1,
      name,
      size: { ...data.size },
      blocks: data.blocks.map((b) => ({
        rx: b.rx,
        ry: b.ry,
        rz: b.rz,
        id: b.id,
      })),
    };
  }

  /**
   * JSON 文字列を解析して { name, data } を返す
   * 不正なフォーマットの場合は null を返す
   */
  private static parseJson(json: string): { name: string; data: ClipboardData } | null {
    try {
      const raw = JSON.parse(json) as unknown;
      if (
        typeof raw !== 'object' || raw === null ||
        !('version' in raw) || (raw as StructureTemplate).version !== 1
      ) {
        console.error('[TemplateSerializer] サポートされていないフォーマットです');
        return null;
      }
      const template = raw as StructureTemplate;
      return {
        name: template.name ?? 'imported',
        data: this.toClipboard(template),
      };
    } catch (e) {
      console.error('[TemplateSerializer] JSON パースエラー:', e);
      return null;
    }
  }
}
