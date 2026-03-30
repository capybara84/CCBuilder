import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Chunk, CHUNK_SIZE } from '../voxel/Chunk';
import { BlockTypes } from '../voxel/BlockTypes';
import { generateTerrain } from '../voxel/WorldGen';

// マップサイズ（ブロック単位）
export const MAP_W = 128;
export const MAP_D = 128;
export const MAP_H = 32; // Y方向の最大高さ
export const CHUNKS_X = MAP_W / CHUNK_SIZE; // 8
export const CHUNKS_Y = MAP_H / CHUNK_SIZE; // 2
export const CHUNKS_Z = MAP_D / CHUNK_SIZE; // 8

export class World {
  readonly chunks: Chunk[] = [];
  readonly group = new THREE.Group();
  // ブロック座標 → コライダーハンドルのマップ（地面以外の設置ブロック用）
  private blockColliders = new Map<string, { body: RAPIER.RigidBody; collider: RAPIER.Collider }>();
  private torchLights = new Map<string, THREE.PointLight>();
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  constructor(private physicsWorld: RAPIER.World) {
    this.generate();
  }

  private blockKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /** チャンクインデックス (cx, cy, cz) → 配列index */
  private chunkIndex(cx: number, cy: number, cz: number): number {
    return cy * CHUNKS_X * CHUNKS_Z + cz * CHUNKS_X + cx;
  }

