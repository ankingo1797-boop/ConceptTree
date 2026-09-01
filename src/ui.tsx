// 轻量 a11y 模态（Esc/背景点击关闭、autofocus、焦点恢复）
// 设计来源：docs/DESIGN-REFERENCES.md §3.8（木子工作台 Modal 模式）
import React from 'react'

/** 第九轮：解析后的深浅色上下文（App 提供），供 BorderGlow/Ferrofluid 等组件按主题取色 */
export const ResolvedDarkContext = React.createContext<boolean>(false)

/** 第八轮：关闭出场动画钩子——先播 180ms 出场，再真正卸载 */
export function useClosing(onClose: () => void, ms = 180) {
  const [leaving, setLeaving] = React.useState(false)
  const timerRef = React.useRef<number | null>(null)
  const requestClose = React.useCallback(() => {
    if (leaving) return
    setLeaving(true)
    timerRef.current = window.setTimeout(onClose, ms)
  }, [leaving, onClose, ms])
  React.useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current) }, [])
  return { leaving, requestClose }
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const { leaving, requestClose } = useClosing(onClose)

  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    boxRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [requestClose])

  return (
    <div style={backdrop} className={leaving ? 'ct-fade-out' : ''} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`ct-glass ct-pop${leaving ? ' ct-pop-out' : ''}`} style={box}>
        <div style={boxTitle}>{title}</div>
        {children}
      </div>
    </div>
  )
}

/**
 * 应用内确认对话框（第二轮 4.2 反馈 #1 根治）：
 * 替代 window.confirm —— 原生系统弹窗会让 Electron 渲染进程丢失键盘焦点，
 * 导致"删除后输入失灵"；应用内弹窗焦点不离开页面。Esc/取消=放弃，Enter/按钮=确认。
 */
export function ConfirmModal({ title, message, confirmLabel = '确认', danger = false, onConfirm, onCancel }: {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onConfirm() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm])

  return (
    <Modal title={title} onClose={onCancel}>
      {message && <div style={confirmMsg}>{message}</div>}
      <div style={confirmActions}>
        <button className="ct-btn" onClick={onCancel}>取消</button>
        <button className={danger ? 'ct-btn ct-btn-danger' : 'ct-btn ct-btn-primary'} style={danger ? { borderColor: 'var(--ct-destructive)' } : undefined} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const box: React.CSSProperties = {
  background: 'var(--ct-panel)', borderRadius: 'var(--ct-radius-md)', padding: '20px 22px', minWidth: 320, maxWidth: 480, outline: 'none', boxShadow: 'var(--ct-shadow-4)', border: '1px solid var(--ct-border)',
}
const boxTitle: React.CSSProperties = { fontWeight: 700, fontSize: 16, marginBottom: 10, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)' }
const confirmMsg: React.CSSProperties = { fontSize: 13, color: 'var(--ct-fg-secondary)', lineHeight: 1.6, marginBottom: 14 }
const confirmActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
