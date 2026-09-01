// 第三轮 3a：学习报告弹层（顶栏「统计」入口，与日历同模式）
// 内容：概览数字卡 / 连续天数+累计次数 / 近30天热力 / 四态分布 / 遗忘率 Top5
import React from 'react'
import { dayKey } from './calendar'
import {
  collectReviewDates, computeActivity, computeStreak, dueTodayCount,
  enrolledCount, forgetRank, statusDistribution,
} from './stats'
import { IconX } from '../icons.tsx'
import { useClosing } from '../ui.tsx'
import BorderGlow from '../components/BorderGlow.tsx'
import CountUp from '../components/CountUp.tsx'
import SplitText from '../components/SplitText.tsx'
import type { ConceptStatus, Series } from '../types'
import { STATUS_LABEL } from './status'

interface StatsOverlayProps {
  series: Series
  onClose: () => void
}

const STATUS_ORDER: ConceptStatus[] = ['learned', 'learning', 'doubtful', 'unlearned']
const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

export default function StatsOverlay({ series, onClose }: StatsOverlayProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  // 第八轮：关闭出场动画
  const { leaving, requestClose } = useClosing(onClose)
  React.useEffect(() => { dialogRef.current && dialogRef.current.focus() }, [])

  // 第七轮：分布条入场展开（挂载后置宽度，CSS 过渡）；尊重系统减弱动效
  const [barsIn, setBarsIn] = React.useState(false)
  React.useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setBarsIn(true); return }
    const t = window.setTimeout(() => setBarsIn(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  const now = new Date()
  const concepts = Object.values(series.concepts || {})
  const total = concepts.length
  const dist = statusDistribution(series)
  const enrolled = enrolledCount(series)
  const dueToday = dueTodayCount(series, now)
  const dates = collectReviewDates(series)
  const streak = computeStreak(dates, now)
  const totalReviews = dates.length
  const activity = computeActivity(dates, 30, now)
  const rank = forgetRank(series, 5)

  // 热力图：7 列日历式，从 29 天前到今天；前面补空格对齐周几
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    days.push(dayKey(d))
  }
  const firstDow = (new Date(days[0] + 'T00:00:00').getDay() + 6) % 7
  const maxDist = Math.max(1, ...STATUS_ORDER.map((s) => dist[s]))

  const tierClass = (n: number) => (n === 0 ? '' : n <= 1 ? 'ct-cal-t1' : n <= 3 ? 'ct-cal-t2' : 'ct-cal-t3')

  return (
    <div style={backdrop} className={leaving ? 'ct-fade-out' : ''} onClick={requestClose}>
      <BorderGlow className="ct-glow-glass" backgroundColor="var(--ct-glass-bg)" borderRadius={18} glowRadius={45} edgeSensitivity={50} glowIntensity={1} coneSpread={25} glowColor="40 80 80" colors={['#c084fc', '#f472b6', '#38bdf8']}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="学习报告" className={`ct-glass ct-pop${leaving ? ' ct-pop-out' : ''}`} style={dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') requestClose() }}>
        <div style={header}>
          {/* 第七轮：标题逐字入场 */}
          <div style={title}>
            <SplitText text={`学习报告 · ${series.name}`} tag="span" textAlign="left" duration={0.6} delay={15} from={{ opacity: 0, y: 14 }} to={{ opacity: 1, y: 0 }} />
          </div>
          <button className="ct-btn ct-btn-ghost" onClick={requestClose} aria-label="关闭" title="关闭（Esc）"><IconX size={16} /></button>
        </div>

        {/* 概览数字卡（第七轮：数字滚动入场；窄屏自动降列） */}
        <div style={cardsRow}>
          <div style={numCard}><div style={numValue}><CountUp to={total} duration={1.1} /></div><div style={numLabel}>概念总数</div></div>
          <div style={numCard}><div style={{ ...numValue, color: 'var(--ct-st-learned)' }}><CountUp to={dist.learned} duration={1.1} delay={0.15} /></div><div style={numLabel}>已掌握</div></div>
          <div style={numCard}><div style={{ ...numValue, color: 'var(--ct-primary)' }}><CountUp to={enrolled} duration={1.1} delay={0.3} /></div><div style={numLabel}>复习计划中</div></div>
          <div style={numCard}><div style={{ ...numValue, color: dueToday > 0 ? 'var(--ct-st-doubtful)' : undefined }}><CountUp to={dueToday} duration={1.1} delay={0.45} /></div><div style={numLabel}>今日到期</div></div>
        </div>

        {/* 坚持度 + 近 30 天热力 */}
        <div style={twoCol}>
          <div style={streakCard}>
            <div style={streakNum}><CountUp to={streak} duration={1.3} /></div>
            <div style={numLabel}>连续复习天数</div>
            <div style={streakSub}>累计复习 {totalReviews} 次</div>
          </div>
          <div style={heatCard}>
            <div style={sectionTitle}>近 30 天复习热力</div>
            {totalReviews === 0 ? (
              <div style={emptyHint}>还没有复习记录。完成一次复习会话后，这里会出现你的足迹。</div>
            ) : (
              <>
                <div style={weekRow}>{WEEK_HEAD.map((w) => <div key={w} style={weekCell}>{w}</div>)}</div>
                <div style={heatGrid}>
                  {Array.from({ length: firstDow }).map((_, i) => <div key={'pad' + i} style={{ visibility: 'hidden' }} />)}
                  {days.map((k, di) => {
                    const n = activity[k] || 0
                    return (
                      <div key={k} className={`${tierClass(n)} ct-heat-cell`}
                        style={{ ...heatCell, animationDelay: `${Math.min(di * 8, 380)}ms` }}
                        title={`${Number(k.slice(5, 7))} 月 ${Number(k.slice(8, 10))} 日 · ${n} 次复习${k === dayKey(now) ? '（今天）' : ''}`} />
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 四态分布 */}
        <div style={section}>
          <div style={sectionTitle}>掌握分布</div>
          <div style={distCol}>
            {STATUS_ORDER.map((s) => (
              <div key={s} style={distRow} title={`${STATUS_LABEL[s]} ${dist[s]} 个`}>
                <span style={distLabel}>{STATUS_LABEL[s]}</span>
                <div style={distTrack}>
                  <div className="ct-dist-bar" style={{ ...distBar, width: barsIn ? `${(dist[s] / maxDist) * 100}%` : '0%', background: `var(--ct-st-${s})` }} />
                </div>
                <span style={distCount}>{dist[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 遗忘率排行 */}
        <div style={section}>
          <div style={sectionTitle}>遗忘率排行（最容易忘的 Top5）</div>
          {rank.length === 0 ? (
            <div style={emptyHint}>还没有复习过的概念。复习几次后，这里会告诉你哪些概念最难记。</div>
          ) : rank.map((r, i) => (
            <div key={r.conceptId} style={rankRow}>
              <span style={rankIdx}>{i + 1}</span>
              <span style={rankName}>{r.name}</span>
              <span style={rankMeta}>忘 {r.lapses} / 复习 {r.reps}</span>
              <span style={rankRate}>{Math.round(r.rate * 100)}%</span>
            </div>
          ))}
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
  background: 'var(--ct-panel)', borderRadius: 'var(--ct-radius-lg)', width: 'min(860px, 94vw)',
  maxHeight: '90vh', padding: '18px 22px', outline: 'none', boxShadow: 'var(--ct-shadow-4)',
  display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto',
}
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const title: React.CSSProperties = { fontWeight: 700, fontSize: 18, fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.01em', color: 'var(--ct-fg)' }
const cardsRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }
const numCard: React.CSSProperties = { background: 'var(--ct-surface-soft)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', padding: '12px 14px', textAlign: 'center' }
const numValue: React.CSSProperties = { fontSize: 26, fontWeight: 700, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.02em' }
const numLabel: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', marginTop: 2 }
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }
const streakCard: React.CSSProperties = { background: 'var(--ct-surface-soft)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', padding: '14px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }
const streakNum: React.CSSProperties = { fontSize: 40, fontWeight: 700, color: 'var(--ct-primary)', fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.03em', lineHeight: 1.1 }
const streakSub: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-muted)', marginTop: 4 }
const heatCard: React.CSSProperties = { background: 'var(--ct-surface-soft)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', padding: '12px 14px' }
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ct-fg-secondary)', marginBottom: 8 }
const emptyHint: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg-tertiary)', lineHeight: 1.6, padding: '6px 0' }
const weekRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 22px)', gap: 4, marginBottom: 4 }
const weekCell: React.CSSProperties = { fontSize: 10, color: 'var(--ct-fg-muted)', textAlign: 'center' }
const heatGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 22px)', gap: 4 }
const heatCell: React.CSSProperties = { width: 22, height: 22, borderRadius: 5, border: '1px solid var(--ct-border-soft)', background: 'var(--ct-panel)' }
const section: React.CSSProperties = { borderTop: '1px solid var(--ct-border-soft)', paddingTop: 12 }
const distCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const distRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
const distLabel: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-secondary)', width: 52, flex: 'none' }
const distTrack: React.CSSProperties = { flex: 1, height: 10, background: 'var(--ct-surface)', borderRadius: 999, overflow: 'hidden' }
const distBar: React.CSSProperties = { height: '100%', borderRadius: 999, transition: 'width .3s ease' }
const distCount: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', width: 28, textAlign: 'right', flex: 'none' }
const rankRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 'var(--ct-radius-sm)' }
const rankIdx: React.CSSProperties = { width: 20, height: 20, borderRadius: '50%', background: 'var(--ct-surface)', color: 'var(--ct-fg-secondary)', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }
const rankName: React.CSSProperties = { flex: 1, fontSize: 13, color: 'var(--ct-fg)', fontWeight: 500, wordBreak: 'break-word' }
const rankMeta: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', whiteSpace: 'nowrap' }
const rankRate: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--ct-st-doubtful)', width: 44, textAlign: 'right', flex: 'none' }
