import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voxelcraft.app',
  appName: 'VoxelCraft',
  webDir: 'dist',
  ios: {
    scrollEnabled: false,
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
  },
  // 開発時: Vite devサーバーからライブリロード
  // server: {
  //   url: 'http://YOUR_LAN_IP:5173',
  //   cleartext: true,
  // },
};

export default config;
