// 第二轮 2.9 反馈 #2：AI 层级分析的数据层（纯函数，可单测）
// 解析 AI 返回的层级配对、环保护、提示词构造

export interface HierarchyPair {
  parent: string
  child: string
}

/**
 * 解析 AI 返回的层级配对。容忍 markdown 代码块、前后缀噪音；
 * 只保留 parent/child 都是非空字符串的项；解析失败返回 []。
 */
export function parseHierarchyPlan(text: string): HierarchyPair[] {
  if (!text) return []
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0])
    if (!Array.isArray(arr)) return []
    const out: HierarchyPair[] = []
    for (const item of arr) {
      if (item && typeof item === 'object') {
        const parent = typeof item.parent === 'string' ? item.parent.trim() : ''
        const child = typeof item.child === 'string' ? item.child.trim() : ''
        if (parent && child) out.push({ parent, child })
      }
    }
    return out
  } catch {
    return []
  }
}

/**
 * 环保护：新增 parent→child 父子边前，检查 child 是否已是 parent 的祖先。
 * edges 为现有父子边（from=父, to=子）。是 → 会产生环，返回 true。
 */
export function wouldCreateCycle(
  edges: { from: string; to: string }[],
  newParentId: string,
  newChildId: string,
): boolean {
  if (newParentId === newChildId) return true
  // 从 newChildId 出发沿「子→其子」方向走，若能到达 newParentId，则新边成环
  const childrenOf: Record<string, string[]> = {}
  for (const e of edges) {
    if (!childrenOf[e.from]) childrenOf[e.from] = []
    childrenOf[e.from].push(e.to)
  }
  const stack = [newChildId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === newParentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const c of childrenOf[id] || []) stack.push(c)
  }
  return false
}

/** 构造层级分析的用户消息（概念清单：名称 + 总结） */
export function buildHierarchyList(concepts: { name: string; summary?: string }[]): string {
  return concepts.map((c) => `- ${c.name}${c.summary ? '：' + c.summary : ''}`).join('\n')
}

/** 系统提示词（约定纯 JSON 输出） */
export const HIERARCHY_SYSTEM_PROMPT =
  '你是知识图谱助手。用户给你一组概念（名称+总结）。分析它们的层级/包含关系，' +
  '输出 JSON 数组，每项形如 {"parent":"父概念名","child":"子概念名"}，表示 child 是 parent 的下位概念。' +
  '只输出 JSON，不要任何其他内容。没有明确层级关系时输出 []。每个概念至多一个 parent。'
