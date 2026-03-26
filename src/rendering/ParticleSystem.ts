import * as THREE from 'three';
import { BlockTypes } from '../voxel/BlockTypes';

/** 個々のパーティクル */
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;    // 残り寿命（秒）
  maxLife: number;  // 初期寿命
}

/** パーティクルバースト（1回の破壊エフェクト） */
interface Burst {
  particles: Particle[];
  color: THREE.Color;
  points: THREE.Points;
}

const GRAVITY = -8;
const PARTICLE_SIZE = 0.16;

/**
 * ブロック破壊・設置のパーティクルエフェクト管理
 */
export class ParticleSystem {
  private bursts: Burst[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 破壊中エフェクト: 毎フレーム少量の粒が出る */
  emitBreaking(wx: number, wy: number, wz: number, blockId: number): void {
    const def = BlockTypes.get(blockId);
    if (!def) return;

    const color = def.color.clone();
    const count = 2;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        wx + 0.5 + (Math.random() - 0.5) * 0.8,
        wy + 0.5 + (Math.random() - 0.5) * 0.8,
        wz + 0.5 + (Math.random() - 0.5) * 0.8,
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 1.5,
      );
      const life = 0.2 + Math.random() * 0.2;
      particles.push({ position: pos, velocity: vel, life, maxLife: life });
    }

    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE * 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ particles, color, points });
  }

  /** ブロック破壊エフェクト: ブロック色のかけらが飛散 */
  emitBreak(wx: number, wy: number, wz: number, blockId: number): void {
    const def = BlockTypes.get(blockId);
    if (!def) return;

    const color = def.color.clone();
    const count = 8;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        wx + 0.5 + (Math.random() - 0.5) * 0.6,
        wy + 0.5 + (Math.random() - 0.5) * 0.6,
        wz + 0.5 + (Math.random() - 0.5) * 0.6,
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 3 + 1.5,
        (Math.random() - 0.5) * 3,
      );
      const life = 0.4 + Math.random() * 0.4;
      particles.push({ position: pos, velocity: vel, life, maxLife: life });
    }

    // Points ジオメトリ
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.bursts.push({ particles, color, points });
  }

  /** ブロック設置エフェクト: 小さなパーティクルが周囲に散る */
  emitPlace(wx: number, wy: number, wz: number, blockId: number): void {
    const def = BlockTypes.get(blockId);
    if (!def) return;

    const color = def.color.clone().multiplyScalar(1.2);
    const count = 10;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const pos = new THREE.Vector3(
        wx + 0.5 + Math.cos(angle) * 0.5,
        wy + 0.2,
        wz + 0.5 + Math.sin(angle) * 0.5,
      );
      const vel = new THREE.Vector3(
        Math.cos(angle) * 0.8,
        Math.random() * 0.8 + 0.3,
        Math.sin(angle) * 0.8,
      );
      const life = 0.2 + Math.random() * 0.15;
      particles.push({ position: pos, velocity: vel, life, maxLife: life });
    }

    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE * 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.bursts.push({ particles, color, points });
  }

  /** 毎フレーム更新 */
  update(dt: number): void {
    for (let bi = this.bursts.length - 1; bi >= 0; bi--) {
      const burst = this.bursts[bi];
      let allDead = true;

      const posAttr = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;

      for (let pi = 0; pi < burst.particles.length; pi++) {
        const p = burst.particles[pi];
        p.life -= dt;

        if (p.life > 0) {
          allDead = false;
          // 物理更新
          p.velocity.y += GRAVITY * dt;
          p.position.addScaledVector(p.velocity, dt);

          posAttr.setXYZ(pi, p.position.x, p.position.y, p.position.z);
        } else {
          // 死んだパーティクルは画面外に
          posAttr.setXYZ(pi, 0, -100, 0);
        }
      }

      posAttr.needsUpdate = true;

      // フェードアウト
      const mat = burst.points.material as THREE.PointsMaterial;
      const minLife = Math.min(...burst.particles.map(p => p.life / p.maxLife));
      mat.opacity = Math.max(0, Math.min(1, minLife + 0.5));

      // 全パーティクル消滅 → 削除
      if (allDead) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        (burst.points.material as THREE.PointsMaterial).dispose();
        this.bursts.splice(bi, 1);
      }
    }
  }

  dispose(): void {
    for (const burst of this.bursts) {
      this.scene.remove(burst.points);
      burst.points.geometry.dispose();
      (burst.points.material as THREE.PointsMaterial).dispose();
    }
    this.bursts.length = 0;
  }
}
