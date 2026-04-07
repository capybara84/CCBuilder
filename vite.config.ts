import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Capacitorの capacitor:// プロトコルで正しくリソース解決するために必要
  server: {
    host: true, // LAN上の他端末からアクセス可能にする
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
