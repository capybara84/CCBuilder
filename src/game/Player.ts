import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';

const MOVE_SPEED = 5;
const JUMP_IMPULSE = 5;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.6; // カプセル全高 ≈ 1.8（半径0.3 + 半高さ0.6 + 半径0.3）
const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private body: RAPIER.RigidBody;
  private yaw = 0;   // 水平回転
  private pitch = 0;  // 垂直回転

  constructor(
    physicsWorld: RAPIER.World,
    private input: InputManager,
  ) {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    // プレイヤー物理ボディ（カプセル）
    const spawnY = 3; // 地面(y=1)の少し上にスポーン
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(32, spawnY, 32)
      .lockRotations(); // 物理回転をロック
    this.body = physicsWorld.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setFriction(0);
    physicsWorld.createCollider(colliderDesc, this.body);
  }

  update(dt: number): void {
    // マウス回転
    if (this.input.locked) {
      this.yaw -= this.input.mouseDX * MOUSE_SENSITIVITY;
      this.pitch -= this.input.mouseDY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    }

    // 移動方向を計算
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw),
    );
    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw),
    );

    const move = new THREE.Vector3();
    if (this.input.isDown('KeyW')) move.add(forward);
    if (this.input.isDown('KeyS')) move.sub(forward);
    if (this.input.isDown('KeyA')) move.sub(right);
    if (this.input.isDown('KeyD')) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED);
    }

    // 速度を設定（Y軸は物理に任せる）
    const vel = this.body.linvel();
    this.body.setLinvel({ x: move.x, y: vel.y, z: move.z }, true);

    // ジャンプ（地面にいるかチェック: Y速度がほぼ0）
    if (this.input.isDown('Space') && Math.abs(vel.y) < 0.1) {
      this.body.setLinvel({ x: vel.x, y: JUMP_IMPULSE, z: vel.z }, true);
    }

    // カメラ位置を同期
    const pos = this.body.translation();
    this.camera.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z);

    // カメラ回転
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
