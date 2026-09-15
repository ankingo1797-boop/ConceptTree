// 流程 3：标记「已掌握」→ 自动入列提示 → 日历中明天格子有到期
import { test, expect } from '@playwright/test'
import { startTestEnv, bootstrap, addConceptManually } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('已掌握自动入列并在日历可见', async ({ page }) => {
  await bootstrap(page, env)
  await addConceptManually(page, '机器学习')
  await page.getByText('机器学习', { exact: true }).first().click()

  // 切到「笔记·详情」标签，点「已掌握」
  await page.getByRole('tab', { name: /笔记·详情/ }).click()
  await page.getByRole('button', { name: '已掌握', exact: true }).click()

  // toast：已加入复习计划
  await expect(page.getByText(/已加入复习计划/)).toBeVisible()

  // 打开日历：明天的格子应标注 1 个到期
  await page.getByRole('button', { name: /日历/ }).click()
  const t = new Date(Date.now() + 86400000)
  // 跨月边界：明天若是下个月，先翻月（日历默认打开当前月）
  if (t.getMonth() !== new Date().getMonth() || t.getFullYear() !== new Date().getFullYear()) {
    await page.getByRole('button', { name: '下个月' }).click()
  }
  const label = `${t.getMonth() + 1}月${t.getDate()}日，到期 1 个`
  await expect(page.getByRole('button', { name: label })).toBeVisible()

  // 点该格子 → 清单出现概念名；未来日子无「开始复习」
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByRole('dialog').getByText('机器学习')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('明天到期')).toBeVisible()
  await expect(page.getByText(/这天还没有可复习的项/)).toBeVisible()
})
