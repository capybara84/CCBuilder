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
let sharedWaterMaterial: THREE.ShaderMaterial | null = null;

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
    // 水面用シェーダーマテリアル
    sharedWaterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: sharedAtlas.texture },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalMatrix * normal;
          vec3 pos = position;
          // 上面のみ波を適用（法線が上向き）
          // 上面を少し下げて隣接ブロックとの z-fighting を防止
          if (normal.y > 0.5) {
            pos.y -= 0.1;
            pos.y += sin(pos.x * 2.0 + uTime * 1.5) * 0.04
                   + sin(pos.z * 1.5 + uTime * 1.2) * 0.03;
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec4 texColor = texture2D(uTexture, vUv);
          // 簡易ライティング
          float light = dot(normalize(vNormal), normalize(vec3(0.5, 1.0, 0.3)));
          light = 0.6 + 0.4 * max(light, 0.0);
          gl_FragColor = vec4(texColor.rgb * light, 0.55);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
  return sharedAtlas;
}

export function getSharedMaterial(): THREE.MeshLambertMaterial {
  getAtlas();
  return sharedMaterial!;
}

export function getSharedTransparentMaterial(): THREE.MeshLambertMaterial {
  getAtlas();
  return sharedTransparentMaterial!;
}

export function getSharedWaterMaterial(): THREE.ShaderMaterial {
  getAtlas();
  return sharedWaterMaterial!;
}

/** 水面シェーダーの時間を更新（Game.ts から毎フレーム呼ぶ） */
export function updateWaterTime(time: number): void {
  if (sharedWaterMaterial) {
    sharedWaterMaterial.uniforms.uTime.value = time;
  }
}

export class Chunk {
  readonly blocks: Uint8Array;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  mesh: THREE.Mesh | null = null;
  transparentMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  }

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

  private shouldRenderFace(blockId: number, neighborId: number): boolean {
    if (neighborId === BlockTypes.AIR) return true;
    if (!BlockTypes.isTransparent(blockId) && BlockTypes.isTransparent(neighborId)) return true;
    if (BlockTypes.isTransparent(blockId) && neighborId !== blockId) return true;
    return false;
  }

  // メッシュ生成（不透明 / 半透明 / 水 の3種に分離）
  buildMesh(): THREE.Mesh {
    const atlas = getAtlas();

    // 不透明用
    const oPos: number[] = [], oNor: number[] = [], oUvs: number[] = [], oIdx: number[] = [];
    let oVert = 0;
    // 半透明用（Glass, Leaves など）
    const tPos: number[] = [], tNor: number[] = [], tUvs: number[] = [], tIdx: number[] = [];
    let tVert = 0;
    // 水用
    const wPos: number[] = [], wNor: number[] = [], wUvs: number[] = [], wIdx: number[] = [];
    let wVert = 0;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = this.getBlock(x, y, z);
          if (blockId === BlockTypes.AIR) continue;

          const blockUV = atlas.blockUVs.get(blockId);
          if (!blockUV) continue;

          const isWater = blockId === BlockTypes.WATER;
          const isTransparent = !isWater && BlockTypes.isTransparent(blockId);

          let pos: number[], nor: number[], uv: number[], idx: number[], vert: number;
          if (isWater) {
            pos = wPos; nor = wNor; uv = wUvs; idx = wIdx; vert = wVert;
          } else if (isTransparent) {
            pos = tPos; nor = tNor; uv = tUvs; idx = tIdx; vert = tVert;
          } else {
            pos = oPos; nor = oNor; uv = oUvs; idx = oIdx; vert = oVert;
          }

          for (const face of FACES) {
            // 水ブロックは上面のみ描画（側面/底面はちらつき防止のため省略）
            if (isWater && face.faceType !== 'top') continue;

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

          if (isWater) wVert = vert;
          else if (isTransparent) tVert = vert;
          else oVert = vert;
        }
      }
    }

    const worldX = this.cx * CHUNK_SIZE;
    const worldY = this.cy * CHUNK_SIZE;
    const worldZ = this.cz * CHUNK_SIZE;

    // 不透明メッシュ
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.Float32BufferAttribute(oPos, 3));
    oGeo.setAttribute('normal', new THREE.Float32BufferAttribute(oNor, 3));
    oGeo.setAttribute('uv', new THREE.Float32BufferAttribute(oUvs, 2));
    oGeo.setIndex(oIdx);
    const opaqueMesh = new THREE.Mesh(oGeo, getSharedMaterial());
    opaqueMesh.position.set(worldX, worldY, worldZ);
    opaqueMesh.castShadow = true;
    opaqueMesh.receiveShadow = true;

    // 半透明メッシュ（Glass, Leaves）
    this.disposeTransparent();
    if (tPos.length > 0) {
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
      tGeo.setAttribute('normal', new THREE.Float32BufferAttribute(tNor, 3));
      tGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tUvs, 2));
      tGeo.setIndex(tIdx);
      const transMesh = new THREE.Mesh(tGeo, getSharedTransparentMaterial());
      transMesh.position.set(worldX, worldY, worldZ);
      transMesh.receiveShadow = true;
      transMesh.renderOrder = 1;
      this.transparentMesh = transMesh;
    } else {
      this.transparentMesh = null;
    }

    // 水メッシュ（ShaderMaterial で波アニメ）
    this.disposeWater();
    if (wPos.length > 0) {
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNor, 3));
      wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUvs, 2));
      wGeo.setIndex(wIdx);
      const waterMesh = new THREE.Mesh(wGeo, getSharedWaterMaterial());
      waterMesh.position.set(worldX, worldY, worldZ);
      waterMesh.receiveShadow = true;
      waterMesh.renderOrder = 2;
      this.waterMesh = waterMesh;
    } else {
      this.waterMesh = null;
    }

    this.dispose();
    this.mesh = opaqueMesh;
    return opaqueMesh;
  }

  rebuildMesh(parent: THREE.Object3D): void {
    if (this.mesh?.parent) parent.remove(this.mesh);
    if (this.transparentMesh?.parent) parent.remove(this.transparentMesh);
    if (this.waterMesh?.parent) parent.remove(this.waterMesh);
    const newMesh = this.buildMesh();
    parent.add(newMesh);
    if (this.transparentMesh) parent.add(this.transparentMesh);
    if (this.waterMesh) parent.add(this.waterMesh);
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

  private disposeWater(): void {
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
