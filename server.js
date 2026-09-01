// 概念学习树 — 一体式本地服务
// 职责：
//  1. 托管前端静态文件（dist/，Vite 构建产物）
//  2. 数据读写 API（data/concept-tree.json）
//  3. 配置 API（config.json：用户自填 apiUrl/apiKey，本地保存）
//     ★ 安全：apiKey 用 Windows DPAPI 加密后存储（apiKeyEnc 字段），
//       启动/请求时自动解密，config.json 中无 Key 明文。
//  4. OpenAI 兼容 AI 代理（规避 CORS，Key 不暴露浏览器）
//  5. 候选概念检测（规则 + 可选 AI 增强）
//
// 启动：node server.js（或双击 启动概念学习树.bat）
// 固定端口：8930

import http from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dpapiEncrypt, dpapiDecrypt } from './dpapi.js'
import { detectCandidates } from './server/detect.mjs'
import { autoBackupIfStale, createBackup, exportData, listBackups, pruneBackups, restoreBackup } from './server/backup.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 环境变量覆盖（供集成测试隔离）；默认值与历史行为完全一致
const PORT = Number(process.env.CT_PORT || 8930)
const DATA_DIR = process.env.CT_DATA_DIR || join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'concept-tree.json')
const CONFIG_FILE = process.env.CT_CONFIG_FILE || join(__dirname, 'config.json')
const BACKUP_DIR = process.env.CT_BACKUP_DIR || join(DATA_DIR, '..', 'backups')
const DIST_DIR = process.env.CT_DIST_DIR || join(__dirname, 'dist')
const LOG_DIR = process.env.CT_LOG_DIR || join(__dirname, 'logs')
const LOG_FILE = join(LOG_DIR, 'app.log')

