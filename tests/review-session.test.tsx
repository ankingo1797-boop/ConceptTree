// @vitest-environment jsdom
// 环 5：复习会话组件测试（全流程 / 空态 / Esc 保留进度）
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewSession from '../src/features/ReviewSession.tsx'
import { addDays } from '../src/features/reviewScheduler'
import type { Series } from '../src/types'

const NOW = new Date('2026-08-29T12:00:00.000Z')

// 锁定系统时钟到 NOW，避免 dueConcepts(默认 new Date()) 随真实时间漂移（时间脆弱性修复）
// 只 fake Date，保留真实 setTimeout（揭示/出场动画、Esc、waitFor 依赖真实定时器）
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers(); cleanup() })

function mkSeries(opts: { due: boolean }[]): Series {
  const concepts: Series['concepts'] = {}
  opts.forEach((o, i) => {
    const id = 'c' + i
    concepts[id] = {
      id, name: '概念' + i, summary: '总结' + i, parentId: null, sessionId: null,
      status: 'learned', x: null, y: null, notes: i === 0 ? '我的笔记' : '',
      history: i === 0 ? [{ role: 'user', content: '问题' }, { role: 'assistant', content: '回答' }] : [],
      candidates: [], createdAt: 't', updatedAt: 't',
      review: o.due
        ? { box: 0, dueAt: addDays(NOW, -1).toISOString(), reps: 1, lapses: 0, lastReviewedAt: null }
        : { box: 0, dueAt: addDays(NOW, 3).toISOString(), reps: 0, lapses: 0, lastReviewedAt: null },
    }
  })
  return { id: 's1', name: '机械学习', rootConceptId: 'c0', concepts, edges: [], createdAt: 't', updatedAt: 't' }
}

describe('ReviewSession 全流程', () => {
  it('快照到期概念 → 揭示 → 掌握评级落盘 → 完成统计', async () => {
    const onApplyGrade = vi.fn()
    const onClose = vi.fn()
    // 2 个概念：1 个到期、1 个未到期（快照只含到期的）
    render(<ReviewSession series={mkSeries([{ due: true }, { due: false }])} onApplyGrade={onApplyGrade} onClose={onClose} />)

    expect(screen.getByText('1 / 1')).toBeTruthy()       // 未到期概念不入队列
    expect(screen.getByText('概念0')).toBeTruthy()
    expect(screen.queryByText('概念1')).toBeNull()

    // 未揭示时没有评级按钮
    expect(screen.queryByText('忘了')).toBeNull()
    fireEvent.click(screen.getByText('揭示'))

    // 背面内容：总结 + 笔记 + 对话折叠
    expect(screen.getByText('总结0')).toBeTruthy()
    expect(screen.getByText(/我的笔记/)).toBeTruthy()
    expect(screen.getByText(/对话记录（2 条）/)).toBeTruthy()

    // 三档评级 + 间隔预览
    expect(screen.getByText('忘了')).toBeTruthy()
    expect(screen.getByText('吃力')).toBeTruthy()
    expect(screen.getByText('掌握')).toBeTruthy()
    expect(screen.getByText('2 天后再见')).toBeTruthy() // 掌握后 box1 → 2 天

    fireEvent.click(screen.getByText('掌握'))
    expect(onApplyGrade).toHaveBeenCalledTimes(1)
    const [id, review, status] = onApplyGrade.mock.calls[0]
    expect(id).toBe('c0')
    expect(review.box).toBe(1)
    expect(status).toBe('learned')

    // 完成页
    await waitFor(() => expect(screen.getByText(/本轮复习完成/)).toBeTruthy())
    expect(screen.getByText('掌握 1')).toBeTruthy()
  })

  it('忘了：落盘 box=0 / doubtful / lapses+1', () => {
    const onApplyGrade = vi.fn()
    render(<ReviewSession series={mkSeries([{ due: true }])} onApplyGrade={onApplyGrade} onClose={() => {}} />)
    fireEvent.click(screen.getByText('揭示'))
    fireEvent.click(screen.getByText('忘了'))
    const [, review, status] = onApplyGrade.mock.calls[0]
    expect(review.box).toBe(0)
    expect(review.lapses).toBe(1)
    expect(status).toBe('doubtful')
  })

  it('N=0 空态：今天没有到期的复习', () => {
    render(<ReviewSession series={mkSeries([{ due: false }])} onApplyGrade={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/今天没有到期的复习/)).toBeTruthy()
  })

  it('Esc 关闭（进度已逐条落盘，直接退出；带出场动画延迟）', async () => {
    const onClose = vi.fn()
    render(<ReviewSession series={mkSeries([{ due: true }, { due: true }])} onApplyGrade={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
