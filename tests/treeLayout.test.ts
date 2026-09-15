// treeLayout：第一轮 1.5 修复 #4 的回归测试（布局合理性）
import { describe, it, expect } from 'vitest'
import { computeTreeLayout, LEVEL_W, SLOT_H, ORIGIN_X } from '../src/features/treeLayout'

const C = (id: string, parentId?: string) => ({ id, name: id, parentId })
const E = (from: string, to: string, type = 'parent-child') => ({ id: `${from}->${to}`, from, to, type })

describe('computeTreeLayout', () => {
  it('空集合返回空布局', () => {
    expect(computeTreeLayout({}, [])).toEqual({})
  })

  it('线性链：深度递增，x 按层级推进，y 居中不变', () => {
    const layout = computeTreeLayout(
      { a: C('a'), b: C('b', 'a'), c: C('c', 'b') },
      [E('a', 'b'), E('b', 'c')],
      'a',
    )
    expect(layout.a.x).toBe(ORIGIN_X)
    expect(layout.b.x).toBe(ORIGIN_X + LEVEL_W)
    expect(layout.c.x).toBe(ORIGIN_X + LEVEL_W * 2)
    // 单子链垂直对齐
    expect(layout.a.y).toBe(layout.b.y)
    expect(layout.b.y).toBe(layout.c.y)
  })

  it('两个叶子：父节点垂直居中于两子之间', () => {
    const layout = computeTreeLayout(
      { a: C('a'), b: C('b', 'a'), c: C('c', 'a') },
      [E('a', 'b'), E('a', 'c')],
      'a',
    )
    const mid = (layout.b.y + layout.c.y) / 2
    expect(Math.abs(layout.a.y - mid)).toBeLessThanOrEqual(1)
    expect(layout.b.y).not.toBe(layout.c.y) // 叶子不重叠
    expect(Math.abs(layout.b.y - layout.c.y)).toBeGreaterThanOrEqual(SLOT_H)
  })

  it('兄弟子树不重叠：同列节点间隔至少一个槽位', () => {
    // a -> b(带两个叶子), c
    const layout = computeTreeLayout(
      { a: C('a'), b: C('b', 'a'), c: C('c', 'a'), d: C('d', 'b'), e: C('e', 'b') },
      [E('a', 'b'), E('a', 'c'), E('b', 'd'), E('b', 'e')],
      'a',
    )
    // 按列（x）分组，同列内任意两点间隔 >= SLOT_H（卡片不重叠）
    const byCol = new Map<number, number[]>()
    for (const p of Object.values(layout)) {
      const arr = byCol.get(p.x) || []
      arr.push(p.y)
      byCol.set(p.x, arr)
    }
    for (const [, ys] of byCol) {
      const sorted = [...ys].sort((x, y) => x - y)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(SLOT_H - 1)
      }
    }
    // 且所有坐标非负、无完全重合点
    const seen = new Set<string>()
    for (const p of Object.values(layout)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      const key = `${p.x},${p.y}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('related 边不参与布局（不影响层级）', () => {
    const layout = computeTreeLayout(
      { a: C('a'), b: C('b', 'a'), c: C('c', 'a') },
      [E('a', 'b'), E('a', 'c'), E('b', 'c', 'related')],
      'a',
    )
    expect(layout.b.x).toBe(layout.c.x) // b、c 仍是同层兄弟
  })

  it('环保护：互相指向不会死循环且不重叠', () => {
    const layout = computeTreeLayout(
      { a: C('a', 'b'), b: C('b', 'a') },
      [E('a', 'b'), E('b', 'a')],
    )
    expect(layout.a).toBeTruthy()
    expect(layout.b).toBeTruthy()
    expect(layout.a.y).not.toBe(layout.b.y)
  })

  it('多棵根树纵向分开，系列根排第一', () => {
    const layout = computeTreeLayout(
      { r: C('r'), x: C('x'), y: C('y') },
      [],
      'r',
    )
    expect(layout.r.y).toBeLessThan(layout.x.y)
    expect(layout.x.y).toBeLessThan(layout.y.y)
  })

  it('自环与悬空边被忽略', () => {
    const layout = computeTreeLayout(
      { a: C('a'), b: C('b', 'a') },
      [E('a', 'a'), E('a', 'ghost'), E('a', 'b')],
      'a',
    )
    expect(Object.keys(layout)).toEqual(['a', 'b'])
  })
})
