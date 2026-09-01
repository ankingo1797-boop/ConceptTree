// 第二轮 2a：复习日历热力图（全屏弹层，月视图 + 当日清单 + 定位/一键复习）
// 数据只读（dueByDay），不改排期；交互确认后实现（PRD §3.1）
import React from 'react'
import { dayKey, daysInMonth, dueByDay, dueText, mondayIndex } from './calendar'
import { useClosing } from '../ui.tsx'
import BorderGlow from '../components/BorderGlow.tsx'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from '../icons.tsx'
import type { Concept, ConceptStatus, Series } from '../types'

interface CalendarOverlayProps {
  series: Series
  onLocate: (conceptId: string) => void
  onOpenReview: () => void
  onClose: () => void
}

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

export default function CalendarOverlay({ series, onLocate, onOpenReview, onClose }: CalendarOverlayProps) {
  // 第八轮：关闭出场动画
  const { leaving, requestClose } = useClosing(onClose)
  const today = new Date()
  const todayKey = dayKey(today)
  const [viewMonth, setViewMonth] = React.useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const dialogRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => { dialogRef.current && dialogRef.current.focus() }, [])

  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const nDays = daysInMonth(y, m)
  const counts = React.useMemo(() => dueByDay(series, viewMonth, nDays), [series, viewMonth, nDays])
  const hasAnyReview = Object.values(series.concepts || {}).some((c) => c.review)

  const offset = mondayIndex(viewMonth) // 1 号前面留几个空格
  const cells: (number | null)[] = []
  for (let i = 0; i < 42; i++) {
    const d = i - offset + 1
    cells.push(d >= 1 && d <= nDays ? d : null)
  }

  const shiftMonth = (delta: number) => {
    setViewMonth(new Date(y, m + delta, 1))
    setSelectedKey(null)
  }

  const keyOf = (d: number) => dayKey(new Date(y, m, d))
  const selectedConcepts: Concept[] = selectedKey ? (counts[selectedKey] || []) : []
  const canStartReview = !!selectedKey && selectedKey <= todayKey && selectedConcepts.length > 0

  const statusDot = (s: ConceptStatus): React.CSSProperties => ({
    width: 8, height: 8, borderRadius: '50%', flex: 'none',
    background: `var(--ct-st-${s})`,
  })

  return (
    <div style={backdrop} className={leaving ? 'ct-fade-out' : ''} onClick={requestClose}>
      <BorderGlow className="ct-glow-glass" backgroundColor="var(--ct-glass-bg)" borderRadius={18} glowRadius={45} edgeSensitivity={50} glowIntensity={1} coneSpread={25} glowColor="40 80 80" colors={['#c084fc', '#f472b6', '#38bdf8']}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="复习日历" className={`ct-glass ct-pop${leaving ? ' ct-pop-out' : ''}`} style={dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') requestClose() }}>
        {/* 头部：翻月 + 标题 + 关闭 */}
        <div style={header}>
          <button className="ct-btn ct-btn-ghost" onClick={() => shiftMonth(-1)} title="上个月" aria-label="上个月"><IconChevronLeft size={16} /></button>
          <div style={monthTitle}><IconCalendar size={17} /> {y} 年 {m + 1} 月</div>
          <button className="ct-btn ct-btn-ghost" onClick={() => shiftMonth(1)} title="下个月" aria-label="下个月"><IconChevronRight size={16} /></button>
          <div style={{ flex: 1 }} />
          <button className="ct-btn ct-btn-ghost" onClick={requestClose} title="关闭（Esc）" aria-label="关闭"><IconX size={16} /></button>
        </div>

        {!hasAnyReview && (
          <div style={emptyHint}>还没有概念加入复习计划。把概念标记为「已掌握」会自动加入，或在右键菜单手动加入。</div>
        )}

        {/* 月视图网格 */}
        <div style={weekRow}>
          {WEEK_HEAD.map((w) => <div key={w} style={weekHeadCell}>{w}</div>)}
        </div>
        <div style={grid}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} style={{ ...dayCell, visibility: 'hidden' }} />
            const key = keyOf(d)
            const count = (counts[key] || []).length
            const tierClass = count === 0 ? '' : count <= 2 ? 'ct-cal-t1' : count <= 4 ? 'ct-cal-t2' : 'ct-cal-t3'
            const isToday = key === todayKey
            const isOverdueDay = key < todayKey && count > 0
            const label = `${m + 1}月${d}日${count ? `，到期 ${count} 个` : ''}`
            return (
              <button key={i}
                className={`ct-cal-cell ${tierClass}`}
                style={{ ...dayCell, ...(isToday ? todayRing : {}), ...(selectedKey === key ? selectedRing : {}) }}
                aria-label={label}
                aria-pressed={selectedKey === key}
                title={label}
                onClick={() => setSelectedKey((prev) => (prev === key ? null : key))}>
                <span style={dayNum}>{d}</span>
                {isOverdueDay && <span className="ct-cal-overdue" title="有逾期未复习" style={overdueDot} />}
              </button>
            )
          })}
        </div>

        {/* 选中日清单 */}
        {selectedKey && (
          <div style={listWrap}>
            <div style={listHead}>
              <span style={listTitle}>
                {Number(selectedKey.slice(5, 7))} 月 {Number(selectedKey.slice(8, 10))} 日
                {selectedConcepts.length > 0 ? ` · ${selectedConcepts.length} 个到期` : ' · 没有到期项'}
              </span>
              {canStartReview ? (
                <button className="ct-btn ct-btn-primary" onClick={onOpenReview}>开始复习</button>
              ) : selectedKey > todayKey ? (
                <span style={futureNote}>这天还没有可复习的项</span>
              ) : null}
            </div>
            {selectedConcepts.length === 0 ? (
              <div style={listEmpty}>这一天没有到期的复习。</div>
            ) : (
              selectedConcepts.map((c) => (
                <button key={c.id} className="ct-menu-item" style={listRow} onClick={() => onLocate(c.id)}
                  title="定位到画布卡片">
                  <span style={statusDot(c.status)} />
                  <span style={listName}>{c.name}</span>
                  <span style={listDue}>{dueText(c.review!.dueAt, today)}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div style={legend}>
          <span style={legendItem}><span className="ct-cal-t1" style={legendSwatch} /> 1–2 个</span>
          <span style={legendItem}><span className="ct-cal-t2" style={legendSwatch} /> 3–4 个</span>
          <span style={legendItem}><span className="ct-cal-t3" style={legendSwatch} /> ≥5 个</span>
          <span style={legendItem}><span style={{ ...overdueDot, display: 'inline-block' }} /> 逾期未清</span>
        </div>
      </div>
      </BorderGlow>
    </div>
  )
}

// ---------- 样式（Notion 令牌）----------
const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,15,15,.5)', zIndex: 150,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const dialog: React.CSSProperties = {
  background: 'var(--ct-panel)', borderRadius: 'var(--ct-radius-lg)', width: 'min(760px, 94vw)',
  maxHeight: '90vh', padding: '18px 22px', outline: 'none', boxShadow: 'var(--ct-shadow-4)',
  display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto',
}
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const monthTitle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 17, fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.01em', minWidth: 130, justifyContent: 'center' }
const emptyHint: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg-tertiary)', background: 'var(--ct-surface-soft)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-sm)', padding: '8px 12px' }
const weekRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }
const weekHeadCell: React.CSSProperties = { textAlign: 'center', fontSize: 12, color: 'var(--ct-fg-muted)', padding: '2px 0' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }
const dayCell: React.CSSProperties = {
  position: 'relative', height: 52, borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border-soft)',
  background: 'var(--ct-panel)', cursor: 'pointer', fontFamily: 'inherit', padding: 4,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
}
const dayNum: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-secondary)', fontWeight: 600 }
const todayRing: React.CSSProperties = { border: '2px solid var(--ct-primary)' }
const selectedRing: React.CSSProperties = { boxShadow: '0 0 0 2px rgba(86,69,212,.35)' }
const overdueDot: React.CSSProperties = { position: 'absolute', right: 5, bottom: 5, width: 7, height: 7, borderRadius: '50%', background: 'var(--ct-warn-border)' }
const listWrap: React.CSSProperties = { borderTop: '1px solid var(--ct-border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }
const listHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }
const listTitle: React.CSSProperties = { fontWeight: 600, fontSize: 14, color: 'var(--ct-fg)' }
const futureNote: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-muted)' }
const listEmpty: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg-tertiary)', padding: '8px 4px' }
const listRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 'var(--ct-radius-sm)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }
const listName: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg)', fontWeight: 500, flex: 1, wordBreak: 'break-word' }
const listDue: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', whiteSpace: 'nowrap' }
const legend: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: 'var(--ct-fg-muted)', borderTop: '1px solid var(--ct-border-soft)', paddingTop: 8 }
const legendItem: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5 }
const legendSwatch: React.CSSProperties = { width: 14, height: 14, display: 'inline-block', border: '1px solid var(--ct-border-soft)' }
