import * as THREE from 'three';
import { BlockTypes } from './BlockTypes';

export const CHUNK_SIZE = 16;

// 6方向: +X, -X, +Y, -Y, +Z, -Z
const FACES = [
  { dir: [1, 0, 0], verts: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], normal: [1,0,0] },
  { dir: [-1, 0, 0], verts: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], normal: [-1,0,0] },
  { dir: [0, 1, 0], verts: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], normal: [0,1,0] },
  { dir: [0, -1, 0], verts: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], normal: [0,-1,0] },
  { dir: [0, 0, 1], verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], normal: [0,0,1] },
  { dir: [0, 0, -1], verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], normal: [0,0,-1] },
];

export class Chunk {
  // ブロックデータ（0 = 空気）
  readonly blocks: Uint8Array;
  readonly cx: number; // チャンク座標
  readonly cz: number;
  mesh: THREE.Mesh | null = null;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  }

  // ローカル座標 → 配列インデックス
  index(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
      return BlockTypes.AIR;
    }
    return this.blocks[this.index(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.blocks[this.index(x, y, z)] = id;
  }

  // メッシュ生成（隣接面カリング）
  buildMesh(): THREE.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vertCount = 0;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = this.getBlock(x, y, z);
          if (blockId === BlockTypes.AIR) continue;

          const def = BlockTypes.get(blockId);
          if (!def) continue;

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // 隣接ブロックが空気なら面を描画
            if (this.getBlock(nx, ny, nz) === BlockTypes.AIR) {
              for (const v of face.verts) {
                positions.push(v[0] + x, v[1] + y, v[2] + z);
                normals.push(face.normal[0], face.normal[1], face.normal[2]);
                colors.push(def.color.r, def.color.g, def.color.b);
              }
              indices.push(
                vertCount, vertCount + 1, vertCount + 2,
                vertCount, vertCount + 2, vertCount + 3,
              );
              vertCount += 4;
            }
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);

    // ワールド座標にオフセット
    mesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);

    // 古いメッシュを破棄
    this.dispose();
    this.mesh = mesh;
    return mesh;
  }

  /** メッシュを再構築（親グループへの追加は呼び出し側が管理） */
  rebuildMesh(parent: THREE.Object3D): void {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    const newMesh = this.buildMesh();
    parent.add(newMesh);
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }
}
