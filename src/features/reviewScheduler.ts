// Leitner 复习调度器 — 纯函数、零副作用（第一轮 A，PRD §12.1/12.2-A5）
// 规则：
//  - 间隔阶梯 L = [1,2,4,7,15,30,60] 天，box 为索引
//  - 入列 enroll：box=0，dueAt=+1d
//  - 三档评级：
//      忘了   → box=0、lapses+1、status=doubtful、dueAt=+1d
//      吃力   → box 不变、status=learning、dueAt=+1d
//      掌握   → box=min(box+1,6)、status=learned、dueAt=+L[box]d
//  - 到期：dueAt <= now
import type { Concept, ConceptReview, ConceptStatus, Series } from '../types'

export const INTERVAL_DAYS = [1, 2, 4, 7, 15, 30, 60]
export const MAX_BOX = INTERVAL_DAYS.length - 1
const DAY_MS = 24 * 3600 * 1000

export type ReviewGrade = 'forgot' | 'struggled' | 'mastered'

export const GRADE_META: Record<ReviewGrade, { label: string; nextStatus: ConceptStatus }> = {
  forgot: { label: '忘了', nextStatus: 'doubtful' },
  struggled: { label: '吃力', nextStatus: 'learning' },
  mastered: { label: '掌握', nextStatus: 'learned' },
}

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

/** 入列：box=0，一天后到期 */
export function enroll(now: Date = new Date()): ConceptReview {
  return { box: 0, dueAt: addDays(now, INTERVAL_DAYS[0]).toISOString(), reps: 0, lapses: 0, lastReviewedAt: null }
}

export function isDue(review: ConceptReview, now: Date = new Date()): boolean {
  return new Date(review.dueAt).getTime() <= now.getTime()
}

/** 评级：返回新复习状态 + 概念目标 status（调用方负责持久化） */
export function gradeReview(review: ConceptReview, grade: ReviewGrade, now: Date = new Date()): { review: ConceptReview; status: ConceptStatus } {
  const reps = (review.reps || 0) + 1
  const lapses = review.lapses || 0
  const base = { reps, lastReviewedAt: now.toISOString(), lapses }
  if (grade === 'forgot') {
    return { review: { ...base, box: 0, lapses: lapses + 1, dueAt: addDays(now, 1).toISOString() }, status: GRADE_META.forgot.nextStatus }
  }
  if (grade === 'struggled') {
    return { review: { ...base, box: review.box || 0, dueAt: addDays(now, 1).toISOString() }, status: GRADE_META.struggled.nextStatus }
  }
  const box = Math.min((review.box || 0) + 1, MAX_BOX)
  return { review: { ...base, box, dueAt: addDays(now, INTERVAL_DAYS[box]).toISOString() }, status: GRADE_META.mastered.nextStatus }
}

/** 评级后的下一间隔（天），供会话界面预览文案 */
export function nextIntervalDays(review: ConceptReview, grade: ReviewGrade): number {
  if (grade === 'forgot' || grade === 'struggled') return 1
  return INTERVAL_DAYS[Math.min((review.box || 0) + 1, MAX_BOX)]
}

/** 系列内到期概念（快照用；未入列的概念不参与） */
export function dueConcepts(series: Series, now: Date = new Date()): Concept[] {
  return Object.values(series.concepts || {}).filter((c) => c.review && isDue(c.review, now))
}

export function dueCount(series: Series, now: Date = new Date()): number {
  return dueConcepts(series, now).length
}

/** 复习到期的人性化标签（第一轮 1.5 修复 #7：规则可见化） */
export function dueLabel(dueAt: string, now: Date = new Date()): string {
  const days = Math.ceil((new Date(dueAt).getTime() - now.getTime()) / 86400000)
  if (days <= 0) return '今天到期'
  if (days === 1) return '明天到期'
  return `${days} 天后到期`
}

/** 状态变更时的自动入列决策（PRD §12.1：首次变 learned 且未入列 → 入列） */
export function autoEnrollPatch(
  prevStatus: ConceptStatus | undefined,
  nextStatus: ConceptStatus | undefined,
  hasReview: boolean,
  now: Date = new Date(),
): { review?: ConceptReview } {
  if (nextStatus === 'learned' && prevStatus !== 'learned' && !hasReview) return { review: enroll(now) }
  return {}
}

/**
 * 第二轮 1.7 反馈 #8：收紧自动入列触发条件（防误触发）。
 * 仅当 patch【显式】把状态改为 learned、此前不是 learned、尚未入列、
 * 且 patch 未自带 review（复习会话打分自带排期，不得被覆盖）时才入列。
 * 纯函数，可单测。
 */
export function shouldAutoEnroll(
  prev: { status?: ConceptStatus; review?: unknown } | undefined,
  patch: { status?: ConceptStatus; review?: unknown },
): boolean {
  if (!('status' in patch)) return false            // 笔记/总结/历史等更新绝不触发
  if (patch.status !== 'learned') return false       // 只有变为「已掌握」才考虑
  if (prev?.status === 'learned') return false       // 已是掌握态的重复设置不触发
  if (prev?.review) return false                     // 已在复习计划中
  if ('review' in patch) return false                // patch 自带排期（如复习打分）→ 不覆盖
  return true
}

/**
 * 第二轮 1.8 反馈 #3：与入列对称的自动出列。
 * 显式把状态改为非 learned、此前在复习计划中、且 patch 未自带 review → 移出复习。
 * （复习会话打分自带 review，不受影响。）
 */
export function shouldAutoUnenroll(
  prev: { status?: ConceptStatus; review?: unknown } | undefined,
  patch: { status?: ConceptStatus; review?: unknown },
): boolean {
  if (!('status' in patch)) return false             // 无关更新不触发
  if (patch.status === 'learned') return false       // 仍是掌握态 → 保留
  if (!prev?.review) return false                    // 本来就不在复习计划
  if ('review' in patch) return false                // patch 自带排期 → 不干预
  return true
}
