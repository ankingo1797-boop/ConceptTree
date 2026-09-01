// @vitest-environment jsdom
// 第五轮 C：全局搜索高亮与 Ctrl+K 聚焦测试
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GlobalSearch from '../src/features/GlobalSearch.tsx'
import type { Concept, Series } from '../src/types'

afterEach(() => cleanup())

const mkConcept = (over: Partial<Concept> & { id: string; name: string }): Concept => ({
  summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [], createdAt: 't', updatedAt: 't', ...over,
})

const series: Series = {
  id: 's1', name: 'S', rootConceptId: null,
  concepts: {
    a: mkConcept({ id: 'a', name: '神经网络', notes: '反向传播是训练神经网络的关键' }),
  },
  edges: [], createdAt: 't', updatedAt: 't',
}

describe('GlobalSearch 高亮与快捷键（第五轮 C）', () => {
  it('结果片段中的关键词被高亮（mark）', async () => {
    const { container } = render(<GlobalSearch series={series} onPick={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('全局搜索'), { target: { value: '反向传播' } })
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy(), { timeout: 1500 })
    const marks = container.querySelectorAll('mark')
    expect(marks.length).toBeGreaterThanOrEqual(1)
    expect(marks[0].textContent).toBe('反向传播')
  }, 5000)

  it('focusSignal 变化时聚焦并全选输入框（Ctrl+K 的落点）', () => {
    const { rerender } = render(<GlobalSearch series={series} onPick={vi.fn()} focusSignal={1} />)
    rerender(<GlobalSearch series={series} onPick={vi.fn()} focusSignal={2} />)
    expect(document.activeElement).toBe(screen.getByLabelText('全局搜索'))
  })

  it('占位符提示 Ctrl+K', () => {
    render(<GlobalSearch series={series} onPick={vi.fn()} />)
    expect(screen.getByPlaceholderText(/Ctrl\+K/)).toBeTruthy()
  })
})
