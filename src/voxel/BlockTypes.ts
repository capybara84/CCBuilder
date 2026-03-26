import * as THREE from 'three';

export interface BlockDef {
  id: number;
  name: string;
  color: THREE.Color;
  breakable: boolean;
  transparent: boolean; // 半透明ブロック（Glass, Leaves など）
}

// ブロック定義
const defs: BlockDef[] = [
  // 基本ブロック
  { id: 1, name: 'Grass', color: new THREE.Color(0x5da84c), breakable: true, transparent: false },
  { id: 2, name: 'Dirt', color: new THREE.Color(0x8b6914), breakable: true, transparent: false },
  { id: 3, name: 'Stone', color: new THREE.Color(0x888888), breakable: true, transparent: false },
  { id: 4, name: 'Wood', color: new THREE.Color(0xa0722a), breakable: true, transparent: false },
  { id: 5, name: 'Sand', color: new THREE.Color(0xdbc67b), breakable: true, transparent: false },
  { id: 6, name: 'Water', color: new THREE.Color(0x3399ff), breakable: false, transparent: true },
  // 自然物系
  { id: 7, name: 'Oak Log', color: new THREE.Color(0x6b4226), breakable: true, transparent: false },
  { id: 8, name: 'Leaves', color: new THREE.Color(0x2d8a2d), breakable: true, transparent: true },
  { id: 9, name: 'Flower', color: new THREE.Color(0x5da84c), breakable: true, transparent: false },
  { id: 10, name: 'Snow', color: new THREE.Color(0xf0f0f0), breakable: true, transparent: false },
  { id: 11, name: 'Ice', color: new THREE.Color(0xa0d8ef), breakable: true, transparent: false },
  // 建物系
  { id: 12, name: 'Brick', color: new THREE.Color(0xb5503c), breakable: true, transparent: false },
  { id: 13, name: 'Stone Brick', color: new THREE.Color(0x999999), breakable: true, transparent: false },
  { id: 14, name: 'Glass', color: new THREE.Color(0xc8e8f0), breakable: true, transparent: true },
  { id: 15, name: 'Planks', color: new THREE.Color(0xc49a4a), breakable: true, transparent: false },
  { id: 16, name: 'Wool White', color: new THREE.Color(0xf0f0f0), breakable: true, transparent: false },
  { id: 17, name: 'Wool Red', color: new THREE.Color(0xcc3333), breakable: true, transparent: false },
  { id: 18, name: 'Wool Blue', color: new THREE.Color(0x3355cc), breakable: true, transparent: false },
];

const byId = new Map<number, BlockDef>();
for (const d of defs) byId.set(d.id, d);

export const BlockTypes = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  SAND: 5,
  WATER: 6,
  OAK_LOG: 7,
  LEAVES: 8,
  FLOWER: 9,
  SNOW: 10,
  ICE: 11,
  BRICK: 12,
  STONE_BRICK: 13,
  GLASS: 14,
  PLANKS: 15,
  WOOL_WHITE: 16,
  WOOL_RED: 17,
  WOOL_BLUE: 18,
  get(id: number): BlockDef | undefined {
    return byId.get(id);
  },
  all(): readonly BlockDef[] {
    return defs;
  },
  isTransparent(id: number): boolean {
    if (id === 0) return true; // AIR
    const def = byId.get(id);
    return def ? def.transparent : false;
  },
} as const;
