// 第二轮 2a：复习日历数据层单测（dueByDay / dueText / dayKey / daysInMonth / mondayIndex）
import { describe, expect, it } from 'vitest'
import { dayKey, daysInMonth, dueByDay, dueText, mondayIndex } from '../src/features/calendar'
import type { Concept, Series } from '../src/types'

const NOW = new Date('2026-08-15T10:00:00')

const mkConcept = (id: string, name: string, dueAt?: string | null): Concept => ({
  id, name, summary: '', parentId: null, sessionId: null, status: 'learned',
  x: null, y: null, notes: '', history: [], candidates: [],
  review: dueAt ? { box: 0, dueAt, reps: 0, lapses: 0, lastReviewedAt: null } : undefined,
  createdAt: 't', updatedAt: 't',
} as Concept)

const mkSeries = (concepts: Record<string, Concept>): Series => ({
  id: 's1', name: 'S', rootConceptId: null, concepts, edges: [], createdAt: 't', updatedAt: 't',
})

describe('dayKey / daysInMonth / mondayIndex', () => {
  it('dayKey 零填充', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('daysInMonth 含闰年 2 月', () => {
    expect(daysInMonth(2026, 7)).toBe(31)   // 8 月
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2028, 1)).toBe(29)   // 2028 闰年
  })

  it('mondayIndex 周一为 0', () => {
    expect(mondayIndex(new Date(2026, 7, 10))).toBe(0) // 2026-08-10 周一
    expect(mondayIndex(new Date(2026, 7, 16))).toBe(6) // 周日
  })
})

describe('dueByDay 到期聚合', () => {
  it('空系列 → 空表', () => {
    expect(dueByDay(mkSeries({}), new Date(2026, 7, 1), 31)).toEqual({})
  })

  it('单概念 dueAt 落在月内 → 正确日期键', () => {
    const s = mkSeries({ a: mkConcept('a', '甲', '2026-08-20T09:00:00') })
    const table = dueByDay(s, new Date(2026, 7, 1), 31)
    expect(Object.keys(table)).toEqual(['2026-08-20'])
    expect(table['2026-08-20'].map((c) => c.id)).toEqual(['a'])
  })

  it('区间外（上月/下月）不收集', () => {
    const s = mkSeries({
      a: mkConcept('a', '上月', '2026-07-31T09:00:00'),
      b: mkConcept('b', '下月', '2026-09-01T09:00:00'),
      c: mkConcept('c', '月内', '2026-08-01T00:00:00'),
    })
    const table = dueByDay(s, new Date(2026, 7, 1), 31)
    expect(Object.keys(table)).toEqual(['2026-08-01'])
  })

  it('同日多概念聚合到一起', () => {
    const s = mkSeries({
      a: mkConcept('a', '甲', '2026-08-05T08:00:00'),
      b: mkConcept('b', '乙', '2026-08-05T20:00:00'),
    })
    const table = dueByDay(s, new Date(2026, 7, 1), 31)
    expect(table['2026-08-05'].length).toBe(2)
  })

  it('无 review / dueAt 非法 → 跳过不抛错', () => {
    const s = mkSeries({
      a: mkConcept('a', '无复习', null),
      b: mkConcept('b', '坏日期', '不是日期'),
      c: mkConcept('c', '正常', '2026-08-02T09:00:00'),
    })
    const table = dueByDay(s, new Date(2026, 7, 1), 31)
    expect(Object.keys(table)).toEqual(['2026-08-02'])
  })

  it('monthStart 带时间分量也被归一到当天 0 点', () => {
    const s = mkSeries({ a: mkConcept('a', '甲', '2026-08-01T00:30:00') })
    const table = dueByDay(s, new Date(2026, 7, 1, 14, 33), 31)
    expect(table['2026-08-01']).toHaveLength(1)
  })

  it('右边界（第 days 天）恰好在区间外', () => {
    const s = mkSeries({
      a: mkConcept('a', '边界内', '2026-08-31T23:00:00'),
      b: mkConcept('b', '边界外', '2026-09-01T00:00:00'),
    })
    const table = dueByDay(s, new Date(2026, 7, 1), 31)
    expect(Object.keys(table)).toEqual(['2026-08-31'])
  })

  it('不修改原系列数据（只读）', () => {
    const s = mkSeries({ a: mkConcept('a', '甲', '2026-08-02T09:00:00') })
    const before = JSON.stringify(s)
    dueByDay(s, new Date(2026, 7, 1), 31)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('dueText 到期文案（含逾期）', () => {
  it('今天到期', () => {
    expect(dueText('2026-08-15T20:00:00', NOW)).toBe('今天到期')
  })
  it('明天到期', () => {
    expect(dueText('2026-08-16T20:00:00', NOW)).toBe('明天到期')
  })
  it('N 天后到期', () => {
    expect(dueText('2026-08-20T20:00:00', NOW)).toBe('5 天后到期')
  })
  it('已逾期 N 天', () => {
    expect(dueText('2026-08-12T20:00:00', NOW)).toBe('已逾期 3 天')
  })
  it('非法日期 → 日期未知', () => {
    expect(dueText('坏了', NOW)).toBe('日期未知')
  })
})
