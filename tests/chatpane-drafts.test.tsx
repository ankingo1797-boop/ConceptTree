// @vitest-environment jsdom
// 环 2：ChatPane 草稿纪律回归测试
// 关键回归：切换概念时，未冲刷的草稿必须写回旧概念，不得污染新概念
// 第二轮 1.7：笔记移入「笔记·详情」标签页 —— 取笔记输入框前先切到该标签
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatPane from '../src/ChatPane.tsx'
import { SaveProvider } from '../src/SaveContext.tsx'
import { chatStream } from '../src/api.ts'

// 第二轮 1.8：隔离网络 —— 总结/对话流式全部走受控 mock
vi.mock('../src/api.ts', () => ({
  chatStream: vi.fn(),
  detectCandidates: vi.fn(async () => ({ candidates: [] })),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mkConcept = (id: string, name: string, notes = '') => ({
  id, name, summary: '总结-' + name, parentId: null, sessionId: null,
  status: 'learning' as const, x: null, y: null, notes,
  history: [], candidates: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
})

const c1 = mkConcept('c1', '机器学习', '')
const c2 = mkConcept('c2', '神经网络', '原有笔记')
const series = {
  id: 's1', name: '机械学习', rootConceptId: 'c1',
  concepts: { c1, c2 }, edges: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

function Harness({ onUpd }: { onUpd: (id: string, patch: Record<string, unknown>) => void }) {
  const [sel, setSel] = React.useState('c1')
  const concept = sel === 'c1' ? c1 : c2
  return (
    <SaveProvider>
      <button data-testid="switch" onClick={() => setSel('c2')}>switch</button>
      <ChatPane
        series={series as never}
        concept={concept as never}
        selectedId={sel}
        onUpdateConcept={onUpd}
        onAddConcept={() => undefined}
      />
    </SaveProvider>
  )
}

/** 第二轮 1.7：切到「笔记·详情」标签并返回笔记输入框 */
function gotoNotesTab() {
  fireEvent.click(screen.getByRole('tab', { name: /笔记·详情/ }))
  return screen.getByPlaceholderText(/写下你自己的理解/)
}

describe('ChatPane 草稿纪律', () => {
  it('笔记 700ms 防抖自动保存（diff 守卫）', async () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    const box = gotoNotesTab()
    fireEvent.change(box, { target: { value: '我的理解' } })
    expect(onUpd).not.toHaveBeenCalled() // 防抖未到期
    await waitFor(() => expect(onUpd).toHaveBeenCalledWith('c1', expect.objectContaining({ notes: '我的理解' })), { timeout: 2000 })
    expect(onUpd).toHaveBeenCalledTimes(1) // 无重复写
  }, 8000)

  it('onBlur 立即冲刷草稿', async () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    const box = gotoNotesTab()
    fireEvent.change(box, { target: { value: '失焦内容' } })
    fireEvent.blur(box)
    await waitFor(() => expect(onUpd).toHaveBeenCalledWith('c1', expect.objectContaining({ notes: '失焦内容' })))
  })

  it('切换概念时草稿写回旧概念，不污染新概念（回归）', async () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    const box = gotoNotesTab()
    fireEvent.change(box, { target: { value: '属于 c1 的草稿' } })
    fireEvent.click(screen.getByTestId('switch'))
    await waitFor(() => expect(onUpd).toHaveBeenCalledWith('c1', expect.objectContaining({ notes: '属于 c1 的草稿' })))
    // 新概念不得收到旧草稿
    for (const call of onUpd.mock.calls) {
      if (call[0] === 'c2') {
        expect(call[1]).not.toHaveProperty('notes')
        expect(call[1]).not.toHaveProperty('summary')
      }
    }
  })

  it('内容未变化时不触发写（diff 守卫）', async () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    const box = gotoNotesTab()
    fireEvent.change(box, { target: { value: '' } }) // 与 c1.notes 相同
    fireEvent.blur(box)
    await new Promise((r) => setTimeout(r, 900))
    expect(onUpd).not.toHaveBeenCalled()
  }, 5000)
})

describe('ChatPane 标签页导航（第二轮 1.7 反馈 #5/6/7 方案 B）', () => {
  it('默认在对话标签：有发送区，无笔记框', () => {
    render(<Harness onUpd={vi.fn()} />)
    expect(screen.getByPlaceholderText(/提问「机器学习」/)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/写下你自己的理解/)).toBeNull()
  })

  it('切到笔记·详情：总结/状态组/复习计划/笔记都在', () => {
    render(<Harness onUpd={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: /笔记·详情/ }))
    expect(screen.getByText('一句话总结')).toBeTruthy()
    expect(screen.getByText('学习状态')).toBeTruthy()
    expect(screen.getByText('复习计划')).toBeTruthy()
    expect(screen.getByPlaceholderText(/写下你自己的理解/)).toBeTruthy()
    // 对话输入区不在详情标签
    expect(screen.queryByPlaceholderText(/提问「机器学习」/)).toBeNull()
  })

  it('状态四选一显式触发更新（反馈 #8：不再循环切换）', () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    fireEvent.click(screen.getByRole('tab', { name: /笔记·详情/ }))
    fireEvent.click(screen.getByRole('button', { name: '已掌握' }))
    expect(onUpd).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'learned' }))
  })

  it('第二轮 3.9 反馈 #4：对话标签页可直接调整状态', () => {
    const onUpd = vi.fn()
    render(<Harness onUpd={onUpd} />)
    // 默认就在对话标签：四个状态按钮直接可用
    expect(screen.getByRole('button', { name: '未学习' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '已掌握' }))
    expect(onUpd).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'learned' }))
  })
})

