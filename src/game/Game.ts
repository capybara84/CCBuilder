import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World, MAP_W, MAP_D } from './World';
import { Player } from './Player';
import { InputManager } from './InputManager';
import { HUD } from '../ui/HUD';
import { MapSerializer } from '../io/MapSerializer';
import { TemplateSerializer } from '../io/TemplateSerializer';
import { Sky } from '../rendering/Sky';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { updateWaterTime } from '../voxel/Chunk';
import { TouchControls } from '../ui/TouchControls';
import { BuildHistory } from './BuildHistory';
import { SelectionBox } from './SelectionBox';
import { BuildTools } from './BuildTools';
import { BuildToolbar } from '../ui/BuildToolbar';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: World;
  private player: Player;
  private input: InputManager;
  private hud: HUD;
  private clock = new THREE.Clock();
  private highlight: THREE.LineSegments;
  /** ミラー座標のブロックハイライトメッシュ（最大3個: x, z, xz の各対称点） */
  private mirrorHighlights: THREE.LineSegments[] = [];
  sky: Sky;
  private particles: ParticleSystem;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private paused = false;
  private elapsedTime = 0;
  private buildHistory = new BuildHistory();
  // 選択範囲 + Fill 機能
  private selectionBox = new SelectionBox();
  private buildTools = new BuildTools();
  private buildToolbar: BuildToolbar;

  // ペーストプレビュー関連
  /** ペーストプレビューモードが有効か */
  private pastePreviewActive = false;
  private _pendingPastePreview = false;
  /** ペーストプレビュー用の半透明メッシュ（プレビューモード中のみ存在） */
  private pastePreviewMesh: THREE.Mesh | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private physicsWorld: RAPIER.World,
  ) {
    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

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

    // ブロック操作を履歴に記録するコールバックを設定
    this.player.onBlockRecord = (changes) => {
      const label = changes.length > 0 && changes[0].newId === 0 ? 'Break' : 'Place';
      this.buildHistory.push({
        label,
        changes,
      });
    };

    // ブロックハイライト（ワイヤーフレーム）
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    const hlMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    this.highlight = new THREE.LineSegments(hlGeo, hlMat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // ミラーハイライトメッシュを3個事前生成（XZ ミラー時に最大3点表示）
    for (let i = 0; i < 3; i++) {
      const mhGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
      const mhMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
      const mh = new THREE.LineSegments(mhGeo, mhMat);
      mh.visible = false;
      this.scene.add(mh);
      this.mirrorHighlights.push(mh);
    }

    // BuildToolbar（ビルドモード専用ツールバー）を先に生成する
    // ※ HUD の onModeChange コールバック内で参照するため先に初期化が必要
    this.buildToolbar = new BuildToolbar();
    // Undo ボタン
    this.buildToolbar.onUndo(() => {
      this.applyUndo();
    });
    // Redo ボタン
    this.buildToolbar.onRedo(() => {
      this.applyRedo();
    });
    // Fill ボタン: ホットバーで選択中のブロックで範囲を充填
    this.buildToolbar.onFill(() => {
      const aabb = this.selectionBox.getAABB();
      if (!aabb) return;
      const entry = this.buildTools.fill(this.world, aabb, this.player.selectedBlockId);
      if (entry.changes.length > 0) {
        this.buildHistory.push(entry);
        // Undo/Redo ボタンの状態を更新
        this.updateUndoRedoButtons();
      }
    });

    // Copy ボタン: 選択範囲をクリップボードにコピー
    this.buildToolbar.onCopy(() => {
      this.executeCopy();
    });

    // Paste ボタン: ペーストプレビューモードに入る
    this.buildToolbar.onPaste(() => {
      this.enterPastePreview();
    });

    // Mirror ボタン: ミラー軸をサイクルさせて player に反映
    this.buildToolbar.onMirror((axis) => {
      this.player.mirrorAxis = axis;
    });

    // Replace ボタン: ダイアログで選択した From/To で範囲内ブロックを置換
    this.buildToolbar.onReplace((fromId, toId) => {
      const aabb = this.selectionBox.getAABB();
      if (!aabb) return;
      const entry = this.buildTools.replace(this.world, aabb, fromId, toId);
      if (entry.changes.length > 0) {
        this.buildHistory.push(entry);
        this.updateUndoRedoButtons();
      }
      // ダイアログ閉後に Pointer Lock を再取得
      if (!this.input.isTouchActive) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    // Replace Cancel: Pointer Lock を再取得
    this.buildToolbar.onReplaceCancel(() => {
      if (!this.input.isTouchActive) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    // Templates パネルのコールバックを接続

    // テンプレート名一覧取得
    this.buildToolbar.onGetTemplateNames(() => {
      return this.buildTools.getTemplateNames();
    });

    // Save: クリップボードをセッション内テンプレートとして保存
    this.buildToolbar.onTemplateSave((name) => {
      return this.buildTools.saveTemplate(name);
    });

    // Load(Use): セッション内テンプレートをクリップボードにロード
    this.buildToolbar.onTemplateLoad((name) => {
      const ok = this.buildTools.loadTemplate(name);
      if (ok) {
        // Paste ボタンを有効化 + パネルを閉じた後にプレビュー起動フラグ
        this.updateToolbarState();
        this._pendingPastePreview = true;
      }
      return ok;
    });

    // Delete: セッション内テンプレートを削除
    this.buildToolbar.onTemplateDelete((name) => {
      this.buildTools.deleteTemplate(name);
    });

    // Export: 対象テンプレートの ClipboardData をファイルにエクスポート
    this.buildToolbar.onTemplateExport(async (name) => {
      const data = this.buildTools.getTemplateData(name);
      if (!data) return;
      await TemplateSerializer.save(data, name);
    });

    // Import: ファイルから ClipboardData をインポートしてクリップボードにセット
    this.buildToolbar.onTemplateImport(async () => {
      const result = await TemplateSerializer.load();
      if (!result) return;
      this.buildTools.setClipboard(result.data);
      // Paste ボタンと Templates パネルの Save ボタンを有効化
      this.updateToolbarState();
      this.buildToolbar.setHasClipboard(this.buildTools.hasClipboard);
      // パネルを閉じた後にプレビュー起動フラグ
      this._pendingPastePreview = true;
    });

    // Templates パネルが開いたら Pointer Lock を解除
    this.buildToolbar.onTemplatePanelOpen(() => {
      if (!this.input.isTouchActive) {
        document.exitPointerLock();
      }
    });

    // Templates パネルが閉じたら Pointer Lock を再取得 + ペーストプレビュー起動
    this.buildToolbar.onTemplatePanelClose(() => {
      if (!this.input.isTouchActive) {
        this.renderer.domElement.requestPointerLock();
      }
      if (this._pendingPastePreview) {
        this._pendingPastePreview = false;
        this.enterPastePreview();
      }
    });

    // HUD
    this.hud = new HUD();
    this.hud.onModeChange((mode) => {
      if (mode !== this.player.mode) {
        this.player.toggleMode();
        // モード切替時に BuildToolbar の表示を切り替える
        if (this.player.mode === 'build') {
          this.buildToolbar.show();
        } else {
          this.buildToolbar.hide();
          // Walk モードに戻ったら選択範囲もクリア
          this.selectionBox.clear();
        }
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
    // ホットバーのインベントリスロットからも開閉できるように接続
    this.hud.hotbar.onInventory(() => {
      if (this.hud.inventory.visible) {
        this.closeInventoryNoLock();
      } else {
        this.openInventory();
      }
    });
    // HUD のインベントリボタンは非表示（ホットバーに統合）
    this.hud.inventoryButton.style.display = 'none';

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
      // ロード後は操作履歴をクリア（ロード前の操作はundo不可）
      this.buildHistory.clear();
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
    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      this.applyUndo();
      return;
    }

    // Ctrl+Y または Ctrl+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
      e.preventDefault();
      this.applyRedo();
      return;
    }

    // Ctrl+C: コピー（ビルドモード、選択範囲確定時）
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      if (this.player.mode === 'build' && this.selectionBox.isReady) {
        e.preventDefault();
        this.executeCopy();
      }
      return;
    }

    // Ctrl+V: ペーストプレビュー開始（ビルドモード、クリップボードあり）
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
      if (this.player.mode === 'build' && this.buildTools.hasClipboard) {
        e.preventDefault();
        this.enterPastePreview();
      }
      return;
    }

    // ESC キー: インベントリ/メニューを閉じる or ペーストキャンセル or 選択範囲クリア
    if (e.code === 'Escape') {
      if (this.hud.inventory.visible) {
        this.closeInventory();
        return;
      }
      if (this.paused) {
        this.resume();
        return;
      }
      // ペーストプレビュー中はキャンセル
      if (this.pastePreviewActive) {
        this.exitPastePreview();
        return;
      }
      // ビルドモード中に選択範囲が存在する場合はクリア
      if (this.player.mode === 'build' && this.selectionBox.getAABB() !== null) {
        this.selectionBox.clear();
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
      // モード切替時に BuildToolbar の表示を切り替える
      if (this.player.mode === 'build') {
        this.buildToolbar.show();
      } else {
        this.buildToolbar.hide();
        // Walk モードに戻ったら選択範囲もクリア
        this.selectionBox.clear();
      }
    }
    // 数字キー1-6でホットバー選択
    if (e.code >= 'Digit1' && e.code <= 'Digit6') {
      this.hud.hotbar.select(parseInt(e.code.charAt(5)) - 1);
    }

    // M キー: ミラー軸をサイクル（none → x → z → xz → none）
    if (e.code === 'KeyM') {
      const cycle: Array<'none' | 'x' | 'z' | 'xz'> = ['none', 'x', 'z', 'xz'];
      const currentIndex = cycle.indexOf(this.player.mirrorAxis);
      const nextAxis = cycle[(currentIndex + 1) % cycle.length];
      this.player.mirrorAxis = nextAxis;
      this.buildToolbar.setMirrorAxis(nextAxis);
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

      // ミラーハイライト更新（ミラーが有効かつヒットがある場合）
      if (hit && this.player.mirrorAxis !== 'none') {
        const bx = hit.blockPos.x, by = hit.blockPos.y, bz = hit.blockPos.z;
        const mx = MAP_W - 1 - bx; // X軸ミラー座標
        const mz = MAP_D - 1 - bz; // Z軸ミラー座標

        // ミラー軸に応じて対称点リストを作成
        const mirrorPositions: Array<[number, number, number]> = [];
        const addMirror = (x: number, y: number, z: number): void => {
          if (x === bx && z === bz) return; // 中心線上はスキップ
          if (x < 0 || x >= MAP_W || z < 0 || z >= MAP_D) return;
          mirrorPositions.push([x, y, z]);
        };

        const axis = this.player.mirrorAxis;
        if (axis === 'x' || axis === 'xz') addMirror(mx, by, bz);
        if (axis === 'z' || axis === 'xz') addMirror(bx, by, mz);
        if (axis === 'xz') addMirror(mx, by, mz);

        // ミラーハイライトメッシュを更新
        for (let i = 0; i < this.mirrorHighlights.length; i++) {
          const mh = this.mirrorHighlights[i];
          if (i < mirrorPositions.length) {
            const [px, py, pz] = mirrorPositions[i];
            mh.position.set(px + 0.5, py + 0.5, pz + 0.5);
            mh.visible = true;
          } else {
            mh.visible = false;
          }
        }
      } else {
        // ミラーなし or ヒットなし: 全ミラーハイライトを非表示
        for (const mh of this.mirrorHighlights) {
          mh.visible = false;
        }
      }

      // ペーストプレビューモード中の処理
      if (this.pastePreviewActive) {
        // レイキャストヒット位置にプレビューメッシュを移動
        if (hit && this.pastePreviewMesh) {
          // ヒットしたブロックの法線方向隣接ブロック位置をペーストのoriginにする
          const origin = hit.blockPos.clone().add(hit.normal);
          this.pastePreviewMesh.position.set(
            origin.x + (this.buildTools.clipboardData?.size.x ?? 0) / 2,
            origin.y + (this.buildTools.clipboardData?.size.y ?? 0) / 2,
            origin.z + (this.buildTools.clipboardData?.size.z ?? 0) / 2,
          );
          this.pastePreviewMesh.visible = true;
        } else if (this.pastePreviewMesh) {
          this.pastePreviewMesh.visible = false;
        }

        // 左クリックでペースト確定 → そのままプレビューを継続（連続配置）
        if (this.input.mouseLeftClicked && hit) {
          const origin = hit.blockPos.clone().add(hit.normal);
          const entry = this.buildTools.paste(this.world, origin);
          if (entry && entry.changes.length > 0) {
            this.buildHistory.push(entry);
            this.updateUndoRedoButtons();
          }
          // プレビューメッシュだけ再生成して継続（Escape でキャンセルするまで繰り返せる）
          this.exitPastePreview();
          this.enterPastePreview();
        }
      } else {
        // G+クリックで選択範囲を設定（ビルドモードのみ）
        if (this.player.mode === 'build' && this.input.isDown('KeyG') && this.input.mouseLeftClicked && hit) {
          if (!this.selectionBox.getAABB() || this.selectionBox.isReady) {
            // 未設定 or 両点確定済みの場合 → 新しい start として再開始
            this.selectionBox.setStart(hit.blockPos);
          } else {
            // start のみ設定済み → end を設定
            this.selectionBox.setEnd(hit.blockPos);
          }
          // Copy ボタンと Undo/Redo ボタン状態を更新
          this.updateToolbarState();
        }
      }

      // 選択範囲ワイヤーフレームを更新（変更がなければ内部でスキップ）
      this.selectionBox.updateMesh(this.scene);

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

    // ライトを太陽と連動（プレイヤー付近にシャドウカメラを配置）
    const sunDir = this.sky.getSunDirection();
    const playerPos = this.player.camera.position;
    this.sunLight.position.copy(playerPos).add(sunDir.multiplyScalar(100));
    this.sunLight.target.position.copy(playerPos);
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

  /** Undo を実行: 最新操作を oldId で復元する */
  private applyUndo(): void {
    const entry = this.buildHistory.undo();
    if (!entry) return;
    // 変更を逆順に適用（oldId で復元）
    const batch = entry.changes.slice().reverse().map((c) => ({
      wx: c.wx, wy: c.wy, wz: c.wz, id: c.oldId,
    }));
    this.world.setBlockBatch(batch);
    this.updateUndoRedoButtons();
  }

  /** Redo を実行: Undo した操作を newId で再適用する */
  private applyRedo(): void {
    const entry = this.buildHistory.redo();
    if (!entry) return;
    // 変更を正順に適用（newId で再適用）
    const batch = entry.changes.map((c) => ({
      wx: c.wx, wy: c.wy, wz: c.wz, id: c.newId,
    }));
    this.world.setBlockBatch(batch);
    this.updateUndoRedoButtons();
  }

  /** BuildToolbar の Undo/Redo ボタンの enabled/disabled 状態を同期する */
  private updateUndoRedoButtons(): void {
    this.buildToolbar.setUndoEnabled(this.buildHistory.canUndo);
    this.buildToolbar.setRedoEnabled(this.buildHistory.canRedo);
  }

  /** BuildToolbar の全ボタン状態を同期する（Undo/Redo + Copy/Paste/Replace） */
  private updateToolbarState(): void {
    this.updateUndoRedoButtons();
    // Copy は選択範囲確定時のみ有効
    this.buildToolbar.setCopyEnabled(this.selectionBox.isReady);
    // Paste はクリップボードありの時のみ有効
    this.buildToolbar.setPasteEnabled(this.buildTools.hasClipboard);
    // Replace は選択範囲が存在する場合のみ有効（start のみでも可）
    this.buildToolbar.setReplaceEnabled(this.selectionBox.getAABB() !== null);
    // Templates パネルの Save ボタン有効化に使用するクリップボード状態を同期
    this.buildToolbar.setHasClipboard(this.buildTools.hasClipboard);
  }

  /** コピーを実行する（ビルドモード・選択範囲確定時） */
  private executeCopy(): void {
    const aabb = this.selectionBox.getAABB();
    if (!aabb || !this.selectionBox.isReady) return;
    this.buildTools.copy(this.world, aabb);
    // Paste ボタンを有効化
    this.updateToolbarState();
    // コピー直後にペーストプレビューモードへ移行
    this.enterPastePreview();
  }

  /** ペーストプレビューモードに入る */
  private enterPastePreview(): void {
    if (!this.buildTools.hasClipboard) return;
    if (this.pastePreviewActive) return;

    this.pastePreviewActive = true;
    // ペーストプレビュー中は通常のブロック設置・破壊を無効化
    this.player.blockInteractionDisabled = true;

    // クリップボードからプレビューメッシュを生成（1回だけ）
    this.pastePreviewMesh = this.buildPastePreviewMesh();
    if (this.pastePreviewMesh) {
      this.pastePreviewMesh.visible = false;
      this.scene.add(this.pastePreviewMesh);
    }
  }

  /** ペーストプレビューモードを終了してメッシュを破棄する */
  private exitPastePreview(): void {
    this.pastePreviewActive = false;
    // ブロック操作を再び有効化
    this.player.blockInteractionDisabled = false;

    if (this.pastePreviewMesh) {
      this.scene.remove(this.pastePreviewMesh);
      this.pastePreviewMesh.geometry.dispose();
      (this.pastePreviewMesh.material as THREE.Material).dispose();
      this.pastePreviewMesh = null;
    }
  }

  /**
   * クリップボードデータからペーストプレビュー用のマージ済みメッシュを生成する
   * ブロックごとに BoxGeometry を生成し、BufferGeometryUtils でマージする
   */
  private buildPastePreviewMesh(): THREE.Mesh | null {
    const clipboard = this.buildTools.clipboardData;
    if (!clipboard || clipboard.blocks.length === 0) return null;

    // AIR以外のブロックのみ対象
    const nonAirBlocks = clipboard.blocks.filter((b) => b.id !== 0);
    if (nonAirBlocks.length === 0) return null;

    const sizeX = clipboard.size.x;
    const sizeY = clipboard.size.y;
    const sizeZ = clipboard.size.z;

    // クリップボードの中心オフセット（position 計算の基準）
    const cx = sizeX / 2;
    const cy = sizeY / 2;
    const cz = sizeZ / 2;

    // ブロックごとに BoxGeometry を生成してマージ
    const geometries: THREE.BufferGeometry[] = [];

    for (const { rx, ry, rz } of nonAirBlocks) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      // メッシュの中心基準に変換（position は clipboardのmin基準 + 0.5）
      const matrix = new THREE.Matrix4().makeTranslation(
        rx + 0.5 - cx,
        ry + 0.5 - cy,
        rz + 0.5 - cz,
      );
      geo.applyMatrix4(matrix);
      geometries.push(geo);
    }

    // 手動マージで1つの BufferGeometry に統合する
    const merged = this.mergeBufferGeometries(geometries);

    // 個別 geometry を dispose
    for (const g of geometries) g.dispose();

    if (!merged) return null;

    const mat = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      opacity: 0.4,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(merged, mat);
  }

  /**
   * 複数の BufferGeometry を1つにマージするユーティリティ
   * Three.js の BufferGeometryUtils を同期的に使わずに実装する
   */
  private mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (geometries.length === 0) return null;

    // position 属性の総頂点数を計算
    let totalVertices = 0;
    let totalIndices = 0;
    for (const g of geometries) {
      totalVertices += g.attributes['position'].count;
      if (g.index) {
        totalIndices += g.index.count;
      }
    }

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const indices = new Uint32Array(totalIndices);

    let vertexOffset = 0;
    let indexOffset = 0;

    for (const g of geometries) {
      const posAttr = g.attributes['position'] as THREE.BufferAttribute;
      const normAttr = g.attributes['normal'] as THREE.BufferAttribute;
      const count = posAttr.count;

      positions.set(posAttr.array as Float32Array, vertexOffset * 3);
      normals.set((normAttr.array as Float32Array), vertexOffset * 3);

      if (g.index) {
        const srcIdx = g.index.array;
        for (let i = 0; i < srcIdx.length; i++) {
          indices[indexOffset + i] = srcIdx[i] + vertexOffset;
        }
        indexOffset += srcIdx.length;
      }

      vertexOffset += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (totalIndices > 0) {
      merged.setIndex(new THREE.BufferAttribute(indices, 1));
    }

    return merged;
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.onResize();
  }
}
