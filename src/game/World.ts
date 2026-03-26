import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Chunk, CHUNK_SIZE } from '../voxel/Chunk';
import { BlockTypes } from '../voxel/BlockTypes';
import { generateTerrain } from '../voxel/WorldGen';

// マップサイズ（ブロック単位）
const MAP_W = 64;
const MAP_D = 64;
const CHUNKS_X = MAP_W / CHUNK_SIZE; // 4
const CHUNKS_Z = MAP_D / CHUNK_SIZE; // 4

export class World {
  readonly chunks: Chunk[] = [];
  readonly group = new THREE.Group();
  // ブロック座標 → コライダーハンドルのマップ（地面以外の設置ブロック用）
  private blockColliders = new Map<string, { body: RAPIER.RigidBody; collider: RAPIER.Collider }>();

  constructor(private physicsWorld: RAPIER.World) {
    this.generate();
  }

  private blockKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  // Simplex Noise 地形を生成
  private generate(): void {
    // チャンクを作成
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        this.chunks.push(new Chunk(cx, cz));
      }
    }

    // 地形生成
    generateTerrain(this.chunks, CHUNKS_X, CHUNKS_Z);

    // メッシュ構築
    for (const chunk of this.chunks) {
      const mesh = chunk.buildMesh();
      this.group.add(mesh);
    }

    // 地形コライダーを構築（表面ブロックのみ）
    this.rebuildTerrainColliders();
  }

  /** 地形の表面ブロックにコライダーを付与（初期生成用） */
  private rebuildTerrainColliders(): void {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const chunk = this.chunks[cz * CHUNKS_X + cx];
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let y = CHUNK_SIZE - 1; y >= 0; y--) {
              const id = chunk.getBlock(lx, y, lz);
              if (id === BlockTypes.AIR) continue;
              // 上が空気（または範囲外）なら表面ブロック → コライダー追加
              const above = chunk.getBlock(lx, y + 1, lz);
              if (above === BlockTypes.AIR || y === CHUNK_SIZE - 1) {
                const wx = cx * CHUNK_SIZE + lx;
                const wz = cz * CHUNK_SIZE + lz;
                const key = this.blockKey(wx, y, wz);
                const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                  .setTranslation(wx + 0.5, y + 0.5, wz + 0.5);
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

  /** チャンクデータをロード（ロード時に使用） */
  loadChunkData(cx: number, cz: number, blocks: number[]): void {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const chunk = this.chunks[cz * CHUNKS_X + cx];
    chunk.blocks.set(blocks);
    chunk.rebuildMesh(this.group);
  }

  /** 全動的コライダーを再構築（ロード後に呼び出す） */
  rebuildAllColliders(): void {
    // 既存の動的コライダーを全削除
    for (const entry of this.blockColliders.values()) {
      this.physicsWorld.removeCollider(entry.collider, true);
      this.physicsWorld.removeRigidBody(entry.body);
    }
    this.blockColliders.clear();

    // 全チャンクを走査してAIR以外 & 地面(y=0)以外にコライダー追加
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const chunk = this.chunks[cz * CHUNKS_X + cx];
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = chunk.getBlock(x, y, z);
              if (id === BlockTypes.AIR) continue;
              const wx = cx * CHUNK_SIZE + x;
              const wz = cz * CHUNK_SIZE + z;
              // 地面(y=0)は固定コライダーがあるのでスキップ
              if (y === 0) continue;
              const key = this.blockKey(wx, y, wz);
              const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                .setTranslation(wx + 0.5, y + 0.5, wz + 0.5);
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

  /** チャンクデータをロード（ロード時に使用） */
  loadChunkData(cx: number, cz: number, blocks: number[]): void {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const chunk = this.chunks[cz * CHUNKS_X + cx];
    chunk.blocks.set(blocks);
    chunk.rebuildMesh(this.group);
  }

  /** 全動的コライダーを再構築（ロード後に呼び出す） */
  rebuildAllColliders(): void {
    // 既存の動的コライダーを全削除
    for (const entry of this.blockColliders.values()) {
      this.physicsWorld.removeCollider(entry.collider, true);
      this.physicsWorld.removeRigidBody(entry.body);
    }
    this.blockColliders.clear();

    // 全チャンクを走査してAIR以外 & 地面(y=0)以外にコライダー追加
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const chunk = this.chunks[cz * CHUNKS_X + cx];
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = chunk.getBlock(x, y, z);
              if (id === BlockTypes.AIR) continue;
              const wx = cx * CHUNK_SIZE + x;
              const wz = cz * CHUNK_SIZE + z;
              // 地面(y=0)は固定コライダーがあるのでスキップ
              if (y === 0) continue;
              const key = this.blockKey(wx, y, wz);
              const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                .setTranslation(wx + 0.5, y + 0.5, wz + 0.5);
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

  // ワールド座標 → ブロック取得
  getBlock(wx: number, wy: number, wz: number): number {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return BlockTypes.AIR;
    const chunk = this.chunks[cz * CHUNKS_X + cx];
    return chunk.getBlock(
      wx - cx * CHUNK_SIZE,
      wy,
      wz - cz * CHUNK_SIZE,
    );
  }

  // ワールド座標 → ブロック設置・変更
  setBlock(wx: number, wy: number, wz: number, id: number): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const chunk = this.chunks[cz * CHUNKS_X + cx];
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const oldId = chunk.getBlock(lx, wy, lz);
    chunk.setBlock(lx, wy, lz, id);
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

    // 境界ブロックの場合は隣接チャンクも再構築
    if (lx === 0 && cx > 0) {
      this.chunks[cz * CHUNKS_X + (cx - 1)].rebuildMesh(this.group);
    }
    if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) {
      this.chunks[cz * CHUNKS_X + (cx + 1)].rebuildMesh(this.group);
    }
    if (lz === 0 && cz > 0) {
      this.chunks[(cz - 1) * CHUNKS_X + cx].rebuildMesh(this.group);
    }
    if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) {
      this.chunks[(cz + 1) * CHUNKS_X + cx].rebuildMesh(this.group);
    }
  }
}
