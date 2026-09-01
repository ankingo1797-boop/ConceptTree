// 第三轮 3b：e2e 环境基建
// startTestEnv()：随机端口启动真实 server.js（临时数据目录，CT_* 环境变量注入）+ mock AI（OpenAI 兼容 SSE）
import { spawn } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function waitForHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('服务未就绪: ' + url)
}

/** mock AI：OpenAI 兼容 /chat/completions，SSE 流式返回含已知术语的回答（供候选检测命中） */
export function startMockAi(port) {
  const REPLY = '机器学习是让计算机从数据中学习规律的技术。它的训练通常依赖 梯度下降 来优化参数，而 神经网络 是其中最重要的模型家族。'
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        // 按标点切块流式输出
        for (const chunk of REPLY.split(/(?<=[，。、])/)) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()
      })
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  server.listen(port, '127.0.0.1')
  return server
}

/**
 * 启动完整测试环境：
 * - mock AI（先起，供配置页填入地址）
 * - 真实 server.js（随机端口 + 临时数据/配置/日志/备份目录）
 * 返回 { baseUrl, aiUrl, close }
 */
export async function startTestEnv() {
  const appPort = await getFreePort()
  const aiPort = await getFreePort()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e2e-'))
  const env = {
    ...process.env,
    CT_PORT: String(appPort),
    CT_DATA_DIR: path.join(tmp, 'data'),
    CT_CONFIG_FILE: path.join(tmp, 'config.json'),
    CT_LOG_DIR: path.join(tmp, 'logs'),
    CT_BACKUP_DIR: path.join(tmp, 'backups'),
  }
  const ai = startMockAi(aiPort)
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore', windowsHide: true })
  const baseUrl = `http://127.0.0.1:${appPort}`
  try {
    await waitForHttp(baseUrl + '/')
  } catch (e) {
    try { child.kill() } catch { /* ignore */ }
    try { ai.close() } catch { /* ignore */ }
    throw e
  }
  return {
    baseUrl,
    aiUrl: `http://127.0.0.1:${aiPort}/v1`,
    async close() {
      try { child.kill() } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 300))
      try { ai.close() } catch { /* ignore */ }
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    },
  }
}

/** 通用：完成首启配置（apiUrl 指向 mock AI）并创建系列、打开 */
export async function bootstrap(page, env, seriesName = 'E2E 系列') {
  await page.goto(env.baseUrl)
  await page.getByPlaceholder(/api\.deepseek\.com/).fill(env.aiUrl)
  await page.getByPlaceholder('sk-...').fill('sk-e2e-mock-key-0123456789')
  await page.getByRole('button', { name: '保存并进入' }).click()
  await page.getByText('每一棵树，都是一段学习旅程').waitFor({ state: 'visible' })
  await page.getByPlaceholder(/系列名称/).fill(seriesName)
  await page.getByRole('button', { name: '创建' }).click()
  // 第二轮 4.1 反馈 #2：创建系列即播种同名根概念，画布直接可见
  await page.getByText(seriesName, { exact: true }).first().waitFor({ state: 'visible' })
}

/** 通用：手动添加一个概念（右侧面板，无需 AI） */
export async function addConceptManually(page, name) {
  const input = page.getByLabel('手动添加概念')
  await input.fill(name)
  await input.press('Enter')
  // 画布卡片出现（卡片标题）
  await page.getByText(name, { exact: true }).first().waitFor({ state: 'visible' })
}
