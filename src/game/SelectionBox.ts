/**
 * SelectionBox.ts
 * ビルドモードでの選択範囲（AABB）を管理し、ワイヤーフレームで可視化するクラス
 */

import * as THREE from 'three';

export class SelectionBox {
  private start: THREE.Vector3 | null = null;
  private end: THREE.Vector3 | null = null;
  private mesh: THREE.LineSegments | null = null;
  /** メッシュが最後に生成された時点の状態ハッシュ（再生成の判定用） */
  private lastStateKey = '';

  /**
   * 選択開始点を設定（ブロック座標）
   * start を変更したら end をリセットする
   */
  setStart(pos: THREE.Vector3): void {
    this.start = pos.clone().floor();
    this.end = null;
    this.lastStateKey = ''; // メッシュ再生成を促す
  }

  /** 選択終了点を設定 */
  setEnd(pos: THREE.Vector3): void {
    this.end = pos.clone().floor();
    this.lastStateKey = ''; // メッシュ再生成を促す
  }

  /** AABB として正規化した選択範囲（min/max）を返す */
  getAABB(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    if (!this.start) return null;
    const s = this.start;
    const e = this.end ?? this.start;
    return {
      min: new THREE.Vector3(
        Math.min(s.x, e.x),
        Math.min(s.y, e.y),
        Math.min(s.z, e.z),
      ),
      max: new THREE.Vector3(
        Math.max(s.x, e.x),
        Math.max(s.y, e.y),
        Math.max(s.z, e.z),
      ),
    };
  }

  /** 選択が確定されているか（start と end 両方が設定済み） */
  get isReady(): boolean {
    return this.start !== null && this.end !== null;
  }

  /** 選択をリセット */
  clear(): void {
    this.start = null;
    this.end = null;
    this.lastStateKey = '';
  }

  /**
   * Three.js シーンのワイヤーフレームメッシュを更新する
   * start/end が変更されたときのみメッシュを再生成する（毎フレーム再生成しない）
   */
  updateMesh(scene: THREE.Scene): void {
    // 現在の状態を表すキーを生成
    const stateKey = this.buildStateKey();

    // 変更がなければ何もしない
    if (stateKey === this.lastStateKey) return;
    this.lastStateKey = stateKey;

    // 既存メッシュを破棄
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }

    // start が未設定なら何も表示しない
    if (!this.start) return;

    const aabb = this.getAABB();
    if (!aabb) return;

    const { min, max } = aabb;
    // ボックスサイズ（1ブロック分を含む: max - min + 1）
    const sizeX = max.x - min.x + 1;
    const sizeY = max.y - min.y + 1;
    const sizeZ = max.z - min.z + 1;

    // AABB の中心座標
    const cx = min.x + sizeX / 2;
    const cy = min.y + sizeY / 2;
    const cz = min.z + sizeZ / 2;

    // 少しだけ拡張してブロックの境界に被らないようにする
    const expand = 0.02;
    const geo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(sizeX + expand, sizeY + expand, sizeZ + expand),
    );

    // start のみ: 黄色、両方設定済み: 水色
    const color = this.end !== null ? 0x00ddff : 0xffff00;
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });

    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.position.set(cx, cy, cz);
    scene.add(this.mesh);
  }

  /** メッシュを dispose して scene から除去 */
  dispose(scene: THREE.Scene): void {
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }

  /** 現在の状態を表す文字列キーを生成（再生成判定用） */
  private buildStateKey(): string {
    if (!this.start) return 'none';
    const s = this.start;
    if (!this.end) return `s:${s.x},${s.y},${s.z}`;
    const e = this.end;
    return `s:${s.x},${s.y},${s.z}|e:${e.x},${e.y},${e.z}`;
  }
}
