// 流程 7（第七轮·指南 #1）：窄屏（≤900px）响应式——上下堆叠、无横向滚动条、标签页可用
import { test, expect } from '@playwright/test'
import { startTestEnv, bootstrap, addConceptManually } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('窄屏堆叠布局完整可用', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await bootstrap(page, env)
  await addConceptManually(page, '窄屏概念')

  // 选中概念，右侧面板（此时在画布下方）切换标签正常
  await page.getByText('窄屏概念', { exact: true }).first().click()
  await page.getByRole('tab', { name: /笔记·详情/ }).click()
  await expect(page.getByPlaceholder(/写下你自己的理解/)).toBeVisible()
  await page.getByRole('tab', { name: /对话/ }).click()
  await expect(page.getByPlaceholder(/提问「窄屏概念」/)).toBeVisible()

  // 无横向滚动条（指南：窄屏不出现横向滚动）
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
  expect(noHScroll).toBe(true)
})
