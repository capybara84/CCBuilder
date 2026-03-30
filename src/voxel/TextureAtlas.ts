import * as THREE from 'three';

const TEX_SIZE = 16; // 各テクスチャのピクセルサイズ
const ATLAS_COLS = 102; // アトラスの列数（ブロック数）
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

type TexGen = (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void;

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

    // ブロック定義: [id, topGen, sideGen, bottomGen]
    const generators: [number, TexGen, TexGen, TexGen][] = [
      [1,  this.genGrassTop, this.genGrassSide, this.genDirt],       // Grass
      [2,  this.genDirt, this.genDirt, this.genDirt],                 // Dirt
      [3,  this.genStone, this.genStone, this.genStone],              // Stone
      [4,  this.genWoodTop, this.genWoodSide, this.genWoodTop],       // Wood
      [5,  this.genSand, this.genSand, this.genSand],                 // Sand
      [6,  this.genWater, this.genWater, this.genWater],              // Water
      [7,  this.genOakLogTop, this.genOakLogSide, this.genOakLogTop], // Oak Log
      [8,  this.genLeaves, this.genLeaves, this.genLeaves],           // Leaves
      [9,  this.genFlowerTop, this.genFlowerSide, this.genDirt],      // Flower
      [10, this.genSnow, this.genSnow, this.genSnow],                 // Snow
      [11, this.genIce, this.genIce, this.genIce],                    // Ice
      [12, this.genBrick, this.genBrick, this.genBrick],               // Brick
      [13, this.genStoneBrick, this.genStoneBrick, this.genStoneBrick],// Stone Brick
      [14, this.genGlass, this.genGlass, this.genGlass],               // Glass
      [15, this.genPlanks, this.genPlanks, this.genPlanks],            // Planks
      [16, this.genWool(0xf0f0f0, 1601), this.genWool(0xf0f0f0, 1602), this.genWool(0xf0f0f0, 1603)], // Wool White
      [17, this.genWool(0xcc3333, 1701), this.genWool(0xcc3333, 1702), this.genWool(0xcc3333, 1703)], // Wool Red
      [18, this.genWool(0x3355cc, 1801), this.genWool(0x3355cc, 1802), this.genWool(0x3355cc, 1803)], // Wool Blue
      [19, this.genCobblestone, this.genCobblestone, this.genCobblestone],   // Cobblestone
      [20, this.genCite(0xb0a090, 2001), this.genCite(0xb0a090, 2002), this.genCite(0xb0a090, 2003)], // Clay
      [21, this.genGravel, this.genGravel, this.genGravel],                  // Gravel
      [22, this.genSandstoneTop, this.genSandstoneSide, this.genSandstoneTop], // Sandstone
      [23, this.genCactusTop, this.genCactusSide, this.genCactusTop],        // Cactus
      [24, this.genMushroomTop, this.genMushroomSide, this.genMushroomSide], // Mushroom
      [25, this.genPumpkinTop, this.genPumpkinSide, this.genPumpkinTop],     // Pumpkin
      [26, this.genCite(0xcccccc, 2601), this.genCite(0xcccccc, 2602), this.genCite(0xcccccc, 2603)], // Concrete
      [27, this.genTile, this.genTile, this.genTile],                        // Tile
      [28, this.genIron2, this.genIron2, this.genIron2],                     // Iron
      [29, this.genWool(0xddcc33, 2901), this.genWool(0xddcc33, 2902), this.genWool(0xddcc33, 2903)], // Wool Yellow
      [30, this.genWool(0x33aa33, 3001), this.genWool(0x33aa33, 3002), this.genWool(0x33aa33, 3003)], // Wool Green
      [31, this.genWool(0xdd8833, 3101), this.genWool(0xdd8833, 3102), this.genWool(0xdd8833, 3103)], // Wool Orange
      [32, this.genWool(0x222222, 3201), this.genWool(0x222222, 3202), this.genWool(0x222222, 3203)], // Wool Black
      [33, this.genBookshelfTop, this.genBookshelfSide, this.genBookshelfTop], // Bookshelf
      [34, this.genTorchTop, this.genTorchSide, this.genTorchTop],           // Torch
      // === 自然物追加 ===
      [35, this.genLogTop(0xd4c89a, 3501), this.genLogSide(0xc8b880, 3502), this.genLogTop(0xd4c89a, 3503)], // Birch Log
      [36, this.genLogTop(0x4a3218, 3601), this.genLogSide(0x5a3e1b, 3602), this.genLogTop(0x4a3218, 3603)], // Jungle Log
      [37, this.genLogTop(0x1e1208, 3701), this.genLogSide(0x2e1f0e, 3702), this.genLogTop(0x1e1208, 3703)], // Dark Oak Log
      [38, this.genCite(0x7fb87f, 3801), this.genCite(0x7fb87f, 3802), this.genCite(0x7fb87f, 3803)], // Birch Leaves
      [39, this.genCite(0x1a7a1a, 3901), this.genCite(0x1a7a1a, 3902), this.genCite(0x1a7a1a, 3903)], // Jungle Leaves
      [40, this.genMossStone, this.genMossStone, this.genMossStone],          // Moss Stone
      [41, this.genCite(0x6b5040, 4101), this.genCite(0x6b5040, 4102), this.genCite(0x6b5040, 4103)], // Mud
      [42, this.genCite(0x7a6070, 4201), this.genCite(0x7a6070, 4202), this.genCite(0x7a6070, 4203)], // Mycelium
      [43, this.genNetherRack, this.genNetherRack, this.genNetherRack],        // Nether Rack
      [44, this.genCite(0x5a4a38, 4401), this.genCite(0x5a4a38, 4402), this.genCite(0x5a4a38, 4403)], // Soul Sand
      [45, this.genCite(0x4a4a50, 4501), this.genCite(0x4a4a50, 4502), this.genCite(0x4a4a50, 4503)], // Basalt
      [46, this.genMagma, this.genMagma, this.genMagma],                       // Magma
      [47, this.genCite(0xdd4444, 4701), this.genCite(0xdd4444, 4702), this.genCite(0xdd4444, 4703)], // Coral Red
      [48, this.genCite(0x4466dd, 4801), this.genCite(0x4466dd, 4802), this.genCite(0x4466dd, 4803)], // Coral Blue
      [49, this.genSponge, this.genSponge, this.genSponge],                    // Sponge
      [50, this.genGranite, this.genGranite, this.genGranite],                 // Granite
      [51, this.genCite(0x909090, 5101), this.genCite(0x909090, 5102), this.genCite(0x909090, 5103)], // Andesite
      [52, this.genCite(0xd0d0d0, 5201), this.genCite(0xd0d0d0, 5202), this.genCite(0xd0d0d0, 5203)], // Diorite
      [53, this.genBedrock, this.genBedrock, this.genBedrock],                 // Bedrock
      [54, this.genOre(0x555555, 0x111111, 5401), this.genOre(0x555555, 0x111111, 5402), this.genOre(0x555555, 0x111111, 5403)], // Coal Ore
      [55, this.genOre(0x888870, 0xcc8866, 5501), this.genOre(0x888870, 0xcc8866, 5502), this.genOre(0x888870, 0xcc8866, 5503)], // Iron Ore
      [56, this.genOre(0x888870, 0xffd700, 5601), this.genOre(0x888870, 0xffd700, 5602), this.genOre(0x888870, 0xffd700, 5603)], // Gold Ore
      [57, this.genOre(0x888870, 0x00e5ff, 5701), this.genOre(0x888870, 0x00e5ff, 5702), this.genOre(0x888870, 0x00e5ff, 5703)], // Diamond Ore
      [58, this.genOre(0x888870, 0x00e060, 5801), this.genOre(0x888870, 0x00e060, 5802), this.genOre(0x888870, 0x00e060, 5803)], // Emerald Ore
      // === 建材追加 ===
      [59, this.genMossyStoneBrick, this.genMossyStoneBrick, this.genMossyStoneBrick], // Mossy Stone Brick
      [60, this.genCrackedStoneBrick, this.genCrackedStoneBrick, this.genCrackedStoneBrick], // Cracked Stone Brick
      [61, this.genChiseledStone, this.genChiseledStone, this.genChiseledStone], // Chiseled Stone
      [62, this.genCite(0xbbbbbb, 6201), this.genCite(0xbbbbbb, 6202), this.genCite(0xbbbbbb, 6203)], // Smooth Stone
      [63, this.genCite(0xd8c870, 6301), this.genCite(0xd8c870, 6302), this.genCite(0xd8c870, 6303)], // Cut Sandstone
      [64, this.genCite(0xb86030, 6401), this.genCite(0xb86030, 6402), this.genCite(0xb86030, 6403)], // Red Sandstone
      [65, this.genDarkBrick(0x3a1a1a, 6501), this.genDarkBrick(0x3a1a1a, 6502), this.genDarkBrick(0x3a1a1a, 6503)], // Nether Brick
      [66, this.genDarkBrick(0x6a1010, 6601), this.genDarkBrick(0x6a1010, 6602), this.genDarkBrick(0x6a1010, 6603)], // Red Nether Brick
      [67, this.genCite(0x996699, 6701), this.genCite(0x996699, 6702), this.genCite(0x996699, 6703)], // Purpur Block
      [68, this.genCite(0xd8d890, 6801), this.genCite(0xd8d890, 6802), this.genCite(0xd8d890, 6803)], // End Stone
      [69, this.genObsidian, this.genObsidian, this.genObsidian],              // Obsidian
      [70, this.genQuartz, this.genQuartz, this.genQuartz],                    // Quartz
      [71, this.genCite(0xf4f0e8, 7101), this.genCite(0xf4f0e8, 7102), this.genCite(0xf4f0e8, 7103)], // Smooth Quartz
      [72, this.genMetalBlock(0xf0c020, 7201), this.genMetalBlock(0xf0c020, 7202), this.genMetalBlock(0xf0c020, 7203)], // Gold Block
      [73, this.genMetalBlock(0x60d8e0, 7301), this.genMetalBlock(0x60d8e0, 7302), this.genMetalBlock(0x60d8e0, 7303)], // Diamond Block
      [74, this.genMetalBlock(0x20c050, 7401), this.genMetalBlock(0x20c050, 7402), this.genMetalBlock(0x20c050, 7403)], // Emerald Block
      [75, this.genMetalBlock(0x2244aa, 7501), this.genMetalBlock(0x2244aa, 7502), this.genMetalBlock(0x2244aa, 7503)], // Lapis Block
      [76, this.genCite(0x222222, 7601), this.genCite(0x222222, 7602), this.genCite(0x222222, 7603)], // Coal Block
      [77, this.genMetalBlock(0xc07848, 7701), this.genMetalBlock(0xc07848, 7702), this.genMetalBlock(0xc07848, 7703)], // Copper Block
      [78, this.genMetalBlock(0xd89060, 7801), this.genMetalBlock(0xd89060, 7802), this.genMetalBlock(0xd89060, 7803)], // Waxed Copper
      [79, this.genAmethyst, this.genAmethyst, this.genAmethyst],              // Amethyst Block
      [80, this.genCite(0x444450, 8001), this.genCite(0x444450, 8002), this.genCite(0x444450, 8003)], // Deepslate
      [81, this.genCite(0x383840, 8101), this.genCite(0x383840, 8102), this.genCite(0x383840, 8103)], // Smooth Basalt
      [82, this.genCite(0x7a7a70, 8201), this.genCite(0x7a7a70, 8202), this.genCite(0x7a7a70, 8203)], // Tuff
      [83, this.genCite(0xeeeee8, 8301), this.genCite(0xeeeee8, 8302), this.genCite(0xeeeee8, 8303)], // Calcite
      [84, this.genCite(0x9a8870, 8401), this.genCite(0x9a8870, 8402), this.genCite(0x9a8870, 8403)], // Dripstone
      [85, this.genDarkBrick(0x9a7a5a, 8501), this.genDarkBrick(0x9a7a5a, 8502), this.genDarkBrick(0x9a7a5a, 8503)], // Mud Brick
      // === 装飾追加 ===
      [86,  this.genWool(0x882299, 8601),  this.genWool(0x882299, 8602),  this.genWool(0x882299, 8603)],  // Wool Purple
      [87,  this.genWool(0x229988, 8701),  this.genWool(0x229988, 8702),  this.genWool(0x229988, 8703)],  // Wool Cyan
      [88,  this.genWool(0x66cc33, 8801),  this.genWool(0x66cc33, 8802),  this.genWool(0x66cc33, 8803)],  // Wool Lime
      [89,  this.genWool(0xee8899, 8901),  this.genWool(0xee8899, 8902),  this.genWool(0xee8899, 8903)],  // Wool Pink
      [90,  this.genWool(0xcc44aa, 9001),  this.genWool(0xcc44aa, 9002),  this.genWool(0xcc44aa, 9003)],  // Wool Magenta
      [91,  this.genWool(0x7a5030, 9101),  this.genWool(0x7a5030, 9102),  this.genWool(0x7a5030, 9103)],  // Wool Brown
      [92,  this.genWool(0x777788, 9201),  this.genWool(0x777788, 9202),  this.genWool(0x777788, 9203)],  // Wool Gray
      [93,  this.genWool(0x6699ee, 9301),  this.genWool(0x6699ee, 9302),  this.genWool(0x6699ee, 9303)],  // Wool Light Blue
      [94,  this.genTerracotta(0xaa4433, 9401), this.genTerracotta(0xaa4433, 9402), this.genTerracotta(0xaa4433, 9403)], // Glazed Terracotta Red
      [95,  this.genTerracotta(0x334488, 9501), this.genTerracotta(0x334488, 9502), this.genTerracotta(0x334488, 9503)], // Glazed Terracotta Blue
      [96,  this.genTerracotta(0xccaa22, 9601), this.genTerracotta(0xccaa22, 9602), this.genTerracotta(0xccaa22, 9603)], // Glazed Terracotta Yellow
      [97,  this.genTerracotta(0x336633, 9701), this.genTerracotta(0x336633, 9702), this.genTerracotta(0x336633, 9703)], // Glazed Terracotta Green
      [98,  this.genTerracotta(0xddddcc, 9801), this.genTerracotta(0xddddcc, 9802), this.genTerracotta(0xddddcc, 9803)], // Glazed Terracotta White
      [99,  this.genLantern, this.genLantern, this.genLantern],               // Lantern
      [100, this.genGlowstone, this.genGlowstone, this.genGlowstone],         // Glowstone
      [101, this.genSeaLantern, this.genSeaLantern, this.genSeaLantern],       // Sea Lantern
      [102, this.genShroomlight, this.genShroomlight, this.genShroomlight],    // Shroomlight
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

  // === 基本テクスチャ生成関数 ===

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
          const g = 90 + Math.floor(rng() * 60);
          ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 20)},${g},${20 + Math.floor(rng() * 15)})`;
        } else {
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
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 110 + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
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

  // === 新ブロック テクスチャ生成 ===

  /** 丸太の上面（年輪） */
  private genOakLogTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(701);
    const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const ring = Math.sin(dist * 2.5) * 0.5 + 0.5;
        const base = 90 + Math.floor(ring * 50) + Math.floor(rng() * 10);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.55)},${Math.floor(base * 0.25)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 丸太の側面（樹皮） */
  private genOakLogSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(702);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // 縦方向の樹皮パターン
        const bark = Math.sin(x * 2.0 + rng() * 0.5) * 0.3 + 0.7;
        const base = 60 + Math.floor(bark * 40) + Math.floor(rng() * 15);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.6)},${Math.floor(base * 0.3)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 横方向のひび
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 4; i++) {
      const sy = Math.floor(rng() * TEX_SIZE);
      for (let x = 0; x < TEX_SIZE; x++) {
        if (rng() > 0.3) ctx.fillRect(ox + x, oy + sy, 1, 1);
      }
    }
  }

  /** 葉ブロック */
  private genLeaves(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(801);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const g = 60 + Math.floor(rng() * 80);
        const r = 10 + Math.floor(rng() * 30);
        const b = 10 + Math.floor(rng() * 20);
        const a = rng() > 0.15 ? 1.0 : 0.0; // 隙間
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 花ブロック（上面: 花びら） */
  private genFlowerTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(901);
    // ベース: 緑
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const g = 90 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 20)},${g},${20 + Math.floor(rng() * 15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 花びらドット
    const colors = ['rgb(220,50,50)', 'rgb(240,200,40)', 'rgb(240,120,180)', 'rgb(255,255,100)'];
    for (let i = 0; i < 5; i++) {
      const fx = 2 + Math.floor(rng() * 12);
      const fy = 2 + Math.floor(rng() * 12);
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      ctx.fillRect(ox + fx, oy + fy, 2, 2);
      ctx.fillRect(ox + fx - 1, oy + fy, 1, 2);
      ctx.fillRect(ox + fx + 2, oy + fy, 1, 2);
      ctx.fillRect(ox + fx, oy + fy - 1, 2, 1);
      ctx.fillRect(ox + fx, oy + fy + 2, 2, 1);
    }
  }

  /** 花ブロック（側面: 茎と花） */
  private genFlowerSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(902);
    // ベース: 緑（草地）
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const g = 90 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 20)},${g},${20 + Math.floor(rng() * 15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 茎
    ctx.fillStyle = 'rgb(40,120,30)';
    ctx.fillRect(ox + 5, oy + 4, 1, 10);
    ctx.fillRect(ox + 10, oy + 6, 1, 8);
    // 花
    ctx.fillStyle = 'rgb(220,50,50)';
    ctx.fillRect(ox + 4, oy + 2, 3, 3);
    ctx.fillStyle = 'rgb(240,200,40)';
    ctx.fillRect(ox + 9, oy + 4, 3, 3);
  }

  /** 雪ブロック */
  private genSnow(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1001);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 230 + Math.floor(rng() * 25);
        ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 5)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 氷ブロック */
  private genIce(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1101);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const wave = Math.sin(x * 0.6 + y * 0.4) * 15;
        const v = 180 + Math.floor(wave) + Math.floor(rng() * 20);
        ctx.fillStyle = `rgb(${v - 30},${v - 10},${Math.min(255, v + 10)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // ひび割れ
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 3; i++) {
      let lx = Math.floor(rng() * TEX_SIZE);
      let ly = Math.floor(rng() * TEX_SIZE);
      for (let j = 0; j < 5; j++) {
        ctx.fillRect(ox + lx, oy + ly, 1, 1);
        lx += Math.floor(rng() * 3) - 1;
        ly += Math.floor(rng() * 3) - 1;
        lx = Math.max(0, Math.min(TEX_SIZE - 1, lx));
        ly = Math.max(0, Math.min(TEX_SIZE - 1, ly));
      }
    }
  }

  /** レンガ */
  private genBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1201);
    // ベース: レンガ色
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 150 + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.45)},${Math.floor(base * 0.3)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 目地線（横4段、各段でオフセット）
    ctx.fillStyle = 'rgb(180,170,150)';
    for (let row = 0; row < 4; row++) {
      const gy = row * 4;
      for (let x = 0; x < TEX_SIZE; x++) {
        ctx.fillRect(ox + x, oy + gy, 1, 1);
      }
      // 縦目地（段ごとにオフセット）
      const offset = (row % 2) * 4;
      for (let col = 0; col < 2; col++) {
        const gx = offset + col * 8;
        for (let y = gy; y < gy + 4 && y < TEX_SIZE; y++) {
          ctx.fillRect(ox + gx, oy + y, 1, 1);
        }
      }
    }
  }

  /** 石レンガ */
  private genStoneBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1301);
    // ベース: グレー
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 130 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 目地（横2段、各段でオフセット）
    ctx.fillStyle = 'rgb(90,90,90)';
    for (let row = 0; row < 2; row++) {
      const gy = row * 8;
      for (let x = 0; x < TEX_SIZE; x++) {
        ctx.fillRect(ox + x, oy + gy, 1, 1);
      }
      const offset = (row % 2) * 4;
      for (let col = 0; col < 2; col++) {
        const gx = offset + col * 8;
        for (let y = gy; y < gy + 8 && y < TEX_SIZE; y++) {
          ctx.fillRect(ox + gx, oy + y, 1, 1);
        }
      }
    }
  }

  /** ガラス */
  private genGlass(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    // 半透明の水色ベース
    ctx.fillStyle = 'rgba(200, 230, 240, 0.25)';
    ctx.fillRect(ox, oy, TEX_SIZE, TEX_SIZE);
    // 枠線
    ctx.fillStyle = 'rgba(180, 210, 230, 0.6)';
    for (let i = 0; i < TEX_SIZE; i++) {
      ctx.fillRect(ox + i, oy, 1, 1);           // 上
      ctx.fillRect(ox + i, oy + TEX_SIZE - 1, 1, 1); // 下
      ctx.fillRect(ox, oy + i, 1, 1);            // 左
      ctx.fillRect(ox + TEX_SIZE - 1, oy + i, 1, 1); // 右
    }
    // ハイライト
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(ox + 2, oy + 2, 3, 1);
    ctx.fillRect(ox + 2, oy + 3, 1, 2);
  }

  /** 板材 */
  private genPlanks(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1501);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // 板の境目（4ピクセルごと）
        const plank = Math.floor(x / 4);
        const plankSeed = plank * 17 + 1500;
        const pRng = seededRandom(plankSeed + y);
        const base = 160 + (plank * 13 % 30) + Math.floor(pRng() * 15);
        // 板の境目ライン
        if (x % 4 === 0) {
          ctx.fillStyle = `rgb(${base - 30},${Math.floor((base - 30) * 0.55)},${Math.floor((base - 30) * 0.25)})`;
        } else {
          ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.58)},${Math.floor(base * 0.28)})`;
        }
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 滑らかなベース色テクスチャ（粘土・コンクリート等に使用） */
  private genCite(colorHex: number, seed: number): TexGen {
    return (ctx: CanvasRenderingContext2D, ox: number, oy: number): void => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff;
      const g = (colorHex >> 8) & 0xff;
      const b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
          const noise = Math.floor(rng() * 12) - 6;
          ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + noise))},${Math.max(0, Math.min(255, g + noise))},${Math.max(0, Math.min(255, b + noise))})`;
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    };
  }

  /** 丸石（不揃いな石の集合） */
  private genCobblestone(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(1901);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 90 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 石の境目を暗い線で描画
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 10; i++) {
      const sx = Math.floor(rng() * TEX_SIZE);
      const sy = Math.floor(rng() * TEX_SIZE);
      const len = 2 + Math.floor(rng() * 3);
      const dir = rng() > 0.5;
      for (let j = 0; j < len; j++) {
        const px = dir ? sx + j : sx;
        const py = dir ? sy : sy + j;
        if (px < TEX_SIZE && py < TEX_SIZE) ctx.fillRect(ox + px, oy + py, 1, 1);
      }
    }
  }

  /** 砂利 */
  private genGravel(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2101);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 100 + Math.floor(rng() * 60);
        const tint = Math.floor(rng() * 15);
        ctx.fillStyle = `rgb(${v},${v - tint},${v - tint * 2})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 砂岩（上面） */
  private genSandstoneTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2201);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 180 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.82)},${Math.floor(base * 0.5)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 砂岩（側面: 横縞） */
  private genSandstoneSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2202);
    for (let y = 0; y < TEX_SIZE; y++) {
      const stripe = (y % 4 < 2) ? 10 : -10;
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 180 + stripe + Math.floor(rng() * 20);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.82)},${Math.floor(base * 0.5)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** サボテン（上面） */
  private genCactusTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2301);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const g = 80 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${20 + Math.floor(rng() * 15)},${g},${15 + Math.floor(rng() * 15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** サボテン（側面: トゲ付き） */
  private genCactusSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2302);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const stripe = Math.sin(x * 1.0) * 10;
        const g = 70 + Math.floor(stripe) + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${15 + Math.floor(rng() * 15)},${g},${10 + Math.floor(rng() * 15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // トゲ
    ctx.fillStyle = 'rgb(200,200,150)';
    for (let i = 0; i < 6; i++) {
      const tx = Math.floor(rng() * TEX_SIZE);
      const ty = Math.floor(rng() * TEX_SIZE);
      ctx.fillRect(ox + tx, oy + ty, 1, 1);
    }
  }

  /** キノコ（上面: 傘） */
  private genMushroomTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2401);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 120 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.4)},${Math.floor(base * 0.2)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 白い斑点
    ctx.fillStyle = 'rgb(240,240,230)';
    for (let i = 0; i < 5; i++) {
      const sx = 2 + Math.floor(rng() * 12);
      const sy = 2 + Math.floor(rng() * 12);
      ctx.fillRect(ox + sx, oy + sy, 2, 2);
    }
  }

  /** キノコ（側面: 軸） */
  private genMushroomSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2402);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        if (y < 6) {
          const base = 120 + Math.floor(rng() * 30);
          ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.4)},${Math.floor(base * 0.2)})`;
        } else {
          const v = 200 + Math.floor(rng() * 30);
          ctx.fillStyle = `rgb(${v},${v - 10},${v - 20})`;
        }
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** カボチャ（上面） */
  private genPumpkinTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2501);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 200 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.5)},${Math.floor(base * 0.15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 中央に茎
    ctx.fillStyle = 'rgb(80,120,40)';
    ctx.fillRect(ox + 7, oy + 7, 2, 2);
  }

  /** カボチャ（側面: 縦溝） */
  private genPumpkinSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2502);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const groove = Math.sin(x * 0.8) * 15;
        const base = 190 + Math.floor(groove) + Math.floor(rng() * 20);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.5)},${Math.floor(base * 0.15)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** タイル（格子模様） */
  private genTile(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2701);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 200 + Math.floor(rng() * 20);
        ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.92)},${Math.floor(base * 0.8)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // 格子線
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < TEX_SIZE; i++) {
      ctx.fillRect(ox + i, oy + 8, 1, 1);
      ctx.fillRect(ox + 8, oy + i, 1, 1);
    }
  }

  /** 鉄ブロック */
  private genIron2(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(2801);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const v = 170 + Math.floor(rng() * 25);
        ctx.fillStyle = `rgb(${v},${v},${v + 5})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    // メタリックなハイライト線
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(ox + 2, oy + 4, 12, 1);
    ctx.fillRect(ox + 2, oy + 11, 12, 1);
  }

  /** 本棚（上面: 木） */
  private genBookshelfTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    this.genPlanks(ctx, ox, oy);
  }

  /** 本棚（側面: 本が並んでいる） */
  private genBookshelfSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(3301);
    // 木枠（上下）
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 140 + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.55)},${Math.floor(base * 0.25)})`;
      ctx.fillRect(ox + x, oy, 1, 2);
      ctx.fillRect(ox + x, oy + 7, 1, 2);
      ctx.fillRect(ox + x, oy + 14, 1, 2);
    }
    // 本（上段）
    const bookColors = ['rgb(150,30,30)', 'rgb(30,80,150)', 'rgb(40,120,40)', 'rgb(140,100,30)', 'rgb(100,30,100)', 'rgb(180,150,30)'];
    for (let x = 0; x < TEX_SIZE; x++) {
      const color = bookColors[Math.floor(rng() * bookColors.length)];
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + 2, 1, 5);
    }
    // 本（下段）
    for (let x = 0; x < TEX_SIZE; x++) {
      const color = bookColors[Math.floor(rng() * bookColors.length)];
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + 9, 1, 5);
    }
  }

  /** 松明（上面: 小さい木の断面＋炎） */
  private genTorchTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(3401);
    // 全面透明
    ctx.clearRect(ox, oy, TEX_SIZE, TEX_SIZE);
    // 中央に小さい炎の丸（2x2の棒 + 周りに炎）
    for (let y = 5; y < 11; y++) {
      for (let x = 5; x < 11; x++) {
        const dist = Math.sqrt((x - 8) ** 2 + (y - 8) ** 2);
        if (dist < 1.5) {
          ctx.fillStyle = `rgb(255,${240 + Math.floor(rng() * 15)},${180 + Math.floor(rng() * 50)})`;
        } else if (dist < 3) {
          ctx.fillStyle = `rgb(255,${150 + Math.floor(rng() * 60)},${20 + Math.floor(rng() * 40)})`;
        }
        if (dist < 3) ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** 松明（側面: 細い棒＋炎、周り透明） */
  private genTorchSide(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(3402);
    // 全面透明
    ctx.clearRect(ox, oy, TEX_SIZE, TEX_SIZE);
    // 細い棒（2px幅）
    for (let y = 5; y < TEX_SIZE; y++) {
      const base = 95 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.5)},${Math.floor(base * 0.22)})`;
      ctx.fillRect(ox + 7, oy + y, 2, 1);
    }
    // 炎（上部、細めで上に伸びる形）
    for (let y = 0; y < 6; y++) {
      for (let x = 6; x < 10; x++) {
        const dist = Math.abs(x - 8) * 1.2 + y * 0.7;
        if (dist < 3) {
          if (y < 2) {
            ctx.fillStyle = `rgb(255,${230 + Math.floor(rng() * 25)},${120 + Math.floor(rng() * 80)})`;
          } else {
            ctx.fillStyle = `rgb(${230 + Math.floor(rng() * 25)},${110 + Math.floor(rng() * 60)},${Math.floor(rng() * 30)})`;
          }
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
  }

  // === 新規テクスチャ生成関数 ===

  /** 丸太汎用（上面: 年輪） */
  private genLogTop(colorHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
      const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const ring = Math.sin(dist * 2.5) * 0.5 + 0.5;
        const n = Math.floor(rng() * 12) - 6;
        ctx.fillStyle = `rgb(${Math.min(255,r+n+Math.floor(ring*20))},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    };
  }

  /** 丸太汎用（側面: 樹皮） */
  private genLogSide(colorHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const stripe = Math.sin(x * 2.0 + rng() * 0.3) * 0.3 + 0.7;
        const n = Math.floor(rng() * 10) - 5 + Math.floor(stripe * 20);
        ctx.fillStyle = `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    };
  }

  /** 苔石 */
  private genMossStone(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    this.genStone(ctx, ox, oy);
    const rng = seededRandom(4001);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      if (rng() < 0.25) {
        const g = 80 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgba(${20+Math.floor(rng()*20)},${g},${10+Math.floor(rng()*20)},0.7)`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** ネザーラック */
  private genNetherRack(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(4301);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 80 + Math.floor(rng() * 40);
      ctx.fillStyle = `rgb(${v},${Math.floor(v*0.25)},${Math.floor(v*0.25)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }

  /** マグマブロック */
  private genMagma(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(4601);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const heat = Math.sin(x * 0.8 + y * 0.6) * 0.5 + 0.5;
      const r = 150 + Math.floor(heat * 80) + Math.floor(rng() * 20);
      const g = Math.floor(heat * 60) + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${Math.min(255,r)},${g},0)`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }

  /** スポンジ */
  private genSponge(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(4901);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const base = 180 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${base},${base},${Math.floor(base*0.4)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    // 穴模様
    const rng2 = seededRandom(4902);
    for (let i = 0; i < 12; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  }

  /** 花崗岩 */
  private genGranite(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(5001);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 150 + Math.floor(rng() * 40);
      ctx.fillStyle = `rgb(${Math.min(255,v+20)},${Math.floor(v*0.7)},${Math.floor(v*0.6)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    const rng2 = seededRandom(5003);
    for (let i = 0; i < 8; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(80,40,30,0.4)';
      ctx.fillRect(ox + px, oy + py, 2, 1);
    }
  }

  /** 岩盤 */
  private genBedrock(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(5301);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 40 + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${v},${v},${v+5})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    const rng2 = seededRandom(5302);
    for (let i = 0; i < 10; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ox + px, oy + py, 2, 1);
    }
  }

  /** 鉱石（石ベース + 鉱脈ドット） */
  private genOre(baseHex: number, oreHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const br = (baseHex >> 16) & 0xff, bg = (baseHex >> 8) & 0xff, bb = baseHex & 0xff;
      const or_ = (oreHex >> 16) & 0xff, og = (oreHex >> 8) & 0xff, ob = oreHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const n = Math.floor(rng() * 20) - 10;
        ctx.fillStyle = `rgb(${br+n},${bg+n},${bb+n})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
      const rng2 = seededRandom(seed + 1);
      for (let i = 0; i < 8; i++) {
        const px = 1 + Math.floor(rng2() * (TEX_SIZE-2)), py = 1 + Math.floor(rng2() * (TEX_SIZE-2));
        ctx.fillStyle = `rgb(${or_},${og},${ob})`;
        ctx.fillRect(ox + px, oy + py, 2, 2);
      }
    };
  }

  /** 苔石レンガ */
  private genMossyStoneBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    this.genStoneBrick(ctx, ox, oy);
    const rng = seededRandom(5901);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      if (rng() < 0.2) {
        ctx.fillStyle = `rgba(30,${80+Math.floor(rng()*50)},20,0.65)`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** ひび割れ石レンガ */
  private genCrackedStoneBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    this.genStoneBrick(ctx, ox, oy);
    const rng = seededRandom(6001);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 5; i++) {
      const sx = Math.floor(rng() * TEX_SIZE), sy = Math.floor(rng() * TEX_SIZE);
      const len = 3 + Math.floor(rng() * 5);
      for (let j = 0; j < len; j++) ctx.fillRect(ox + ((sx+j) % TEX_SIZE), oy + sy, 1, 1);
    }
  }

  /** 彫刻石 */
  private genChiseledStone(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(6101);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 160 + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    // 十字パターン
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < TEX_SIZE; i++) {
      ctx.fillRect(ox + i, oy + 7, 1, 2);
      ctx.fillRect(ox + 7, oy + i, 2, 1);
    }
    ctx.fillRect(ox + 4, oy + 4, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(ox + 5, oy + 5, 6, 6);
  }

  /** 黒曜石 */
  private genObsidian(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(6901);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 15 + Math.floor(rng() * 15);
      ctx.fillStyle = `rgb(${v},${Math.floor(v*0.5)},${v+5})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    const rng2 = seededRandom(6902);
    for (let i = 0; i < 5; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(100,50,150,0.4)';
      ctx.fillRect(ox + px, oy + py, 2, 2);
    }
  }

  /** クォーツ */
  private genQuartz(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(7001);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 220 + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${v},${v-5},${v-10})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(ox + 3, oy + 3, 2, TEX_SIZE - 6);
    ctx.fillRect(ox + 11, oy + 3, 2, TEX_SIZE - 6);
  }

  /** メタルブロック汎用（金・ダイヤ・エメラルド等） */
  private genMetalBlock(colorHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const n = Math.floor(rng() * 16) - 8;
        ctx.fillStyle = `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(ox + 1, oy + 1, TEX_SIZE-2, 1);
      ctx.fillRect(ox + 1, oy + 1, 1, TEX_SIZE-2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(ox + 1, oy + TEX_SIZE-2, TEX_SIZE-2, 1);
      ctx.fillRect(ox + TEX_SIZE-2, oy + 1, 1, TEX_SIZE-2);
    };
  }

  /** アメジスト */
  private genAmethyst(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(7901);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 120 + Math.floor(rng() * 40);
      ctx.fillStyle = `rgb(${Math.floor(v*0.7)},${Math.floor(v*0.4)},${v})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    const rng2 = seededRandom(7902);
    for (let i = 0; i < 6; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(200,150,255,0.5)';
      ctx.fillRect(ox + px, oy + py, 2, 2);
    }
  }

  /** 暗色レンガ汎用（ネザーレンガ・泥レンガ等） */
  private genDarkBrick(colorHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const n = Math.floor(rng() * 16) - 8;
        ctx.fillStyle = `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 0; y < TEX_SIZE; y += 5) ctx.fillRect(ox, oy + y, TEX_SIZE, 1);
      for (let x = 0; x < TEX_SIZE; x += 8) ctx.fillRect(ox + x, oy, 1, TEX_SIZE);
    };
  }

  /** テラコッタ（釉薬あり・パターン） */
  private genTerracotta(colorHex: number, seed: number): TexGen {
    return (ctx, ox, oy) => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        const n = Math.floor(rng() * 10) - 5;
        ctx.fillStyle = `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
      // 光沢パターン
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(ox + 2, oy + 2, TEX_SIZE-4, 2);
      ctx.fillRect(ox + 2, oy + 2, 2, TEX_SIZE-4);
    };
  }

  /** ランタン */
  private genLantern(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(9901);
    // 外枠（鉄）
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 90 + Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    // 内部の光
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const heat = 1 - (Math.abs(x-8) + Math.abs(y-8)) / 10;
      if (heat > 0) {
        ctx.fillStyle = `rgba(255,${180+Math.floor(heat*60)},${Math.floor(heat*80)},${heat})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /** グロウストーン */
  private genGlowstone(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(10001);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 180 + Math.floor(rng() * 50);
      ctx.fillStyle = `rgb(${v},${Math.floor(v*0.85)},${Math.floor(v*0.4)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    // 光のひびパターン
    ctx.fillStyle = 'rgba(255,240,100,0.4)';
    const rng2 = seededRandom(10002);
    for (let i = 0; i < 6; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillRect(ox + px, oy + py, 3, 1);
    }
  }

  /** シーランタン */
  private genSeaLantern(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(10101);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 160 + Math.floor(rng() * 40);
      ctx.fillStyle = `rgb(${Math.floor(v*0.6)},${v},${Math.floor(v*0.9)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    // 格子模様
    ctx.fillStyle = 'rgba(100,220,200,0.3)';
    for (let i = 0; i < TEX_SIZE; i += 4) {
      ctx.fillRect(ox + i, oy, 1, TEX_SIZE);
      ctx.fillRect(ox, oy + i, TEX_SIZE, 1);
    }
  }

  /** キノコライト */
  private genShroomlight(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const rng = seededRandom(10201);
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const v = 180 + Math.floor(rng() * 50);
      ctx.fillStyle = `rgb(${v},${Math.floor(v*0.55)},${Math.floor(v*0.2)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    const rng2 = seededRandom(10202);
    for (let i = 0; i < 8; i++) {
      const px = Math.floor(rng2() * TEX_SIZE), py = Math.floor(rng2() * TEX_SIZE);
      ctx.fillStyle = 'rgba(255,200,100,0.5)';
      ctx.fillRect(ox + px, oy + py, 2, 2);
    }
  }

  /** 羊毛（色を受け取ってクロージャを返す） */
  private genWool(colorHex: number, seed: number): TexGen {
    return (ctx: CanvasRenderingContext2D, ox: number, oy: number): void => {
      const rng = seededRandom(seed);
      const r = (colorHex >> 16) & 0xff;
      const g = (colorHex >> 8) & 0xff;
      const b = colorHex & 0xff;
      for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
          const noise = Math.floor(rng() * 20) - 10;
          ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + noise))},${Math.max(0, Math.min(255, g + noise))},${Math.max(0, Math.min(255, b + noise))})`;
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    };
  }
}
