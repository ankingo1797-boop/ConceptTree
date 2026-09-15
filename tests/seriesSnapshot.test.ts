// 第二轮 1.7 反馈 #4：结构快照（撤销删除/新增）纯函数测试
import { describe, expect, it } from 'vitest'
import { restoreSnapshot, takeSnapshot } from '../src/features/seriesSnapshot'
import type { Series } from '../src/types'

const mkSeries = (): Series => ({
  id: 's1', name: '系列', rootConceptId: 'c1',
  concepts: {
    c1: { id: 'c1', name: '概念一', summary: 'S1', parentId: null, sessionId: null, status: 'learning', x: 10, y: 20, notes: 'n', history: [], candidates: [], createdAt: 't', updatedAt: 't' },
    c2: { id: 'c2', name: '概念二', summary: '', parentId: 'c1', sessionId: null, status: 'unlearned', x: null, y: null, notes: '', history: [], candidates: [], createdAt: 't', updatedAt: 't' },
  },
  edges: [{ id: 'e1', from: 'c1', to: 'c2', type: 'parent-child' }],
  createdAt: 't', updatedAt: 't',
})

describe('takeSnapshot / restoreSnapshot', () => {
  it('快照是深拷贝：改动原系列不影响快照', () => {
    const s = mkSeries()
    const snap = takeSnapshot(s)
    delete s.concepts.c2
    s.edges.pop()
    expect(Object.keys(snap.concepts)).toEqual(['c1', 'c2'])
    expect(snap.edges.length).toBe(1)
  })

  it('恢复快照还原被删除的概念与边', () => {
    const s = mkSeries()
    const snap = takeSnapshot(s)
    // 模拟删除 c2
    const deleted: Series = {
      ...s,
      concepts: { c1: s.concepts.c1 },
      edges: [],
      updatedAt: 'later',
    }
    const restored = restoreSnapshot(deleted, snap)
    expect(Object.keys(restored.concepts)).toEqual(['c1', 'c2'])
    expect(restored.edges.length).toBe(1)
    expect(restored.rootConceptId).toBe('c1')
    // 系列元信息保留
    expect(restored.id).toBe('s1')
    expect(restored.name).toBe('系列')
  })

  it('恢复结果与原对象无引用共享（再次修改不互相污染）', () => {
    const s = mkSeries()
    const snap = takeSnapshot(s)
    const restored = restoreSnapshot(s, snap)
    restored.concepts.c1.name = '被改了'
    expect(snap.concepts.c1.name).toBe('概念一')
    expect(s.concepts.c1.name).toBe('概念一')
  })

  it('快照保留 rootConceptId 为 null 的情形', () => {
    const s = mkSeries()
    s.rootConceptId = null
    const snap = takeSnapshot(s)
    expect(snap.rootConceptId).toBeNull()
  })
})
