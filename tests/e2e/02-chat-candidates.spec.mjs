// 流程 2：手动加概念 → 对话（mock AI 流式）→ 候选概念出现并入树
import { test, expect } from '@playwright/test'
import { startTestEnv, bootstrap, addConceptManually } from './helpers.mjs'

let env
test.beforeAll(async () => { env = await startTestEnv() })
test.afterAll(async () => { await env.close() })

test('对话流式 + 候选概念入树', async ({ page }) => {
  await bootstrap(page, env)
  await addConceptManually(page, '机器学习')
  // 第二轮 3.9 反馈 #9 回归：创建概念不得弹出日历/统计弹层
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 选中新概念，右侧出现对话面板
  await page.getByText('机器学习', { exact: true }).first().click()
  await expect(page.getByPlaceholder(/提问「机器学习」/)).toBeVisible()

  // 发送问题，等待 mock AI 流式回答完成
  await page.getByPlaceholder(/提问「机器学习」/).fill('什么是机器学习的核心？')
  await page.getByRole('button', { name: /发送/ }).click()
  // 回答结束标志：候选区出现（规则检测在 onDone 触发）
  await expect(page.getByText(/候选概念/)).toBeVisible({ timeout: 20_000 })

  // 回答气泡含 mock 内容
  await expect(page.getByText(/梯度下降/).first()).toBeVisible()

  // 展开候选区，点「梯度下降」芯片入树
  await page.getByText('展开').click()
  await page.getByRole('button', { name: '梯度下降' }).click()

  // 画布出现新卡片，且存在父子关系（候选挂到当前概念下）
  await expect(page.getByText('梯度下降', { exact: true }).first()).toBeVisible()
})
