// API 客户端（TypeScript）：与本地服务通信
// 所有请求都走本地服务（http://127.0.0.1:8930），由服务代理 AI 请求
import type { AppConfig, ChatMessage, ConceptTreeData, DetectResponse, SaveConfigInput } from './types'

const BASE = ''

interface RequestOptions extends RequestInit {}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let msg = 'HTTP ' + res.status
    try { const j = await res.json(); if (j.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res
}

// ---- 配置 ----
export function getConfig(): Promise<AppConfig> {
  return request('/api/config').then((r) => r.json())
}

export function saveConfig(input: SaveConfigInput): Promise<{ ok: true }> {
  return request('/api/config', { method: 'POST', body: JSON.stringify(input) }).then(() => ({ ok: true }))
}

// ---- 数据 ----
export function loadData(): Promise<ConceptTreeData> {
  return request('/api/data').then((r) => r.json())
}

export function saveData(data: ConceptTreeData): Promise<Response> {
  return request('/api/data', { method: 'PUT', body: JSON.stringify(data) })
}

// ---- AI 对话（流式） ----
export interface ChatStreamOptions {
  model?: string
  onDelta?: (delta: string) => void
  onDone?: (fullText: string) => void
  onError?: (message: string) => void
  signal?: AbortSignal
}

export async function chatStream(messages: ChatMessage[], { model, onDelta, onDone, onError, signal }: ChatStreamOptions = {}): Promise<void> {
  try {
    const res = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        stream: true,
      }),
      signal,
    })
    if (!res.ok) {
      let msg = 'HTTP ' + res.status
      try { const j = await res.json(); if (j.error) msg = j.error } catch { /* ignore */ }
      throw new Error(msg)
    }
    const reader = res.body?.getReader()
    if (!reader) { onError && onError('无响应流'); return }
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content as string | undefined
          if (delta) { fullText += delta; onDelta && onDelta(delta) }
        } catch { /* 忽略无法解析的行 */ }
      }
    }
    onDone && onDone(fullText)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    onError && onError(e instanceof Error ? e.message : String(e))
  }
}

// ---- 候选概念检测 ----
export function detectCandidates(text: string, existingNames: string[]): Promise<DetectResponse> {
  return request('/api/detect', { method: 'POST', body: JSON.stringify({ text, existingNames }) }).then((r) => r.json())
}

// ---- 备份 / 恢复 / 导出（第一轮 B）----
export interface BackupInfo {
  file: string
  size: number
  createdAt: string
}

export function listBackups(): Promise<{ backups: BackupInfo[] }> {
  return request('/api/backups').then((r) => r.json())
}

export function createBackup(): Promise<{ ok: true; backup: BackupInfo }> {
  return request('/api/backups', { method: 'POST' }).then((r) => r.json())
}

export function restoreBackup(file: string): Promise<{ ok: true; safety: string | null }> {
  return request('/api/backups/' + encodeURIComponent(file) + '/restore', { method: 'POST' }).then((r) => r.json())
}

export const EXPORT_URL = '/api/export'
