// 概念学习树 — 核心数据模型（TypeScript 类型）
// 所有模块共享的类型契约：画布、对话、系列页、服务端、存储

// ---- 概念 ----
export type ConceptStatus = 'unlearned' | 'learning' | 'learned' | 'doubtful'

// 第一轮 A：Leitner 复习状态（增量字段；旧数据无此字段 = 未入列）
export interface ConceptReview {
  box: number                    // Leitner 盒子 0..6（间隔阶梯索引）
  dueAt: string                  // ISO 时间，下次复习时间
  reps: number                   // 累计复习次数
  lapses: number                 // 累计忘记次数
  lastReviewedAt: string | null
  // 第三轮 3a：复习事件日志（本地日期键 YYYY-MM-DD，去重追加；旧数据无此字段 = 无记录）
  reviewLog?: string[]
}

export interface Position {
  x: number
  y: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Concept {
  id: string
  name: string
  summary: string
  parentId: string | null
  sessionId: string | null
  status: ConceptStatus
  x: number | null
  y: number | null
  notes: string
  history: ChatMessage[]
  candidates: string[]
  review?: ConceptReview
  createdAt: string
  updatedAt: string
}

// ---- 边 ----
export type EdgeType = 'parent-child' | 'related'

export interface Edge {
  id: string
  from: string
  to: string
  type: EdgeType
}

// ---- 系列 ----
export interface Series {
  id: string
  name: string
  rootConceptId: string | null
  createdAt: string
  updatedAt: string
  concepts: Record<string, Concept>
  edges: Edge[]
}

export interface SeriesSummary {
  id: string
  name: string
  rootConceptId: string | null
  conceptCount: number
  updatedAt: string
}

// ---- 数据文件 ----
export interface ConceptTreeData {
  version: number
  series: Record<string, Series>
}

// ---- 导入导出 ----
export interface ExportPayload {
  format: 'dsh-concept-tree'
  version: number
  series: {
    id: string
    name: string
    rootConceptId: string | null
    concepts: Record<string, Concept>
    edges: Edge[]
  }
}

// ---- 配置 ----
export interface AppConfig {
  apiUrl: string
  model: string
  hasKey: boolean
}

export interface SaveConfigInput {
  apiUrl?: string
  apiKey?: string
  model?: string
}

// ---- API 响应 ----
export interface ApiResult<T> {
  ok: boolean
  value?: T
  error?: { message: string }
}

export interface DetectResponse {
  candidates: string[]
}

// ---- 画布 ----
export interface DragState {
  id: string
  startX: number
  startY: number
  origX: number
  origY: number
  liveX: number
  liveY: number
}

export type HistoryEntry =
  | { type: 'status'; conceptId: string; before: ConceptStatus; after: ConceptStatus }
  | { type: 'rename'; conceptId: string; before: string; after: string }
  | { type: 'move'; conceptId: string; before: Position; after: Position }
  // 第二轮 1.7 反馈 #4：结构快照（删除/新增概念与连线可撤销）
  | { type: 'snapshot'; label: string; before: SeriesSnapshot; after: SeriesSnapshot }

/** 系列结构快照（不含 updatedAt 等元信息，恢复时重建） */
export interface SeriesSnapshot {
  concepts: Record<string, Concept>
  edges: Edge[]
  rootConceptId: string | null
}
