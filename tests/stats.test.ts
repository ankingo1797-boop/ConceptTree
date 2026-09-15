// 第三轮 3a：复习统计纯函数测试
import { describe, expect, it } from 'vitest'
import {
  appendReviewLog, collectReviewDates, computeActivity, computeStreak,
  dueTodayCount, enrolledCount, forgetRank, statusDistribution,
} from '../src/features/stats'
import type { Concept, Series } from '../src/types'

const NOW = new Date('2026-08-15T10:00:00')
const TODAY = '2026-08-15'

const mkConcept = (over: Partial<Concept> & { id: string; name: string }): Concept => ({
  summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [],
  createdAt: 't', updatedAt: 't', ...over,
})

const mkSeries = (concepts: Concept[]): Series => ({
  id: 's1', name: 'S', rootConceptId: null,
  concepts: Object.fromEntries(concepts.map((c) => [c.id, c])),
  edges: [], createdAt: 't', updatedAt: 't',
})

const withLog = (log: string[]) => ({ box: 0, dueAt: '2026-08-20T09:00:00', reps: 1, lapses: 0, lastReviewedAt: null, reviewLog: log })

describe('collectReviewDates / appendReviewLog', () => {
  it('合并多概念日志；无日志字段视为空', () => {
    const s = mkSeries([
      mkConcept({ id: 'a', name: '甲', review: withLog(['2026-08-10', '2026-08-12']) }),
      mkConcept({ id: 'b', name: '乙', review: withLog(['2026-08-12']) }),
      mkConcept({ id: 'c', name: '丙' }),
    ])
    expect(collectReviewDates(s).sort()).toEqual(['2026-08-10', '2026-08-12', '2026-08-12'])
  })

  it('追加同日去重且不修改原数组', () => {
    const log = ['2026-08-14']
    const r1 = appendReviewLog(log, TODAY)
    expect(r1).toEqual(['2026-08-14', TODAY])
    expect(log).toEqual(['2026-08-14'])
    expect(appendReviewLog(r1, TODAY)).toEqual(r1) // 同日不重复
    expect(appendReviewLog(undefined, TODAY)).toEqual([TODAY])
  })
})

describe('computeStreak 连续复习天数', () => {
  it('今天有复习：从今天往回数', () => {
    expect(computeStreak([TODAY, '2026-08-14', '2026-08-13'], NOW)).toBe(3)
  })

  it('今天没复习但昨天有：从昨天数起（记录未断）', () => {
    expect(computeStreak(['2026-08-14', '2026-08-13'], NOW)).toBe(2)
  })

  it('昨天也没有：0', () => {
    expect(computeStreak(['2026-08-13'], NOW)).toBe(0)
    expect(computeStreak([], NOW)).toBe(0)
  })

  it('中间断档：只数连续段', () => {
    expect(computeStreak([TODAY, '2026-08-13'], NOW)).toBe(1) // 14 号缺失
  })

  it('重复日期不影响', () => {
    expect(computeStreak([TODAY, TODAY, '2026-08-14'], NOW)).toBe(2)
  })
})

describe('computeActivity 近 N 天热力', () => {
  it('窗口内计数、窗口外忽略、无记录为 0', () => {
    const act = computeActivity([TODAY, TODAY, '2026-08-14', '2026-07-01'], 7, NOW)
    expect(Object.keys(act).length).toBe(7)
    expect(act[TODAY]).toBe(2)
    expect(act['2026-08-14']).toBe(1)
    expect(act['2026-08-09']).toBe(0)
    expect(act['2026-07-01']).toBeUndefined() // 窗口外
  })

  it('30 天窗口覆盖今天与 29 天前', () => {
    const act = computeActivity(['2026-07-17'], 30, NOW) // 08-15 往前 29 天 = 07-17
    expect(act['2026-07-17']).toBe(1)
    expect(Object.keys(act).length).toBe(30)
  })
})

describe('statusDistribution / enrolledCount / dueTodayCount', () => {
  it('四态计数', () => {
    const s = mkSeries([
      mkConcept({ id: 'a', name: '甲', status: 'learned' }),
      mkConcept({ id: 'b', name: '乙', status: 'learned' }),
      mkConcept({ id: 'c', name: '丙', status: 'learning' }),
      mkConcept({ id: 'd', name: '丁', status: 'doubtful' }),
    ])
    expect(statusDistribution(s)).toEqual({ unlearned: 0, learning: 1, learned: 2, doubtful: 1 })
  })

  it('复习计划中数量与今日到期数量', () => {
    const s = mkSeries([
      mkConcept({ id: 'a', name: '甲', review: { box: 0, dueAt: '2026-08-15T09:00:00', reps: 1, lapses: 0, lastReviewedAt: null } }),
      mkConcept({ id: 'b', name: '乙', review: { box: 1, dueAt: '2026-08-16T09:00:00', reps: 2, lapses: 0, lastReviewedAt: null } }),
      mkConcept({ id: 'c', name: '丙' }),
    ])
    expect(enrolledCount(s)).toBe(2)
    expect(dueTodayCount(s, NOW)).toBe(1)
  })
})

describe('forgetRank 遗忘率排行', () => {
  it('只统计 reps>0，按遗忘率降序，取 TopN', () => {
    const s = mkSeries([
      mkConcept({ id: 'a', name: '易忘', review: { box: 0, dueAt: 'x', reps: 4, lapses: 3, lastReviewedAt: null } }),
      mkConcept({ id: 'b', name: '牢固', review: { box: 3, dueAt: 'x', reps: 10, lapses: 1, lastReviewedAt: null } }),
      mkConcept({ id: 'c', name: '中等', review: { box: 1, dueAt: 'x', reps: 2, lapses: 1, lastReviewedAt: null } }),
      mkConcept({ id: 'd', name: '未复习', review: { box: 0, dueAt: 'x', reps: 0, lapses: 0, lastReviewedAt: null } }),
      mkConcept({ id: 'e', name: '无计划' }),
    ])
    const r = forgetRank(s, 2)
    expect(r.map((x) => x.name)).toEqual(['易忘', '中等']) // 3/4=0.75 > 1/2=0.5 > 1/10=0.1
    expect(r[0].rate).toBeCloseTo(0.75)
    expect(r.some((x) => x.name === '未复习')).toBe(false)
  })

  it('空系列 → 空排行', () => {
    expect(forgetRank(mkSeries([]))).toEqual([])
  })
})