// ---------- 日志模块（需求3：专门目录存运行日志） ----------
// 记录：启动、请求、错误、配置操作。绝不记录 apiKey 明文。
import { openSync, writeSync, closeSync } from 'node:fs'
function log(level, msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] ${msg}\n`
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const fd = openSync(LOG_FILE, 'a')
    try { writeSync(fd, line) } finally { closeSync(fd) }
  } catch { /* 日志失败不影响运行 */ }
  if (level === 'ERROR') console.error(line.trim())
  else if (level === 'INFO') console.log(line.trim())
}
const logInfo = (m) => log('INFO', m)
const logError = (m) => log('ERROR', m)
const logWarn = (m) => log('WARN', m)

// ---------- 工具 ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  // 原子写入：temp + rename（崩溃安全）
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    renameSyncSafe(tmp, file)
  } catch {
    // 极端情况直接覆盖
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }
}

import { renameSync } from 'node:fs'
function renameSyncSafe(from, to) {
  try { renameSync(from, to) } catch { /* 见调用方兜底 */ }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy() }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ---------- OpenAI 兼容代理 ----------

// 把 OpenAI 兼容的 {apiUrl} 规范化为 base（支持 /v1 或直接 /chat/completions）
function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  return u
}

async function proxyChat(config, req, res) {
  const { apiUrl, apiKeyEnc, model } = config
  if (!apiUrl || !apiKeyEnc) return json(res, 400, { error: '请先在设置中填写 API URL 和 API Key' })
  // ★ 启动/请求时自动解密 Key（DPAPI，仅当前 Windows 用户可解）
  const apiKey = dpapiDecrypt(apiKeyEnc)
  if (!apiKey) return json(res, 400, { error: 'API Key 解密失败，请重新在设置中填写' })

  const body = await readBody(req)
  let payload
  try { payload = JSON.parse(body) } catch { return json(res, 400, { error: 'invalid JSON body' }) }

  // 若用户在设置中配置了模型名，覆盖前端请求中的 model（优先平台正确模型名）
  if (model && payload && typeof payload.model === 'string') {
    payload = { ...payload, model }
  }

  // 构造 OpenAI 兼容请求：{apiUrl}/chat/completions
  const base = normalizeBaseUrl(apiUrl)
  const chatUrl = base.includes('/chat/completions') ? base : base + '/chat/completions'

  const upstreamRes = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  })

  // 转发响应头（流式用 text/event-stream）
  const contentType = upstreamRes.headers.get('content-type') || 'application/json'
  res.writeHead(upstreamRes.status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  })

  // 流式转发（SSE 或普通 JSON）
  if (upstreamRes.body) {
    const reader = upstreamRes.body.getReader()
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
      } catch (e) {
        console.error('stream error:', e.message)
      } finally {
        res.end()
      }
    }
    pump()
  } else {
    res.end(await upstreamRes.text())
  }
}

// ---------- 静态文件服务 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function serveStatic(req, res, pathname) {
  // 安全：只服务 dist/ 内的文件
  let rel = pathname === '/' ? '/index.html' : pathname
  const filePath = normalize(join(DIST_DIR, rel))
  if (!filePath.startsWith(normalize(DIST_DIR))) return json(res, 403, { error: 'forbidden' })

  // SPA 回退：无扩展名路径 → index.html
  if (!extname(filePath) || !existsSync(filePath)) {
    const indexPath = join(DIST_DIR, 'index.html')
    if (!existsSync(indexPath)) return json(res, 500, { error: '前端未构建，请先运行 npm run build' })
    const html = readFileSync(indexPath)
    res.writeHead(200, { 'content-type': MIME['.html'] })
    return res.end(html)
  }

  if (!existsSync(filePath)) return json(res, 404, { error: 'not found' })
  const content = readFileSync(filePath)
  res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' })
  res.end(content)
}

// ---------- HTTP 服务 ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname
  const method = req.method

  try {
    // ---- API 路由 ----
    if (pathname === '/api/config' && method === 'GET') {
      const config = readJson(CONFIG_FILE, {})
      // 不返回 apiKey 明文给前端，只返回"已配置"状态
      logInfo(`GET /api/config (hasKey=${!!config.apiKeyEnc})`)
      return json(res, 200, { apiUrl: config.apiUrl || '', model: config.model || '', hasKey: !!config.apiKeyEnc })
    }
    if (pathname === '/api/config' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      const config = readJson(CONFIG_FILE, {})
      if (typeof body.apiUrl === 'string') config.apiUrl = body.apiUrl.trim()
      // ★ Key 用 DPAPI 加密后存储（apiKeyEnc 字段），config.json 无明文
      // 空字符串 = 清空 Key；非空 = 更新加密值（日志不记 Key 本身）
      if (typeof body.apiKey === 'string') {
        if (body.apiKey.trim()) {
          config.apiKeyEnc = dpapiEncrypt(body.apiKey.trim())
          logInfo('POST /api/config: API Key 已更新（DPAPI 加密存储）')
        } else {
          delete config.apiKeyEnc
          logInfo('POST /api/config: API Key 已清除')
        }
      }
      if (typeof body.model === 'string') config.model = body.model.trim()
      writeJson(CONFIG_FILE, config)
      return json(res, 200, { ok: true })
    }

    if (pathname === '/api/data' && method === 'GET') {
      logInfo('GET /api/data')
      return json(res, 200, readJson(DATA_FILE, { version: 1, series: {} }))
    }
    if (pathname === '/api/data' && method === 'PUT') {
      const body = JSON.parse((await readBody(req)) || '{}')
      if (!body || typeof body !== 'object' || !body.series) return json(res, 400, { error: 'invalid data' })
      writeJson(DATA_FILE, body)
      logInfo(`PUT /api/data (${Object.keys(body.series).length} series)`)
      return json(res, 200, { ok: true })
    }

    if (pathname === '/api/chat' && method === 'POST') {
      logInfo('POST /api/chat')
      return proxyChat(readJson(CONFIG_FILE, {}), req, res)
    }

    if (pathname === '/api/detect' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      const { text, existingNames } = body
      const candidates = detectCandidates(text, existingNames)  // 返回数组
      logInfo(`POST /api/detect (${candidates.length} candidates)`)
      return json(res, 200, { candidates })
    }

    // ---- 备份 / 恢复 / 导出（第一轮 B）----
    if (pathname === '/api/backups' && method === 'GET') {
      return json(res, 200, { backups: listBackups({ backupDir: BACKUP_DIR }) })
    }
    if (pathname === '/api/backups' && method === 'POST') {
      try {
        const b = createBackup({ dataFile: DATA_FILE, backupDir: BACKUP_DIR })
        pruneBackups({ backupDir: BACKUP_DIR, keep: 10 })
        logInfo(`POST /api/backups (${b.file})`)
        return json(res, 200, { ok: true, backup: b })
      } catch (e) {
        return json(res, 500, { error: e.message })
      }
    }
    const restoreMatch = /^\/api\/backups\/([^/]+)\/restore$/.exec(pathname)
    if (restoreMatch && method === 'POST') {
      const file = decodeURIComponent(restoreMatch[1])
      try {
        const r = restoreBackup({ backupDir: BACKUP_DIR, file, dataFile: DATA_FILE })
        logInfo(`POST restore (${file}, safety=${r.safety || 'none'})`)
        return json(res, 200, r)
      } catch (e) {
        logError(`POST restore 失败 (${file}): ${e.message}`)
        return json(res, 500, { error: e.message })
      }
    }
    if (pathname === '/api/export' && method === 'GET') {
      try {
        const data = exportData({ dataFile: DATA_FILE })
        const name = 'concept-tree-export-' + new Date().toISOString().slice(0, 10) + '.json'
        logInfo('GET /api/export')
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${name}"`,
          'cache-control': 'no-store',
        })
        return res.end(JSON.stringify(data, null, 2))
      } catch (e) {
        return json(res, 500, { error: e.message })
      }
    }

    // ---- 静态文件 ----
    return serveStatic(req, res, pathname)
  } catch (e) {
    logError(`请求错误 ${method} ${pathname}: ${e.message}`)
    if (!res.headersSent) return json(res, 500, { error: e.message })
    res.end()
  }
})

// 启动时自动备份（距上次 >24h 才创建，静默；失败不阻塞启动）
try {
  const ab = autoBackupIfStale({ dataFile: DATA_FILE, backupDir: BACKUP_DIR })
  if (ab) logInfo(`启动自动备份: ${ab.file}`)
} catch (e) {
  logWarn(`启动自动备份跳过: ${e.message}`)
}

server.listen(PORT, '127.0.0.1', () => {
  logInfo(`服务启动: http://127.0.0.1:${PORT} (数据=${DATA_FILE})`)
  console.log('')
  console.log('🌳 概念学习树')
  console.log('   本地服务: http://127.0.0.1:' + PORT)
  console.log('   数据文件: ' + DATA_FILE)
  console.log('   配置文件: ' + CONFIG_FILE)
  console.log('   日志文件: ' + LOG_FILE)
  console.log('')
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    logError('端口 ' + PORT + ' 已被占用（可能上一个实例未退出）')
    console.error('❌ 端口 ' + PORT + ' 已被占用。可能是上一个实例未退出，请先关闭后再启动。')
    process.exit(1)
  }
  logError('服务错误: ' + e.message)
  console.error('server error:', e)
  process.exit(1)
})
