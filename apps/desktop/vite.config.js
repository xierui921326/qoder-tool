import { defineConfig } from 'vite';

export default defineConfig({
  // 清除控制台
  clearScreen: false,
  // 开发服务器配置
  server: {
    port: 5173,
    strictPort: true,
  },
  // 环境变量前缀
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri 在 Windows 上使用 Chromium，在 macOS 和 Linux 上使用 WebKit
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // 生产环境不生成 sourcemap
    sourcemap: !!process.env.TAURI_DEBUG,
    // 输出目录
    outDir: 'dist',
  },
});
