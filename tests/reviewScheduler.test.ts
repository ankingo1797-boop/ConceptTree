// 环 4：reviewScheduler 纯函数单测（PRD §12.1 规则逐条验证）
import { describe, expect, it } from 'vitest'
import { INTERVAL_DAYS, MAX_BOX, addDays, autoEnrollPatch, dueConcepts, dueCount, enroll, gradeReview, isDue, nextIntervalDays, shouldAutoEnroll, shouldAutoUnenroll } from '../src/features/reviewScheduler'
import type { ConceptReview, Series } from '../src/types'

const NOW = new Date('2026-08-29T12:00:00.000Z')

const mkReview = (over: Partial<ConceptReview> = {}): ConceptReview => ({
  box: 0, dueAt: addDays(NOW, 1).toISOString(), reps: 0, lapses: 0, lastReviewedAt: null, ...over,
})

describe('enroll 入列', () => {
  it('box=0，一天后到期，计数归零', () => {
    const r = enroll(NOW)
    expect(r.box).toBe(0)
    expect(r.dueAt).toBe(addDays(NOW, 1).toISOString())
    expect(r.reps).toBe(0)
    expect(r.lapses).toBe(0)
    expect(r.lastReviewedAt).toBeNull()
  })
})

describe('isDue 到期判定', () => {
  it('dueAt == now 视为到期（含边界）', () => {
    expect(isDue(mkReview({ dueAt: NOW.toISOString() }), NOW)).toBe(true)
  })
  it('未来 1ms 不到期', () => {
    expect(isDue(mkReview({ dueAt: new Date(NOW.getTime() + 1).toISOString() }), NOW)).toBe(false)
  })
  it('过去已到期', () => {
    expect(isDue(mkReview({ dueAt: addDays(NOW, -3).toISOString() }), NOW)).toBe(true)
  })
})

describe('gradeReview 三档评级', () => {
  it('掌握：box+1、status=learned、due=+L[box]d', () => {
    const { review, status } = gradeReview(mkReview({ box: 0 }), 'mastered', NOW)
    expect(review.box).toBe(1)
    expect(review.dueAt).toBe(addDays(NOW, INTERVAL_DAYS[1]).toISOString()) // +2d
    expect(status).toBe('learned')
    expect(review.reps).toBe(1)
    expect(review.lastReviewedAt).toBe(NOW.toISOString())
  })

  it('掌握在最高盒：box 封顶 6、间隔 60d', () => {
    const { review } = gradeReview(mkReview({ box: MAX_BOX }), 'mastered', NOW)
    expect(review.box).toBe(MAX_BOX)
    expect(review.dueAt).toBe(addDays(NOW, 60).toISOString())
  })

  it('吃力：box 不变、status=learning、due=+1d、lapses 不变', () => {
    const { review, status } = gradeReview(mkReview({ box: 3, lapses: 2 }), 'struggled', NOW)
    expect(review.box).toBe(3)
    expect(review.dueAt).toBe(addDays(NOW, 1).toISOString())
    expect(review.lapses).toBe(2)
    expect(status).toBe('learning')
  })

  it('忘了：box 归零、lapses+1、status=doubtful、due=+1d', () => {
    const { review, status } = gradeReview(mkReview({ box: 4, lapses: 1 }), 'forgot', NOW)
    expect(review.box).toBe(0)
    expect(review.lapses).toBe(2)
    expect(review.dueAt).toBe(addDays(NOW, 1).toISOString())
    expect(status).toBe('doubtful')
  })

  it('旧数据宽容：缺失计数字段按 0 处理', () => {
    // 模拟老数据只有部分字段
    const legacy = { box: 2, dueAt: NOW.toISOString() } as ConceptReview
    const { review } = gradeReview(legacy, 'mastered', NOW)
    expect(review.reps).toBe(1)
    expect(review.lapses).toBe(0)
    expect(review.box).toBe(3)
  })
})

describe('nextIntervalDays 预览', () => {
  it('忘了/吃力 → 1 天；掌握 → 下一盒间隔', () => {
    const r = mkReview({ box: 1 })
    expect(nextIntervalDays(r, 'forgot')).toBe(1)
    expect(nextIntervalDays(r, 'struggled')).toBe(1)
    expect(nextIntervalDays(r, 'mastered')).toBe(INTERVAL_DAYS[2]) // 4d
    expect(nextIntervalDays(mkReview({ box: MAX_BOX }), 'mastered')).toBe(60)
  })
})

