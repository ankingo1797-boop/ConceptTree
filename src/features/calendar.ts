// 第二轮 2a：复习日历数据层（纯函数，只读不改排期）
// dueByDay：把系列内所有 review.dueAt 聚合为「日期 → 当天到期概念」
import type { Concept, Series } from '../types'

/** 本地日期键 YYYY-MM-DD（零填充，可按字典序比较先后） */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 某年某月的天数（month 为 0 基） */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * 聚合到期表：返回 {日期键: 当天到期的概念数组}。
 * 仅收集 dueAt 落在 [monthStart 当天 0 点, +days 天) 区间内的概念。
 * 无 review / dueAt 非法的概念跳过。只读，不修改任何数据。
 */
export function dueByDay(series: Series, monthStart: Date, days: number): Record<string, Concept[]> {
  const out: Record<string, Concept[]> = {}
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate()).getTime()
  const end = start + days * 86400000
  const concepts = Object.values(series?.concepts || {})
  for (const c of concepts) {
    if (!c.review || !c.review.dueAt) continue
    const t = new Date(c.review.dueAt).getTime()
    if (Number.isNaN(t)) continue
    if (t < start || t >= end) continue
    const key = dayKey(new Date(t))
    if (!out[key]) out[key] = []
    out[key].push(c)
  }
  return out
}

/**
 * 到期的人性化文案（比 reviewScheduler.dueLabel 多一个「已逾期」分支，日历清单用）。
 * 按日历日差计算（不用毫秒差 ceil，避免"今天晚些到期"被算成明天）。
 */
export function dueText(dueAt: string, now: Date = new Date()): string {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return '日期未知'
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((dueDay - today) / 86400000)
  if (days < 0) return `已逾期 ${-days} 天`
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  return `${days} 天后到期`
}

/** 周一为第一列的周几索引（0=周一 … 6=周日） */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}
