// 第十八轮：数据文件损坏时的隔离保护（真服务集成测试）
// 期望：损坏的 concept-tree.json 被隔离留存（改名 + 备份副本），GET 返回空结构，绝不静默覆盖丢数据
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = 22000 + Math.floor(Math.random() * 2000)
const BASE = `http://127.0.0.1:${PORT}`

let dir
let child

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ct-corrupt-'))
  writeFileSync(join(dir, 'concept-tree.json'), '{ 这不是合法 JSON ', 'utf8')
  child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      CT_PORT: String(PORT),
      CT_DATA_DIR: dir,
      CT_CONFIG_FILE: join(dir, 'config.json'),
      CT_BACKUP_DIR: join(dir, 'backups'),
      CT_LOG_DIR: join(dir, 'logs'),
      CT_DIST_DIR: join(ROOT, 'dist'),
    },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + '/api/config')
      if (r.ok) return
    } catch { /* 尚未就绪 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not become ready on ' + BASE)
}, 20000)

afterAll(() => {
  if (child) child.kill()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('损坏数据文件隔离', () => {
  it('GET /api/data 损坏时返回空结构，且原文件被隔离留存', async () => {
    const r = await fetch(BASE + '/api/data')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ version: 1, series: {} })
    // backups 里有损坏隔离副本
    const quarantined = readdirSync(join(dir, 'backups')).filter((f) => /^concept-tree-corrupt-.+\.json$/.test(f))
    expect(quarantined.length).toBeGreaterThanOrEqual(1)
    // 原损坏文件被改名留存（不再占用主文件名，避免被后续保存覆盖）
    const renamed = readdirSync(dir).some((f) => f.startsWith('concept-tree.json.corrupt-'))
    expect(renamed).toBe(true)
  }, 10000)
})
