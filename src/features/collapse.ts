// 第五轮 A：子树折叠数据层（纯函数，可单测）
// 约定：只看父子边（parent-child）；关联边（related）不构成层级
import type { Concept, Edge } from '../types'

/** 直接子概念（父子边的 to 端） */
export function childIds(edges: Edge[], id: string): string[] {
  const out: string[] = []
  for (const e of edges) {
    if (e.type === 'parent-child' && e.from === id) out.push(e.to)
  }
  return out
}

/** 全部后代 id（沿父子边 BFS，带环保护；不含自身） */
export function descendantIds(concepts: Record<string, Concept>, edges: Edge[], id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const c of childIds(edges, cur)) {
      if (seen.has(c) || !concepts[c]) continue
      seen.add(c)
      out.push(c)
      queue.push(c)
    }
  }
  return out
}

/** 祖先链（沿父子边向上，带环保护；不含自身） */
export function ancestorIds(concepts: Record<string, Concept>, edges: Edge[], id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const e of edges) {
      if (e.type !== 'parent-child' || e.to !== cur) continue
      const p = e.from
      if (seen.has(p) || !concepts[p]) continue
      seen.add(p)
      out.push(p)
      queue.push(p)
    }
  }
  return out
}

/**
 * 可见概念集合 = 全部概念 − 每个折叠节点的后代。
 * 折叠节点本身保持可见（显示 +N 角标）；折叠不存在的概念无害。
 */
export function visibleConceptIds(
  concepts: Record<string, Concept>,
  edges: Edge[],
  collapsedIds: string[],
): Set<string> {
  const hidden = new Set<string>()
  for (const id of collapsedIds) {
    if (!concepts[id]) continue
    for (const d of descendantIds(concepts, edges, id)) hidden.add(d)
  }
  const visible = new Set<string>()
  for (const id of Object.keys(concepts)) {
    if (!hidden.has(id)) visible.add(id)
  }
  return visible
}

/** 某节点的折叠角标数字：被藏起来的后代数量 */
export function hiddenCount(concepts: Record<string, Concept>, edges: Edge[], id: string): number {
  return descendantIds(concepts, edges, id).length
}
