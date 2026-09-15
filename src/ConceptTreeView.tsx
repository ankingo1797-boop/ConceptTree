// 概念树主视图：左右分栏（左画布 + 右对话/笔记标签页；分栏宽度可拖拽、默认对话优先）
import React from 'react'
import CanvasPane from './CanvasPane.tsx'
import ChatPane from './ChatPane.tsx'
import CalendarOverlay from './features/CalendarOverlay.tsx'
import StatsOverlay from './features/StatsOverlay.tsx'
import ReviewSession from './features/ReviewSession.tsx'
import { enroll, shouldAutoEnroll, shouldAutoUnenroll } from './features/reviewScheduler.ts'
import { restoreSnapshot, takeSnapshot } from './features/seriesSnapshot.ts'
import { HIERARCHY_SYSTEM_PROMPT, buildHierarchyList, parseHierarchyPlan, wouldCreateCycle } from './features/hierarchy.ts'
import { pairHasEdge } from './features/edges.ts'
import { dayKey } from './features/calendar.ts'
import { appendReviewLog } from './features/stats.ts'
import { chatStream } from './api.ts'
import type { Concept, HistoryEntry, Series } from './types'
import { uid } from './features/uid.ts'

interface ConceptTreeViewProps {
  series: Series
  onChange: (next: Series) => void
  onBack?: () => void
  model?: string
  /** 第二轮 2a：顶栏日历请求序号（>0 且变化时打开日历弹层） */
  calendarRequest?: number
  /** 第三轮 3a：顶栏统计请求序号（>0 且变化时打开学习报告弹层） */
  statsRequest?: number
  /** 第二轮 2b：顶栏全局搜索定位请求（seq 变化触发选中 + 飞行） */
  locateRequest?: { id: string; seq: number } | null
}

const SIDE_W_KEY = 'ct-side-width'
const SIDE_MIN = 340
// 第二轮 3.9 反馈 #3：右侧范围做大，画布让位
const SIDE_MAX = 1100
const clampSide = (w: number) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, w))

