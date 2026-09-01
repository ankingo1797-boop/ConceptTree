// 环 0/1：备份栈集成测试（临时目录，路径注入）
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autoBackupIfStale, createBackup, exportData, listBackups, pruneBackups, restoreBackup } from '../server/backup.mjs'

const VALID = JSON.stringify({ version: 1, series: { s1: { id: 's1', name: '机械学习', concepts: {}, edges: [] } } })

let dir, dataFile, backupDir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ct-backup-'))
  dataFile = join(dir, 'concept-tree.json')
  backupDir = join(dir, 'backups')
  writeFileSync(dataFile, VALID, 'utf8')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createBackup / listBackups', () => {
  it('创建可列出的备份，内容与主数据一致', () => {
    const b = createBackup({ dataFile, backupDir })
    expect(b.file).toMatch(/^concept-tree-.+\.json$/)
    const list = listBackups({ backupDir })
    expect(list).toHaveLength(1)
    expect(list[0].file).toBe(b.file)
    expect(readFileSync(join(backupDir, b.file), 'utf8')).toBe(VALID)
  })

  it('主数据损坏时拒绝备份（不产出坏备份）', () => {
    writeFileSync(dataFile, '{oops', 'utf8')
    expect(() => createBackup({ dataFile, backupDir })).toThrow()
    expect(listBackups({ backupDir })).toEqual([])
  })

  it('按时间倒序排列', () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    const t1 = new Date('2026-01-02T00:00:00Z')
    createBackup({ dataFile, backupDir, now: t0 })
    createBackup({ dataFile, backupDir, now: t1 })
    const list = listBackups({ backupDir })
    expect(list[0].createdAt).toBe(t1.toISOString())
  })
})

describe('pruneBackups', () => {
  it('FIFO 保留 keep 份', () => {
    for (let i = 0; i < 13; i++) {
      createBackup({ dataFile, backupDir, now: new Date(Date.UTC(2026, 0, 1 + i)) })
    }
    const removed = pruneBackups({ backupDir, keep: 10 })
    expect(removed).toHaveLength(3)
    expect(listBackups({ backupDir })).toHaveLength(10)
  })
})

describe('restoreBackup', () => {
  it('恢复备份内容，且先做安全备份', () => {
    const b = createBackup({ dataFile, backupDir, now: new Date('2026-01-01T00:00:00Z') })
    writeFileSync(dataFile, VALID.replace('机械学习', '改过的系列'), 'utf8')
    const r = restoreBackup({ backupDir, file: b.file, dataFile })
    expect(r.ok).toBe(true)
    expect(readFileSync(dataFile, 'utf8')).toBe(VALID)
    expect(r.safety).toMatch(/^concept-tree-.+\.json$/) // 恢复前安全备份存在
    expect(listBackups({ backupDir }).length).toBe(2)
  })

  it('备份损坏时抛错且主数据不动', () => {
    createBackup({ dataFile, backupDir })
    const [b] = listBackups({ backupDir })
    writeFileSync(join(backupDir, b.file), '{corrupt', 'utf8')
    const before = readFileSync(dataFile, 'utf8')
    expect(() => restoreBackup({ backupDir, file: b.file, dataFile })).toThrow()
    expect(readFileSync(dataFile, 'utf8')).toBe(before)
  })

  it('备份不存在时抛错', () => {
    expect(() => restoreBackup({ backupDir, file: 'concept-tree-nope.json', dataFile })).toThrow(/not found/)
  })
})

describe('autoBackupIfStale', () => {
  it('无备份时创建', () => {
    const created = autoBackupIfStale({ dataFile, backupDir })
    expect(created).not.toBeNull()
    expect(listBackups({ backupDir })).toHaveLength(1)
  })

  it('24h 内的新备份不重复创建', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    createBackup({ dataFile, backupDir, now })
    const created = autoBackupIfStale({ dataFile, backupDir, now: new Date('2026-06-01T20:00:00Z') })
    expect(created).toBeNull()
  })

  it('超过 24h 创建新备份', () => {
    createBackup({ dataFile, backupDir, now: new Date('2026-06-01T00:00:00Z') })
    const created = autoBackupIfStale({ dataFile, backupDir, now: new Date('2026-06-03T00:00:01Z') })
    expect(created).not.toBeNull()
  })
})

describe('exportData', () => {
  it('返回解析后的全量数据', () => {
    const d = exportData({ dataFile })
    expect(d.series.s1.name).toBe('机械学习')
  })

  it('数据损坏时抛错', () => {
    writeFileSync(dataFile, 'not json', 'utf8')
    expect(() => exportData({ dataFile })).toThrow()
  })
})
