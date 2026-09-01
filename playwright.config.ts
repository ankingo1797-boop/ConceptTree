// 第三轮 3b：Playwright 端到端配置
// 约定：e2e 不进 `npm test`（保持日常门禁速度），用 `npm run e2e` 单独跑；
// 每条流程独立临时数据目录 + 随机端口 + mock AI，不消耗真实 Key。
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
  },
})
