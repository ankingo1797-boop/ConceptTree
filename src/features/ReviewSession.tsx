// 第一轮 A：全屏复习会话（PRD §12.2）
// 语义：开始即快照到期列表；评级逐条持久化；Esc 退出保留已评进度；N=0 显示空态
import React from 'react'
import { GRADE_META, dueConcepts, gradeReview, nextIntervalDays } from './reviewScheduler.ts'
import type { ReviewGrade } from './reviewScheduler.ts'
import type { Concept, ConceptReview, ConceptStatus, Series } from '../types'
import { IconNote } from '../icons.tsx'
import { useClosing } from '../ui.tsx'
import BorderGlow from '../components/BorderGlow.tsx'
import { STATUS_LABEL } from './status'

interface ReviewSessionProps {
  series: Series
  /** 评级落盘：更新概念复习状态与 status（走统一 persist → saveStatus） */
  onApplyGrade: (conceptId: string, review: ConceptReview, status: ConceptStatus) => void
  onClose: () => void
}

const GRADE_ORDER: ReviewGrade[] = ['forgot', 'struggled', 'mastered']
const GRADE_STYLE: Record<ReviewGrade, { bg: string; border: string; color: string }> = {
  forgot: { bg: '#fde0ec', border: '#f3bcd9', color: '#a02e6d' },
  struggled: { bg: '#ffe8d4', border: '#f5cba4', color: '#b25000' },
  mastered: { bg: '#d9f3e1', border: '#b5e3c4', color: '#0e7a35' },
}

