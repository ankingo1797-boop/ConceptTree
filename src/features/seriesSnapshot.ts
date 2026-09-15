// 第二轮 1.7 反馈 #4：结构快照的恢复（撤销/重做删除、新增等结构性操作）
import type { Series, SeriesSnapshot } from '../types'

/** 深拷贝一份当前结构（概念 + 边 + 根），用于撤销栈 */
export function takeSnapshot(series: Series): SeriesSnapshot {
  return {
    concepts: JSON.parse(JSON.stringify(series.concepts || {})),
    edges: JSON.parse(JSON.stringify(series.edges || [])),
    rootConceptId: series.rootConceptId || null,
  }
}

/** 用快照恢复系列结构（保留系列 id/name/createdAt 等元信息） */
export function restoreSnapshot(series: Series, snap: SeriesSnapshot): Series {
  return {
    ...series,
    concepts: JSON.parse(JSON.stringify(snap.concepts)),
    edges: JSON.parse(JSON.stringify(snap.edges)),
    rootConceptId: snap.rootConceptId,
    updatedAt: new Date().toISOString(),
  }
}
