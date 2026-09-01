// 第三轮 3a：复习统计数据层（纯函数，可单测）
// streak / 近 N 天热力 / 四态分布 / 遗忘率排行 / 复习日志合并与追加
import type { ConceptStatus, Series } from '../types'
import { dayKey } from './calendar'

/** 合并系列内所有概念的复习日志（本地日期键列表，可能含重复，由消费方自行去重/计数） */
export function collectReviewDates(series: Series): string[] {
  const out: string[] = []
  for (const c of Object.values(series?.concepts || {})) {
    for (const d of c.review?.reviewLog || []) out.push(d)
  }
  return out
}

/** 追加今天的复习记录（同日去重，返回新数组，不改原数组） */
export function appendReviewLog(log: string[] | undefined, dateKeyStr: string): string[] {
  const base = log || []
  if (base.includes(dateKeyStr)) return base
  return [...base, dateKeyStr]
}

/**
 * 连续复习天数：从今天往回数连续有记录的天数。
 * 今天还没复习但昨天有 → 从昨天数起（记录未断）；今天昨天都没有 → 0。
 */
export function computeStreak(dates: string[], now: Date = new Date()): number {
  const set = new Set(dates)
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (set.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 近 N 天（含今天）每日复习次数：{日期键: 次数}，窗口外日期不计 */
export function computeActivity(dates: string[], days: number, now: Date = new Date()): Record<string, number> {
  const out: Record<string, number> = {}
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out[dayKey(d)] = 0
  }
  for (const dt of dates) {
    if (dt in out) out[dt]++
  }
  return out
}

/** 四态分布：{状态: 概念数} */
export function statusDistribution(series: Series): Record<ConceptStatus, number> {
  const out: Record<ConceptStatus, number> = { unlearned: 0, learning: 0, learned: 0, doubtful: 0 }
  for (const c of Object.values(series?.concepts || {})) {
    if (out[c.status] !== undefined) out[c.status]++
  }
  return out
}

export interface ForgetRankItem {
  conceptId: string
  name: string
  lapses: number
  reps: number
  rate: number
}

/** 遗忘率排行：仅统计复习过（reps>0）的概念，按 lapses/reps 降序，取前 topN */
export function forgetRank(series: Series, topN = 5): ForgetRankItem[] {
  const items: ForgetRankItem[] = []
  for (const c of Object.values(series?.concepts || {})) {
    const r = c.review
    if (!r || !r.reps || r.reps <= 0) continue
    items.push({ conceptId: c.id, name: c.name, lapses: r.lapses || 0, reps: r.reps, rate: (r.lapses || 0) / r.reps })
  }
  items.sort((a, b) => (b.rate - a.rate) || (b.lapses - a.lapses) || a.name.localeCompare(b.name, 'zh'))
  return items.slice(0, topN)
}

/** 今日到期数（复用日历的聚合） */
export function dueTodayCount(series: Series, now: Date = new Date()): number {
  const key = dayKey(now)
  let n = 0
  for (const c of Object.values(series?.concepts || {})) {
    if (c.review?.dueAt && dayKey(new Date(c.review.dueAt)) === key) n++
  }
  return n
}

/** 复习计划中的概念数 */
export function enrolledCount(series: Series): number {
  return Object.values(series?.concepts || {}).filter((c) => c.review).length
}
