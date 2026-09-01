// 第二轮 3.9 反馈 #5：边查重纯函数（双向），防同对概念间出现重复连线
import type { Edge } from '../types'

/** 两概念之间是否存在任意类型、任意方向的边 */
export function pairHasEdge(edges: Edge[], a: string, b: string): boolean {
  return edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))
}

/** 是否存在同向同类型的边 */
export function sameEdgeExists(edges: Edge[], from: string, to: string, type: Edge['type']): boolean {
  return edges.some((e) => e.from === from && e.to === to && e.type === type)
}
