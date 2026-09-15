// @vitest-environment jsdom
// 第二轮 2.9 反馈 #1：连线「点击-点击」交互渲染测试
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasPane from '../src/CanvasPane.tsx'
import type { Concept, Series } from '../src/types'

// jsdom 缺 ResizeObserver / matchMedia，每个测试前打桩
class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }))
})
afterEach(() => { cleanup() })

const mkConcept = (id: string, name: string, x: number, y: number): Concept => ({
  id, name, summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x, y, notes: '', history: [], candidates: [], createdAt: 't', updatedAt: 't',
})

const series: Series = {
  id: 's1', name: 'S', rootConceptId: 'a',
  concepts: { a: mkConcept('a', '甲概念', 40, 40), b: mkConcept('b', '乙概念', 400, 40) },
  edges: [], createdAt: 't', updatedAt: 't',
}

const calls = { addEdge: vi.fn(), addConcept: vi.fn() }
beforeEach(() => { calls.addEdge.mockReset(); calls.addConcept.mockReset() })

const renderCanvas = () => render(
  <CanvasPane
    series={series}
    onSelectConcept={() => {}}
    onUpdateConcept={() => {}}
    onAddConcept={calls.addConcept}
    onDeleteConcept={() => {}}
    onAddEdge={calls.addEdge}
  />,
)

describe('连线：点击-点击建边（反馈 #1）', () => {
  it('点第一个连接键进入待连接：出现提示条', () => {
    renderCanvas()
    const handles = screen.getAllByTitle('连接：点击后再点另一卡片的连接键')
    fireEvent.click(handles[0])
    expect(screen.getByText(/正在从「甲概念」连线/)).toBeTruthy()
    expect(calls.addEdge).not.toHaveBeenCalled()
  })

  it('再点另一个卡片的连接键：建边并退出待连接', () => {
    renderCanvas()
    const handles = screen.getAllByTitle('连接：点击后再点另一卡片的连接键')
    fireEvent.click(handles[0])
    // 待连接后，源卡片手柄的 title 变化；目标仍是默认 title
    const target = screen.getAllByTitle('连接：点击后再点另一卡片的连接键')[0]
    fireEvent.click(target)
    expect(calls.addEdge).toHaveBeenCalledWith({ from: 'a', to: 'b', type: 'related' })
    expect(screen.queryByText(/正在从「甲概念」连线/)).toBeNull()
  })

  it('点空白处取消本次连接：之后再点连接键只是重新开始', () => {
    const { container } = renderCanvas()
    const handles = screen.getAllByTitle('连接：点击后再点另一卡片的连接键')
    fireEvent.click(handles[0])
    expect(screen.getByText(/正在从「甲概念」连线/)).toBeTruthy()
    // 点画布空白（画布区的 pointerdown 触发取消）
    const canvasArea = container.querySelector('.ct-canvas-dots') as HTMLElement
    fireEvent.pointerDown(canvasArea)
    expect(screen.queryByText(/正在从「甲概念」连线/)).toBeNull()
    expect(calls.addEdge).not.toHaveBeenCalled()
  })

  it('再次点击同一卡片的连接键 = 取消，不建边', () => {
    renderCanvas()
    const handles = screen.getAllByTitle('连接：点击后再点另一卡片的连接键')
    fireEvent.click(handles[0])
    const cancel = screen.getByTitle('再次点击取消连接')
    fireEvent.click(cancel)
    expect(calls.addEdge).not.toHaveBeenCalled()
    expect(screen.queryByText(/正在从「甲概念」连线/)).toBeNull()
  })

  it('工具栏有 AI 层级按钮', () => {
    renderCanvas()
    expect(screen.getByTitle(/让 AI 分析概念间的层级关系/)).toBeTruthy()
  })
})

describe('添加子概念应用内弹框（第五轮 D）', () => {
  it('右键菜单 → 添加子概念 → 弹框输入回车 → 建概念', () => {
    renderCanvas()
    // 第八轮：卡内翻起面板会复制名字，取第一个匹配（卡片标题）
    fireEvent.contextMenu(screen.getAllByText('甲概念')[0])
    fireEvent.click(screen.getByText('➕ 添加子概念'))
    const input = screen.getByLabelText('子概念名称')
    fireEvent.change(input, { target: { value: '新子概念' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(calls.addConcept).toHaveBeenCalledWith({ name: '新子概念', parentId: 'a', status: 'unlearned' })
    // 弹框关闭
    expect(screen.queryByLabelText('子概念名称')).toBeNull()
  })

  it('弹框取消不建概念', () => {
    renderCanvas()
    fireEvent.contextMenu(screen.getAllByText('甲概念')[0])
    fireEvent.click(screen.getByText('➕ 添加子概念'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(calls.addConcept).not.toHaveBeenCalled()
  })
})
