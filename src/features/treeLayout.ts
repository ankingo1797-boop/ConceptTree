// 概念树自动布局（第一轮 1.5 修复 #4：重写为 tidy-tree）
// 纯函数：按 parent-child 边做层级布局——子树垂直居中于父节点；
// 叶子占固定槽位；每棵根树占独立区域；环/孤儿节点排在末尾独立列。

export interface LayoutPoint { x: number; y: number }

export const LEVEL_W = 300   // 层级水平间距
export const SLOT_H = 120    // 每个叶子的垂直槽位（卡片高约 90 + 间隙）
export const TREE_GAP = 80   // 相邻根树之间的垂直间隙
export const ORIGIN_X = 80
export const ORIGIN_Y = 60

interface LayoutConcept { id: string; parentId?: string }
interface LayoutEdge { from: string; to: string; type: string }

/**
 * 计算自动布局。
 * @param concepts 概念集合（顺序决定同层排序，保持稳定）
 * @param edges 边集合（只用 parent-child；related 不参与布局）
 * @param rootId 系列根概念（优先作为第一棵树的根）
 */
export function computeTreeLayout(
  concepts: Record<string, LayoutConcept>,
  edges: LayoutEdge[],
  rootId?: string,
): Record<string, LayoutPoint> {
  const ids = Object.keys(concepts)
  const out: Record<string, LayoutPoint> = {}
  if (ids.length === 0) return out

  // children 表（只认 parent-child；去重；忽略自环与指向不存在节点的边）
  const children = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const e of edges) {
    if (e.type !== 'parent-child') continue
    if (e.from === e.to) continue
    if (!concepts[e.from] || !concepts[e.to]) continue
    const arr = children.get(e.from) || []
    if (!arr.includes(e.to)) arr.push(e.to)
    children.set(e.from, arr)
    hasParent.add(e.to)
  }

  // 根列表：系列根优先，然后是没有父（或父不存在）的节点，保持稳定顺序
  const roots: string[] = []
  if (rootId && concepts[rootId]) roots.push(rootId)
  for (const id of ids) {
    if (id === rootId) continue
    const p = concepts[id].parentId
    if (!p || !concepts[p]) { if (!roots.includes(id)) roots.push(id) }
  }
  // 有父但父在树中、且不在任何 children 表里的异常情况：兜底也当根（防遗漏）
  for (const id of ids) {
    if (roots.includes(id)) continue
    let claimed = false
    for (const arr of children.values()) { if (arr.includes(id)) { claimed = true; break } }
    if (!claimed && !hasParent.has(id)) roots.push(id)
  }

  const placed = new Set<string>()
  let cursorY = ORIGIN_Y

  // 子树占用的槽位数（叶子=1；内部节点=子树之和，至少 1）
  const slotCache = new Map<string, number>()
  const slotsOf = (id: string, guard: Set<string>): number => {
    if (slotCache.has(id)) return slotCache.get(id)!
    if (guard.has(id)) return 1 // 环保护
    guard.add(id)
    const kids = (children.get(id) || []).filter((k) => !guard.has(k))
    const n = kids.length === 0 ? 1 : kids.reduce((s, k) => s + slotsOf(k, guard), 0)
    slotCache.set(id, n)
    return n
  }

  const place = (id: string, depth: number, topY: number, guard: Set<string>) => {
    if (placed.has(id)) return topY
    placed.add(id)
    const kids = (children.get(id) || []).filter((k) => !guard.has(k) && !placed.has(k))
    const total = kids.reduce((s, k) => s + slotsOf(k, new Set(guard)), 0)
    const spanH = Math.max(total, 1) * SLOT_H
    const myY = topY + spanH / 2 - SLOT_H / 2 // 居中于子树跨度
    out[id] = { x: ORIGIN_X + depth * LEVEL_W, y: Math.round(myY) }
    guard.add(id)
    let cy = topY
    for (const k of kids) {
      const sh = slotsOf(k, new Set(guard)) * SLOT_H
      place(k, depth + 1, cy, guard)
      cy += sh
    }
    return topY + spanH
  }

  for (const r of roots) {
    if (placed.has(r)) continue
    const sh = slotsOf(r, new Set()) * SLOT_H
    place(r, 0, cursorY, new Set())
    cursorY += sh + TREE_GAP
  }

  // 兜底：未被放置的节点（环内无根可达等）纵向排列在下方
  for (const id of ids) {
    if (placed.has(id)) continue
    out[id] = { x: ORIGIN_X, y: cursorY }
    placed.add(id)
    cursorY += SLOT_H
  }
  return out
}
