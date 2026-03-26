import * as THREE from 'three';

const SKIN_COLOR = 0xd4a373;

// ベース位置
const BASE_X = 0.35;
const BASE_Y = -0.35;
const BASE_Z = -0.5;

/**
 * 一人称の手表示（素手のみ）
 * 別シーン + 別カメラでメインシーンの上にオーバーレイ描画
 */
export class HandView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private armGroup: THREE.Group;

  // アニメーション状態
  private idleTime = 0;
  private isBreaking = false;     // 破壊中（がつがつ振る）
  private breakSwingTime = 0;
  private isWalking = false;      // 歩行中
  private walkTime = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);

    // ライト
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(1, 2, 1);
    this.scene.add(dirLight);

    // 腕グループ
    this.armGroup = new THREE.Group();
    this.armGroup.position.set(BASE_X, BASE_Y, BASE_Z);
    this.scene.add(this.armGroup);

    // 前腕
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 0.35);
    const armMat = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 0, -0.1);
    this.armGroup.add(arm);

    // 手（拳）
    const handGeo = new THREE.BoxGeometry(0.1, 0.08, 0.1);
    const handMat = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
    const hand = new THREE.Mesh(handGeo, handMat);
    hand.position.set(0, 0, -0.3);
    this.armGroup.add(hand);

    // 指（4本まとめ）
    const fingersGeo = new THREE.BoxGeometry(0.09, 0.04, 0.06);
    const fingersMat = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
    const fingers = new THREE.Mesh(fingersGeo, fingersMat);
    fingers.position.set(0, -0.03, -0.36);
    fingers.rotation.x = 0.4; // 少し握り込み
    this.armGroup.add(fingers);
  }

  /** 破壊中フラグ（毎フレーム呼ぶ） */
  setBreaking(breaking: boolean): void {
    if (breaking && !this.isBreaking) {
      this.breakSwingTime = 0;
    }
    this.isBreaking = breaking;
  }

  /** 歩行中フラグ */
  setWalking(walking: boolean): void {
    if (walking && !this.isWalking) {
      this.walkTime = 0;
    }
    this.isWalking = walking;
  }

  /** 毎フレーム更新 */
  update(dt: number): void {
    this.idleTime += dt;

    let offsetX = 0;
    let offsetY = 0;
    let rotX = 0;
    let rotZ = 0;

    if (this.isBreaking) {
      // がつがつ振るアニメーション（高速繰り返し）
      this.breakSwingTime += dt * 12;
      rotX = Math.sin(this.breakSwingTime) * 0.6;
      rotZ = Math.sin(this.breakSwingTime * 0.7) * 0.15;
      offsetY = Math.abs(Math.sin(this.breakSwingTime)) * 0.05;
    } else if (this.isWalking) {
      // 歩行揺れ
      this.walkTime += dt * 8;
      offsetX = Math.sin(this.walkTime) * 0.03;
      offsetY = Math.abs(Math.sin(this.walkTime * 2)) * 0.025;
      rotZ = Math.sin(this.walkTime) * 0.04;
    }

    // アイドル呼吸（常に加算）
    const breathe = Math.sin(this.idleTime * 1.5) * 0.008;

    this.armGroup.position.set(
      BASE_X + offsetX,
      BASE_Y + offsetY + breathe,
      BASE_Z,
    );
    this.armGroup.rotation.x = rotX;
    this.armGroup.rotation.z = rotZ;
  }

  /** リサイズ */
  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}
