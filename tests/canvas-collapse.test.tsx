// @vitest-environment jsdom
// 第五轮 A：画布子树折叠交互测试
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasPane from '../src/CanvasPane.tsx'
import type { Concept, Series } from '../src/types'

class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
// jsdom 环境无 localStorage，打内存桩（组件内所有读写均有 try/catch，真实浏览器不受影响）
const memStore: Record<string, string> = {}
const fakeStorage = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => { memStore[k] = String(v) },
  removeItem: (k: string) => { delete memStore[k] },
  clear: () => { for (const k of Object.keys(memStore)) delete memStore[k] },
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }))
  vi.stubGlobal('localStorage', fakeStorage)
  fakeStorage.clear()
})
afterEach(() => cleanup())

const mkConcept = (id: string, name: string): Concept => ({
  id, name, summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [], createdAt: 't', updatedAt: 't',
})

// 根 → 子 → 孙
const series: Series = {
  id: 's1', name: 'S', rootConceptId: 'root',
  concepts: { root: mkConcept('root', '根概念'), mid: mkConcept('mid', '中间概念'), leaf: mkConcept('leaf', '叶子概念') },
  edges: [
    { id: 'e1', from: 'root', to: 'mid', type: 'parent-child' },
    { id: 'e2', from: 'mid', to: 'leaf', type: 'parent-child' },
  ],
  createdAt: 't', updatedAt: 't',
}

const noop = () => {}

const renderCanvas = () => render(
  <CanvasPane
    series={series}
    onSelectConcept={noop}
    onUpdateConcept={noop}
    onAddConcept={() => undefined}
    onDeleteConcept={noop}
    onAddEdge={noop}
  />,
)

describe('画布子树折叠（第五轮 A）', () => {
  it('有子树的卡片显示折叠钮，叶子没有', () => {
    renderCanvas()
    // 根与中间有子树 → 两个折叠钮；叶子没有
    expect(screen.getAllByTitle('收起子树').length).toBe(2)
  })

  it('点折叠钮：后代隐藏 + 显示 +N 角标；再点展开恢复', () => {
    renderCanvas()
    // 渲染顺序 = 插入顺序：[根, 中间]，取「中间概念」的折叠钮（第二个）
    const btns = screen.getAllByTitle('收起子树')
    fireEvent.click(btns[1])
    // 折叠后：叶子不可见；中间卡片的按钮变为「▸ 1」（第十轮文案精简）
    expect(screen.queryByText('叶子概念')).toBeNull()
    expect(screen.getByText('▸ 1')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()

    // 展开恢复（第八轮：翻起面板复制名字，用 getAllByText）
    fireEvent.click(screen.getByTitle('展开子树'))
    expect(screen.getAllByText('叶子概念').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('+1')).toBeNull()
  })

  it('折叠状态持久化到 localStorage', () => {
    renderCanvas()
    const btns = screen.getAllByTitle('收起子树')
    fireEvent.click(btns[btns.length - 1])
    const raw = fakeStorage.getItem('ct-collapsed-s1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).length).toBe(1)
  })

  it('第六轮反馈 #1：折叠后通向隐藏后代的连线一并消失', () => {
    const { getByTestId } = renderCanvas()
    const edgeLayer = () => getByTestId('edge-layer')
    // 每条边渲染 2 条 path（可见线 + 透明命中层）：初始 2 条边 = 4 条 path
    expect(edgeLayer().querySelectorAll('path').length).toBe(4)
    const btns = screen.getAllByTitle('收起子树')
    fireEvent.click(btns[1]) // 折叠「中间概念」：mid→leaf 的边两端不再都可见
    expect(edgeLayer().querySelectorAll('path').length).toBe(2)
    fireEvent.click(screen.getByTitle('展开子树'))
    expect(edgeLayer().querySelectorAll('path').length).toBe(4)
  })
})
