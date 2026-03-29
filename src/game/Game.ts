import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './World';
import { Player } from './Player';
import { InputManager } from './InputManager';
import { HUD } from '../ui/HUD';
import { MapSerializer } from '../io/MapSerializer';
import { Sky } from '../rendering/Sky';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { updateWaterTime } from '../voxel/Chunk';
import { TouchControls } from '../ui/TouchControls';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: World;
  private player: Player;
  private input: InputManager;
  private hud: HUD;
  private clock = new THREE.Clock();
  private highlight: THREE.LineSegments;
  sky: Sky;
  private particles: ParticleSystem;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private paused = false;
  private elapsedTime = 0;

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
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.sunLight.position.set(50, 100, 30);
    this.scene.add(this.sunLight);

    // 入力
    this.input = new InputManager(canvas);

    // タッチデバイスならタッチコントロールを有効化
    if (navigator.maxTouchPoints > 0) {
      this.input.touchControls = new TouchControls();
    }

    // ワールド
    this.world = new World(physicsWorld);
    this.scene.add(this.world.group);

    // プレイヤー
    this.player = new Player(physicsWorld, this.input, this.world);

    // パーティクルシステム
    this.particles = new ParticleSystem(this.scene);
    this.player.onBlockBreak = (wx, wy, wz, blockId) => {
      this.particles.emitBreak(wx, wy, wz, blockId);
    };
    this.player.onBlockBreaking = (wx, wy, wz, blockId) => {
      this.particles.emitBreaking(wx, wy, wz, blockId);
    };
    this.player.onBlockPlace = null;

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

    // UIボタンコールバック
    this.hud.onMenu(() => {
      if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
    });
    this.hud.onJump(() => {
      this.player.triggerJump();
    });
    this.hud.onInventoryButton(() => {
      if (this.hud.inventory.visible) {
        this.closeInventoryNoLock();
      } else {
        if (this.hud.pauseMenu.visible) this.hud.pauseMenu.hide();
        this.openInventory();
      }
    });

    // ホットバー選択変更 → Player に反映
    this.hud.hotbar.onChange((blockId) => {
      this.player.selectedBlockId = blockId;
    });

    // ホットバースロットクリック
    this.hud.hotbar.onSlotClick((index) => {
      if (this.hud.inventory.visible) {
        // インベントリ表示中: トグル選択
        this.hud.hotbar.toggleSelect(index);
        this.trySwapInventoryToHotbar();
      } else {
        // 通常時: 選択
        this.hud.hotbar.select(index);
      }
    });

    // インベントリ: ブロック選択（トグル）→ 両方選択なら入れ替え
    this.hud.inventory.onSelect(() => {
      this.trySwapInventoryToHotbar();
    });
    this.hud.inventory.onClose(() => {
      this.closeInventory();
    });

    // ESCメニュー: コールバック
    this.hud.pauseMenu.onResume(() => this.resume());
    this.hud.pauseMenu.onInventory(() => {
      this.hud.pauseMenu.hide();
      this.openInventory();
    });
    this.hud.pauseMenu.onSave(() => {
      MapSerializer.save(this.world);
    });
    this.hud.pauseMenu.onLoad(() => {
      MapSerializer.load(this.world);
      this.resume();
    });

    // キャンバスクリック: インベントリ表示中なら閉じてロック取得
    canvas.addEventListener('click', () => {
      if (this.hud.inventory.visible) {
        this.closeInventory();
      }
    });

    // キーボードショートカット
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // リサイズ
    window.addEventListener('resize', () => this.onResize());
  }

  private onKeyDown(e: KeyboardEvent): void {
    // ESC キー: インベントリ/メニューを閉じる
    if (e.code === 'Escape') {
      if (this.hud.inventory.visible) {
        this.closeInventory();
        return;
      }
      if (this.paused) {
        this.resume();
        return;
      }
      return;
    }

    // Q キー: メニュー
    if (e.code === 'KeyQ') {
      if (this.hud.inventory.visible) {
        this.closeInventory();
      }
      if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
      return;
    }

    // E キー: インベントリ
    if (e.code === 'KeyE') {
      if (this.hud.inventory.visible) {
        this.closeInventoryNoLock();
      } else {
        if (this.hud.pauseMenu.visible) this.hud.pauseMenu.hide();
        this.openInventory();
      }
      return;
    }

    // 一時停止中は以下のショートカットを無効化
    if (this.paused) return;

    // Fキーでモード切替
    if (e.code === 'KeyF') {
      this.player.toggleMode();
      this.hud.modeButton.setActive(this.player.mode);
    }
    // 数字キー1-6でホットバー選択
    if (e.code >= 'Digit1' && e.code <= 'Digit6') {
      this.hud.hotbar.select(parseInt(e.code.charAt(5)) - 1);
    }
  }

  private pause(): void {
    this.paused = true;
    if (!this.input.isTouchActive) {
      document.exitPointerLock();
    }
    this.hud.pauseMenu.show();
  }

  private resume(): void {
    this.paused = false;
    this.hud.pauseMenu.hide();
    this.hud.inventory.hide();
    if (!this.input.isTouchActive) {
      const canvas = this.renderer.domElement;
      canvas.requestPointerLock();
    }
  }

  private openInventory(): void {
    this.paused = true;
    if (!this.input.isTouchActive) {
      document.exitPointerLock();
    }
    this.hud.hotbar.deselect();
    this.hud.inventory.show();
  }

  /** インベントリとホットバーの両方が選択されていたら入れ替え */
  private trySwapInventoryToHotbar(): void {
    if (this.hud.hotbar.hasSelection && this.hud.inventory.hasSelection) {
      this.hud.hotbar.setSelectedSlot(this.hud.inventory.selectedBlockId);
      // 入れ替え後、両方の選択を解除
      this.hud.hotbar.deselect();
      this.hud.inventory.deselect();
    }
  }

  /** インベントリを閉じて Pointer Lock を再取得 */
  private closeInventory(): void {
    this.hud.inventory.hide();
    this.paused = false;
    this.hud.pauseMenu.hide();
    if (!this.hud.hotbar.hasSelection) this.hud.hotbar.select(0);
    if (!this.input.isTouchActive) {
      const canvas = this.renderer.domElement;
      canvas.requestPointerLock();
    }
  }

  /** インベントリを閉じるが Pointer Lock はかけない */
  private closeInventoryNoLock(): void {
    this.hud.inventory.hide();
    this.paused = false;
    this.hud.pauseMenu.hide();
    if (!this.hud.hotbar.hasSelection) this.hud.hotbar.select(0);
  }

  start(): void {
    this.clock.start();
    this.loop();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 1 / 30);

    // 一時停止中はゲームロジックをスキップ（描画は続行）
    if (!this.paused) {
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
    } else {
      // 一時停止中もクロックを消費（再開時に大きなdtが出ないように）
      this.clock.getDelta();
    }

    // 時間更新
    this.elapsedTime += dt;

    // パーティクル更新
    this.particles.update(dt);

    // 水面アニメーション
    updateWaterTime(this.elapsedTime);

    // 空の更新（一時停止中も雲は動かす、太陽も動かす）
    this.sky.update(this.player.camera, dt);

    // ライトを太陽と連動
    const sunDir = this.sky.getSunDirection();
    this.sunLight.position.copy(sunDir.multiplyScalar(100));
    this.sunLight.color.copy(this.sky.getSunColor());
    this.sunLight.intensity = this.sky.getSunIntensity();
    this.ambientLight.color.copy(this.sky.getAmbientColor());
    this.ambientLight.intensity = this.sky.getAmbientIntensity();

    // 時刻表示更新
    this.hud.updateTime(this.sky.timeOfDay);

    // 視錐台カリング
    this.world.updateVisibility(this.player.camera);

    // 描画
    this.renderer.render(this.scene, this.player.camera);
  };

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.onResize();
  }
}
