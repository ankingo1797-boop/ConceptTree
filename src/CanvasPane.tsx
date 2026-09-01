// 画布组件：概念树可视化
// 功能：卡片拖拽（坐标持久化）、缩放/平移/适应、迷你地图、父子/关联连线、
//       四态颜色、双击重命名、搜索定位、右键菜单、Ctrl多选批量、撤销/重做、复习过滤
import React from 'react'
import { dueCount, enroll, dueLabel } from './features/reviewScheduler.ts'
import type { Concept, ConceptStatus, DragState, Edge, HistoryEntry, Position, Series } from './types'
import { computeFly, computeVisibleIds, sameMembers, wheelZoomFactor, zoomAtPoint, type FlyIntent } from './viewport'
import { ancestorIds, childIds, hiddenCount, visibleConceptIds } from './features/collapse'
import { computeTreeLayout } from './features/treeLayout'
import { IconPlus, IconMinus, IconFit, IconClock, IconGrid, IconHand, IconUndo, IconRedo, IconCheck, IconQuestion, IconTrash, IconLink, IconX, IconSparkle, IconBack } from './icons.tsx'
import { ConfirmModal, Modal } from './ui.tsx'
import FancySelect from './components/FancySelect.tsx'
import FlipCountdown from './components/FlipCountdown.tsx'
import { STATUS_META } from './features/status.ts'

interface CanvasPaneProps {
  series: Series
  rootConceptId?: string
  onSelectConcept?: (id: string | null) => void
  onUpdateConcept: (id: string, patch: Partial<Concept>) => void
  onAddConcept: (concept: Partial<Concept> & { name: string; parentId?: string | null }) => string | void
  /** 第二轮 1.7：支持批量删除（撤销以快照为单位） */
  onDeleteConcept: (id: string | string[]) => void
  onAddEdge: (edge: Omit<Edge, 'id'>) => void
  onRemoveEdge?: (edgeId: string) => void
  onOpenReview?: () => void
  /** 第一轮 C：外部定位请求（候选入树后聚焦新卡），seq 变化触发动画 */
  focusRequest?: { id: string; seq: number } | null
  /** 第二轮 1.7 反馈 #4：撤销/重做栈在父级统一管理（字段级 + 结构快照一条时间线） */
  onHistoryEntry?: (e: HistoryEntry) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  /** 第二轮 2.9 反馈 #2：AI 层级分析（父级执行），完成后请求切回自动布局 */
  onAnalyzeHierarchy?: () => void
  autoLayoutRequest?: number
  /** 第二轮 3.9 反馈 #8：返回系列管理 */
  onBackToSeries?: () => void
}

type LayoutMode = 'auto' | 'manual'
type StatusFilter = 'all' | ConceptStatus

interface MenuState { x: number; y: number; conceptId: string }
interface HoverState { id: string; x: number; y: number }

