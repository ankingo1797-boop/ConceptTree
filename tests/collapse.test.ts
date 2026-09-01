// 第五轮 A：子树折叠纯函数测试
import { describe, expect, it } from 'vitest'
import { ancestorIds, childIds, descendantIds, hiddenCount, visibleConceptIds } from '../src/features/collapse'
import type { Concept, Edge } from '../src/types'

const C = (id: string): Concept => ({
  id, name: id, summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [], createdAt: 't', updatedAt: 't',
})
const concepts = { a: C('a'), b: C('b'), c: C('c'), d: C('d') }
// a → b → c，a → d（另一直属子）
const edges: Edge[] = [
  { id: 'e1', from: 'a', to: 'b', type: 'parent-child' },
  { id: 'e2', from: 'b', to: 'c', type: 'parent-child' },
  { id: 'e3', from: 'a', to: 'd', type: 'parent-child' },
  { id: 'e4', from: 'c', to: 'd', type: 'related' }, // 关联边不参与层级
]

describe('childIds / descendantIds', () => {
  it('直接子与全部后代', () => {
    expect(childIds(edges, 'a').sort()).toEqual(['b', 'd'])
    expect(descendantIds(concepts, edges, 'a').sort()).toEqual(['b', 'c', 'd'])
    expect(descendantIds(concepts, edges, 'b')).toEqual(['c'])
  })

  it('叶子无后代', () => {
    expect(descendantIds(concepts, edges, 'c')).toEqual([])
  })

  it('关联边不构成层级', () => {
    // c 通过 related 边连 d，但 d 不是 c 的后代
    expect(descendantIds(concepts, edges, 'c')).toEqual([])
  })

  it('环保护：a→b→a 不死循环', () => {
    const cyclic: Edge[] = [
      { id: 'x1', from: 'a', to: 'b', type: 'parent-child' },
      { id: 'x2', from: 'b', to: 'a', type: 'parent-child' },
    ]
    const desc = descendantIds(concepts, cyclic, 'a')
    expect(desc).toContain('b')
    expect(desc.length).toBeLessThanOrEqual(2)
  })
})

describe('ancestorIds', () => {
  it('祖先链向上收集', () => {
    expect(ancestorIds(concepts, edges, 'c').sort()).toEqual(['a', 'b'])
    expect(ancestorIds(concepts, edges, 'a')).toEqual([])
  })

  it('环保护', () => {
    const cyclic: Edge[] = [
      { id: 'x1', from: 'a', to: 'b', type: 'parent-child' },
      { id: 'x2', from: 'b', to: 'a', type: 'parent-child' },
    ]
    expect(() => ancestorIds(concepts, cyclic, 'a')).not.toThrow()
  })
})

describe('visibleConceptIds / hiddenCount', () => {
  it('折叠 b：藏起 c，b 自身仍可见', () => {
    const v = visibleConceptIds(concepts, edges, ['b'])
    expect(v.has('a')).toBe(true)
    expect(v.has('b')).toBe(true)   // 折叠节点本身保留
    expect(v.has('c')).toBe(false)
    expect(v.has('d')).toBe(true)
  })

  it('折叠 a：藏起 b、c、d', () => {
    const v = visibleConceptIds(concepts, edges, ['a'])
    expect([...v]).toEqual(['a'])
    expect(hiddenCount(concepts, edges, 'a')).toBe(3)
  })

  it('空折叠 / 不存在的折叠节点无害', () => {
    expect(visibleConceptIds(concepts, edges, []).size).toBe(4)
    expect(visibleConceptIds(concepts, edges, ['ghost']).size).toBe(4)
  })
})
