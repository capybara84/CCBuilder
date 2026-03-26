import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';
import { World } from './World';
import { voxelRaycast, RaycastHit } from './Raycast';
import { BlockTypes } from '../voxel/BlockTypes';

const MOVE_SPEED = 5;
const BUILD_FLY_SPEED = 10;
const JUMP_IMPULSE = 5;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;
const RAYCAST_DIST = 8;
const DESTROY_HOLD_TIME = 0.5; // 長押し破壊の閾値（秒）

export type GameMode = 'walk' | 'build';

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private yaw = 0;
  private pitch = 0;
  selectedBlockId: number = BlockTypes.GRASS; // ホットバー初期選択と同期
  mode: GameMode = 'walk';

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
    this.collider = physicsWorld.createCollider(colliderDesc, this.body);
  }

  /** Walk ↔ Build モード切替 */
  toggleMode(): void {
    if (this.mode === 'walk') {
      this.mode = 'build';
      // 重力無効化: Kinematic に切替
      this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else {
      this.mode = 'walk';
      // 物理復帰: Dynamic に切替
      this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
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

    if (this.mode === 'walk') {
      this.updateWalk(dt, forward, right);
    } else {
      this.updateBuild(dt, forward, right);
    }

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
    this.handleBlockInteraction();
  }

  private updateWalk(_dt: number, forward: THREE.Vector3, right: THREE.Vector3): void {
    const move = new THREE.Vector3();
    if (this.input.isDown('KeyW')) move.add(forward);
    if (this.input.isDown('KeyS')) move.sub(forward);
    if (this.input.isDown('KeyA')) move.sub(right);
    if (this.input.isDown('KeyD')) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED);
    }

    const vel = this.body.linvel();
    this.body.setLinvel({ x: move.x, y: vel.y, z: move.z }, true);

    // ジャンプ
    if (this.input.isDown('Space') && Math.abs(vel.y) < 0.1) {
      this.body.setLinvel({ x: vel.x, y: JUMP_IMPULSE, z: vel.z }, true);
    }

    // カメラ位置を同期
    const pos = this.body.translation();
    this.camera.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z);
  }

  private updateBuild(dt: number, forward: THREE.Vector3, right: THREE.Vector3): void {
    const move = new THREE.Vector3();
    if (this.input.isDown('KeyW')) move.add(forward);
    if (this.input.isDown('KeyS')) move.sub(forward);
    if (this.input.isDown('KeyA')) move.sub(right);
    if (this.input.isDown('KeyD')) move.add(right);
    if (this.input.isDown('Space')) move.y += 1;
    if (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(BUILD_FLY_SPEED * dt);
    }

    // カメラ位置を直接操作
    this.camera.position.add(move);

    // 物理ボディも追従（レイキャストの基準位置用）
    this.body.setNextKinematicTranslation({
      x: this.camera.position.x,
      y: this.camera.position.y - PLAYER_HEIGHT / 2,
      z: this.camera.position.z,
    });
  }

  private handleBlockInteraction(): void {
    if (!this.input.locked || !this.currentHit) return;
    const hit = this.currentHit;
    const camPos = this.camera.position;

    // 短クリック（離した時） → 設置
    if (this.input.mouseLeftClicked) {
      const placePos = hit.blockPos.clone().add(hit.normal);
      // Walk モードのみ自分との重なりチェック
      let overlaps = false;
      if (this.mode === 'walk') {
        const px = Math.floor(camPos.x);
        const py = Math.floor(camPos.y - PLAYER_HEIGHT / 2);
        const pz = Math.floor(camPos.z);
        const ppx = Math.floor(placePos.x);
        const ppy = Math.floor(placePos.y);
        const ppz = Math.floor(placePos.z);
        overlaps = ppx === px && ppz === pz && (ppy === py || ppy === py + 1);
      }
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
      this.input.mouseLeftFired = true;
    }
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
