// @vitest-environment jsdom
// 第三轮 3a：学习报告弹层渲染测试
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatsOverlay from '../src/features/StatsOverlay.tsx'
import { dayKey } from '../src/features/calendar'
import type { Concept, Series } from '../src/types'

afterEach(() => cleanup())

const NOW = new Date()
const TODAY = dayKey(NOW)
const YESTERDAY = dayKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1))

const mkConcept = (over: Partial<Concept> & { id: string; name: string }): Concept => ({
  summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [],
  createdAt: 't', updatedAt: 't', ...over,
})

const series: Series = {
  id: 's1', name: '机械学习', rootConceptId: 'a',
  concepts: {
    a: mkConcept({
      id: 'a', name: '易忘概念', status: 'learned',
      review: { box: 1, dueAt: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 20).toISOString(), reps: 4, lapses: 3, lastReviewedAt: null, reviewLog: [YESTERDAY, TODAY] },
    }),
    b: mkConcept({ id: 'b', name: '进行中概念', status: 'learning' }),
    c: mkConcept({ id: 'c', name: '新概念' }),
  },
  edges: [], createdAt: 't', updatedAt: 't',
}

describe('StatsOverlay 学习报告', () => {
  it('标题与四项概览数字', () => {
    const { container } = render(<StatsOverlay series={series} onClose={vi.fn()} />)
    // 第七轮：标题逐字入场（SplitText），整体文本仍在
    expect(container.textContent).toContain('学习报告 · 机械学习')
    expect(screen.getByText('概念总数')).toBeTruthy()
    // 「已掌握」在概览卡与分布区各出现一次
    expect(screen.getAllByText('已掌握').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('复习计划中')).toBeTruthy()
    expect(screen.getByText('今日到期')).toBeTruthy()
  })

  it('连续天数与累计次数', () => {
    const { container } = render(<StatsOverlay series={series} onClose={vi.fn()} />)
    expect(screen.getByText('连续复习天数')).toBeTruthy()
    expect(screen.getByText('累计复习 2 次')).toBeTruthy()
    // streak=2（今天+昨天）
    expect(container.textContent).toContain('2')
  })

  it('掌握分布：四态标签齐全', () => {
    render(<StatsOverlay series={series} onClose={vi.fn()} />)
    expect(screen.getByText('掌握分布')).toBeTruthy()
    expect(screen.getAllByText('已掌握').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('学习中').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('未学习').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('存疑').length).toBeGreaterThanOrEqual(1)
  })

  it('遗忘率排行：名称 + 忘/复习次数 + 百分比', () => {
    render(<StatsOverlay series={series} onClose={vi.fn()} />)
    expect(screen.getByText('易忘概念')).toBeTruthy()
    expect(screen.getByText('忘 3 / 复习 4')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
  })

  it('关闭按钮触发 onClose（带出场动画延迟）', async () => {
    const onClose = vi.fn()
    render(<StatsOverlay series={series} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('空系列：显示两处空状态提示', () => {
    const empty: Series = { ...series, concepts: {} }
    render(<StatsOverlay series={empty} onClose={vi.fn()} />)
    expect(screen.getByText(/还没有复习记录/)).toBeTruthy()
    expect(screen.getByText(/还没有复习过的概念/)).toBeTruthy()
  })
})
