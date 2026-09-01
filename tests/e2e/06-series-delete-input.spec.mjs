// 流程 6（第二轮 4.2 反馈 #1 用户原始场景）：删除系列后，创建输入框仍可正常输入
import { test, expect } from '@playwright/test'
import { startTestEnv } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('删除系列后创建输入框正常', async ({ page }) => {
  await page.goto(env.baseUrl)
  await page.getByPlaceholder(/api\.deepseek\.com/).fill(env.aiUrl)
  await page.getByPlaceholder('sk-...').fill('sk-e2e-mock-key-0123456789')
  await page.getByRole('button', { name: '保存并进入' }).click()
  await page.getByText('每一棵树，都是一段学习旅程').waitFor({ state: 'visible' })

  // 创建系列 A 并返回系列列表
  await page.getByPlaceholder(/系列名称/).fill('系列A')
  await page.getByRole('button', { name: '创建' }).click()
  await page.getByText('系列A', { exact: true }).first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '系列' }).click()
  await page.getByText('每一棵树，都是一段学习旅程').waitFor({ state: 'visible' })

  // 删除系列 A（应用内确认框）
  await page.getByTitle('删除').click()
  await page.getByRole('dialog').getByRole('button', { name: '删除' }).click()
  await expect(page.getByText(/还没有系列/)).toBeVisible()

  // 用户原始症状场景：删除后立刻在创建输入框打字
  const input = page.getByPlaceholder(/系列名称/)
  await input.fill('删除后的新系列')
  await expect(input).toHaveValue('删除后的新系列')
  await expect(page.getByRole('button', { name: '创建' })).toBeEnabled()

  // 再敲一次回车创建，验证整个链路可用
  await input.press('Enter')
  await page.getByText('删除后的新系列', { exact: true }).first().waitFor({ state: 'visible' })
})
