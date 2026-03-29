/** サブボクセル座標系（0-16）で定義する直方体 */
export interface ShapeBox {
  min: [number, number, number]; // [x, y, z] 0-16
  max: [number, number, number]; // [x, y, z] 0-16
}

/** ブロック形状定義 */
export interface BlockShape {
  boxes: ShapeBox[];
  isFullCube: boolean;
}

/** フルキューブ形状（シングルトン） */
const FULL_CUBE: BlockShape = {
  boxes: [{ min: [0, 0, 0], max: [16, 16, 16] }],
  isFullCube: true,
};

export function createFullCubeShape(): BlockShape {
  return FULL_CUBE;
}

/** ボックスリストからBlockShapeを生成 */
export function createShapeFromBoxes(boxes: ShapeBox[]): BlockShape {
  // フルキューブかチェック
  const isFullCube = boxes.length === 1
    && boxes[0].min[0] === 0 && boxes[0].min[1] === 0 && boxes[0].min[2] === 0
    && boxes[0].max[0] === 16 && boxes[0].max[1] === 16 && boxes[0].max[2] === 16;

  return { boxes, isFullCube };
}
