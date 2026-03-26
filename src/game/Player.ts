import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';
import { World } from './World';
import { voxelRaycast, RaycastHit } from './Raycast';
import { BlockTypes } from '../voxel/BlockTypes';

const MOVE_SPEED = 5;
const JUMP_IMPULSE = 5;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;
const RAYCAST_DIST = 8;
const DESTROY_HOLD_TIME = 0.5; // 長押し破壊の閾値（秒）

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private body: RAPIER.RigidBody;
  private yaw = 0;
  private pitch = 0;
  selectedBlockId = BlockTypes.DIRT; // 設置するブロック（仮）

  /** 現在のレイキャスト結果（Game側でハイライト表示に使用） */
  currentHit: RaycastHit | null = null;

  constructor(
    physicsWorld: RAPIER.World,
    private input: InputManager,
    private world: World,
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

    // レイキャスト
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.currentHit = voxelRaycast(
      this.camera.position, dir, RAYCAST_DIST,
      (x, y, z) => this.world.getBlock(x, y, z),
    );

    // ブロック操作
    if (this.input.locked && this.currentHit) {
      const hit = this.currentHit;

      // 左クリック → 設置
      if (this.input.mouseLeftJustPressed) {
        const placePos = hit.blockPos.clone().add(hit.normal);
        // 自分の位置と重ならないかチェック（プレイヤーは2ブロック分の高さ）
        const px = Math.floor(pos.x);
        const py = Math.floor(pos.y);
        const pz = Math.floor(pos.z);
        const ppx = Math.floor(placePos.x);
        const ppy = Math.floor(placePos.y);
        const ppz = Math.floor(placePos.z);
        const overlaps = ppx === px && ppz === pz && (ppy === py || ppy === py + 1);
        if (!overlaps && placePos.y >= 0) {
          this.world.setBlock(placePos.x, placePos.y, placePos.z, this.selectedBlockId);
        }
      }

      // 左長押し → 破壊
      if (this.input.mouseLeft && this.input.mouseLeftDuration >= DESTROY_HOLD_TIME && !this.input.mouseLeftFired) {
        const blockId = this.world.getBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z);
        const def = BlockTypes.get(blockId);
        if (def && def.breakable) {
          this.world.setBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, BlockTypes.AIR);
        }
        this.input.mouseLeftFired = true; // 1回だけ発火
      }
    }
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
