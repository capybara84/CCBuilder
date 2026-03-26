import * as THREE from 'three';

export interface BlockDef {
  id: number;
  name: string;
  color: THREE.Color;
  breakable: boolean;
}

// ブロック定義
const defs: BlockDef[] = [
  { id: 1, name: 'Grass', color: new THREE.Color(0x5da84c), breakable: true },
  { id: 2, name: 'Dirt', color: new THREE.Color(0x8b6914), breakable: true },
  { id: 3, name: 'Stone', color: new THREE.Color(0x888888), breakable: true },
  { id: 4, name: 'Wood', color: new THREE.Color(0xa0722a), breakable: true },
  { id: 5, name: 'Sand', color: new THREE.Color(0xdbc67b), breakable: true },
  { id: 6, name: 'Water', color: new THREE.Color(0x3399ff), breakable: false },
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
  get(id: number): BlockDef | undefined {
    return byId.get(id);
  },
  all(): readonly BlockDef[] {
    return defs;
  },
} as const;
