import { World } from '../game/World';

/** 保存フォーマット */
interface VoxMap {
  version: number;
  mapW: number;
  mapD: number;
  chunks: { cx: number; cz: number; blocks: number[] }[];
}

export class MapSerializer {
  /** World → JSON 文字列 */
  static serialize(world: World): string {
    const data: VoxMap = {
      version: 1,
      mapW: 64,
      mapD: 64,
      chunks: world.chunks.map((chunk) => ({
        cx: chunk.cx,
        cz: chunk.cz,
        blocks: Array.from(chunk.blocks),
      })),
    };
    return JSON.stringify(data);
  }

  /** JSON 文字列 → World にロード */
  static deserialize(json: string, world: World): void {
    const data: VoxMap = JSON.parse(json);
    if (data.version !== 1) {
      throw new Error(`Unsupported voxmap version: ${data.version}`);
    }
    for (const chunkData of data.chunks) {
      world.loadChunkData(chunkData.cx, chunkData.cz, chunkData.blocks);
    }
    world.rebuildAllColliders();
  }

  /** ファイルに保存 */
  static async save(world: World): Promise<void> {
    const json = this.serialize(world);
    const blob = new Blob([json], { type: 'application/json' });

    // File System Access API が使える場合
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'world.voxmap',
          types: [{
            description: 'Voxel Map',
            accept: { 'application/json': ['.voxmap'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return; // ユーザーがキャンセル
        // フォールバックへ
      }
    }

    // フォールバック: <a download>
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'world.voxmap';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** ファイルからロード */
  static async load(world: World): Promise<void> {
    // File System Access API が使える場合
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Voxel Map',
            accept: { 'application/json': ['.voxmap'] },
          }],
        });
        const file = await handle.getFile();
        const json = await file.text();
        this.deserialize(json, world);
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
      }
    }

    // フォールバック: <input type="file">
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.voxmap';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const json = await file.text();
      this.deserialize(json, world);
    };
    input.click();
  }
}
