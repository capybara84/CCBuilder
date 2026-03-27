import * as THREE from 'three';

/**
 * 空の演出を管理するクラス
 * スカイドーム（グラデーション）、太陽スプライト、雲メッシュを提供
 */
export class Sky {
  readonly group = new THREE.Group();

  // 太陽の方向（DirectionalLight と連動）
  private sunDirection = new THREE.Vector3(50, 100, 30).normalize();
  private sunSprite: THREE.Sprite;
  private sunGlowSprite: THREE.Sprite;
  private clouds: THREE.Mesh[] = [];
  private skyDome: THREE.Mesh;

  // 色定義
  private static readonly ZENITH_COLOR = new THREE.Color(0x1e90ff);   // 天頂: 深い青
  private static readonly HORIZON_COLOR = new THREE.Color(0xb0d4f1);  // 地平線: 明るい水色
  private static readonly FOG_COLOR = new THREE.Color(0xb0d4f1);      // フォグ色（地平線と合わせる）

  constructor() {
    this.skyDome = this.createSkyDome();
    this.group.add(this.skyDome);

    this.sunSprite = this.createSun();
    this.sunGlowSprite = this.createSunGlow();
    this.group.add(this.sunSprite);
    this.group.add(this.sunGlowSprite);

    this.createClouds();
  }

  /** 空のグラデーションドームを作成 */
  private createSkyDome(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uZenithColor: { value: Sky.ZENITH_COLOR },
        uHorizonColor: { value: Sky.HORIZON_COLOR },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        varying vec3 vWorldPos;
        void main() {
          // 正規化した高さ (0=地平線, 1=天頂)
          float h = normalize(vWorldPos).y;
          h = clamp(h, 0.0, 1.0);
          // べき乗で地平線付近を広く明るくする
          float t = pow(h, 0.6);
          vec3 color = mix(uHorizonColor, uZenithColor, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1; // 最背面に描画
    mesh.frustumCulled = false;
    return mesh;
  }

  /** 太陽スプライトを作成 */
  private createSun(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // 太陽の円
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    gradient.addColorStop(0, 'rgba(255, 255, 230, 1.0)');
    gradient.addColorStop(0.5, 'rgba(255, 240, 180, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 200, 100, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(30, 30, 1);
    sprite.renderOrder = 0;
    return sprite;
  }

  /** 太陽のグロー（大きめスプライト、加算ブレンド） */
  private createSunGlow(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 0.3)');
    gradient.addColorStop(0.3, 'rgba(255, 230, 150, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 200, 100, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(80, 80, 1);
    sprite.renderOrder = 0;
    return sprite;
  }

  /** 雲を生成 */
  private createClouds(): void {
    for (let i = 0; i < 20; i++) {
      // 各雲ごとに個別テクスチャ生成（形のバリエーション）
      const tex = this.generateCloudTexture();
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.7 + Math.random() * 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const scaleX = 30 + Math.random() * 40;
      const scaleZ = 15 + Math.random() * 20;
      const geo = new THREE.PlaneGeometry(scaleX, scaleZ);

      const cloud = new THREE.Mesh(geo, mat);
      cloud.rotation.x = -Math.PI / 2; // 水平に配置
      cloud.position.set(
        (Math.random() - 0.5) * 500,
        60 + Math.random() * 30,       // 高度 60〜90
        (Math.random() - 0.5) * 500,
      );
      cloud.renderOrder = 1;

      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  /** プロシージャル雲テクスチャ生成（もこもこした自然な雲） */
  private generateCloudTexture(): THREE.CanvasTexture {
    const w = 256;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // 複数の楕円を重ねてもこもこした雲を作る
    ctx.clearRect(0, 0, w, h);

    // 雲の塊を構成する楕円パーツ
    const blobs: { cx: number; cy: number; rx: number; ry: number }[] = [];

    // メインの横長ベース
    blobs.push({ cx: w * 0.5, cy: h * 0.55, rx: w * 0.38, ry: h * 0.22 });

    // 上に盛り上がるもこもこ
    const bumpCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < bumpCount; i++) {
      const t = (i + 0.5) / bumpCount;
      const cx = w * (0.15 + t * 0.7);
      const cy = h * (0.3 + Math.random() * 0.15);
      const rx = w * (0.08 + Math.random() * 0.12);
      const ry = h * (0.15 + Math.random() * 0.2);
      blobs.push({ cx, cy, rx, ry });
    }

    // 下に少し膨らむ部分
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.25 + Math.random() * 0.5);
      const cy = h * (0.6 + Math.random() * 0.1);
      const rx = w * (0.06 + Math.random() * 0.1);
      const ry = h * (0.08 + Math.random() * 0.08);
      blobs.push({ cx, cy, rx, ry });
    }

    // 各楕円を放射グラデーションで描画（白→透明）
    for (const blob of blobs) {
      const r = Math.max(blob.rx, blob.ry);
      const gradient = ctx.createRadialGradient(
        blob.cx, blob.cy, 0,
        blob.cx, blob.cy, r,
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

      ctx.save();
      ctx.translate(blob.cx, blob.cy);
      ctx.scale(blob.rx / r, blob.ry / r);
      ctx.translate(-blob.cx, -blob.cy);
      ctx.fillStyle = gradient;
      ctx.fillRect(blob.cx - r, blob.cy - r, r * 2, r * 2);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  /** フォグ色を返す（外部のFog設定に使用） */
  get fogColor(): THREE.Color {
    return Sky.FOG_COLOR.clone();
  }

  /** 毎フレーム呼ばれる更新 */
  update(camera: THREE.Camera, _dt: number): void {
    // スカイドームをカメラに追従
    this.skyDome.position.copy(camera.position);

    // 太陽をカメラからの相対位置に配置
    const sunPos = this.sunDirection.clone().multiplyScalar(500);
    sunPos.add(camera.position);
    this.sunSprite.position.copy(sunPos);
    this.sunGlowSprite.position.copy(sunPos);

    // 雲をゆっくりスクロール（風）
    const windSpeed = 2.0; // units/sec
    for (const cloud of this.clouds) {
      cloud.position.x += windSpeed * _dt;
      // 画面外に出たらループ
      if (cloud.position.x - camera.position.x > 300) {
        cloud.position.x = camera.position.x - 300;
        cloud.position.z = camera.position.z + (Math.random() - 0.5) * 300;
      }
    }
  }

  /** リソース解放 */
  dispose(): void {
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.ShaderMaterial).dispose();
    (this.sunSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.sunSprite.material as THREE.SpriteMaterial).dispose();
    (this.sunGlowSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.sunGlowSprite.material as THREE.SpriteMaterial).dispose();
    for (const cloud of this.clouds) {
      cloud.geometry.dispose();
      (cloud.material as THREE.MeshBasicMaterial).map?.dispose();
      (cloud.material as THREE.MeshBasicMaterial).dispose();
    }
  }
}