export default function ConceptTreeView({ series, onChange, onBack, model, calendarRequest, statsRequest, locateRequest }: ConceptTreeViewProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  // 第二轮 2a：复习日历弹层（顶栏按钮唤起）
  // 第二轮 3.9 反馈 #9：序号【变化】才打开——挂载时带旧序号不得触发（修复"建概念弹出日历/统计"）
  const [calOpen, setCalOpen] = React.useState(false)
  const prevCalReq = React.useRef(calendarRequest)
  // 第七轮 UI 优化（指南 #1）：窄屏（≤900px）改为上下堆叠，画布占上、面板占下
  const [isNarrow, setIsNarrow] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 900px)').matches)
  React.useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(max-width: 900px)')
    const h = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', h)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', h) }
  }, [])
  React.useEffect(() => {
    if (calendarRequest && calendarRequest > 0 && calendarRequest !== prevCalReq.current) setCalOpen(true)
    prevCalReq.current = calendarRequest
  }, [calendarRequest])
  // 第三轮 3a：学习报告弹层（顶栏按钮唤起）
  const [statsOpen, setStatsOpen] = React.useState(false)
  const prevStatsReq = React.useRef(statsRequest)
  React.useEffect(() => {
    if (statsRequest && statsRequest > 0 && statsRequest !== prevStatsReq.current) setStatsOpen(true)
    prevStatsReq.current = statsRequest
  }, [statsRequest])
  // 第二轮 2b：全局搜索定位（选中概念 + 飞行到卡片）
  // 第二轮 3.9 反馈 #9：同样只在序号变化时触发
  const prevLocateSeq = React.useRef(locateRequest?.seq)
  React.useEffect(() => {
    if (!locateRequest) return
    if (locateRequest.seq === prevLocateSeq.current) return
    prevLocateSeq.current = locateRequest.seq
    setSelectedId(locateRequest.id)
    focusSeq.current += 1
    setFocusRequest({ id: locateRequest.id, seq: focusSeq.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateRequest?.seq])
  // 第一轮 C：候选入树后聚焦新卡（视口命令层入口之一）
  const focusSeq = React.useRef(0)
  const [focusRequest, setFocusRequest] = React.useState<{ id: string; seq: number } | null>(null)

  // 第一轮 1.5 修复 #6：右侧宽度持久化、可拖拽调节（对话内容优先）
  const [sideW, setSideW] = React.useState<number>(() => {
    try { const v = parseInt(localStorage.getItem(SIDE_W_KEY) || '', 10); return Number.isFinite(v) ? clampSide(v) : 560 } catch { return 560 }
  })
  const splitRef = React.useRef<HTMLDivElement>(null)
  const dragSideRef = React.useRef(false)
  const [draggingSide, setDraggingSide] = React.useState(false)
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }

  // ---- 第二轮 1.7 反馈 #4：撤销/重做栈上移到这里（字段级 + 结构快照统一一条时间线）----
  const [history, setHistory] = React.useState<HistoryEntry[]>([])
  const [future, setFuture] = React.useState<HistoryEntry[]>([])
  const pushEntry = (e: HistoryEntry) => { setHistory((h) => [...h.slice(-49), e]); setFuture([]) }

  // 概念 CRUD（修改后通过 onChange 持久化）
  const ops = {
    updateConcept: (conceptId: string, patch: Partial<Concept>) => {
      const concepts = { ...series.concepts }
      const prev = concepts[conceptId]
      // 第二轮 1.7 反馈 #8：仅当 patch 显式把状态改为 learned（且未入列、未自带排期）才自动入列，
      // 杜绝打字/点击等无关更新误触发
      const autoEnroll = shouldAutoEnroll(prev, patch) ? { review: enroll() } : {}
      // 第二轮 1.8 反馈 #3：对称出列——状态显式离开 learned 且已在复习计划 → 自动移出
      const unenroll = shouldAutoUnenroll(prev, patch)
      const autoUnenroll = unenroll ? { review: undefined } : {}
      concepts[conceptId] = { ...prev, ...patch, ...autoEnroll, ...autoUnenroll, updatedAt: new Date().toISOString() }
      onChange({ ...series, concepts, updatedAt: new Date().toISOString() })
      // 第一轮 1.5 修复 #7：自动入列/出列都要让用户知道（规则可见化）
      if (autoEnroll.review) showToast(`「${prev?.name || '该概念'}」已加入复习计划：首次复习在明天，之后间隔递增`)
      else if (unenroll) showToast(`「${prev?.name || '该概念'}」不再是已掌握，已移出复习计划`)
    },
    addConcept: (concept) => {
      const id = uid('c')
      const ts = new Date().toISOString()
      const concepts = { ...series.concepts }
      const edges = [...series.edges]
      concepts[id] = { id, name: concept.name, summary: concept.summary || '', parentId: concept.parentId || null, sessionId: null, status: concept.status || 'unlearned', x: null, y: null, notes: '', history: [], candidates: concept.candidates || [], createdAt: ts, updatedAt: ts }
      if (concept.parentId) edges.push({ id: uid('e'), from: concept.parentId, to: id, type: 'parent-child' })
      let rootConceptId = series.rootConceptId
      if (!rootConceptId && !concept.parentId) rootConceptId = id
      pushEntry({ type: 'snapshot', label: '添加概念', before: takeSnapshot(series), after: { concepts, edges, rootConceptId } })
      onChange({ ...series, concepts, edges, rootConceptId, updatedAt: ts })
      setSelectedId(id)
      return id
    },
    deleteConcept: (ids: string | string[]) => {
      const list = Array.isArray(ids) ? ids : [ids]
      if (list.length === 0) return
      const concepts = { ...series.concepts }
      for (const id of list) delete concepts[id]
      const edges = series.edges.filter((e) => list.indexOf(e.from) < 0 && list.indexOf(e.to) < 0)
      const rootConceptId = list.indexOf(series.rootConceptId || '') >= 0 ? null : series.rootConceptId
      pushEntry({ type: 'snapshot', label: list.length > 1 ? `删除 ${list.length} 个概念` : '删除概念', before: takeSnapshot(series), after: { concepts, edges, rootConceptId } })
      onChange({ ...series, concepts, edges, rootConceptId, updatedAt: new Date().toISOString() })
      if (selectedId && list.indexOf(selectedId) >= 0) setSelectedId(null)
    },
    addEdge: (edge) => {
      const dup = series.edges.find((e) => e.from === edge.from && e.to === edge.to && e.type === edge.type)
      if (dup) return dup
      // 第二轮 3.9 反馈 #5：两概念间已有任意连线时，不再叠加关联线（避免双线、删两遍）
      if (edge.type === 'related' && pairHasEdge(series.edges, edge.from, edge.to)) return undefined
      const edges = [...series.edges, { id: uid('e'), ...edge }]
      pushEntry({ type: 'snapshot', label: '添加连线', before: takeSnapshot(series), after: { concepts: series.concepts, edges, rootConceptId: series.rootConceptId || null } })
      onChange({ ...series, edges, updatedAt: new Date().toISOString() })
    },
    removeEdge: (edgeId) => {
      const edges = series.edges.filter((e) => e.id !== edgeId)
      pushEntry({ type: 'snapshot', label: '删除连线', before: takeSnapshot(series), after: { concepts: series.concepts, edges, rootConceptId: series.rootConceptId || null } })
      onChange({ ...series, edges, updatedAt: new Date().toISOString() })
    },
  }

  // 字段级条目（移动/改名/状态）的执行：撤销用 before，重做用 after
  const applyFieldEntry = (e: HistoryEntry, dir: 'undo' | 'redo') => {
    if (e.type === 'snapshot') {
      onChange(restoreSnapshot(series, dir === 'undo' ? e.before : e.after))
      return
    }
    if (e.type === 'status') {
      ops.updateConcept(e.conceptId, { status: dir === 'undo' ? e.before : e.after })
      return
    }
    if (e.type === 'rename') {
      ops.updateConcept(e.conceptId, { name: dir === 'undo' ? e.before : e.after })
      return
    }
    if (e.type === 'move') {
      const v = dir === 'undo' ? e.before : e.after
      ops.updateConcept(e.conceptId, { x: v.x, y: v.y })
    }
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1)); setFuture((f) => [...f, last])
    applyFieldEntry(last, 'undo')
  }
  const redo = () => {
    const next = future[future.length - 1]
    if (!next) return
    setFuture((f) => f.slice(0, -1)); setHistory((h) => [...h, next])
    applyFieldEntry(next, 'redo')
  }

  // 第一轮 1.5 修复 #7：手动加入/移出复习（对话页与画布右键共用）
  const toggleReview = (id: string) => {
    const c = series.concepts[id]
    if (!c) return
    if (c.review) {
      ops.updateConcept(id, { review: undefined })
      showToast(`「${c.name}」已移出复习计划`)
    } else {
      ops.updateConcept(id, { review: enroll() })
      showToast(`「${c.name}」已加入复习计划：首次复习在明天`)
    }
  }

  const selected = selectedId ? series.concepts[selectedId] : null

  const addConceptFocused = (c) => {
    const id = ops.addConcept(c)
    if (id) { focusSeq.current += 1; setFocusRequest({ id, seq: focusSeq.current }) }
    return id
  }

  // ---- 第二轮 2.9 反馈 #2：AI 层级分析（直接应用，可撤销）----
  const [autoLayoutSeq, setAutoLayoutSeq] = React.useState(0)
  const analyzeHierarchy = () => {
    const list = Object.values(series.concepts)
    if (list.length < 2) { showToast('至少需要 2 个概念才能分析层级'); return }
    showToast('正在让 AI 分析概念层级…')
    chatStream([
      { role: 'system', content: HIERARCHY_SYSTEM_PROMPT },
      { role: 'user', content: buildHierarchyList(list.map((c) => ({ name: c.name, summary: c.summary }))) },
    ], {
      model,
      onDelta: () => { /* 只要最终结果 */ },
      onDone: (full) => {
        const pairs = parseHierarchyPlan(full)
        const nameToId: Record<string, string> = {}
        for (const c of list) nameToId[c.name] = c.id
        const working = series.edges.filter((e) => e.type === 'parent-child').map((e) => ({ from: e.from, to: e.to }))
        const newEdges = [...series.edges]
        let added = 0
        for (const p of pairs) {
          const pid = nameToId[p.parent], cid = nameToId[p.child]
          if (!pid || !cid || pid === cid) continue
          // 第二轮 3.9 反馈 #5：两概念间已有任意连线（含手动关联/反向）就跳过，避免双线
          if (pairHasEdge(series.edges, pid, cid)) continue
          if (working.some((e) => e.from === pid && e.to === cid)) continue
          if (wouldCreateCycle(working, pid, cid)) continue
          working.push({ from: pid, to: cid })
          newEdges.push({ id: uid('e'), from: pid, to: cid, type: 'parent-child' })
          added++
        }
        if (added === 0) { showToast('AI 没有发现新的层级关系（或已有边已覆盖）'); return }
        pushEntry({ type: 'snapshot', label: 'AI 层级分析', before: takeSnapshot(series), after: { concepts: series.concepts, edges: newEdges, rootConceptId: series.rootConceptId || null } })
        onChange({ ...series, edges: newEdges, updatedAt: new Date().toISOString() })
        setAutoLayoutSeq((s) => s + 1) // 请求画布切回自动布局
        showToast(`AI 层级已应用：新增 ${added} 条父子关系（可撤销）`)
      },
      onError: (msg) => showToast('AI 层级分析失败：' + msg),
    })
  }

  return (
    <div style={{ ...styles.split, flexDirection: isNarrow ? 'column' : 'row' }} ref={splitRef}
      onPointerMove={(e) => {
        if (!dragSideRef.current || !splitRef.current) return
        const rect = splitRef.current.getBoundingClientRect()
        setSideW(clampSide(rect.right - e.clientX))
      }}
      onPointerUp={() => {
        if (!dragSideRef.current) return
        dragSideRef.current = false
        setDraggingSide(false)
      }}>
      {/* 左：画布（窄屏时在上方，弹性子项 min-width:0 防溢出） */}
      <div style={{ ...styles.canvasCol, minWidth: 0, ...(isNarrow ? { flex: 'none', height: '42vh' } : {}) }}>
        <CanvasPane
          series={series}
          rootConceptId={series.rootConceptId || undefined}
          onSelectConcept={setSelectedId}
          onUpdateConcept={ops.updateConcept}
          onAddConcept={addConceptFocused}
          onDeleteConcept={ops.deleteConcept}
          onAddEdge={ops.addEdge}
          onRemoveEdge={ops.removeEdge}
          onOpenReview={() => setReviewOpen(true)}
          focusRequest={focusRequest}
          onHistoryEntry={pushEntry}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onAnalyzeHierarchy={analyzeHierarchy}
          autoLayoutRequest={autoLayoutSeq}
          onBackToSeries={onBack}
        />
      </div>
      {/* 第一轮 1.5 修复 #6：可拖拽分隔条（窄屏堆叠时隐藏） */}
      {!isNarrow && (
        <div
          style={{ ...styles.divider, ...(draggingSide ? styles.dividerActive : {}) }}
          title="拖拽调整宽度（对话区）"
          onPointerDown={(e) => {
            e.preventDefault()
            dragSideRef.current = true
            setDraggingSide(true)
            try { splitRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
          }}>
          <div style={styles.dividerGrip} />
        </div>
      )}
      {/* 右：对话｜笔记·详情 标签页（第二轮 1.7 反馈 #5/6/7，方案 B；窄屏占下方；第十轮：半透明透出背景） */}
      <div style={{ ...styles.sideCol, minWidth: 0, background: 'var(--ct-panel-trans)', ...(isNarrow ? { width: 'auto', flex: 1, borderLeft: 'none', borderTop: '1px solid var(--ct-border)' } : { width: sideW }) }}>
        <ChatPane
          series={series}
          concept={selected}
          selectedId={selectedId}
          model={model}
          onUpdateConcept={ops.updateConcept}
          onAddConcept={addConceptFocused}
          onToggleReview={toggleReview}
        />
      </div>
      {/* 第一轮 A：全屏复习会话（第三轮 3a：每次评级写入复习日志，供统计使用） */}
      {reviewOpen && (
        <ReviewSession
          series={series}
          onApplyGrade={(id, review, status) => {
            const prevLog = series.concepts[id]?.review?.reviewLog
            const reviewLog = appendReviewLog(prevLog, dayKey(new Date()))
            ops.updateConcept(id, { review: { ...review, reviewLog }, status })
          }}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {/* 第二轮 2a：复习日历热力图（定位联动 + 一键复习） */}
      {calOpen && (
        <CalendarOverlay
          series={series}
          onClose={() => setCalOpen(false)}
          onLocate={(id) => {
            setCalOpen(false)
            setSelectedId(id)
            focusSeq.current += 1
            setFocusRequest({ id, seq: focusSeq.current })
          }}
          onOpenReview={() => { setCalOpen(false); setReviewOpen(true) }}
        />
      )}
      {/* 第三轮 3a：学习报告弹层 */}
      {statsOpen && (
        <StatsOverlay
          series={series}
          onClose={() => setStatsOpen(false)}
        />
      )}
      {/* 第一轮 1.5：轻提示（自动入列等规则可见化） */}
      {toast && (
        <div role="status" style={styles.toast} className="ct-toast-in">{toast}</div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  split: { display: 'flex', height: '100%', position: 'relative' },
  canvasCol: { flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column' },
  divider: { width: 6, cursor: 'col-resize', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', transition: 'background .15s' },
  dividerActive: { background: 'var(--ct-hover)' },
  dividerGrip: { width: 2, height: 40, borderRadius: 2, background: 'var(--ct-border-strong)' },
  sideCol: { flex: 'none', minWidth: SIDE_MIN, maxWidth: SIDE_MAX, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ct-panel)', borderLeft: '1px solid var(--ct-border)' },
  toast: { position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,26,26,.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', padding: '10px 18px', borderRadius: 'var(--ct-radius-sm)', fontSize: 13, boxShadow: 'var(--ct-shadow-4)', zIndex: 200, maxWidth: '80vw' },
}