describe('dueConcepts / dueCount', () => {
  const mkSeries = (concepts: Record<string, Partial<Series['concepts'][string]>>): Series => ({
    id: 's1', name: '系列', rootConceptId: null, createdAt: 't', updatedAt: 't',
    concepts: concepts as Series['concepts'], edges: [],
  })

  it('只统计已入列且到期的概念', () => {
    const s = mkSeries({
      a: { id: 'a', name: 'A', review: mkReview({ dueAt: addDays(NOW, -1).toISOString() }) },   // 到期
      b: { id: 'b', name: 'B', review: mkReview({ dueAt: addDays(NOW, 1).toISOString() }) },    // 未到期
      c: { id: 'c', name: 'C' },                                                                 // 未入列
    })
    expect(dueCount(s, NOW)).toBe(1)
    expect(dueConcepts(s, NOW).map((c) => c.id)).toEqual(['a'])
  })

  it('空系列 → 0（旧数据宽容）', () => {
    expect(dueCount(mkSeries({}), NOW)).toBe(0)
  })
})

describe('autoEnrollPatch 自动入列决策', () => {
  it('unlearned → learned 且未入列：入列', () => {
    const p = autoEnrollPatch('unlearned', 'learned', false, NOW)
    expect(p.review).toBeDefined()
    expect(p.review!.box).toBe(0)
  })
  it('learning → learned 且未入列：入列', () => {
    expect(autoEnrollPatch('learning', 'learned', false, NOW).review).toBeDefined()
  })
  it('learned → learned（已是掌握）：不重复入列', () => {
    expect(autoEnrollPatch('learned', 'learned', false, NOW).review).toBeUndefined()
  })
  it('已入列再变 learned：不覆盖已有复习状态', () => {
    expect(autoEnrollPatch('doubtful', 'learned', true, NOW).review).toBeUndefined()
  })
  it('变为其他状态：不入列', () => {
    expect(autoEnrollPatch('unlearned', 'doubtful', false, NOW).review).toBeUndefined()
    expect(autoEnrollPatch('unlearned', undefined, false, NOW).review).toBeUndefined()
  })
})

// 第二轮 1.7 反馈 #8：收紧后的自动入列守卫（杜绝打字/点击等无关更新误触发）
describe('shouldAutoEnroll 收紧的入列守卫', () => {
  const learned = { review: { box: 0, dueAt: 'x' } }

  it('patch 不含 status（笔记/总结/历史等更新）：绝不触发', () => {
    expect(shouldAutoEnroll({ status: 'learning' }, { notes: '打字内容' } as never)).toBe(false)
    expect(shouldAutoEnroll({ status: 'learned' }, { summary: '新总结' } as never)).toBe(false)
    expect(shouldAutoEnroll({ status: 'learned' }, { history: [] } as never)).toBe(false)
  })

  it('显式 learning → learned 且未入列：触发', () => {
    expect(shouldAutoEnroll({ status: 'learning' }, { status: 'learned' })).toBe(true)
  })

  it('learned → learned 重复设置：不触发', () => {
    expect(shouldAutoEnroll({ status: 'learned' }, { status: 'learned' })).toBe(false)
  })

  it('已在复习计划中：不触发', () => {
    expect(shouldAutoEnroll({ status: 'learning', review: learned.review }, { status: 'learned' })).toBe(false)
  })

  it('patch 自带 review（复习会话打分）：不覆盖', () => {
    expect(shouldAutoEnroll({ status: 'learning' }, { status: 'learned', review: learned.review })).toBe(false)
  })

  it('变为其他状态：不触发', () => {
    expect(shouldAutoEnroll({ status: 'learning' }, { status: 'doubtful' })).toBe(false)
  })

  it('prev 不存在（防御）：仅在显式 learned 且无 review 时触发', () => {
    expect(shouldAutoEnroll(undefined, { status: 'learned' })).toBe(true)
    expect(shouldAutoEnroll(undefined, { status: 'learning' })).toBe(false)
  })
})

// 第二轮 1.8 反馈 #3：与入列对称的自动出列守卫
describe('shouldAutoUnenroll 对称出列守卫', () => {
  const review = { box: 0, dueAt: 'x' }

  it('显式 learned → 其他状态 且在复习中：触发出列', () => {
    expect(shouldAutoUnenroll({ status: 'learned', review }, { status: 'learning' })).toBe(true)
    expect(shouldAutoUnenroll({ status: 'learned', review }, { status: 'doubtful' })).toBe(true)
    expect(shouldAutoUnenroll({ status: 'learned', review }, { status: 'unlearned' })).toBe(true)
  })

  it('patch 不含 status（笔记/总结等更新）：不触发', () => {
    expect(shouldAutoUnenroll({ status: 'learned', review }, { notes: 'x' } as never)).toBe(false)
  })

  it('仍设为 learned：不触发', () => {
    expect(shouldAutoUnenroll({ status: 'learning', review }, { status: 'learned' })).toBe(false)
  })

  it('不在复习计划中：不触发', () => {
    expect(shouldAutoUnenroll({ status: 'learned' }, { status: 'learning' })).toBe(false)
  })

  it('patch 自带 review（复习会话打分）：不干预', () => {
    expect(shouldAutoUnenroll({ status: 'learned', review }, { status: 'learning', review })).toBe(false)
  })
})