// ---- 第二轮 1.8 反馈 #1：候选概念折叠 ----
const cCand = { ...mkConcept('cc', '候选宿主', ''), candidates: ['概念A', '概念B'] }
const seriesCand = { ...series, concepts: { cc: cCand } }

function CandHarness({ onUpd }: { onUpd: (id: string, patch: Record<string, unknown>) => void }) {
  return (
    <SaveProvider>
      <ChatPane
        series={seriesCand as never}
        concept={cCand as never}
        selectedId="cc"
        onUpdateConcept={onUpd}
        onAddConcept={() => undefined}
      />
    </SaveProvider>
  )
}

describe('候选概念折叠（第二轮 1.8 反馈 #1）', () => {
  it('默认折叠：标题行显示数量，候选芯片不可见', () => {
    render(<CandHarness onUpd={vi.fn()} />)
    expect(screen.getByText(/候选概念 2 个/)).toBeTruthy()
    expect(screen.queryByText('概念A')).toBeNull()
    expect(screen.queryByText('概念B')).toBeNull()
  })

  it('展开后芯片可见，收起后隐藏', () => {
    render(<CandHarness onUpd={vi.fn()} />)
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText('概念A')).toBeTruthy()
    expect(screen.getByText('概念B')).toBeTruthy()
    fireEvent.click(screen.getByText('收起'))
    expect(screen.queryByText('概念A')).toBeNull()
  })

  it('手动添加入口始终可见（不受折叠影响）', () => {
    render(<CandHarness onUpd={vi.fn()} />)
    expect(screen.getByPlaceholderText(/手动添加概念/)).toBeTruthy()
  })
})

// ---- 第二轮 1.8 反馈 #4：一句话总结由 AI 基于整个回答生成 ----
const cSum = { ...mkConcept('cs', '总结宿主', ''), summary: '' }
const seriesSum = { ...series, concepts: { cs: cSum } }

function SumHarness({ onUpd }: { onUpd: (id: string, patch: Record<string, unknown>) => void }) {
  return (
    <SaveProvider>
      <ChatPane
        series={seriesSum as never}
        concept={cSum as never}
        selectedId="cs"
        onUpdateConcept={onUpd}
        onAddConcept={() => undefined}
      />
    </SaveProvider>
  )
}

describe('AI 全文总结（第二轮 1.8 反馈 #4）', () => {
  it('回答结束后调用总结流，AI 结果回填可编辑总结框并持久化', async () => {
    const onUpd = vi.fn()
    const mockStream = vi.mocked(chatStream)
    mockStream.mockReset()
    mockStream.mockImplementation(async (messages, opts) => {
      const list = messages as { role: string; content: string }[]
      const sys = (list.find((m) => m.role === 'system')?.content) || ''
      const o = opts || {}
      if (sys.includes('总结助手')) {
        if (o.onDone) o.onDone('机器学习是让机器从数据中自动学习规律的技术。')
      } else {
        // 模拟完整流式：delta 累积出足够长的全文（≥40 字才走 AI 总结流）
        const full = '机器学习是研究如何让计算机从数据中自动获取规律并改进自身性能的学科，应用非常广泛。'
        if (o.onDelta) o.onDelta(full)
        if (o.onDone) o.onDone(full)
      }
    })
    render(<SumHarness onUpd={onUpd} />)
    fireEvent.change(screen.getByPlaceholderText(/提问「总结宿主」/), { target: { value: '什么是机器学习？' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    // 总结流被发起，且结果经防抖持久化为 summary
    await waitFor(() => expect(onUpd).toHaveBeenCalledWith('cs', expect.objectContaining({ summary: '机器学习是让机器从数据中自动学习规律的技术。' })), { timeout: 3000 })
    // 详情标签里给出「根据整个回答」提示
    fireEvent.click(screen.getByRole('tab', { name: /笔记·详情/ }))
    expect(screen.getByText(/根据整个回答/)).toBeTruthy()
    const box = screen.getByPlaceholderText(/一句话总结/) as HTMLInputElement
    expect(box.value).toBe('机器学习是让机器从数据中自动学习规律的技术。')
  }, 8000)

  it('总结流失败时回退首句提取，仍有草稿可编辑', async () => {
    const onUpd = vi.fn()
    const mockStream = vi.mocked(chatStream)
    mockStream.mockReset()
    mockStream.mockImplementation(async (messages, opts) => {
      const list = messages as { role: string; content: string }[]
      const sys = (list.find((m) => m.role === 'system')?.content) || ''
      const o = opts || {}
      if (sys.includes('总结助手')) {
        if (o.onError) o.onError('AI 不可用')
      } else {
        const full = '第一句就是核心结论。后面还有很多补充内容，确保整段回答足够长以便回退提取有东西可用。'
        if (o.onDelta) o.onDelta(full)
        if (o.onDone) o.onDone(full)
      }
    })
    render(<SumHarness onUpd={onUpd} />)
    fireEvent.change(screen.getByPlaceholderText(/提问「总结宿主」/), { target: { value: '问点别的' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    await waitFor(() => expect(onUpd).toHaveBeenCalledWith('cs', expect.objectContaining({ summary: '第一句就是核心结论。' })), { timeout: 3000 })
  }, 8000)
})
