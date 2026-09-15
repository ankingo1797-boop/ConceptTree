// 第二轮 2b：全局搜索数据层（纯函数）
// 四类字段按权重排序：概念名 4 > 总结 3 > 笔记 2 > 对话历史 1
import type { ChatMessage, Concept, Series } from '../types'

export type SearchField = 'name' | 'summary' | 'notes' | 'history'

export interface SearchResult {
  conceptId: string
  conceptName: string
  field: SearchField
  snippet: string
  weight: number
}

export const SEARCH_WEIGHTS: Record<SearchField, number> = { name: 4, summary: 3, notes: 2, history: 1 }

/** 命中位置前后各取约 radius 字符做片段（超长两端加 …，压平空白） */
export function makeSnippet(text: string, idx: number, termLen: number, radius = 20): string {
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + termLen + radius)
  const mid = text.slice(start, end).replace(/\s+/g, ' ')
  return (start > 0 ? '…' : '') + mid + (end < text.length ? '…' : '')
}

/**
 * 全局搜索：返回按权重降序（同权重按概念名）的结果列表，最多 limit 条。
 * 大小写不敏感；同一概念多字段命中产生多条结果；对话历史只取第一条命中消息。
 */
export function searchAll(series: Series, term: string, limit = 20): SearchResult[] {
  const q = (term || '').trim().toLowerCase()
  if (!q) return []
  const out: SearchResult[] = []
  for (const c of Object.values(series?.concepts || {})) {
    const check = (field: SearchField, text: string) => {
      if (!text) return
      const idx = text.toLowerCase().indexOf(q)
      if (idx < 0) return
      out.push({ conceptId: c.id, conceptName: c.name, field, weight: SEARCH_WEIGHTS[field], snippet: makeSnippet(text, idx, q.length) })
    }
    check('name', c.name)
    check('summary', c.summary || '')
    check('notes', c.notes || '')
    const histMsg = (c.history || []).find((m: ChatMessage) => (m.content || '').toLowerCase().includes(q))
    if (histMsg) check('history', histMsg.content)
  }
  out.sort((a, b) => (b.weight - a.weight) || a.conceptName.localeCompare(b.conceptName, 'zh'))
  return out.slice(0, limit)
}

/** 字段来源的显示名（下拉标签用） */
export function fieldLabel(f: SearchField): string {
  return f === 'name' ? '名称' : f === 'summary' ? '总结' : f === 'notes' ? '笔记' : '对话'
}

/** 从概念集合构建搜索用 Series 视图的辅助（无副作用） */
export function conceptsOf(series: Series): Concept[] {
  return Object.values(series?.concepts || {})
}
