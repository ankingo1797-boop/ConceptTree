// 环 1：备份/恢复/导出 API 集成测试（真服务 + 隔离环境）
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = 21000 + Math.floor(Math.random() * 2000)
const BASE = `http://127.0.0.1:${PORT}`

const VALID = { version: 1, series: { s1: { id: 's1', name: '机械学习', concepts: {}, edges: [] } } }

let dir
let child

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ct-api-'))
  writeFileSync(join(dir, 'concept-tree.json'), JSON.stringify(VALID), 'utf8')
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
      const r = await fetch(BASE + '/api/data')
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

describe('备份 API（真服务）', () => {
  it('启动时自动备份生效（新目录出现首份备份）', async () => {
    const r = await fetch(BASE + '/api/backups')
    const { backups } = await r.json()
    expect(backups.length).toBeGreaterThanOrEqual(1)
  }, 10000)

  it('POST /api/backups 创建新备份', async () => {
    const r = await fetch(BASE + '/api/backups', { method: 'POST' })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.backup.file).toMatch(/^concept-tree-.+\.json$/)
  }, 10000)

  it('恢复流程：改数据 → 恢复 → 数据回到备份态', async () => {
    const list0 = await (await fetch(BASE + '/api/backups')).json()
    const target = list0.backups[0].file
    // 修改主数据
    const changed = JSON.parse(JSON.stringify(VALID))
    changed.series.s1.name = '改过的系列'
    await fetch(BASE + '/api/data', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changed) })
    // 恢复
    const r = await fetch(BASE + `/api/backups/${encodeURIComponent(target)}/restore`, { method: 'POST' })
    expect(r.status).toBe(200)
    const data = await (await fetch(BASE + '/api/data')).json()
    expect(data.series.s1.name).toBe('机械学习')
  }, 10000)

  it('损坏的备份恢复返回 500 且主数据不动', async () => {
    const list0 = await (await fetch(BASE + '/api/backups')).json()
    const target = list0.backups[0].file
    writeFileSync(join(dir, 'backups', target), '{corrupt', 'utf8')
    const before = await (await fetch(BASE + '/api/data')).json()
    const r = await fetch(BASE + `/api/backups/${encodeURIComponent(target)}/restore`, { method: 'POST' })
    expect(r.status).toBe(500)
    const after = await (await fetch(BASE + '/api/data')).json()
    expect(after).toEqual(before)
  }, 10000)

  it('GET /api/export 返回全量数据与下载头', async () => {
    const r = await fetch(BASE + '/api/export')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="concept-tree-export-.+\.json"/)
    const data = await r.json()
    expect(data.series.s1).toBeTruthy()
  }, 10000)
})
