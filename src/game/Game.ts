import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './World';
import { Player } from './Player';
import { InputManager } from './InputManager';
import { HUD } from '../ui/HUD';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: World;
  private player: Player;
  private input: InputManager;
  private hud: HUD;
  private clock = new THREE.Clock();

  constructor(
    canvas: HTMLCanvasElement,
    private physicsWorld: RAPIER.World,
  ) {
    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x87ceeb); // 空色

    // シーン
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 150);

    // ライト
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 100, 30);
    this.scene.add(sun);

    // 入力
    this.input = new InputManager(canvas);

    // ワールド
    this.world = new World(physicsWorld);
    this.scene.add(this.world.group);

    // プレイヤー
    this.player = new Player(physicsWorld, this.input);

    // HUD
    this.hud = new HUD();

    // リサイズ
    window.addEventListener('resize', () => this.onResize());
  }

  start(): void {
    this.clock.start();
    this.loop();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 1 / 30); // 上限を設定

    // 物理シミュレーション
    this.physicsWorld.step();

    // プレイヤー更新
    this.player.update(dt);

    // 入力デルタリセット
    this.input.resetDelta();

    // 描画
    this.renderer.render(this.scene, this.player.camera);
  };

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.onResize();
  }
}
