// @vitest-environment jsdom
// 第二轮 2a：复习日历弹层渲染与交互测试
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarOverlay from '../src/features/CalendarOverlay.tsx'
import { daysInMonth } from '../src/features/calendar'
import type { Concept, Series } from '../src/types'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const NOW = new Date()
const Y = NOW.getFullYear()
const M = NOW.getMonth()
const DIM = daysInMonth(Y, M)

/** 本地日偏移 → ISO（保持本地日期不变） */
const isoOffset = (offsetDays: number) =>
  new Date(Y, M, NOW.getDate() + offsetDays, 20, 0, 0).toISOString()

const mkConcept = (id: string, name: string, dueAt: string): Concept => ({
  id, name, summary: '', parentId: null, sessionId: null, status: 'learned',
  x: null, y: null, notes: '', history: [], candidates: [],
  review: { box: 0, dueAt, reps: 0, lapses: 0, lastReviewedAt: null },
  createdAt: 't', updatedAt: 't',
})

const series: Series = {
  id: 's1', name: 'S', rootConceptId: null,
  concepts: {
    'c-today': mkConcept('c-today', '今天到期概念', isoOffset(0)),
    'c-future': mkConcept('c-future', '未来到期概念', isoOffset(3)),
    'c-overdue': mkConcept('c-overdue', '逾期概念', isoOffset(-2)),
  },
  edges: [], createdAt: 't', updatedAt: 't',
}

const calls = { onLocate: vi.fn(), onOpenReview: vi.fn(), onClose: vi.fn() }
beforeEach(() => { calls.onLocate.mockReset(); calls.onOpenReview.mockReset(); calls.onClose.mockReset() })

const renderCal = () => render(
  <CalendarOverlay
    series={series}
    onLocate={calls.onLocate}
    onOpenReview={calls.onOpenReview}
    onClose={calls.onClose}
  />,
)

describe('CalendarOverlay 月视图', () => {
  it('渲染月份标题与 42 个格子，今天格子标注到期数', () => {
    const { container } = renderCal()
    expect(screen.getByText(new RegExp(`${Y} 年 ${M + 1} 月`))).toBeTruthy()
    expect(container.querySelectorAll('.ct-cal-cell').length).toBe(DIM) // 每个本月日子一个格子
    expect(screen.getByRole('button', { name: `${M + 1}月${NOW.getDate()}日，到期 1 个` })).toBeTruthy()
  })

  it('点击今天的格子：出清单，点清单行定位概念', () => {
    renderCal()
    fireEvent.click(screen.getByRole('button', { name: `${M + 1}月${NOW.getDate()}日，到期 1 个` }))
    expect(screen.getByText('今天到期概念')).toBeTruthy()
    expect(screen.getByText('今天到期')).toBeTruthy()
    fireEvent.click(screen.getByTitle('定位到画布卡片'))
    expect(calls.onLocate).toHaveBeenCalledWith('c-today')
  })

  it('今天有到期项：「开始复习」可用并触发 onOpenReview', () => {
    renderCal()
    fireEvent.click(screen.getByRole('button', { name: `${M + 1}月${NOW.getDate()}日，到期 1 个` }))
    fireEvent.click(screen.getByRole('button', { name: '开始复习' }))
    expect(calls.onOpenReview).toHaveBeenCalled()
  })

  it('选中之后的日子：显示"这天还没有可复习的项"，无开始复习按钮', () => {
    renderCal()
    if (NOW.getDate() + 3 <= DIM) {
      fireEvent.click(screen.getByRole('button', { name: `${M + 1}月${NOW.getDate() + 3}日，到期 1 个` }))
    } else {
      fireEvent.click(screen.getByRole('button', { name: '下个月' }))
      const nextM = (M + 1) % 12
      fireEvent.click(screen.getByRole('button', { name: `${nextM + 1}月${NOW.getDate() + 3 - DIM}日，到期 1 个` }))
    }
    expect(screen.getByText('这天还没有可复习的项')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '开始复习' })).toBeNull()
  })

  it('逾期日有警示点', () => {
    const { container } = renderCal()
    if (NOW.getDate() - 2 >= 1) {
      expect(container.querySelector('.ct-cal-overdue')).toBeTruthy()
    } else {
      fireEvent.click(screen.getByRole('button', { name: '上个月' }))
      expect(container.querySelector('.ct-cal-overdue')).toBeTruthy()
    }
  })

  it('翻月：标题随之前进/后退', () => {
    renderCal()
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    const nextM = (M + 1) % 12
    const nextY = M === 11 ? Y + 1 : Y
    expect(screen.getByText(new RegExp(`${nextY} 年 ${nextM + 1} 月`))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    expect(screen.getByText(new RegExp(`${Y} 年 ${M + 1} 月`))).toBeTruthy()
  })

  it('关闭按钮触发 onClose（带出场动画延迟）', async () => {
    renderCal()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(calls.onClose).toHaveBeenCalled())
  })

  it('再次点击已选中的格子收起清单', () => {
    renderCal()
    const cell = screen.getByRole('button', { name: `${M + 1}月${NOW.getDate()}日，到期 1 个` })
    fireEvent.click(cell)
    expect(screen.getByText('今天到期概念')).toBeTruthy()
    fireEvent.click(cell)
    expect(screen.queryByText('今天到期概念')).toBeNull()
  })

  it('无复习项的系列显示空状态提示', () => {
    const empty: Series = { ...series, concepts: {} }
    render(
      <CalendarOverlay series={empty} onLocate={calls.onLocate} onOpenReview={calls.onOpenReview} onClose={calls.onClose} />,
    )
    expect(screen.getByText(/还没有概念加入复习计划/)).toBeTruthy()
  })
})
