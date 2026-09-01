// 第十一轮：翻页倒计时（素材「翻页倒计时」的无 jQuery React 实现）
// 用法：<FlipCountdown days={3} dueToday={0} /> —— dueToday>0 时显示今天到期个数，否则显示距下次到期天数
import React from 'react'

function FlipDigit({ ch }: { ch: string }) {
  const [cur, setCur] = React.useState(ch)
  const [prev, setPrev] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (ch !== cur) {
      setPrev(cur)
      setCur(ch)
      const t = window.setTimeout(() => setPrev(null), 650)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch])
  return (
    <span className="ct-flip-digit" aria-label={cur}>
      <span className="ct-flip-half ct-flip-top"><span>{cur}</span></span>
      <span className="ct-flip-half ct-flip-bottom"><span>{cur}</span></span>
      {prev !== null && (
        <>
          <span className="ct-flip-half ct-flip-top ct-flip-old-top"><span>{prev}</span></span>
          <span className="ct-flip-half ct-flip-bottom ct-flip-new-bottom"><span>{cur}</span></span>
        </>
      )}
      <span className="ct-flip-midline" aria-hidden="true" />
    </span>
  )
}

export default function FlipCountdown({ days, dueToday, overdue }: { days?: number; dueToday?: number; overdue?: number }) {
  const showDue = (dueToday ?? 0) > 0
  const showOver = (overdue ?? 0) > 0
  const n = Math.min(99, Math.max(0, showDue ? dueToday! : showOver ? overdue! : (days ?? 0)))
  const s = String(n).padStart(2, '0')
  const label = showOver ? '天已逾期' : showDue ? '今天到期' : '天后到期'
  return (
    <span className="ct-flip-wrap" title={showOver ? `已逾期 ${overdue} 天` : showDue ? `${dueToday} 个概念今天到期` : `下次到期还有 ${days} 天`}>
      <FlipDigit ch={s[0]} />
      <FlipDigit ch={s[1]} />
      <span className="ct-flip-label">{label}</span>
    </span>
  )
}
