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

  constructor(private physicsWorld: RAPIER.World) {
    this.generate();
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
}
