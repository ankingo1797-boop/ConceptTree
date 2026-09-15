// 流程 5：暗色主题持久化 + 全局搜索定位
import { test, expect } from '@playwright/test'
import { startTestEnv, bootstrap, addConceptManually } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('暗色切换刷新后保留，全局搜索可定位概念', async ({ page }) => {
  await bootstrap(page, env)
  await addConceptManually(page, '神经网络')

  // 默认亮色
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // 切到暗色
  await page.getByRole('button', { name: '切换主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // 刷新后落在系列管理页，仍为暗色（持久化）
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // 重新打开系列（顶栏搜索/日历只在打开系列时出现）
  await page.getByText('E2E 系列').first().click()
  await expect(page.getByText('神经网络', { exact: true }).first()).toBeVisible()

  // 再切一次 → 跟随系统（属性随系统，此处只验证按钮可用与属性合法）
  await page.getByRole('button', { name: '切换主题' }).click()
  const mode = await page.locator('html').getAttribute('data-theme')
  expect(['light', 'dark']).toContain(mode)

  // 全局搜索：搜「神经」→ 下拉出现结果 → 点击定位
  await page.getByLabel('全局搜索').fill('神经')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByTitle('定位到画布卡片').first().click()

  // 定位后：概念被选中（右侧对话页显示该概念名），搜索框清空
  await expect(page.getByPlaceholder(/提问「神经网络」/)).toBeVisible()
  await expect(page.getByLabel('全局搜索')).toHaveValue('')

  // 第五轮 C：Ctrl+K 唤起全局搜索（聚焦输入框）
  await page.keyboard.press('Control+k')
  await expect(page.getByLabel('全局搜索')).toBeFocused()
})
