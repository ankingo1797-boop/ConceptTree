// 第二轮 3.9 反馈 #5：边查重纯函数测试
import { describe, expect, it } from 'vitest'
import { pairHasEdge, sameEdgeExists } from '../src/features/edges'
import type { Edge } from '../src/types'

const E = (id: string, from: string, to: string, type: Edge['type']): Edge => ({ id, from, to, type })

describe('sameEdgeExists 同向同类型查重', () => {
  it('完全相同的边存在', () => {
    expect(sameEdgeExists([E('e1', 'a', 'b', 'related')], 'a', 'b', 'related')).toBe(true)
  })
  it('反向不算同向同类型', () => {
    expect(sameEdgeExists([E('e1', 'a', 'b', 'related')], 'b', 'a', 'related')).toBe(false)
  })
  it('类型不同不算', () => {
    expect(sameEdgeExists([E('e1', 'a', 'b', 'parent-child')], 'a', 'b', 'related')).toBe(false)
  })
})

describe('pairHasEdge 双向任意类型查重', () => {
  const edges = [E('e1', 'a', 'b', 'related')]
  it('正向命中', () => {
    expect(pairHasEdge(edges, 'a', 'b')).toBe(true)
  })
  it('反向命中', () => {
    expect(pairHasEdge(edges, 'b', 'a')).toBe(true)
  })
  it('无关节点对不命中', () => {
    expect(pairHasEdge(edges, 'a', 'c')).toBe(false)
  })
  it('父子边同样算已有连线', () => {
    expect(pairHasEdge([E('e2', 'p', 'c', 'parent-child')], 'c', 'p')).toBe(true)
  })
})
