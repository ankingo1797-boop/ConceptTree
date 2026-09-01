// 第七轮（UI 优化）：自定义下拉选择器（替代原生 <select>）
// 指南踩坑 #4：原生 select 无法 hover 高亮/主题化 → button+list 自绘；
// 选项 hover 高亮+发光、跟随主题；Esc/点击外部关闭；↑↓ 键导航 + Enter 选中。
import React from 'react'

export interface FancyOption {
  value: string
  label: string
}

interface FancySelectProps {
  value: string
  options: FancyOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  title?: string
}

export default function FancySelect({ value, options, onChange, ariaLabel, title }: FancySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [hl, setHl] = React.useState(0) // 键盘高亮项
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const current = options.find((o) => o.value === value)

  const close = () => setOpen(false)
  const toggle = () => {
    setOpen((v) => !v)
    setHl(Math.max(0, options.findIndex((o) => o.value === value)))
  }
  const pick = (v: string) => {
    onChange(v)
    close()
  }

  // 点击外部关闭
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); toggle(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((i) => Math.min(options.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHl((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter') { e.preventDefault(); pick(options[hl].value) }
  }

  return (
    <div className="ct-fs" ref={wrapRef}>
      <button
        type="button"
        className="ct-fs-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current ? current.label : value}</span>
        <svg className="ct-fs-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="ct-fs-list" role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`ct-fs-option${open && i === hl ? ' ct-fs-hl' : ''}`}
              onMouseEnter={() => setHl(i)}
              onClick={() => pick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