export default function ReviewSession({ series, onApplyGrade, onClose }: ReviewSessionProps) {
  // 开始时快照到期列表（会话期间数据变化不影响本回合）
  const [queue] = React.useState<Concept[]>(() => dueConcepts(series))
  const [idx, setIdx] = React.useState(0)
  const [revealed, setRevealed] = React.useState(false)
  const [finished, setFinished] = React.useState(false)
  const [stats, setStats] = React.useState({ forgot: 0, struggled: 0, mastered: 0 })
  const [elapsed, setElapsed] = React.useState(0)
  const boxRef = React.useRef<HTMLDivElement | null>(null)

  // 计时
  React.useEffect(() => {
    const t0 = Date.now()
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Esc 退出（已评的已经逐条落盘，直接关闭即保留进度）；第八轮：带出场动画
  const { leaving, requestClose } = useClosing(onClose)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    boxRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  const current = queue[idx]
  const total = queue.length

  const grade = (g: ReviewGrade) => {
    if (!current || !current.review) return
    const { review, status } = gradeReview(current.review, g)
    onApplyGrade(current.id, review, status)
    setStats((s) => ({ ...s, [g]: s[g] + 1 }))
    setRevealed(false)
    if (idx + 1 >= total) setFinished(true)
    else setIdx(idx + 1)
  }

  const fmtElapsed = (sec: number) => {
    const m = Math.floor(sec / 60), s = sec % 60
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
  }

  return (
    <div style={backdrop} className={leaving ? 'ct-fade-out' : ''} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <BorderGlow className="ct-glow-glass" backgroundColor="var(--ct-glass-bg)" borderRadius={18} glowRadius={45} edgeSensitivity={50} glowIntensity={1} coneSpread={25} glowColor="40 80 80" colors={['#c084fc', '#f472b6', '#38bdf8']}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="复习会话" className={`ct-glass ct-pop${leaving ? ' ct-pop-out' : ''}`} style={dialog}>
        {/* 空态 */}
        {total === 0 && (
          <div style={emptyWrap}>
            <div style={emptyText}>今天没有到期的复习 🎉</div>
            <button style={closeBtn} onClick={requestClose}>关闭（Esc）</button>
          </div>
        )}

        {/* 结束页 */}
        {total > 0 && finished && (
          <div style={emptyWrap}>
            <div style={emptyText}>本轮复习完成 🎉</div>
            <div style={statsRow}>
              <span style={{ color: '#0e7a35' }}>掌握 {stats.mastered}</span>
              <span style={{ color: '#b25000' }}>吃力 {stats.struggled}</span>
              <span style={{ color: '#a02e6d' }}>忘了 {stats.forgot}</span>
            </div>
            <div style={metaText}>共 {total} 个 · 用时 {fmtElapsed(elapsed)}</div>
            <button style={closeBtn} onClick={requestClose}>完成（Esc）</button>
          </div>
        )}

        {/* 进行中 */}
        {total > 0 && !finished && current && (
          <div style={sessionCol}>
            <div style={progressRow}>
              <span style={progressCount}>{idx + 1} / {total}</span>
              <span style={metaText}>{series.name} · Esc 退出（进度已保留）</span>
            </div>

            {/* 卡片（key=idx 触发入场动画） */}
            <div key={current.id + ':' + idx} className="ct-card-in" style={card}>
              {!revealed ? (
                <div style={cardFront}>
                  <div style={frontName}>{current.name}</div>
                  <div style={frontStatus}>{STATUS_LABEL[current.status] || current.status}</div>
                  <div style={frontHint}>先在心里回忆这个概念，再揭示对照</div>
                  <button className="ct-reveal" style={revealBtn} onClick={() => setRevealed(true)}>揭示</button>
                </div>
              ) : (
                <div style={cardBack}>
                  <div style={backName}>{current.name}</div>
                  <div style={backSection}>{current.summary || '（还没有一句话总结，可以先在右侧对话里学一学）'}</div>
                  {current.notes && <div style={backNotes}><IconNote size={13} /> {current.notes}</div>}
                  {current.history && current.history.length > 0 && (
                    <details style={backHistory}>
                      <summary style={backHistorySummary}>对话记录（{current.history.length} 条）</summary>
                      <div style={backHistoryBody}>
                        {current.history.map((m, i) => (
                          <div key={i} style={historyMsg}>
                            <b>{m.role === 'user' ? '你：' : 'AI：'}</b>
                            <span>{m.content.length > 300 ? m.content.slice(0, 300) + '…' : m.content}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* 评级区 */}
            {revealed ? (
              <div style={gradeRow}>
                {GRADE_ORDER.map((g) => {
                  const st = GRADE_STYLE[g]
                  const days = nextIntervalDays(current.review!, g)
                  return (
                    <button key={g} style={{ ...gradeBtn, background: st.bg, borderColor: st.border, color: st.color }} onClick={() => grade(g)}>
                      <div style={gradeLabel}>{GRADE_META[g].label}</div>
                      <div style={gradeHint}>{days} 天后再见</div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={gradePlaceholder}>揭示答案后评级，决定下一轮复习间隔</div>
            )}
          </div>
        )}
      </div>
      </BorderGlow>
    </div>
  )
}

// ---------- 样式 ----------
const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,15,15,.5)', zIndex: 200,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const dialog: React.CSSProperties = {
  background: 'var(--ct-panel)', borderRadius: 'var(--ct-radius-lg)', width: 'min(680px, 92vw)', maxHeight: '88vh',
  padding: '24px 28px', outline: 'none', boxShadow: 'var(--ct-shadow-4)',
  display: 'flex', flexDirection: 'column', overflow: 'auto',
}
const sessionCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const progressRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }
const progressCount: React.CSSProperties = { fontWeight: 700, fontSize: 16, color: 'var(--ct-primary)', fontFamily: 'var(--ct-font-display)' }
const metaText: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-muted)' }
const card: React.CSSProperties = {
  border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', minHeight: 220, padding: '26px 28px',
  background: 'var(--ct-surface-soft)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--ct-shadow-1)',
}
const cardFront: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, flex: 1, textAlign: 'center' }
const frontName: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.02em' }
const frontStatus: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', borderRadius: 999, padding: '2px 12px' }
const frontHint: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg-muted)' }
const revealBtn: React.CSSProperties = {
  cursor: 'pointer', marginTop: 8, padding: '10px 38px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, var(--ct-primary), var(--ct-primary-hover))', color: '#fff', fontSize: 15, fontWeight: 600,
  boxShadow: '0 4px 18px var(--ct-glow-primary)',
  transition: 'filter .18s ease, transform .18s ease', fontFamily: 'inherit',
}
const cardBack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const backName: React.CSSProperties = { fontSize: 19, fontWeight: 700, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)' }
const backSection: React.CSSProperties = { fontSize: 14, lineHeight: 1.7, color: 'var(--ct-fg)' }
const backNotes: React.CSSProperties = { fontSize: 13, color: 'var(--ct-st-doubtful)', background: 'var(--ct-tint-yellow)', border: '1px solid var(--ct-warn-border)', borderRadius: 'var(--ct-radius-sm)', padding: '8px 10px', lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 6 }
const backHistory: React.CSSProperties = { fontSize: 13 }
const backHistorySummary: React.CSSProperties = { cursor: 'pointer', color: 'var(--ct-primary)', userSelect: 'none', fontWeight: 600 }
const backHistoryBody: React.CSSProperties = { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }
const historyMsg: React.CSSProperties = { fontSize: 12, lineHeight: 1.6, background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-sm)', padding: '6px 8px' }
const gradeRow: React.CSSProperties = { display: 'flex', gap: 10 }
const gradeBtn: React.CSSProperties = {
  flex: 1, cursor: 'pointer', borderRadius: 'var(--ct-radius-md)', border: '1px solid', padding: '12px 8px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: 'inherit',
  transition: 'transform .12s ease, box-shadow .15s ease',
}
const gradeLabel: React.CSSProperties = { fontWeight: 700, fontSize: 15 }
const gradeHint: React.CSSProperties = { fontSize: 11, opacity: 0.85 }
const gradePlaceholder: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-muted)', textAlign: 'center' }
const emptyWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 0' }
const emptyText: React.CSSProperties = { fontSize: 21, fontWeight: 700, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)' }
const statsRow: React.CSSProperties = { display: 'flex', gap: 18, fontSize: 15, fontWeight: 600 }
const closeBtn: React.CSSProperties = {
  cursor: 'pointer', padding: '8px 24px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', background: 'var(--ct-panel)', fontSize: 13, color: 'var(--ct-fg)', fontFamily: 'inherit',
}
