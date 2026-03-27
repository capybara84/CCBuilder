import { World, MAP_W, MAP_D, MAP_H, CHUNKS_X, CHUNKS_Z } from '../game/World';
import { CHUNK_SIZE } from '../voxel/Chunk';

/** 保存フォーマット v2（Y段対応） */
interface VoxMapV2 {
  version: number;
  mapW: number;
  mapD: number;
  mapH: number;
  chunks: { cx: number; cy: number; cz: number; blocks: number[] }[];
}

/** v1 フォーマット（後方互換用） */
interface VoxMapV1 {
  version: number;
  mapW: number;
  mapD: number;
  chunks: { cx: number; cz: number; blocks: number[] }[];
}

export class MapSerializer {
  /** World → JSON 文字列 */
  static serialize(world: World): string {
    const data: VoxMapV2 = {
      version: 2,
      mapW: MAP_W,
      mapD: MAP_D,
      mapH: MAP_H,
      chunks: world.chunks.map((chunk) => ({
        cx: chunk.cx,
        cy: chunk.cy,
        cz: chunk.cz,
        blocks: Array.from(chunk.blocks),
      })),
    };
    return JSON.stringify(data);
  }

  /** JSON 文字列 → World にロード */
  static deserialize(json: string, world: World): void {
    const raw = JSON.parse(json);
    if (raw.version === 1) {
      this.deserializeV1(raw as VoxMapV1, world);
    } else if (raw.version === 2) {
      this.deserializeV2(raw as VoxMapV2, world);
    } else {
      throw new Error(`Unsupported voxmap version: ${raw.version}`);
    }
    world.rebuildAllColliders();
  }

  /** v2 フォーマットのロード */
  private static deserializeV2(data: VoxMapV2, world: World): void {
    for (const chunkData of data.chunks) {
      world.loadChunkData(chunkData.cx, chunkData.cy, chunkData.cz, chunkData.blocks);
    }
  }

  /** v1 フォーマットのロード（後方互換: cy=0、旧マップを中央にオフセット） */
  private static deserializeV1(data: VoxMapV1, world: World): void {
    const oldChunksX = data.mapW / CHUNK_SIZE;
    const oldChunksZ = data.mapD / CHUNK_SIZE;
    // 旧マップを新ワールドの中央に配置
    const offsetX = Math.floor((CHUNKS_X - oldChunksX) / 2);
    const offsetZ = Math.floor((CHUNKS_Z - oldChunksZ) / 2);
    for (const chunkData of data.chunks) {
      world.loadChunkData(chunkData.cx + offsetX, 0, chunkData.cz + offsetZ, chunkData.blocks);
    }
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
