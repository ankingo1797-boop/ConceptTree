// 系列管理页（顶级入口）
import React from 'react'
import { loadData, saveData } from './api.ts'
import ConceptTreeView from './ConceptTreeView.tsx'
import { useSave } from './SaveContext.tsx'
import { IconTree, IconDownload, IconTrash, IconNote } from './icons.tsx'
import { ConfirmModal, ResolvedDarkContext } from './ui.tsx'
import { seriesToMarkdown } from './features/exportMarkdown.ts'
import { uid } from './features/uid.ts'
import BorderGlow from './components/BorderGlow.tsx'
import type { Concept, ConceptTreeData, Series } from './types'

interface SeriesPageProps {
  model?: string
  /** 第二轮 3.9 反馈 #2：打开的系列由 App 持有（进设置返回后不丢现场） */
  openId?: string | null
  onOpenId?: (id: string | null) => void
  /** 第二轮 2a/2b：向顶栏上报当前打开的系列（决定日历按钮/全局搜索显隐） */
  onSeriesOpen?: (series: import('./types').Series | null) => void
  /** 第二轮 2a：顶栏日历按钮请求（序号递增 → 打开日历弹层） */
  calendarRequest?: number
  /** 第三轮 3a：顶栏统计按钮请求（序号递增 → 打开学习报告弹层） */
  statsRequest?: number
  /** 第二轮 2b：顶栏全局搜索的定位请求 */
  locateRequest?: { id: string; seq: number } | null
  /** 第十三轮：开场动画进行中，隐藏 hero 大字 logo 与标语，落定后淡入 */
  introActive?: boolean
}

