import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './World';
import { Player } from './Player';
import { InputManager } from './InputManager';
import { HUD } from '../ui/HUD';
import { MapSerializer } from '../io/MapSerializer';
import { Sky } from '../rendering/Sky';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: World;
  private player: Player;
  private input: InputManager;
  private hud: HUD;
  private clock = new THREE.Clock();
  private highlight: THREE.LineSegments; // ブロックハイライト
  private sky: Sky;

  constructor(
    canvas: HTMLCanvasElement,
    private physicsWorld: RAPIER.World,
  ) {
    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    // シーン
    this.scene = new THREE.Scene();

    // 空の演出
    this.sky = new Sky();
    this.scene.add(this.sky.group);

    // フォグ（スカイドームの地平線色と合わせる）
    this.scene.fog = new THREE.Fog(this.sky.fogColor, 50, 150);
    this.renderer.setClearColor(this.sky.fogColor);

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
    this.player = new Player(physicsWorld, this.input, this.world);

    // ブロックハイライト（ワイヤーフレーム）
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    const hlMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    this.highlight = new THREE.LineSegments(hlGeo, hlMat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // HUD
    this.hud = new HUD();
    this.hud.onModeChange((mode) => {
      if (mode !== this.player.mode) {
        this.player.toggleMode();
      }
    });

    // ホットバー選択変更 → Player に反映
    this.hud.hotbar.onChange((blockId) => {
      this.player.selectedBlockId = blockId;
    });

    // キーボードショートカット
    window.addEventListener('keydown', (e) => {
      // Fキーでモード切替
      if (e.code === 'KeyF') {
        this.player.toggleMode();
        this.hud.modeButton.setActive(this.player.mode);
      }
      // 数字キー1-9でホットバー選択
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        this.hud.hotbar.select(parseInt(e.code.charAt(5)) - 1);
      }
      // 0キーで10番目
      if (e.code === 'Digit0') {
        this.hud.hotbar.select(9);
      }
      // Ctrl+S: 保存
      if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        MapSerializer.save(this.world);
      }
      // Ctrl+O: ロード
      if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        MapSerializer.load(this.world);
      }
    });

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

    // 入力更新
    this.input.update(dt);

    // スクロールでホットバー選択変更
    if (this.input.scrollDelta !== 0) {
      const hotbar = this.hud.hotbar;
      hotbar.select(hotbar.selectedIndex + this.input.scrollDelta);
    }

    // 物理シミュレーション
    this.physicsWorld.step();

    // プレイヤー更新
    this.player.update(dt);

    // 空の更新（カメラ追従・雲スクロール）
    this.sky.update(this.player.camera, dt);

    // ブロックハイライト更新
    const hit = this.player.currentHit;
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(
        hit.blockPos.x + 0.5,
        hit.blockPos.y + 0.5,
        hit.blockPos.z + 0.5,
      );
    } else {
      this.highlight.visible = false;
    }

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