export default function CanvasPane({ series, rootConceptId, onSelectConcept, onUpdateConcept, onAddConcept, onDeleteConcept, onAddEdge, onRemoveEdge, onOpenReview, focusRequest, onHistoryEntry, onUndo, onRedo, canUndo, canRedo, onAnalyzeHierarchy, autoLayoutRequest, onBackToSeries }: CanvasPaneProps) {
  const [scale, setScale] = React.useState<number>(1)
  const [pan, setPan] = React.useState<Position>({ x: 0, y: 0 })
  const [layout, setLayout] = React.useState<LayoutMode>('auto')
  const [dragging, setDragging] = React.useState<DragState | null>(null)
  const [linkFrom, setLinkFrom] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [multi, setMulti] = React.useState<Set<string>>(new Set())
  const [menu, setMenu] = React.useState<MenuState | null>(null)
  const [selectedEdge, setSelectedEdge] = React.useState<string | null>(null) // 第一轮 1.5：选中的连线（点击后可删除）
  const [isPanning, setIsPanning] = React.useState(false)
  const panDragRef = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [renameId, setRenameId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [searchMsg, setSearchMsg] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [hover, setHover] = React.useState<HoverState | null>(null)  // 悬停卡片 {id, x, y}（第九轮：恢复悬浮浮层）
  // 第五轮 A：子树折叠（状态只存本机，按系列隔离）
  const collapseKey = `ct-collapsed-${series?.id || 'default'}`
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(collapseKey)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  const persistCollapsed = (next: Set<string>) => {
    setCollapsedIds(next)
    try { localStorage.setItem(collapseKey, JSON.stringify([...next])) } catch { /* ignore */ }
  }
  const toggleCollapse = (id: string) => {
    const next = new Set(collapsedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    persistCollapsed(next)
  }
  // 切换系列时重载该系列的折叠状态
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey)
      setCollapsedIds(raw ? new Set(JSON.parse(raw) as string[]) : new Set())
    } catch { setCollapsedIds(new Set()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseKey])
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasElRef = React.useRef<HTMLDivElement | null>(null)
  const dragRef = React.useRef<DragState | null>(null)  // 当前拖拽状态（避免闭包过期）
  const [viewport, setViewport] = React.useState({ w: 800, h: 500 })

  const concepts: Record<string, Concept> = series?.concepts || {}
  const edges: Edge[] = series?.edges || []
  // 第五轮 A：折叠后可见性过滤（listAll/小地图/布局共用）
  const collapseVisible = React.useMemo(
    () => visibleConceptIds(concepts, edges, [...collapsedIds]),
    [concepts, edges, collapsedIds],
  )
  const listAll: Concept[] = Object.values(concepts).filter((c) => collapseVisible.has(c.id))
  const list: Concept[] = statusFilter === 'all' ? listAll : listAll.filter((c) => c.status === statusFilter)
  const due = dueCount(series) // 第一轮 A：到期复习数（工具栏呼吸灯）

  // ---- 第一轮 C：自动布局切换的 FLIP 位移过渡 ----
  const [, setFlipTick] = React.useState(0)
  const flippingRef = React.useRef(false)
  const switchLayout = (mode: LayoutMode) => {
    if (mode === layout) return
    if (mode === 'auto') {
      flippingRef.current = true
      setFlipTick((t) => t + 1)
      window.setTimeout(() => { flippingRef.current = false; setFlipTick((t) => t + 1) }, 340)
    }
    setLayout(mode)
  }

  // ---- 第一轮 C：操作提示（可折叠，偏好持久化）----
  const [guideCollapsed, setGuideCollapsed] = React.useState(() => {
    try { return localStorage.getItem('ct-guide-collapsed') === '1' } catch { return false }
  })
  const toggleGuide = () => setGuideCollapsed((v) => {
    const next = !v
    try { localStorage.setItem('ct-guide-collapsed', next ? '1' : '0') } catch { /* 隐私模式 */ }
    return next
  })

  // ---- 撤销/重做（第二轮 1.7 反馈 #4：栈上移到父级，字段级条目从这里推入）----
  const pushHistory = (e: HistoryEntry) => { onHistoryEntry && onHistoryEntry(e) }

  // 第二轮 4.2 反馈 #1：删除确认改为应用内弹框（原生 confirm 会让 Electron 丢键盘焦点）
  const [confirmState, setConfirmState] = React.useState<null | { kind: 'concept'; id: string } | { kind: 'batch'; ids: string[] }>(null)
  // 第五轮 D：添加子概念输入弹框
  const [addChildFor, setAddChildFor] = React.useState<string | null>(null)
  const [childName, setChildName] = React.useState('')

  // ---- 多选 ----
  const toggleMulti = (id) => setMulti((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearMulti = () => setMulti(new Set())
  const batchSetStatus = (status) => {
    for (const id of multi) {
      const before = concepts[id]?.status
      if (before && before !== status) { pushHistory({ type: 'status', conceptId: id, before, after: status }); onUpdateConcept(id, { status }) }
    }
    clearMulti()
  }
  const batchDelete = () => {
    setConfirmState({ kind: 'batch', ids: Array.from(multi) })
  }

  // ---- 自动布局（第一轮 1.5 修复 #4：tidy-tree 纯函数，子树居中不重叠，见 treeLayout 单测）----
  // 第五轮 A：只排可见概念（折叠的子树不占位，布局更紧凑）
  const autoPos = React.useMemo(() => {
    if (layout !== 'auto') return null
    const visConcepts: Record<string, Concept> = {}
    for (const c of listAll) visConcepts[c.id] = c
    const visEdges = edges.filter((e) => visConcepts[e.from] && visConcepts[e.to])
    return computeTreeLayout(visConcepts, visEdges, rootConceptId)
  }, [listAll, edges, rootConceptId, layout])

  const posOf = (id: string): Position => {
    const c = concepts[id]
    if (layout === 'manual' && c && typeof c.x === 'number' && typeof c.y === 'number') return { x: c.x, y: c.y }
    if (autoPos && autoPos[id]) return autoPos[id]
    return { x: 80, y: 80 }
  }

  // 坐标：拖动中的卡片用实时坐标（连线/卡片跟随），否则用 posOf
  const dragPos = (id: string): Position => {
    const d = dragRef.current
    if (d && d.id === id && d.liveX !== undefined) return { x: d.liveX, y: d.liveY }
    return posOf(id)
  }

  // ---- 第一轮 C：屏外裁剪 + 集合相等守卫（小地图仍画全树）----
  const positions = React.useMemo(() => {
    const out: Record<string, Position> = {}
    for (const c of list) out[c.id] = dragPos(c.id)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, layout, autoPos, dragging])

  const rawVisible = React.useMemo(
    () => computeVisibleIds(positions, { pan, scale, vw: viewport.w, vh: viewport.h }),
    [positions, pan, scale, viewport.w, viewport.h],
  )
  const prevVisibleRef = React.useRef<string[]>([])
  const visibleIds = React.useMemo(() => {
    if (sameMembers(prevVisibleRef.current, rawVisible)) return prevVisibleRef.current // 成员未变 → 复用引用
    prevVisibleRef.current = rawVisible
    return rawVisible
  }, [rawVisible])
  const visibleSet = React.useMemo(() => new Set(visibleIds), [visibleIds])

  // ---- 视口 ----
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setViewport({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- 第一轮 C：视口命令层（flyTo 集中：动画、去重、可打断）----
  const scaleRef = React.useRef(scale)
  scaleRef.current = scale
  const panRef = React.useRef(pan)
  panRef.current = pan
  const animRef = React.useRef<number | null>(null)

  const cancelFly = () => {
    if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null }
  }

  const flyTo = (intent: FlyIntent) => {
    cancelFly() // 去重：新命令打断上一个动画（StarMap focusKey 语义）
    const to = computeFly({ scale: scaleRef.current, pan: panRef.current, vw: viewport.w, vh: viewport.h }, intent)
    // prefers-reduced-motion：直接落位
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScale(to.scale); setPan(to.pan)
      return
    }
    const fromScale = scaleRef.current
    const fromPan = panRef.current
    const t0 = performance.now()
    const D = 320
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / D)
      const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
      setScale(fromScale + (to.scale - fromScale) * e)
      setPan({ x: fromPan.x + (to.pan.x - fromPan.x) * e, y: fromPan.y + (to.pan.y - fromPan.y) * e })
      animRef.current = k < 1 ? requestAnimationFrame(step) : null
    }
    animRef.current = requestAnimationFrame(step)
  }

  React.useEffect(() => () => cancelFly(), [])

  // 外部定位请求：候选入树后聚焦新卡
  React.useEffect(() => {
    if (!focusRequest) return
    // 第五轮 A：目标被折叠藏住时，先展开其祖先链
    if (!collapseVisible.has(focusRequest.id)) {
      const toExpand = ancestorIds(concepts, edges, focusRequest.id).filter((a) => collapsedIds.has(a))
      if (toExpand.length > 0) {
        const next = new Set(collapsedIds)
        for (const a of toExpand) next.delete(a)
        persistCollapsed(next)
      }
    }
    // 第二轮 3.9 反馈 #10：手动布局下新概念没有坐标，用自动布局算出的位置飞行，保证可见
    let target = posOf(focusRequest.id)
    const c = concepts[focusRequest.id]
    if (layout === 'manual' && c && typeof c.x !== 'number' && typeof c.y !== 'number') {
      const auto = computeTreeLayout(concepts, edges, rootConceptId)
      if (auto[focusRequest.id]) target = auto[focusRequest.id]
    } else if (!collapseVisible.has(focusRequest.id)) {
      // 刚展开祖先：按"可见+目标链"即时算位，飞向重排后的位置
      const keep = new Set([...ancestorIds(concepts, edges, focusRequest.id), focusRequest.id])
      const vis: Record<string, Concept> = {}
      for (const cc of Object.values(concepts)) {
        if (collapseVisible.has(cc.id) || keep.has(cc.id)) vis[cc.id] = cc
      }
      const visEdges = edges.filter((e) => vis[e.from] && vis[e.to])
      const lay = computeTreeLayout(vis, visEdges, rootConceptId)
      if (lay[focusRequest.id]) target = lay[focusRequest.id]
    }
    flyTo({ kind: 'focus', target })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.seq])

  // 第二轮 2.9 反馈 #2：AI 层级应用后，父级请求切回自动布局
  React.useEffect(() => {
    if (autoLayoutRequest && autoLayoutRequest > 0) switchLayout('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLayoutRequest])

  // 第二轮 1.7 反馈 #2：滚轮缩放（原生监听，光标为锚点）
  React.useEffect(() => {
    const el = canvasElRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      cancelFly() // 用户滚轮打断飞行动画
      if (e.shiftKey) { setPan((p) => ({ x: p.x - e.deltaY, y: p.y })); return }
      const rect = el.getBoundingClientRect()
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = wheelZoomFactor(e.deltaY * (e.deltaMode === 1 ? 16 : 1))
      const next = zoomAtPoint(panRef.current, scaleRef.current, cursor, scaleRef.current * factor)
      setScale(next.scale); setPan(next.pan)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 交互 ----
  // 第二轮 1.7 反馈 #2：滚轮 = 以光标为中心缩放；平移交给拖拽（shift+滚轮 = 水平平移，触控板兼容）
  // 原生监听器：需要 passive:false 才能 preventDefault（滚轮不再滚动页面/父容器）
  const zoomAt = (f: number) => {
    const next = zoomAtPoint(panRef.current, scaleRef.current, { x: viewport.w / 2, y: viewport.h / 2 }, scaleRef.current * f)
    setScale(next.scale); setPan(next.pan)
  }

  // ---- 第一轮 1.5 修复：空白处左键拖拽 = 平移画布（反馈 #5）----
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    setMenu(null); setLinkFrom(null); setSelectedEdge(null)
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button,input,select,svg')) return // 控件/小地图点击不启动平移
    // 第二轮 3.9 反馈 #1：点空白处同时取消卡片选中
    if (selected !== null) { setSelected(null); onSelectConcept && onSelectConcept(null) }
    cancelFly()
    panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: panRef.current.x, origY: panRef.current.y }
    setIsPanning(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const d = panDragRef.current
    if (!d) return
    setPan({ x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) })
  }
  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (!panDragRef.current) return
    panDragRef.current = null
    setIsPanning(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const doSearch = () => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return
    const found = listAll.find((c) => c.name.toLowerCase().includes(term))
    if (!found) { setSearchMsg('未找到'); return }
    flyTo({ kind: 'focus', target: posOf(found.id) }) // 第一轮 C：搜索命中 → focus
    setSelected(found.id); setSearchMsg('已定位: ' + found.name)
    onSelectConcept && onSelectConcept(found.id)
  }

  // ---- 拖拽（setPointerCapture 修复"不脱离光标"） ----
  // 按下：捕获指针，后续 move/up 持续到达，松手释放 —— 拖到任何位置都能正确落点
  const onCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // 第二轮 2.9 反馈 #1：待连接状态下点卡片（非连接键）= 取消本次连接
    if (linkFrom) { setLinkFrom(null); return }
    cancelFly() // 拖拽打断飞行动画
    if (e.ctrlKey || e.metaKey || e.shiftKey) { toggleMulti(id); setSelected(id); onSelectConcept && onSelectConcept(id); return }
    const p = posOf(id)
    const state: DragState = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, liveX: p.x, liveY: p.y }
    dragRef.current = state
    setDragging(state)
    setSelected(id); clearMulti()
    onSelectConcept && onSelectConcept(id)
    // 捕获指针：保证在元素外也持续收到 move/up
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 某些场景不支持 */ }
  }
  const onCardPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    const next: DragState = { ...d, liveX: d.origX + dx, liveY: d.origY + dy }
    dragRef.current = next
    // 节流：仅当位移变化明显时才 setState（减少重渲染）
    if (Math.abs(next.liveX - d.liveX) > 0.5 || Math.abs(next.liveY - d.liveY) > 0.5) {
      setDragging(next)
    }
  }

  const startRename = (id: string) => { setRenameId(id); setRenameValue(concepts[id]?.name || '') }
  const commitRename = () => {
    if (renameId && renameValue.trim() && renameValue.trim() !== concepts[renameId]?.name) {
      pushHistory({ type: 'rename', conceptId: renameId, before: concepts[renameId]?.name, after: renameValue.trim() })
      onUpdateConcept(renameId, { name: renameValue.trim() })
    }
    setRenameId(null)
  }

  const onLinkHandleClick = (id: string) => {
    // 第二轮 2.9 反馈 #1：点击-点击建边（替代拖拽）
    if (linkFrom === null) { setLinkFrom(id); return }        // 第一步：开始连接
    if (linkFrom === id) { setLinkFrom(null); return }        // 再点同一卡片 = 取消
    onAddEdge({ from: linkFrom, to: id, type: 'related' })    // 第二步：完成连接
    setLinkFrom(null)
  }
  // 卡片松手：普通点击/拖拽结束（连线已改为点击-点击，不再走 pointerup）
  const onCardPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = d.liveX, dy = d.liveY
    if (layout !== 'manual') setLayout('manual')
    const moved = Math.abs(dx - d.origX) > 2 || Math.abs(dy - d.origY) > 2
    if (moved) pushHistory({ type: 'move', conceptId: d.id, before: { x: d.origX, y: d.origY }, after: { x: Math.round(dx), y: Math.round(dy) } })
    onUpdateConcept(d.id, { x: Math.round(dx), y: Math.round(dy) })
    dragRef.current = null
    setDragging(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  // 迷你地图
  const mini = React.useMemo(() => {
    if (listAll.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of listAll) { const p = posOf(c.id); minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
    const W = maxX - minX + 200, H = maxY - minY + 200
    const mw = 180, mh = 110
    return { k: Math.min(mw / W, mh / H), minX, minY, mw, mh }
  }, [listAll.length, layout, dragging, pan, scale])

  return (
    <div ref={containerRef} style={styles.canvasWrap}>
      {/* 第八轮（用户反馈）：工具栏保留顶部通栏条，功能按钮换成圆形光晕钮 */}
      <div style={styles.toolbar} onPointerDown={(e) => e.stopPropagation()}>
        {/* 第二轮 3.9 反馈 #8：返回系列管理 */}
        {onBackToSeries && (
          <button className="ct-orb ct-orb-pill" onClick={onBackToSeries} title="返回系列管理"><IconBack size={14} /> 系列</button>
        )}
        <span className="ct-toolbar-sep" />
        <button className="ct-orb" onClick={() => zoomAt(1.25)} title="放大" aria-label="放大"><IconPlus size={15} /></button>
        <button className="ct-orb" onClick={() => zoomAt(0.8)} title="缩小" aria-label="缩小"><IconMinus size={15} /></button>
        <button className="ct-orb ct-orb-pill" onClick={() => flyTo({ kind: 'overview', targets: listAll.map((c) => posOf(c.id)) })} title="缩放至全树可见"><IconFit size={14} /> 适应</button>
        <span className="ct-toolbar-sep" />
        {/* 第一轮 A：复习入口（N>0 呼吸灯，来源 StarMap 状态灯语义） */}
        <button
          className={`ct-orb ct-orb-pill${due > 0 ? ' ct-orb-due' : ''}`}
          onClick={() => onOpenReview && onOpenReview()}
          title={due > 0 ? `有 ${due} 个概念待复习` : '今天没有到期的复习'}>
          <IconClock size={14} /> 复习{due > 0 ? ' ' + due : ''}
        </button>
        <span className="ct-toolbar-sep" />
        <button className={`ct-orb ct-orb-pill${layout === 'auto' ? ' ct-orb-active' : ''}`} onClick={() => switchLayout('auto')} title="自动布局：按层级整齐排布"><IconGrid size={14} /> 自动布局</button>
        <button className={`ct-orb ct-orb-pill${layout === 'manual' ? ' ct-orb-active' : ''}`} onClick={() => switchLayout('manual')} title="手动布局：保留你拖放的位置"><IconHand size={14} /> 手动布局</button>
        {/* 第二轮 2.9 反馈 #2：AI 层级分析（应用可撤销） */}
        <button className="ct-orb ct-orb-pill" onClick={() => onAnalyzeHierarchy && onAnalyzeHierarchy()} title="让 AI 分析概念间的层级关系并自动重排（可撤销）"><IconSparkle size={14} /> AI 层级</button>
        <span className="ct-toolbar-sep" />
        <input className="ct-input" style={styles.searchInput} placeholder="搜索概念…" value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setSearchMsg(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }} />
        {searchMsg && <span style={styles.searchMsg}>{searchMsg}</span>}
        <FancySelect
          ariaLabel="状态过滤"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v as StatusFilter); clearMulti() }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'unlearned', label: '未学习' },
            { value: 'learning', label: '学习中' },
            { value: 'learned', label: '已掌握' },
            { value: 'doubtful', label: '存疑' },
          ]}
        />
        <span className="ct-toolbar-sep" />
        <button className="ct-orb" onClick={() => onUndo && onUndo()} disabled={!canUndo} title="撤销（移动/改名/状态/删除/新增）" aria-label="撤销"><IconUndo size={15} /></button>
        <button className="ct-orb" onClick={() => onRedo && onRedo()} disabled={!canRedo} title="重做" aria-label="重做"><IconRedo size={15} /></button>
        {multi.size > 0 && (
          <span style={styles.multiBar}>
            已选 {multi.size}:
            <button className="ct-orb ct-orb-pill" onClick={() => batchSetStatus('learned')}><IconCheck size={13} /> 已掌握</button>
            <button className="ct-orb ct-orb-pill" onClick={() => batchSetStatus('doubtful')}><IconQuestion size={13} /> 存疑</button>
            <button className="ct-orb ct-orb-pill" style={{ color: 'var(--ct-destructive)' }} onClick={batchDelete}><IconTrash size={13} /> 删除</button>
            <button className="ct-orb ct-orb-pill" onClick={clearMulti}>取消</button>
          </span>
        )}
      </div>

      {/* 画布区：无限画布（空白拖拽平移 + 滚轮缩放，第二轮 1.7 反馈 #2） */}
      <div ref={canvasElRef} className="ct-canvas-dots" style={{ ...styles.canvas, cursor: isPanning ? 'grabbing' : 'grab' }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}>
        <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', width: 20000, height: 20000 }}>
          {/* 连线（用实时坐标，拖动时连线跟随；overflow:visible 使负坐标/超界连线也可见） */}
          <svg data-testid="edge-layer" style={{ position: 'absolute', top: 0, left: 0, width: 20000, height: 20000, overflow: 'visible', pointerEvents: 'none' }}>
            {/* 第六轮反馈 #1：连线两端都必须可见才画（折叠后不再残留通向隐藏子节点的线） */}
            {edges.filter((e) => concepts[e.from] && concepts[e.to] && visibleSet.has(e.from) && visibleSet.has(e.to)).map((e) => {
              const from = dragPos(e.from), to = dragPos(e.to)
              if (!from || !to) return null
              const isParent = e.type === 'parent-child'
              const isSelEdge = selectedEdge === e.id
              const midX = (from.x + to.x) / 2
              const d = `M ${from.x + 90} ${from.y + 28} C ${midX} ${from.y + 28}, ${midX} ${to.y + 28}, ${to.x + 90} ${to.y + 28}`
              return (
                <g key={e.id}>
                  <path d={d} fill="none"
                    style={{ stroke: isSelEdge ? 'var(--ct-primary)' : (isParent ? 'var(--ct-edge-parent)' : 'var(--ct-edge-related)') }}
                    strokeWidth={isSelEdge ? 2.5 : (isParent ? 1.6 : 1.4)}
                    strokeDasharray={isParent ? undefined : '6 4'}
                    opacity={isSelEdge ? 1 : (isParent ? 0.8 : 0.75)} />
                  {/* 第一轮 1.5 修复：连线可点击选中（透明命中层），配合删除按钮（反馈 #3）；第二轮 1.7 反馈 #1：命中层 14→22px */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={22}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedEdge(e.id) }} />
                </g>
              )
            })}
          </svg>
          {/* 卡片（屏外裁剪：只渲染视口内；拖拽的卡片用实时坐标；move/up 绑定在卡片上 + pointer capture） */}
          {list.filter((c) => visibleSet.has(c.id)).map((c) => {
            const p = dragPos(c.id)
            const meta = STATUS_META[c.status] || STATUS_META.unlearned
            const isSel = selected === c.id
            return (
              <div key={c.id}
                className={[flippingRef.current ? 'ct-flip-pos' : '', 'ct-card', 'ct-glasscard', (isSel || multi.has(c.id) || linkFrom === c.id) ? 'ct-card-active' : ''].filter(Boolean).join(' ')}
                style={{ ...styles.card, position: 'absolute', left: p.x, top: p.y, boxShadow: linkFrom === c.id ? '0 0 0 2px rgba(0,117,222,.55), var(--ct-shadow-1)' : multi.has(c.id) ? '0 0 0 2px rgba(178,106,0,.35), var(--ct-shadow-1)' : (isSel ? '0 0 0 2px rgba(86,69,212,.35), var(--ct-shadow-1)' : undefined) }}
                onMouseEnter={(e) => setHover({ id: c.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                onPointerDown={(e) => onCardPointerDown(e, c.id)}
                onPointerMove={(e) => onCardPointerMove(e)}
                onPointerUp={(e) => onCardPointerUp(e)}
                onDoubleClick={(e) => { e.stopPropagation(); startRename(c.id) }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelected(c.id); setMenu({ x: e.clientX, y: e.clientY, conceptId: c.id }) }}>
                {/* 第十轮：连接键改为右上角绝对定位，标题居中排版 */}
                <button style={{ ...styles.linkHandle, position: 'absolute', top: 6, right: 6, ...(linkFrom === c.id ? styles.linkHandleActive : {}) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onLinkHandleClick(c.id) }}
                  title={linkFrom === c.id ? '再次点击取消连接' : '连接：点击后再点另一卡片的连接键'}><IconLink size={15} /></button>
                <div style={styles.cardHeader}>
                  {renameId === c.id
                    ? <input style={styles.renameInput} value={renameValue} autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameId(null) }}
                        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />
                    : <span style={{ ...styles.cardTitle, color: meta.color }}>{c.name}</span>}
                </div>
                {c.summary && <div style={styles.cardSummary}>{c.summary}</div>}
                {/* 第十二轮：底部标签条 = 状态色点（无文字）+ 翻页倒计时 + 折叠钮 */}
                <div style={styles.cardFooter}>
                  <span style={{ ...styles.cardStatusDot, background: meta.border }} title={meta.label} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.review?.dueAt && (() => {
                      const d = Math.ceil((new Date(c.review.dueAt).getTime() - Date.now()) / 86400000)
                      return d <= 0 ? <FlipCountdown overdue={-d} /> : <FlipCountdown days={d} />
                    })()}
                    {childIds(edges, c.id).length > 0 && (
                      <button
                        style={styles.collapseBtn}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); toggleCollapse(c.id) }}
                        title={collapsedIds.has(c.id) ? '展开子树' : '收起子树'}>
                        {collapsedIds.has(c.id) ? `▸ ${hiddenCount(concepts, edges, c.id)}` : '▾'}
                      </button>
                    )}
                  </span>
                </div>
                {collapsedIds.has(c.id) && <span style={styles.collapseBadge}>+{hiddenCount(concepts, edges, c.id)}</span>}
              </div>
            )
          })}
          {listAll.length === 0 && <div style={styles.emptyHint}>本系列还没有概念。在右侧「对话」页与 AI 对话，候选概念会自动出现；或先手动添加。</div>}
          {/* 第一轮 1.5 修复：选中连线后在中点显示删除按钮（反馈 #3） */}
          {selectedEdge && (() => {
            const e = edges.find((x) => x.id === selectedEdge)
            if (!e) return null
            const from = dragPos(e.from), to = dragPos(e.to)
            if (!from || !to) return null
            const mx = (from.x + to.x) / 2 + 90, my = (from.y + to.y) / 2 + 28
            return (
              <button
                style={{ position: 'absolute', left: mx - 18, top: my - 18, width: 36, height: 36, borderRadius: 999, border: '1px solid var(--ct-destructive)', background: 'var(--ct-panel)', color: 'var(--ct-destructive)', cursor: 'pointer', fontSize: 15, lineHeight: 1, boxShadow: 'var(--ct-shadow-2)', zIndex: 5, padding: 0 }}
                title="删除这条连线"
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => { ev.stopPropagation(); if (onRemoveEdge) onRemoveEdge(selectedEdge); setSelectedEdge(null) }}>
                ✕
              </button>
            )
          })()}
        </div>

        {/* 第二轮 2.9 反馈 #1：待连接提示条（源卡片高亮，点别处取消） */}
        {linkFrom && concepts[linkFrom] && (
          <div style={styles.linkHint} role="status">
            正在从「{concepts[linkFrom].name}」连线：点击目标卡片的 <IconLink size={12} /> 连接键；点击其他地方取消
          </div>
        )}

        {/* 迷你地图 */}
        {mini && listAll.length > 0 && (
          <div style={styles.minimap}>
            <div style={styles.minimapTitle}>全树</div>
            <svg style={{ width: mini.mw, height: mini.mh, cursor: 'pointer' }}
              onClick={(e) => {
                // 第一轮 C：小地图点击 → 平移居中（保持缩放）
                const rect = e.currentTarget.getBoundingClientRect()
                const wx = (e.clientX - rect.left) / mini.k + mini.minX - 100
                const wy = (e.clientY - rect.top) / mini.k + mini.minY - 100
                flyTo({ kind: 'pan-to', target: { x: wx, y: wy } })
              }}>
              {edges.map((e) => {
                // 第二轮 1.7 反馈 #3：端点概念不存在时不画（删除后不留残影）
                if (!concepts[e.from] || !concepts[e.to]) return null
                const from = posOf(e.from), to = posOf(e.to)
                return <line key={'m' + e.id} x1={(from.x - mini.minX + 100) * mini.k} y1={(from.y - mini.minY + 100) * mini.k} x2={(to.x - mini.minX + 100) * mini.k} y2={(to.y - mini.minY + 100) * mini.k} stroke="var(--ct-map-line)" strokeWidth={0.6} />
              })}
              {listAll.map((c) => { const p = posOf(c.id); return <circle key={'mc' + c.id} cx={(p.x - mini.minX + 100) * mini.k} cy={(p.y - mini.minY + 100) * mini.k} r={3} fill={STATUS_META[c.status]?.border || 'var(--ct-map-line)'} /> })}
            </svg>
          </div>
        )}

        {/* 第一轮 C：操作提示（可折叠、偏好持久化；与迷你地图叠放右下角） */}
        <div style={{ ...styles.guide, bottom: mini && listAll.length > 0 ? 152 : 12 }}>
          {guideCollapsed ? (
            <button style={styles.guideToggle} onClick={toggleGuide} title="展开操作提示"><IconQuestion size={15} /></button>
          ) : (
            <>
              <span style={styles.guideText}>拖空白处平移 · 滚轮缩放 · 拖卡片移动 · 点 <IconLink size={11} /> 两次建边 · 双击改名 · 点连线可删除</span>
              <button style={styles.guideToggle} onClick={toggleGuide} title="收起操作提示"><IconX size={14} /></button>
            </>
          )}
        </div>

        {/* 第九轮反馈 #4：恢复悬浮浮层（玻璃质感 + 不遮挡点击 pointer-events:none） */}
        {hover && concepts[hover.id] && (
          <div style={{ position: 'fixed', left: Math.min(hover.x + 12, window.innerWidth - 250), top: Math.min(hover.y + 12, window.innerHeight - 150), zIndex: 90, ...styles.hoverCard }}>
            <div style={styles.hoverName}>{concepts[hover.id].name}</div>
            <div style={styles.hoverMeta}>状态: {STATUS_META[concepts[hover.id].status]?.label || concepts[hover.id].status}</div>
            {concepts[hover.id].review && <div style={styles.hoverReview}>⏰ 复习中 · {dueLabel(concepts[hover.id].review!.dueAt)}</div>}
            {concepts[hover.id].summary && <div style={styles.hoverSummary}>{concepts[hover.id].summary}</div>}
            {concepts[hover.id].notes && <div style={styles.hoverNotes}>{concepts[hover.id].notes}</div>}
            {concepts[hover.id].candidates?.length > 0 && <div style={styles.hoverCand}>候选概念: {concepts[hover.id].candidates.join('、')}</div>}
            {concepts[hover.id].history?.length > 0 && <div style={styles.hoverHistory}>对话 {concepts[hover.id].history.length} 条</div>}
          </div>
        )}

        {/* 右键菜单（pointerdown 阻止冒泡，避免画布先清菜单导致 click 失效） */}
        {menu && (
          <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 100, ...styles.menu }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}>
            <MenuItem label="📖 查看/对话" onClick={() => { onSelectConcept && onSelectConcept(menu.conceptId); setMenu(null) }} />
            <div style={styles.menuDivider} />
            <div style={styles.menuLabel}>状态</div>
            {(Object.keys(STATUS_META) as ConceptStatus[]).map((s) => (
              <MenuItem key={s} label={(concepts[menu.conceptId]?.status === s ? '● ' : '○ ') + STATUS_META[s].label} onClick={() => {
                const before = concepts[menu.conceptId]?.status
                if (before && before !== s) pushHistory({ type: 'status', conceptId: menu.conceptId, before, after: s })
                onUpdateConcept(menu.conceptId, { status: s }); setMenu(null)
              }} />
            ))}
            <div style={styles.menuDivider} />
            {/* 第一轮 A：手动入列 / 出列复习 */}
            <MenuItem
              label={concepts[menu.conceptId]?.review ? '⏰ 移出复习' : '⏰ 加入复习'}
              onClick={() => {
                const c = concepts[menu.conceptId]
                if (c) onUpdateConcept(menu.conceptId, c.review ? { review: undefined } : { review: enroll() })
                setMenu(null)
              }} />
            <div style={styles.menuDivider} />
            {/* 第五轮 D：添加子概念改应用内弹框（原生 prompt 清零收尾） */}
            <MenuItem label="➕ 添加子概念" onClick={() => {
              setAddChildFor(menu.conceptId)
              setChildName('')
              setMenu(null)
            }} />
            <MenuItem label="🗑 删除概念" danger onClick={() => { setConfirmState({ kind: 'concept', id: menu.conceptId }); setMenu(null) }} />
          </div>
        )}

        {/* 第五轮 D：添加子概念输入弹框 */}
        {addChildFor && concepts[addChildFor] && (
          <Modal title={`给「${concepts[addChildFor].name}」添加子概念`} onClose={() => setAddChildFor(null)}>
            <input
              className="ct-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              autoFocus
              placeholder="概念名称（回车确认）"
              aria-label="子概念名称"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && childName.trim()) {
                  onAddConcept({ name: childName.trim(), parentId: addChildFor, status: 'unlearned' })
                  setAddChildFor(null)
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="ct-btn" onClick={() => setAddChildFor(null)}>取消</button>
              <button className="ct-btn ct-btn-primary" disabled={!childName.trim()}
                onClick={() => { onAddConcept({ name: childName.trim(), parentId: addChildFor, status: 'unlearned' }); setAddChildFor(null) }}>
                添加
              </button>
            </div>
          </Modal>
        )}

        {/* 第二轮 4.2 反馈 #1：应用内删除确认（替代原生 confirm，避免 Electron 键盘焦点丢失） */}
        {confirmState && (
          <ConfirmModal
            title={confirmState.kind === 'batch' ? `删除选中的 ${confirmState.ids.length} 个概念？` : '删除该概念及其连线？'}
            message="删除后可以用工具栏 ↩ 撤销恢复。"
            confirmLabel="删除"
            danger
            onCancel={() => setConfirmState(null)}
            onConfirm={() => {
              if (confirmState.kind === 'concept') onDeleteConcept(confirmState.id)
              else { onDeleteConcept(confirmState.ids); clearMulti() }
              setConfirmState(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function MenuItem({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button className="ct-menu-item" style={{ ...styles.menuItem, ...(danger ? styles.menuItemDanger : {}) }} onClick={onClick}>{label}</button>
}

const styles: Record<string, React.CSSProperties> = {
  canvasWrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--ct-panel)' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--ct-border)', background: 'var(--ct-glass-bg)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', flexWrap: 'wrap', rowGap: 6 },
  canvas: { flex: 1, minHeight: 0, position: 'relative', cursor: 'grab', touchAction: 'none', overflow: 'hidden' },
  searchInput: { padding: '5px 10px', fontSize: 12, width: 130, borderRadius: 9, background: 'var(--ct-surface-soft)' },
  searchMsg: { fontSize: 12, color: 'var(--ct-link)', whiteSpace: 'nowrap' },
  multiBar: { display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px', borderRadius: 999, background: 'var(--ct-tint-lavender)', fontSize: 12, color: 'var(--ct-primary)', border: '1px solid var(--ct-primary-soft)', whiteSpace: 'nowrap' },
  card: { width: 180, padding: '12px 12px 0', cursor: 'grab', userSelect: 'none', zIndex: 2 },
  cardHeader: { display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6, gap: 6, padding: '0 20px', minHeight: 22 },
  cardTitle: { fontWeight: 600, fontSize: 14, wordBreak: 'break-word', color: 'var(--ct-fg)', textAlign: 'center' },
  renameInput: { width: '100%', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--ct-primary)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(86,69,212,.12)', outline: 'none', fontFamily: 'inherit' },
  linkHandle: { cursor: 'pointer', background: 'transparent', border: 'none', fontSize: 13, padding: 7, color: 'var(--ct-fg-muted)', borderRadius: 6, lineHeight: 0 },
  linkHandleActive: { color: 'var(--ct-link)', background: 'var(--ct-st-learning-bg)' },
  linkHint: { position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 29, background: 'var(--ct-glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--ct-glass-border)', borderRadius: 999, padding: '6px 14px', fontSize: 12, color: 'var(--ct-fg)', boxShadow: 'var(--ct-shadow-1)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
  cardSummary: { fontSize: 12, color: 'var(--ct-fg-secondary)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, textAlign: 'center' },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, fontSize: 11, margin: '0 -12px', padding: '6px 12px', background: 'var(--ct-card-band)', borderTop: '1px solid var(--ct-card-glass-border)', borderRadius: '0 0 9px 9px' },
  cardStatusDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  // 第五轮 A：折叠钮与角标
  collapseBtn: { cursor: 'pointer', border: 'none', background: 'transparent', borderRadius: 6, fontSize: 11, color: 'var(--ct-fg-tertiary)', padding: '1px 4px', fontFamily: 'inherit', transition: 'color .15s ease' },
  collapseBadge: { position: 'absolute', top: -8, right: -8, minWidth: 22, height: 18, borderRadius: 999, background: 'var(--ct-primary)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', boxShadow: 'var(--ct-shadow-1)' },
  emptyHint: { position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--ct-fg-tertiary)', fontSize: 14, textAlign: 'center', width: '70%', lineHeight: 1.7 },
  minimap: { position: 'absolute', right: 12, bottom: 12, background: 'var(--ct-glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--ct-glass-border)', borderRadius: 12, padding: 8, zIndex: 10, boxShadow: 'var(--ct-shadow-2)' },
  guide: { position: 'absolute', right: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ct-glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--ct-glass-border)', borderRadius: 999, padding: '6px 12px', zIndex: 10, boxShadow: 'var(--ct-shadow-1)' },
  guideText: { fontSize: 11, color: 'var(--ct-fg-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 3 },
  guideToggle: { cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 12, color: 'var(--ct-fg-tertiary)', padding: 2, borderRadius: 6, display: 'inline-flex', alignItems: 'center', lineHeight: 0 },
  minimapTitle: { fontSize: 10, color: 'var(--ct-fg-muted)', marginBottom: 4, letterSpacing: '.05em' },
  menu: { background: 'var(--ct-glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--ct-glass-border)', borderRadius: 12, boxShadow: 'var(--ct-shadow-2)', padding: 6, minWidth: 170 },
  menuItem: { display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 'var(--ct-radius-sm)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--ct-fg)', transition: 'background .12s ease' },
  menuItemDanger: { color: 'var(--ct-destructive)' },
  menuLabel: { fontSize: 11, color: 'var(--ct-fg-muted)', padding: '4px 10px 2px' },
  menuDivider: { borderTop: '1px solid var(--ct-border-soft)', margin: '4px 0' },
  hoverCard: { background: 'var(--ct-glass-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--ct-glass-border)', borderRadius: 12, boxShadow: 'var(--ct-shadow-2)', padding: '10px 12px', width: 230, pointerEvents: 'none' },
  hoverName: { fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--ct-fg)' },
  hoverMeta: { fontSize: 11, color: 'var(--ct-fg-tertiary)', marginBottom: 4 },
  hoverReview: { fontSize: 11, color: 'var(--ct-primary)', marginBottom: 4 },
  hoverSummary: { fontSize: 12, color: 'var(--ct-fg)', lineHeight: 1.5, marginBottom: 4 },
  hoverNotes: { fontSize: 12, color: 'var(--ct-st-doubtful)', lineHeight: 1.5, marginBottom: 2 },
  hoverCand: { fontSize: 11, color: 'var(--ct-link)', lineHeight: 1.5, marginTop: 2 },
  hoverHistory: { fontSize: 11, color: 'var(--ct-fg-muted)', marginTop: 2 },
}