  /** チャンクを取得（範囲外なら undefined） */
  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    if (cx < 0 || cx >= CHUNKS_X || cy < 0 || cy >= CHUNKS_Y || cz < 0 || cz >= CHUNKS_Z) {
      return undefined;
    }
    return this.chunks[this.chunkIndex(cx, cy, cz)];
  }

  // Simplex Noise 地形を生成
  private generate(): void {
    // チャンクを作成（Y段 → Z → X の順）
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cz = 0; cz < CHUNKS_Z; cz++) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
          this.chunks.push(new Chunk(cx, cy, cz));
        }
      }
    }

    // 地形生成
    generateTerrain(this.chunks, CHUNKS_X, CHUNKS_Y, CHUNKS_Z);

    // メッシュ構築
    for (const chunk of this.chunks) {
      const mesh = chunk.buildMesh();
      this.group.add(mesh);
      if (chunk.transparentMesh) this.group.add(chunk.transparentMesh);
      if (chunk.waterMesh) this.group.add(chunk.waterMesh);
    }

    // 地形コライダーを構築（表面ブロックのみ）
    this.rebuildTerrainColliders();
  }

  /** 地形の表面ブロックにコライダーを付与（初期生成用） */
  private rebuildTerrainColliders(): void {
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cz = 0; cz < CHUNKS_Z; cz++) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
          const chunk = this.chunks[this.chunkIndex(cx, cy, cz)];
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              for (let ly = CHUNK_SIZE - 1; ly >= 0; ly--) {
                const id = chunk.getBlock(lx, ly, lz);
                if (id === BlockTypes.AIR) continue;
                // ワールドY座標
                const wy = cy * CHUNK_SIZE + ly;
                // 上が空気なら表面ブロック → コライダー追加
                const aboveId = this.getBlock(
                  cx * CHUNK_SIZE + lx,
                  wy + 1,
                  cz * CHUNK_SIZE + lz,
                );
                if (aboveId === BlockTypes.AIR) {
                  const wx = cx * CHUNK_SIZE + lx;
                  const wz = cz * CHUNK_SIZE + lz;
                  const key = this.blockKey(wx, wy, wz);
                  const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                    .setTranslation(wx + 0.5, wy + 0.5, wz + 0.5);
                  const body = this.physicsWorld.createRigidBody(bodyDesc);
                  const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
                  const collider = this.physicsWorld.createCollider(colliderDesc, body);
                  this.blockColliders.set(key, { body, collider });
                }
              }
            }
          }
        }
      }
    }
  }

  /** チャンクデータをロード（ロード時に使用） */
  loadChunkData(cx: number, cy: number, cz: number, blocks: number[]): void {
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return;
    chunk.blocks.set(blocks);
    chunk.rebuildMesh(this.group);
  }

  /** 全コライダーを再構築（ロード後に呼び出す） */
  rebuildAllColliders(): void {
    // 既存のコライダーを全削除
    for (const entry of this.blockColliders.values()) {
      this.physicsWorld.removeCollider(entry.collider, true);
      this.physicsWorld.removeRigidBody(entry.body);
    }
    this.blockColliders.clear();

    // rebuildTerrainColliders と同じ表面コライダー方式で再構築
    this.rebuildTerrainColliders();
  }

  // ワールド座標 → ブロック取得
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= MAP_H) return BlockTypes.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return BlockTypes.AIR;
    return chunk.getBlock(
      wx - cx * CHUNK_SIZE,
      wy - cy * CHUNK_SIZE,
      wz - cz * CHUNK_SIZE,
    );
  }

  // ワールド座標 → ブロック設置・変更
  setBlock(wx: number, wy: number, wz: number, id: number): void {
    if (wy < 0 || wy >= MAP_H) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_SIZE;
    const ly = wy - cy * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const oldId = chunk.getBlock(lx, ly, lz);
    chunk.setBlock(lx, ly, lz, id);
    chunk.rebuildMesh(this.group);

    // コライダー管理
    const key = this.blockKey(wx, wy, wz);
    if (oldId !== BlockTypes.AIR && id === BlockTypes.AIR) {
      // ブロック破壊 → コライダー削除
      const entry = this.blockColliders.get(key);
      if (entry) {
        this.physicsWorld.removeCollider(entry.collider, true);
        this.physicsWorld.removeRigidBody(entry.body);
        this.blockColliders.delete(key);
      }
    } else if (oldId === BlockTypes.AIR && id !== BlockTypes.AIR) {
      // ブロック設置 → コライダー追加
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(wx + 0.5, wy + 0.5, wz + 0.5);
      const body = this.physicsWorld.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
      const collider = this.physicsWorld.createCollider(colliderDesc, body);
      this.blockColliders.set(key, { body, collider });
    }

    // 松明ライト管理
    if (oldId === BlockTypes.TORCH && id !== BlockTypes.TORCH) {
      // 松明が破壊された → ライト削除
      const light = this.torchLights.get(key);
      if (light) {
        this.group.remove(light);
        light.dispose();
        this.torchLights.delete(key);
      }
    }
    if (id === BlockTypes.TORCH && oldId !== BlockTypes.TORCH) {
      // 松明が設置された → PointLight作成
      const light = new THREE.PointLight(0xffaa44, 1.5, 12, 1);
      light.position.set(wx + 0.5, wy + 0.8, wz + 0.5);
      this.group.add(light);
      this.torchLights.set(key, light);
    }

    // 境界ブロックの場合は隣接チャンクも再構築
    if (lx === 0 && cx > 0) {
      this.getChunk(cx - 1, cy, cz)?.rebuildMesh(this.group);
    }
    if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) {
      this.getChunk(cx + 1, cy, cz)?.rebuildMesh(this.group);
    }
    if (ly === 0 && cy > 0) {
      this.getChunk(cx, cy - 1, cz)?.rebuildMesh(this.group);
    }
    if (ly === CHUNK_SIZE - 1 && cy < CHUNKS_Y - 1) {
      this.getChunk(cx, cy + 1, cz)?.rebuildMesh(this.group);
    }
    if (lz === 0 && cz > 0) {
      this.getChunk(cx, cy, cz - 1)?.rebuildMesh(this.group);
    }
    if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) {
      this.getChunk(cx, cy, cz + 1)?.rebuildMesh(this.group);
    }
  }

  /**
   * 複数ブロックをまとめて変更するバッチメソッド
   * 影響チャンクを Set で収集し、全変更適用後に各チャンクを1回だけ rebuildMesh する
   */
  setBlockBatch(changes: { wx: number; wy: number; wz: number; id: number }[]): void {
    // 影響するチャンクインデックスを収集するための Set
    const dirtyChunks = new Set<number>();

    for (const change of changes) {
      const { wx, wy, wz, id } = change;
      if (wy < 0 || wy >= MAP_H) continue;

      const cx = Math.floor(wx / CHUNK_SIZE);
      const cy = Math.floor(wy / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const chunk = this.getChunk(cx, cy, cz);
      if (!chunk) continue;

      const lx = wx - cx * CHUNK_SIZE;
      const ly = wy - cy * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;
      const oldId = chunk.getBlock(lx, ly, lz);

      // データを更新
      chunk.setBlock(lx, ly, lz, id);
      dirtyChunks.add(this.chunkIndex(cx, cy, cz));

      // コライダー管理
      const key = this.blockKey(wx, wy, wz);
      if (oldId !== BlockTypes.AIR && id === BlockTypes.AIR) {
        // ブロック破壊 → コライダー削除
        const entry = this.blockColliders.get(key);
        if (entry) {
          this.physicsWorld.removeCollider(entry.collider, true);
          this.physicsWorld.removeRigidBody(entry.body);
          this.blockColliders.delete(key);
        }
      } else if (oldId === BlockTypes.AIR && id !== BlockTypes.AIR) {
        // ブロック設置 → コライダー追加
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(wx + 0.5, wy + 0.5, wz + 0.5);
        const body = this.physicsWorld.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
        const collider = this.physicsWorld.createCollider(colliderDesc, body);
        this.blockColliders.set(key, { body, collider });
      } else if (oldId !== BlockTypes.AIR && id !== BlockTypes.AIR && oldId !== id) {
        // ブロック種類の変更（破壊 + 設置）→ 既存コライダーはそのまま流用
      }

      // 松明ライト管理
      if (oldId === BlockTypes.TORCH && id !== BlockTypes.TORCH) {
        const light = this.torchLights.get(key);
        if (light) {
          this.group.remove(light);
          light.dispose();
          this.torchLights.delete(key);
        }
      }
      if (id === BlockTypes.TORCH && oldId !== BlockTypes.TORCH) {
        const light = new THREE.PointLight(0xffaa44, 1.5, 12, 1);
        light.position.set(wx + 0.5, wy + 0.8, wz + 0.5);
        this.group.add(light);
        this.torchLights.set(key, light);
      }

      // 境界ブロックの場合は隣接チャンクもダーティに追加
      if (lx === 0 && cx > 0) {
        const neighborIdx = this.chunkIndex(cx - 1, cy, cz);
        if (this.getChunk(cx - 1, cy, cz)) dirtyChunks.add(neighborIdx);
      }
      if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) {
        const neighborIdx = this.chunkIndex(cx + 1, cy, cz);
        if (this.getChunk(cx + 1, cy, cz)) dirtyChunks.add(neighborIdx);
      }
      if (ly === 0 && cy > 0) {
        const neighborIdx = this.chunkIndex(cx, cy - 1, cz);
        if (this.getChunk(cx, cy - 1, cz)) dirtyChunks.add(neighborIdx);
      }
      if (ly === CHUNK_SIZE - 1 && cy < CHUNKS_Y - 1) {
        const neighborIdx = this.chunkIndex(cx, cy + 1, cz);
        if (this.getChunk(cx, cy + 1, cz)) dirtyChunks.add(neighborIdx);
      }
      if (lz === 0 && cz > 0) {
        const neighborIdx = this.chunkIndex(cx, cy, cz - 1);
        if (this.getChunk(cx, cy, cz - 1)) dirtyChunks.add(neighborIdx);
      }
      if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) {
        const neighborIdx = this.chunkIndex(cx, cy, cz + 1);
        if (this.getChunk(cx, cy, cz + 1)) dirtyChunks.add(neighborIdx);
      }
    }

    // ダーティチャンクを1回だけ再構築
    for (const idx of dirtyChunks) {
      this.chunks[idx]?.rebuildMesh(this.group);
    }
  }

  /** 視錐台カリング: カメラの視野外のチャンクメッシュを非表示にする */
  updateVisibility(camera: THREE.Camera): void {
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const box = new THREE.Box3();
    for (const chunk of this.chunks) {
      const wx = chunk.cx * CHUNK_SIZE;
      const wy = chunk.cy * CHUNK_SIZE;
      const wz = chunk.cz * CHUNK_SIZE;
      box.min.set(wx, wy, wz);
      box.max.set(wx + CHUNK_SIZE, wy + CHUNK_SIZE, wz + CHUNK_SIZE);
      const visible = this.frustum.intersectsBox(box);
      if (chunk.mesh) chunk.mesh.visible = visible;
      if (chunk.transparentMesh) chunk.transparentMesh.visible = visible;
      if (chunk.waterMesh) chunk.waterMesh.visible = visible;
    }
  }
}
