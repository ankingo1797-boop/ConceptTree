import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：构建到 dist/（server.js 托管该目录）
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    // 第五轮修复：tests/e2e 是 Playwright 领域（npm run e2e），
    // vitest 不得收集 .spec.mjs，否则收集期报错拖垮日常门禁
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // 第七轮：jsdom 观测 API 全局桩（CountUp/ClickSpark 等组件依赖）
    setupFiles: ['./tests/setup.ts'],
  },
})
