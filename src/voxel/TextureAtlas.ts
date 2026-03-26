import * as THREE from 'three';

const TEX_SIZE = 16; // 各テクスチャのピクセルサイズ
const ATLAS_COLS = 6; // アトラスの列数
const ATLAS_ROWS = 3; // 行数（top, side, bottom）
const ATLAS_W = TEX_SIZE * ATLAS_COLS;
const ATLAS_H = TEX_SIZE * ATLAS_ROWS;

/** ブロックごとの面テクスチャ UV 情報 */
export interface BlockUV {
  top: [number, number];   // アトラス内 [col, row]
  side: [number, number];
  bottom: [number, number];
}

/** シンプルな疑似乱数（シード付き） */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** テクスチャアトラスを生成 */
export class TextureAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  readonly blockUVs: Map<number, BlockUV> = new Map();

  // UV サイズ（アトラス内の1テクスチャの UV 幅/高さ）
  readonly uvW = 1 / ATLAS_COLS;
  readonly uvH = 1 / ATLAS_ROWS;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    const ctx = this.canvas.getContext('2d')!;

    // ブロック定義: [id, name, generator]
    const generators: [number, (ctx: CanvasRenderingContext2D, x: number, y: number) => void,
                                (ctx: CanvasRenderingContext2D, x: number, y: number) => void,
                                (ctx: CanvasRenderingContext2D, x: number, y: number) => void][] = [
      [1, this.genGrassTop, this.genGrassSide, this.genDirt],       // Grass
      [2, this.genDirt, this.genDirt, this.genDirt],                 // Dirt
      [3, this.genStone, this.genStone, this.genStone],              // Stone
      [4, this.genWoodTop, this.genWoodSide, this.genWoodTop],       // Wood
      [5, this.genSand, this.genSand, this.genSand],                 // Sand
      [6, this.genWater, this.genWater, this.genWater],              // Water
    ];

    generators.forEach(([id, topGen, sideGen, bottomGen], col) => {
      // row 0 = top, row 1 = side, row 2 = bottom
      topGen.call(this, ctx, col * TEX_SIZE, 0 * TEX_SIZE);
      sideGen.call(this, ctx, col * TEX_SIZE, 1 * TEX_SIZE);
      bottomGen.call(this, ctx, col * TEX_SIZE, 2 * TEX_SIZE);

      this.blockUVs.set(id, {
        top: [col, 0],
        side: [col, 1],
        bottom: [col, 2],
      });
    });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** UV 座標を取得（アトラス内のセル位置 → [u0, v0, u1, v1]） */
  getUVRect(col: number, row: number): [number, number, number, number] {
    const u0 = col * this.uvW;
    const v0 = 1 - (row + 1) * this.uvH; // Y反転
    const u1 = u0 + this.uvW;
    const v1 = v0 + this.uvH;
    return [u0, v0, u1, v1];
  }

  // === テクスチャ生成関数 ===

  private genGrassTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(101);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const g = 100 + Math.floor(rng() * 60);
        const r = 30 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${r},${g},${20 + Math.floor(rng() * 20)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genGrassSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(102);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        if (y < 4) {
          // 上部: 緑の草帯
          const g = 90 + Math.floor(rng() * 60);
          ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 20)},${g},${20 + Math.floor(rng() * 15)})`;
        } else {
          // 下部: 茶色の土
          const base = 100 + Math.floor(rng() * 40);
          ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.6)},${Math.floor(base * 0.3)})`;
        }
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genDirt(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(201);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 110 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.55)},${Math.floor(base * 0.25)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genStone(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(301);
    // ベースのグレー
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 110 + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // ひび割れライン
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 6; i++) {
      const sx = Math.floor(rng() * TEX_SIZE);
      const sy = Math.floor(rng() * TEX_SIZE);
      const len = 2 + Math.floor(rng() * 4);
      for (let j = 0; j < len; j++) {
        ctx.fillRect(ox + ((sx + j) % TEX_SIZE), oy + sy, 1, 1);
      }
    }
  }

  private genWoodTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(401);
    // 年輪パターン
    const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const ring = Math.sin(dist * 1.8) * 0.5 + 0.5;
        const base = 130 + Math.floor(ring * 40) + Math.floor(rng() * 15);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.6)},${Math.floor(base * 0.3)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genWoodSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(402);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // 縦の木目ライン
        const stripe = Math.sin(x * 1.5 + rng() * 0.3) * 0.5 + 0.5;
        const base = 120 + Math.floor(stripe * 40) + Math.floor(rng() * 15);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.55)},${Math.floor(base * 0.28)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genSand(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(501);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 190 + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.85)},${Math.floor(base * 0.5)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  private genWater(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(601);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const wave = Math.sin(x * 0.8 + y * 0.5) * 20;
        const b = 180 + Math.floor(wave) + Math.floor(rng() * 20);
        ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 20)},${80 + Math.floor(rng() * 30)},${b})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}
