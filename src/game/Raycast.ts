import * as THREE from 'three';

/** レイキャスト結果 */
export interface RaycastHit {
  /** ヒットしたブロックのワールド座標 */
  blockPos: THREE.Vector3;
  /** ヒット面の法線（設置先を求めるのに使用） */
  normal: THREE.Vector3;
}

/**
 * ボクセルワールドへのレイキャスト（DDA アルゴリズム）
 *
 * @param origin   レイの始点（カメラ位置）
 * @param direction レイの方向（正規化済み）
 * @param maxDist  最大トレース距離（ブロック数）
 * @param getBlock ワールド座標からブロックIDを返す関数（0 = AIR）
 * @returns ヒット情報、または null
 */
export function voxelRaycast(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist: number,
  getBlock: (x: number, y: number, z: number) => number,
): RaycastHit | null {
  // 現在のボクセル座標
  let ix = Math.floor(origin.x);
  let iy = Math.floor(origin.y);
  let iz = Math.floor(origin.z);

  // ステップ方向（+1 or -1）
  const stepX = direction.x >= 0 ? 1 : -1;
  const stepY = direction.y >= 0 ? 1 : -1;
  const stepZ = direction.z >= 0 ? 1 : -1;

  // 各軸で次のボクセル境界までの t
  const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
  const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
  const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

  let tMaxX = direction.x !== 0
    ? ((stepX > 0 ? ix + 1 - origin.x : origin.x - ix) * tDeltaX)
    : Infinity;
  let tMaxY = direction.y !== 0
    ? ((stepY > 0 ? iy + 1 - origin.y : origin.y - iy) * tDeltaY)
    : Infinity;
  let tMaxZ = direction.z !== 0
    ? ((stepZ > 0 ? iz + 1 - origin.z : origin.z - iz) * tDeltaZ)
    : Infinity;

  // 法線追跡用
  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t < maxDist) {
    const block = getBlock(ix, iy, iz);
    if (block !== 0) {
      return {
        blockPos: new THREE.Vector3(ix, iy, iz),
        normal: new THREE.Vector3(nx, ny, nz),
      };
    }

    // 最小の tMax 方向に進む
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        ix += stepX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else {
        t = tMaxZ;
        iz += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        t = tMaxY;
        iy += stepY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        t = tMaxZ;
        iz += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
  }

  return null;
}
