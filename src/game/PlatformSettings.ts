// モバイル/デスクトップのパフォーマンス設定を一元管理

export interface PlatformConfig {
  /** デバイスピクセル比の上限 */
  maxPixelRatio: number;
  /** アンチエイリアス */
  antialias: boolean;
  /** シャドウマップサイズ（片辺） */
  shadowMapSize: number;
  /** フォグ開始距離 */
  fogNear: number;
  /** フォグ終了距離 */
  fogFar: number;
  /** 松明PointLightの最大数 */
  maxTorchLights: number;
}

const DESKTOP: PlatformConfig = {
  maxPixelRatio: Infinity,
  antialias: true,
  shadowMapSize: 2048,
  fogNear: 50,
  fogFar: 150,
  maxTorchLights: Infinity,
};

const MOBILE: PlatformConfig = {
  maxPixelRatio: 1.5,
  antialias: false,
  shadowMapSize: 1024,
  fogNear: 30,
  fogFar: 80,
  maxTorchLights: 8,
};

/** Capacitorネイティブ or タッチデバイスならモバイル設定を返す */
export function getPlatformConfig(): PlatformConfig {
  const isNative = !!(window as unknown as Record<string, unknown>).Capacitor;
  const isTouch = navigator.maxTouchPoints > 0;
  return (isNative || isTouch) ? { ...MOBILE } : { ...DESKTOP };
}
