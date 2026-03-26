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
    const geo = new THREE.SphereGeometry(400, 32, 16);
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
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1; // 最背面に描画
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
    const cloudTexture = this.generateCloudTexture();

    for (let i = 0; i < 25; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: cloudTexture.clone(),
        transparent: true,
        opacity: 0.4 + Math.random() * 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const scaleX = 15 + Math.random() * 25;
      const scaleZ = 8 + Math.random() * 15;
      const geo = new THREE.PlaneGeometry(scaleX, scaleZ);

      const cloud = new THREE.Mesh(geo, mat);
      cloud.rotation.x = -Math.PI / 2; // 水平に配置
      cloud.position.set(
        (Math.random() - 0.5) * 300,
        60 + Math.random() * 30,       // 高度 60〜90
        (Math.random() - 0.5) * 300,
      );
      cloud.renderOrder = 1;

      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  /** プロシージャル雲テクスチャ生成 */
  private generateCloudTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // シンプルなノイズベースの雲
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // 中心からの距離で端をフェードアウト
        const dx = (x - size / 2) / (size / 2);
        const dy = (y - size / 2) / (size / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const fade = Math.max(0, 1 - dist);

        // ランダムなノイズ
        const noise = Math.random() * 0.4 + 0.6;
        const alpha = fade * fade * noise * 255;

        const idx = (y * size + x) * 4;
        data[idx] = 255;     // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        data[idx + 3] = alpha;
      }
    }

    ctx.putImageData(imageData, 0, 0);
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
    const sunPos = this.sunDirection.clone().multiplyScalar(350);
    sunPos.add(camera.position);
    this.sunSprite.position.copy(sunPos);
    this.sunGlowSprite.position.copy(sunPos);

    // 雲をゆっくりスクロール（風）
    const windSpeed = 2.0; // units/sec
    for (const cloud of this.clouds) {
      cloud.position.x += windSpeed * _dt;
      // 画面外に出たらループ
      if (cloud.position.x - camera.position.x > 200) {
        cloud.position.x = camera.position.x - 200;
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
