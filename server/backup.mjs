// 备份 / 恢复 / 导出 — 可注入路径的纯函数模块（便于集成测试）
// 设计来源：docs/DESIGN-REFERENCES.md §3.4（木子工作台备份栈模式）
// 安全语义：
//  - createBackup：读主数据 → JSON 校验 → 原子写（.tmp + rename）
//  - restoreBackup：先做安全备份 → 校验备份 → 原子替换 → 后置校验 → 失败回滚
//  - 备份文件名：concept-tree-<ISO>.json（listBackups 只认该前缀）

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BACKUP_RE = /^concept-tree-.+\.json$/

/** 从备份文件名解析创建时间（文件名是时间的权威来源，mtime 仅作兜底） */
function parseBackupTime(f) {
  const m = /^concept-tree-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(f)
  if (!m) return null
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`)
}

export function backupFileName(now = new Date()) {
  return 'concept-tree-' + now.toISOString().replace(/[:.]/g, '-') + '.json'
}

function readValidData(file) {
  const raw = readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw) // 损坏即抛
  if (!parsed || typeof parsed !== 'object' || !parsed.series) throw new Error('invalid data: missing series')
  return { raw, parsed }
}

function writeAtomic(file, content) {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = file + '.tmp'
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

/** 创建一份备份；返回 { file, size, createdAt } */
export function createBackup({ dataFile, backupDir, now = new Date() }) {
  const { raw } = readValidData(dataFile)
  mkdirSync(backupDir, { recursive: true })
  const file = backupFileName(now)
  writeAtomic(join(backupDir, file), raw)
  return { file, size: Buffer.byteLength(raw, 'utf8'), createdAt: now.toISOString() }
}

/** 备份列表，按时间倒序 */
export function listBackups({ backupDir }) {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((f) => BACKUP_RE.test(f))
    .map((f) => {
      const st = statSync(join(backupDir, f))
      const t = parseBackupTime(f)
      return { file: f, size: st.size, createdAt: (t && !Number.isNaN(t.getTime()) ? t : st.mtime).toISOString() }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** FIFO 保留 keep 份，返回被删除的文件名 */
export function pruneBackups({ backupDir, keep = 10 }) {
  const removed = []
  for (const b of listBackups({ backupDir }).slice(keep)) {
    try { rmSync(join(backupDir, b.file)); removed.push(b.file) } catch { /* 忽略删除失败 */ }
  }
  return removed
}

/**
 * 恢复指定备份到主数据文件。
 * 流程：安全备份当前数据 → 校验备份内容 → 原子替换 → 后置校验；任何一步失败回滚，不破坏主数据。
 */
export function restoreBackup({ backupDir, file, dataFile }) {
  const src = join(backupDir, file)
  if (!existsSync(src)) throw new Error('backup not found: ' + file)
  const { raw } = readValidData(src) // 备份损坏即抛，主数据不动

  let safety = null
  try {
    safety = createBackup({ dataFile, backupDir }) // 恢复前安全备份
  } catch {
    // 当前主数据已损坏时无法做安全备份，仍允许恢复（恢复即修复）
  }

  const stash = dataFile + '.prev'
  const hadOriginal = existsSync(dataFile)
  if (hadOriginal) copyFileSync(dataFile, stash)
  try {
    writeAtomic(dataFile, raw)
    readValidData(dataFile) // 后置校验
    try { rmSync(stash) } catch { /* 清理失败不影响结果 */ }
    return { ok: true, safety: safety ? safety.file : null }
  } catch (e) {
    if (hadOriginal && existsSync(stash)) {
      try { copyFileSync(stash, dataFile) } catch { /* 回滚失败则抛出原始错误 */ }
    }
    try { rmSync(stash, { force: true }) } catch { /* ignore */ }
    throw e
  }
}

/** 启动时自动备份：无备份或最新备份早于 maxAgeMs 时创建一份并 prune */
export function autoBackupIfStale({ dataFile, backupDir, maxAgeMs = 24 * 3600 * 1000, keep = 10, now = new Date() }) {
  const [latest] = listBackups({ backupDir })
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < maxAgeMs) return null
  const created = createBackup({ dataFile, backupDir, now })
  pruneBackups({ backupDir, keep })
  return created
}

/** 导出全量数据（返回解析后的对象，调用方负责下载头） */
export function exportData({ dataFile }) {
  return readValidData(dataFile).parsed
}
