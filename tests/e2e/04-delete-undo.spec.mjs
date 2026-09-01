// 流程 4：删除概念 → 撤销恢复
import { test, expect } from '@playwright/test'
import { startTestEnv, bootstrap, addConceptManually } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('删除概念后可撤销恢复', async ({ page }) => {
  await bootstrap(page, env)
  await addConceptManually(page, '待删概念')
  const card = page.getByText('待删概念', { exact: true }).first()
  await expect(card).toBeVisible()

  // 右键卡片 → 删除概念 → 应用内确认框（第二轮 4.2：不再有原生 confirm）
  await card.click({ button: 'right' })
  await page.getByText('删除概念').click()
  await page.getByRole('dialog').getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('待删概念', { exact: true })).toHaveCount(0)

  // 第二轮 4.1/4.2 反馈 #1 回归：删除确认后输入功能正常
  const manual = page.getByLabel('手动添加概念')
  await manual.fill('删除后输入正常')
  await expect(manual).toHaveValue('删除后输入正常')
  await manual.fill('')

  // 工具栏撤销 → 卡片恢复
  await page.getByTitle('撤销（移动/改名/状态/删除/新增）').click()
  await expect(page.getByText('待删概念', { exact: true }).first()).toBeVisible()

  // 重做 → 又消失
  await page.getByTitle('重做').click()
  await expect(page.getByText('待删概念', { exact: true })).toHaveCount(0)
})
