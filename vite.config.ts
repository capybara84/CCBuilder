import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // LAN上の他端末からアクセス可能にする
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
