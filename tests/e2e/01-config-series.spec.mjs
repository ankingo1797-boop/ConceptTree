// 流程 1：首启配置 → 创建系列 → 打开画布
import { test, expect } from '@playwright/test'
import { startTestEnv } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('首启配置并创建系列', async ({ page }) => {
  await page.goto(env.baseUrl)
  // 首启自动进设置页
  await expect(page.getByText('API URL')).toBeVisible()
  await page.getByPlaceholder(/api\.deepseek\.com/).fill(env.aiUrl)
  await page.getByPlaceholder('sk-...').fill('sk-e2e-mock-key-0123456789')
  await page.getByRole('button', { name: '保存并进入' }).click()

  // 系列管理页（第十一轮：主页标语替代大标题）
  await expect(page.getByText('每一棵树，都是一段学习旅程')).toBeVisible()
  await expect(page.getByText(/还没有系列/)).toBeVisible()

  // 创建并打开（第二轮 4.1 反馈 #2：同名根概念已播种在画布）
  await page.getByPlaceholder(/系列名称/).fill('E2E 系列')
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.getByText('E2E 系列', { exact: true }).first()).toBeVisible()

  // 顶栏三件套（日历/统计/主题）在打开系列后可见
  await expect(page.getByRole('button', { name: /日历/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /统计/ })).toBeVisible()

  // 第二轮 3.9 反馈 #8：画布工具栏有返回系列管理入口
  await expect(page.getByRole('button', { name: '系列' })).toBeVisible()

  // 第二轮 3.9 反馈 #2：设置返回后回到原系列（不是首页）
  await page.getByRole('button', { name: /设置/ }).click()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByText('E2E 系列', { exact: true }).first()).toBeVisible()
})
