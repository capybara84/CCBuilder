import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';
import { World } from './World';
import { voxelRaycast, RaycastHit } from './Raycast';
import { BlockTypes } from '../voxel/BlockTypes';
import { getTerrainHeight } from '../voxel/WorldGen';

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

/** ブロック操作時のコールバック型 */
export type BlockEffectCallback = (wx: number, wy: number, wz: number, blockId: number) => void;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private yaw = 0;
  private pitch = 0;
  selectedBlockId: number = BlockTypes.GRASS; // ホットバー初期選択と同期
  onBlockPlace: BlockEffectCallback | null = null;
  onBlockBreak: BlockEffectCallback | null = null;
  onBlockBreaking: BlockEffectCallback | null = null; // 長押し中に継続的に呼ばれる
  mode: GameMode = 'walk';
  private cameraY = 0; // カメラY位置（スムーズ補間用）

  /** 現在のレイキャスト結果（Game側でハイライト表示に使用） */
  currentHit: RaycastHit | null = null;

  constructor(
    physicsWorld: RAPIER.World,
    private input: InputManager,
    private world: World,
  ) {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    // プレイヤー物理ボディ（カプセル）
    const spawnX = 32;
    const spawnZ = 32;
    const terrainH = getTerrainHeight(world.chunks, 4, spawnX, spawnZ);
    const spawnY = terrainH + PLAYER_HALF_HEIGHT + PLAYER_RADIUS + 0.5;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .lockRotations(); // 物理回転をロック
    this.body = physicsWorld.createRigidBody(bodyDesc);

    this.cameraY = spawnY + PLAYER_HEIGHT / 2;

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
    // カメラ回転（マウス: Pointer Lock 時、カーソルキー: 常時）
    this.yaw -= this.input.mouseDX * MOUSE_SENSITIVITY;
    this.pitch -= this.input.mouseDY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

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

  private updateWalk(dt: number, forward: THREE.Vector3, right: THREE.Vector3): void {
    const move = new THREE.Vector3();

    // アナログ軸（タッチジョイスティック）が有効ならそちらを使用
    if (this.input.moveAxisX !== 0 || this.input.moveAxisY !== 0) {
      move.addScaledVector(forward, this.input.moveAxisY);
      move.addScaledVector(right, this.input.moveAxisX);
    } else {
      // WASD フォールバック
      if (this.input.isDown('KeyW')) move.add(forward);
      if (this.input.isDown('KeyS')) move.sub(forward);
      if (this.input.isDown('KeyA')) move.sub(right);
      if (this.input.isDown('KeyD')) move.add(right);
    }

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED);
    }

    const vel = this.body.linvel();
    this.body.setLinvel({ x: move.x, y: vel.y, z: move.z }, true);

    // ジャンプ
    if (this.input.isDown('Space') && Math.abs(vel.y) < 0.1) {
      this.body.setLinvel({ x: vel.x, y: JUMP_IMPULSE, z: vel.z }, true);
    }

    // オートステップ: 移動中 & 地面付近の場合、隣接1ブロック段差を自動で登る
    const pos = this.body.translation();
    if (move.lengthSq() > 0 && Math.abs(vel.y) < 0.5) {
      const bottomY = pos.y - PLAYER_HALF_HEIGHT - PLAYER_RADIUS;
      const feetBlockY = Math.round(bottomY) - 1; // 足元のブロック Y
      const playerBX = Math.floor(pos.x);
      const playerBZ = Math.floor(pos.z);

      // 移動方向に応じて隣接ブロックをチェック（前後左右）
      const candidates: [number, number][] = [];
      if (move.lengthSq() > 0) {
        const dir = move.clone().normalize();
        // 移動方向の隣接ブロック座標を計算
        const targetX = Math.floor(pos.x + dir.x * 0.9);
        const targetZ = Math.floor(pos.z + dir.z * 0.9);
        if (targetX !== playerBX || targetZ !== playerBZ) {
          candidates.push([targetX, targetZ]);
        }
        // 斜め移動対策: X方向とZ方向も個別にチェック
        if (Math.abs(dir.x) > 0.1) {
          const sideX = Math.floor(pos.x + Math.sign(dir.x) * 0.9);
          if (sideX !== playerBX) candidates.push([sideX, playerBZ]);
        }
        if (Math.abs(dir.z) > 0.1) {
          const sideZ = Math.floor(pos.z + Math.sign(dir.z) * 0.9);
          if (sideZ !== playerBZ) candidates.push([playerBX, sideZ]);
        }
      }

      for (const [cx, cz] of candidates) {
        const blockAtStep = this.world.getBlock(cx, feetBlockY + 1, cz);
        const blockAbove1 = this.world.getBlock(cx, feetBlockY + 2, cz);
        const blockAbove2 = this.world.getBlock(cx, feetBlockY + 3, cz);
        if (blockAtStep !== 0 && blockAbove1 === 0 && blockAbove2 === 0) {
          const newY = feetBlockY + 2 + PLAYER_HALF_HEIGHT + PLAYER_RADIUS + 0.01;
          this.body.setTranslation({ x: pos.x, y: newY, z: pos.z }, true);
          this.body.setLinvel({ x: move.x, y: 0, z: move.z }, true);
          break;
        }
      }
    }

    // カメラ位置を同期（Y はスムーズ補間）
    const posAfter = this.body.translation();
    const targetCamY = posAfter.y + PLAYER_HEIGHT / 2;
    // lerpで滑らかに追従（段差を登る時のガクつきを防止）
    const lerpSpeed = 15; // 大きいほど速く追従
    this.cameraY += (targetCamY - this.cameraY) * Math.min(lerpSpeed * dt, 1);
    this.camera.position.set(posAfter.x, this.cameraY, posAfter.z);
  }

  private updateBuild(dt: number, forward: THREE.Vector3, right: THREE.Vector3): void {
    const move = new THREE.Vector3();

    // アナログ軸（タッチジョイスティック）が有効ならそちらを使用
    if (this.input.moveAxisX !== 0 || this.input.moveAxisY !== 0) {
      move.addScaledVector(forward, this.input.moveAxisY);
      move.addScaledVector(right, this.input.moveAxisX);
    } else {
      if (this.input.isDown('KeyW')) move.add(forward);
      if (this.input.isDown('KeyS')) move.sub(forward);
      if (this.input.isDown('KeyA')) move.sub(right);
      if (this.input.isDown('KeyD')) move.add(right);
    }
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
    if (!this.currentHit) return;
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

    // 左長押し中 → 破壊予兆パーティクル
    const holdDuration = Math.max(this.input.mouseLeftDuration, this.input.cKeyDuration);
    if (this.input.mouseLeft && holdDuration >= DESTROY_HOLD_TIME * 0.5 && !this.input.mouseLeftFired) {
      const breakingId = this.world.getBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z);
      const breakingDef = BlockTypes.get(breakingId);
      if (breakingDef && breakingDef.breakable) {
        this.onBlockBreaking?.(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, breakingId);
      }
    }

    // 左長押し → 破壊
    if (this.input.mouseLeft && holdDuration >= DESTROY_HOLD_TIME && !this.input.mouseLeftFired) {
      const blockId = this.world.getBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z);
      const def = BlockTypes.get(blockId);
      if (def && def.breakable) {
        this.onBlockBreak?.(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, blockId);
        this.world.setBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, BlockTypes.AIR);
      }
      this.input.mouseLeftFired = true;
    }
  }

  /** UIボタンからジャンプをトリガー */
  triggerJump(): void {
    if (this.mode === 'walk') {
      const vel = this.body.linvel();
      if (Math.abs(vel.y) < 0.1) {
        this.body.setLinvel({ x: vel.x, y: JUMP_IMPULSE, z: vel.z }, true);
      }
    }
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
