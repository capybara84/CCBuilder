import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Chunk, CHUNK_SIZE } from '../voxel/Chunk';
import { BlockTypes } from '../voxel/BlockTypes';

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

  // フラット地形を生成
  private generate(): void {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const chunk = new Chunk(cx, cz);

        // y=0 に草ブロックを敷き詰める
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            chunk.setBlock(x, 0, z, BlockTypes.GRASS);
          }
        }

        const mesh = chunk.buildMesh();
        this.group.add(mesh);
        this.chunks.push(chunk);
      }
    }

    // 地面コライダー（薄い箱）
    const halfW = MAP_W / 2;
    const halfD = MAP_D / 2;
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(halfW, 0.5, halfD); // y=0.5 → ブロック上面が y=1
    const body = this.physicsWorld.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, 0.5, halfD);
    this.physicsWorld.createCollider(colliderDesc, body);
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
