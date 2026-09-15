// 第五轮 B：学习成果 Markdown 导出（纯函数，可单测）
// 内容：层级结构 + 每概念的状态/一句话总结/笔记 + 复习概览（不含对话记录，用户已确认）
import type { Concept, Series } from '../types'
import { collectReviewDates, computeStreak, dueTodayCount, statusDistribution } from './stats'
import { STATUS_LABEL } from './status'

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 单个概念的文本块（标题行 + 总结引用 + 笔记 + 复习信息） */
function conceptBlock(c: Concept, heading: string | null): string[] {
  const out: string[] = []
  const status = STATUS_LABEL[c.status] || c.status
  if (heading) out.push(`${heading} ${c.name}（${status}）`)
  else out.push(`- **${c.name}**（${status}）`)
  if (c.summary && c.summary.trim()) out.push('', `> ${c.summary.trim()}`)
  if (c.notes && c.notes.trim()) {
    out.push('', '**笔记**：', '')
    for (const line of c.notes.trim().split('\n')) out.push(line)
  }
  if (c.review) {
    const due = c.review.dueAt ? new Date(c.review.dueAt) : null
    out.push('', `复习：已复习 ${c.review.reps || 0} 次 · 忘记 ${c.review.lapses || 0} 次${due && !Number.isNaN(due.getTime()) ? ` · 下次到期 ${formatDate(due)}` : ''}`)
  }
  out.push('')
  return out
}

/**
 * 系列 → Markdown 文档。
 * 层级按父子边深度优先；无父边的概念为根；环/不可达概念归入「其他概念」。
 */
export function seriesToMarkdown(series: Series, now: Date = new Date()): string {
  const concepts = series.concepts || {}
  const edges = (series.edges || []).filter((e) => e.type === 'parent-child')
  const list = Object.values(concepts)
  const lines: string[] = []

  const dist = statusDistribution(series)
  lines.push(`# ${series.name} · 概念学习树`, '')
  lines.push(`> 导出时间：${formatDate(now)} · 共 ${list.length} 个概念 · 已掌握 ${dist.learned} · 学习中 ${dist.learning} · 存疑 ${dist.doubtful} · 未学习 ${dist.unlearned}`, '')

  const childrenOf: Record<string, string[]> = {}
  const hasParent = new Set<string>()
  for (const e of edges) {
    if (!concepts[e.from] || !concepts[e.to]) continue
    if (!childrenOf[e.from]) childrenOf[e.from] = []
    childrenOf[e.from].push(e.to)
    hasParent.add(e.to)
  }
  for (const ids of Object.values(childrenOf)) ids.sort((a, b) => (concepts[a]?.name || '').localeCompare(concepts[b]?.name || '', 'zh'))

  const visited = new Set<string>()
  const walk = (id: string, depth: number) => {
    if (visited.has(id) || !concepts[id]) return // 环保护
    visited.add(id)
    const heading = depth < 5 ? '#'.repeat(depth + 2) : null // ## 起，最深 ######，再深转列表
    lines.push(...conceptBlock(concepts[id], heading))
    for (const child of childrenOf[id] || []) walk(child, depth + 1)
  }

  const roots = list.filter((c) => !hasParent.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  for (const r of roots) walk(r.id, 0)

  const rest = list.filter((c) => !visited.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  if (rest.length > 0) {
    lines.push('## 其他概念', '')
    for (const c of rest) {
      visited.add(c.id)
      lines.push(...conceptBlock(c, '###'))
    }
  }

  // 复习概览
  const dates = collectReviewDates(series)
  const streak = computeStreak(dates, now)
  lines.push('## 复习概览', '')
  lines.push(`- 连续复习天数：${streak}`)
  lines.push(`- 累计复习次数：${dates.length}`)
  lines.push(`- 复习计划中：${list.filter((c) => c.review).length}`)
  lines.push(`- 今日到期：${dueTodayCount(series, now)}`)
  lines.push('')

  return lines.join('\n')
}