export default function SeriesPage({ model, openId = null, onOpenId, onSeriesOpen, calendarRequest, statsRequest, locateRequest, introActive = false }: SeriesPageProps) {
  const [data, setData] = React.useState<ConceptTreeData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  // 第九轮反馈 #2：边缘光辉颜色随主题（深底浅光 / 浅底深光）
  const dark = React.useContext(ResolvedDarkContext)

  // 第十一轮：系列级到期信息（翻页倒计时数据源）
  const dueInfoOf = (s: Series) => {
    const now = new Date()
    let dueToday = 0
    let nextDays: number | null = null
    for (const c of Object.values(s.concepts || {})) {
      if (!c.review?.dueAt) continue
      const d = Math.ceil((new Date(c.review.dueAt).getTime() - now.getTime()) / 86400000)
      if (d <= 0) dueToday += 1
      else nextDays = nextDays === null ? d : Math.min(nextDays, d)
    }
    if (dueToday === 0 && nextDays === null) return null
    return { dueToday, days: nextDays ?? 0 }
  }
  const setOpenId = React.useCallback((id: string | null) => { onOpenId && onOpenId(id) }, [onOpenId])
  const { run } = useSave()

  // 第二轮 2a/2b：当前打开系列上报（顶栏日历按钮与全局搜索）
  React.useEffect(() => {
    onSeriesOpen && onSeriesOpen(openId && data ? data.series[openId] : null)
  }, [openId, data]) // eslint-disable-line react-hooks/exhaustive-deps

  // 加载数据
  const refresh = React.useCallback(() => {
    loadData().then(setData).catch((e) => setError(e.message))
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  // 恢复备份后外部通知重载（设置页「数据与备份」派发）
  React.useEffect(() => {
    const h = () => refresh()
    window.addEventListener('ct-data-changed', h)
    return () => window.removeEventListener('ct-data-changed', h)
  }, [refresh])

  // 保存数据（所有修改后调用；经 saveStatus 状态机）
  const persist = React.useCallback((next) => {
    setData(next)
    return run(() => saveData(next))
  }, [run])

  // ---- 系列操作 ----
  // 第二轮 4.2 反馈 #1：删除确认改为应用内弹框
  // （4.1 曾用 window.focus() 补救，但原生 confirm 仍会让 Electron 渲染进程丢键盘焦点；
  //   应用内弹框焦点不离开页面，根治"删除后输入失灵"）
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  // 第六轮反馈 #2：导出完成轻提示（告知文件名与保存位置）
  const [notice, setNotice] = React.useState<string | null>(null)
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNotice = (msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }

  const createSeries = () => {
    if (!name.trim()) return
    const next = { ...data, series: { ...data.series } }
    const id = uid('s')
    const ts = new Date().toISOString()
    // 第二轮 4.1 反馈 #2：创建系列即播种同名根概念，画布开箱即有一张卡
    const rootId = uid('c')
    const concepts = {
      [rootId]: {
        id: rootId, name: name.trim(), summary: '', parentId: null, sessionId: null,
        status: 'unlearned' as const, x: null, y: null, notes: '', history: [], candidates: [],
        createdAt: ts, updatedAt: ts,
      },
    }
    next.series[id] = { id, name: name.trim(), rootConceptId: rootId, createdAt: ts, updatedAt: ts, concepts, edges: [] }
    persist(next).then(() => { setName(''); setOpenId(id) })
  }

  const deleteSeries = (id) => {
    const next = { ...data, series: { ...data.series } }
    delete next.series[id]
    persist(next)
  }

  const exportSeries = (id) => {
    const s = data.series[id]
    const payload = { format: 'dsh-concept-tree', version: 1, series: { id: s.id, name: s.name, rootConceptId: s.rootConceptId, concepts: s.concepts, edges: s.edges } }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const file = `concept-tree-${s.name}.json`
    a.href = url; a.download = file; a.click()
    URL.revokeObjectURL(url)
    showNotice(`已导出「${file}」，请查看系统「下载」文件夹`)
  }

  // 第五轮 B：学习成果 Markdown 导出（结构+总结+笔记+复习概览）
  const exportMarkdownFile = (id) => {
    const s = data.series[id]
    const md = seriesToMarkdown(s)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const file = `${s.name}-学习树.md`
    a.href = url; a.download = file; a.click()
    URL.revokeObjectURL(url)
    // 第六轮反馈 #2：明确告知导出位置（桌面端统一保存到系统「下载」）
    showNotice(`已导出「${file}」，请查看系统「下载」文件夹`)
  }

  const importSeries = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const payload = JSON.parse(String(reader.result))
          if (!payload.series) throw new Error('不是有效的概念树文件')
          const next = { ...data, series: { ...data.series } }
          const ts = new Date().toISOString()
          // 合并：同名系列合并概念，否则新建
          let target = Object.values(next.series).find((s) => s.name === payload.series.name)
          if (!target) {
            const id = uid('s')
            target = { id, name: payload.series.name, rootConceptId: null, createdAt: ts, updatedAt: ts, concepts: {}, edges: [] }
            next.series[id] = target
          }
          const idMap: Record<string, string> = {}
          for (const [cid, c] of Object.entries(payload.series.concepts || {}) as [string, Concept][]) {
            const dup = Object.values(target.concepts).find((tc) => tc.name === c.name)
            if (dup) { idMap[cid] = dup.id; continue }
            const nid = uid('c')
            target.concepts[nid] = { id: nid, name: c.name, summary: c.summary || '', parentId: null, sessionId: null, status: (c.status || 'unlearned') as Concept['status'], x: c.x ?? null, y: c.y ?? null, notes: c.notes || '', createdAt: c.createdAt || ts, updatedAt: ts, history: c.history || [], candidates: c.candidates || [] }
            idMap[cid] = nid
          }
          for (const e of payload.series.edges || []) {
            const from = idMap[e.from], to = idMap[e.to]
            if (!from || !to) continue
            if (!target.edges.find((te) => te.from === from && te.to === to && te.type === e.type)) {
              target.edges.push({ id: uid('e'), from, to, type: e.type })
            }
          }
          if (!target.rootConceptId) target.rootConceptId = idMap[payload.series.rootConceptId] || null
          persist(next).then(() => setOpenId(target.id))
        } catch (e) { setError('导入失败: ' + e.message) }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  if (openId && data) {
    return <ConceptTreeView
      series={data.series[openId]}
      model={model}
      onChange={(updated) => {
        const next = { ...data, series: { ...data.series, [openId]: updated } }
        persist(next)
      }}
      onBack={() => setOpenId(null)}
      calendarRequest={calendarRequest}
      statsRequest={statsRequest}
      locateRequest={locateRequest}
    />
  }

  if (data === null) return <div style={styles.hint}>加载中…</div>

  const seriesList = Object.values(data.series).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  return (
    <div style={styles.page}>
      {/* 第十一轮：主页 = 发光 logo + 一行标语（用户指定文案），去掉「系列管理」大字 */}
      {/* 第十三轮：开场动画期间 hero 隐藏（introActive），落定后淡入 */}
      <div style={{ ...styles.homeHero, opacity: introActive ? 0 : 1, transition: 'opacity .4s ease' }}>
        <img id="ct-hero-logo" src="/logo.png" alt="概念学习树" className={dark ? 'ct-logo-glow-dark' : 'ct-logo-glow-light'} style={{ width: 104, height: 104 }} />
        <div style={styles.homeTag}>每一棵树，都是一段学习旅程</div>
      </div>
      <div style={{ ...styles.newRow, marginTop: 16 }}>
        <input
          className="ct-input"
          style={{ flex: 1, minWidth: 0, fontSize: 14, padding: '10px 14px' }}
          placeholder="系列名称，如：机器学习"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createSeries() }}
        />
        {/* 第十一轮：创建按钮与「导入」同款（去掉渐变主按钮） */}
        <button className="ct-btn" style={{ padding: '9px 20px' }} onClick={createSeries} disabled={!name.trim()}>创建</button>
        <button className="ct-btn" style={{ padding: '9px 16px' }} onClick={importSeries}>导入</button>
      </div>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.seriesList}>
        {seriesList.length === 0
          ? <div style={styles.hint}>还没有系列。输入名称创建你的第一棵概念树。</div>
          : seriesList.map((s, i) => {
            const di = dueInfoOf(s)
            return (
              <div key={s.id} className="ct-rise" style={{ ...styles.seriesRow, animationDelay: `${Math.min(i * 60, 420)}ms` }}>
                {/* 第十一轮：边缘光辉参数改按用户素材文件（edgeSensitivity 50 / glowRadius 45 / coneSpread 25） */}
                <BorderGlow className="ct-glow-glass ct-glow-wrap" backgroundColor="var(--ct-glass-bg)" borderRadius={12} glowRadius={45} edgeSensitivity={50} glowIntensity={1} coneSpread={25} glowColor="40 80 80" colors={['#c084fc', '#f472b6', '#38bdf8']}>
                <div className="ct-series-spot" style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                  <button style={styles.seriesCard} onClick={() => setOpenId(s.id)}>
                    <div style={styles.seriesName}>
                      <span style={styles.seriesDot} aria-hidden="true"><IconTree size={15} /></span>
                      {s.name}
                    </div>
                    {/* 第十二轮：翻页倒计时移到画布概念卡；系列卡只留克制的 meta 文本 */}
                    <div style={styles.seriesMeta}>{Object.keys(s.concepts || {}).length} 概念 · {relativeTime(s.updatedAt)}{di && di.dueToday > 0 ? ` · ${di.dueToday} 个今天到期` : ''}</div>
                  </button>
                </div>
                </BorderGlow>
                <button className="ct-btn" style={styles.miniBtn} onClick={() => exportMarkdownFile(s.id)} title="导出 Markdown 学习笔记"><IconNote size={14} /></button>
                <button className="ct-btn" style={styles.miniBtn} onClick={() => exportSeries(s.id)} title="导出 JSON（备份/迁移）"><IconDownload size={14} /></button>
                <button className="ct-btn ct-btn-danger" style={styles.miniBtn} onClick={() => setConfirmDeleteId(s.id)} title="删除"><IconTrash size={14} /></button>
              </div>
            )
          })
        }
      </div>

      {/* 第二轮 4.2 反馈 #1：应用内删除确认（替代原生 confirm，避免 Electron 键盘焦点丢失） */}
      {confirmDeleteId && data.series[confirmDeleteId] && (
        <ConfirmModal
          title={`删除系列「${data.series[confirmDeleteId].name}」？`}
          message="该系列及其所有概念、连线都会被删除，此操作不可撤销。"
          confirmLabel="删除"
          danger
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); deleteSeries(id) }}
        />
      )}

      {/* 第六轮反馈 #2：导出完成轻提示 */}
      {notice && <div role="status" style={styles.notice} className="ct-toast-in">{notice}</div>}
    </div>
  )
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 30) return d + ' 天前'
  return new Date(iso).toLocaleDateString()
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: '36px 24px 24px' },
  homeHero: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '8px 0 4px' },
  homeTag: { fontSize: 14, color: 'var(--ct-fg-secondary)', letterSpacing: '0.08em' },
  newRow: { display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  error: { color: 'var(--ct-destructive)', padding: '8px 0', fontSize: 13 },
  hint: { color: 'var(--ct-fg-tertiary)', padding: 24, textAlign: 'center', fontSize: 13 },
  seriesList: { display: 'flex', flexDirection: 'column', gap: 10 },
  seriesRow: { display: 'flex', gap: 8, alignItems: 'center' },
  seriesCard: { cursor: 'pointer', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--ct-radius-md)', border: 'none', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, boxShadow: 'none', fontFamily: 'inherit', width: '100%' },
  seriesName: { fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ct-fg)', minWidth: 0 },
  seriesDot: { width: 28, height: 28, borderRadius: 8, background: 'var(--ct-st-unlearned-bg)', color: 'var(--ct-fg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
  dueBadge: { fontSize: 11, fontWeight: 700, color: 'var(--ct-st-doubtful)', background: 'var(--ct-tint-yellow)', border: '1px solid var(--ct-warn-border)', borderRadius: 999, padding: '1px 8px', animation: 'ct-breathe 2s ease-in-out infinite' },
  seriesMeta: { color: 'var(--ct-fg-tertiary)', fontSize: 12, marginTop: 2 },
  miniBtn: { padding: '7px 9px' },
  notice: { position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,26,26,.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', padding: '10px 18px', borderRadius: 'var(--ct-radius-sm)', fontSize: 13, boxShadow: 'var(--ct-shadow-4)', zIndex: 200, maxWidth: '80vw' },
}
