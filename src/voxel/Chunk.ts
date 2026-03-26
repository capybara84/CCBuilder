import * as THREE from 'three';
import { BlockTypes } from './BlockTypes';
import { TextureAtlas } from './TextureAtlas';

export const CHUNK_SIZE = 16;

// 面タイプ: 上/下/横
type FaceType = 'top' | 'bottom' | 'side';

// 6方向: +X, -X, +Y, -Y, +Z, -Z
// 頂点順序は全面統一: [下左, 下右, 上右, 上左] → UV: (u0,v0), (u1,v0), (u1,v1), (u0,v1)
const FACES: { dir: number[]; verts: number[][]; normal: number[]; faceType: FaceType }[] = [
  { dir: [1, 0, 0], verts: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], normal: [1,0,0], faceType: 'side' },
  { dir: [-1, 0, 0], verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], normal: [-1,0,0], faceType: 'side' },
  { dir: [0, 1, 0], verts: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], normal: [0,1,0], faceType: 'top' },
  { dir: [0, -1, 0], verts: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], normal: [0,-1,0], faceType: 'bottom' },
  { dir: [0, 0, 1], verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], normal: [0,0,1], faceType: 'side' },
  { dir: [0, 0, -1], verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], normal: [0,0,-1], faceType: 'side' },
];

// 共有テクスチャアトラス（遅延初期化）
let sharedAtlas: TextureAtlas | null = null;
let sharedMaterial: THREE.MeshLambertMaterial | null = null;
let sharedTransparentMaterial: THREE.MeshLambertMaterial | null = null;

export function getAtlas(): TextureAtlas {
  if (!sharedAtlas) {
    sharedAtlas = new TextureAtlas();
    sharedMaterial = new THREE.MeshLambertMaterial({
      map: sharedAtlas.texture,
    });
    sharedTransparentMaterial = new THREE.MeshLambertMaterial({
      map: sharedAtlas.texture,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
  return sharedAtlas;
}

export function getSharedMaterial(): THREE.MeshLambertMaterial {
  getAtlas(); // 初期化保証
  return sharedMaterial!;
}

export function getSharedTransparentMaterial(): THREE.MeshLambertMaterial {
  getAtlas();
  return sharedTransparentMaterial!;
}

export class Chunk {
  // ブロックデータ（0 = 空気）
  readonly blocks: Uint8Array;
  readonly cx: number; // チャンク座標
  readonly cz: number;
  mesh: THREE.Mesh | null = null;
  transparentMesh: THREE.Mesh | null = null;

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

  /** 面を描画すべきか判定 */
  private shouldRenderFace(blockId: number, neighborId: number): boolean {
    if (neighborId === BlockTypes.AIR) return true;
    // 不透明ブロック → 隣が透明なら描画
    if (!BlockTypes.isTransparent(blockId) && BlockTypes.isTransparent(neighborId)) return true;
    // 透明ブロック → 隣が異なる透明ブロックなら描画
    if (BlockTypes.isTransparent(blockId) && neighborId !== blockId) return true;
    return false;
  }

  // メッシュ生成（不透明と半透明を分離）
  buildMesh(): THREE.Mesh {
    const atlas = getAtlas();

    // 不透明用
    const oPos: number[] = [];
    const oNor: number[] = [];
    const oUvs: number[] = [];
    const oIdx: number[] = [];
    let oVert = 0;

    // 半透明用
    const tPos: number[] = [];
    const tNor: number[] = [];
    const tUvs: number[] = [];
    const tIdx: number[] = [];
    let tVert = 0;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = this.getBlock(x, y, z);
          if (blockId === BlockTypes.AIR) continue;

          const blockUV = atlas.blockUVs.get(blockId);
          if (!blockUV) continue;

          const isTransparent = BlockTypes.isTransparent(blockId);
          const pos = isTransparent ? tPos : oPos;
          const nor = isTransparent ? tNor : oNor;
          const uv = isTransparent ? tUvs : oUvs;
          const idx = isTransparent ? tIdx : oIdx;
          let vert = isTransparent ? tVert : oVert;

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighborId = this.getBlock(nx, ny, nz);

            if (this.shouldRenderFace(blockId, neighborId)) {
              const [col, row] = blockUV[face.faceType];
              const [u0, v0, u1, v1] = atlas.getUVRect(col, row);

              for (const v of face.verts) {
                pos.push(v[0] + x, v[1] + y, v[2] + z);
                nor.push(face.normal[0], face.normal[1], face.normal[2]);
              }
              uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
              idx.push(vert, vert + 1, vert + 2, vert, vert + 2, vert + 3);
              vert += 4;
            }
          }

          if (isTransparent) tVert = vert;
          else oVert = vert;
        }
      }
    }

    // 不透明メッシュ
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.Float32BufferAttribute(oPos, 3));
    oGeo.setAttribute('normal', new THREE.Float32BufferAttribute(oNor, 3));
    oGeo.setAttribute('uv', new THREE.Float32BufferAttribute(oUvs, 2));
    oGeo.setIndex(oIdx);

    const opaqueMesh = new THREE.Mesh(oGeo, getSharedMaterial());
    opaqueMesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);

    // 半透明メッシュ
    if (tPos.length > 0) {
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
      tGeo.setAttribute('normal', new THREE.Float32BufferAttribute(tNor, 3));
      tGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tUvs, 2));
      tGeo.setIndex(tIdx);

      const transMesh = new THREE.Mesh(tGeo, getSharedTransparentMaterial());
      transMesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);
      transMesh.renderOrder = 1; // 不透明の後に描画

      this.disposeTransparent();
      this.transparentMesh = transMesh;
    } else {
      this.disposeTransparent();
      this.transparentMesh = null;
    }

    // 古い不透明メッシュを破棄
    this.dispose();
    this.mesh = opaqueMesh;
    return opaqueMesh;
  }

  /** メッシュを再構築（親グループへの追加は呼び出し側が管理） */
  rebuildMesh(parent: THREE.Object3D): void {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    if (this.transparentMesh && this.transparentMesh.parent) {
      this.transparentMesh.parent.remove(this.transparentMesh);
    }
    const newMesh = this.buildMesh();
    parent.add(newMesh);
    if (this.transparentMesh) {
      parent.add(this.transparentMesh);
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }

  private disposeTransparent(): void {
    if (this.transparentMesh) {
      this.transparentMesh.geometry.dispose();
      this.transparentMesh = null;
    }
  }
}
