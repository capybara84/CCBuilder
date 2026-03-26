import { createNoise2D } from 'simplex-noise';
import { Chunk, CHUNK_SIZE } from './Chunk';
import { BlockTypes } from './BlockTypes';

const WATER_LEVEL = 3; // 海面の高さ
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 14;

/**
 * Simplex Noise によるプロシージャル地形生成
 */
export function generateTerrain(
  chunks: Chunk[],
  chunksX: number,
  chunksZ: number,
): void {
  const noise2D = createNoise2D();

  // 高さマップを生成
  const mapW = chunksX * CHUNK_SIZE;
  const mapD = chunksZ * CHUNK_SIZE;
  const heightMap = new Uint8Array(mapW * mapD);

  for (let wz = 0; wz < mapD; wz++) {
    for (let wx = 0; wx < mapW; wx++) {
      // 複数オクターブのノイズを合成
      const nx = wx / mapW;
      const nz = wz / mapD;
      let h = 0;
      h += noise2D(nx * 4, nz * 4) * 1.0;    // 大きな丘
      h += noise2D(nx * 8, nz * 8) * 0.5;     // 中程度の起伏
      h += noise2D(nx * 16, nz * 16) * 0.25;  // 細かいディテール
      h /= 1.75; // 正規化 (-1 ~ 1)

      // 高さを範囲にマッピング
      const height = Math.floor(MIN_HEIGHT + (h + 1) / 2 * (MAX_HEIGHT - MIN_HEIGHT));
      heightMap[wz * mapW + wx] = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
    }
  }

  // チャンクにブロックを配置
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const chunk = chunks[cz * chunksX + cx];

      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = cx * CHUNK_SIZE + lx;
          const wz = cz * CHUNK_SIZE + lz;
          const surfaceY = heightMap[wz * mapW + wx];

          for (let y = 0; y < CHUNK_SIZE; y++) {
            if (y > surfaceY) {
              // 地表より上
              if (y <= WATER_LEVEL) {
                // 水面以下の空気 → 水
                chunk.setBlock(lx, y, lz, BlockTypes.WATER);
              }
              // それ以外は AIR（デフォルト）
            } else if (y === surfaceY) {
              // 最上面
              if (surfaceY <= WATER_LEVEL) {
                // 水中・水際 → 砂
                chunk.setBlock(lx, y, lz, BlockTypes.SAND);
              } else {
                chunk.setBlock(lx, y, lz, BlockTypes.GRASS);
              }
            } else if (y >= surfaceY - 3) {
              // 地表 -1 〜 -3 → 土
              chunk.setBlock(lx, y, lz, BlockTypes.DIRT);
            } else {
              // それ以下 → 石
              chunk.setBlock(lx, y, lz, BlockTypes.STONE);
            }
          }
        }
      }
    }
  }
}

/** 指定ワールド座標の地表高さを取得 */
export function getTerrainHeight(
  chunks: Chunk[],
  chunksX: number,
  wx: number,
  wz: number,
): number {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunks[cz * chunksX + cx];
  if (!chunk) return 1;
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  // 上から走査して最初の非AIR・非WATERブロックを探す
  for (let y = CHUNK_SIZE - 1; y >= 0; y--) {
    const id = chunk.getBlock(lx, y, lz);
    if (id !== BlockTypes.AIR && id !== BlockTypes.WATER) {
      return y + 1; // ブロック上面
    }
  }
  return 1;
}
