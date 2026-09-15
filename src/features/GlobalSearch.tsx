// 第二轮 2b：顶栏全局搜索框（防抖 200ms + 下拉结果 + 点击定位）
// 第五轮 C：Ctrl/Cmd+K 唤起（focusSignal 序号）+ 结果关键词高亮
import React from 'react'
import { fieldLabel, searchAll, type SearchResult } from './search'
import { IconSearch } from '../icons.tsx'
import type { Series } from '../types'

interface GlobalSearchProps {
  series: Series
  onPick: (conceptId: string) => void
  /** 序号变化时聚焦并全选输入框（Ctrl+K） */
  focusSignal?: number
}

/** 片段中命中的关键词加 <mark> 高亮（大小写不敏感） */
function highlightSnippet(text: string, term: string): React.ReactNode {
  const q = term.trim().toLowerCase()
  if (!q) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let idx = lower.indexOf(q)
  let key = 0
  while (idx >= 0) {
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(<mark key={key++} style={markStyle}>{text.slice(idx, idx + q.length)}</mark>)
    i = idx + q.length
    idx = lower.indexOf(q, i)
  }
  parts.push(text.slice(i))
  return parts
}

export default function GlobalSearch({ series, onPick, focusSignal }: GlobalSearchProps) {
  const [term, setTerm] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[] | null>(null)
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<number | null>(null)
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  // 第五轮 C：Ctrl+K 唤起
  const prevFocusSignal = React.useRef(focusSignal)
  React.useEffect(() => {
    if (focusSignal && focusSignal > 0 && focusSignal !== prevFocusSignal.current) {
      inputRef.current && inputRef.current.focus()
      inputRef.current && inputRef.current.select()
    }
    prevFocusSignal.current = focusSignal
  }, [focusSignal])

  const onChange = (v: string) => {
    setTerm(v)
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (!v.trim()) { setResults(null); setOpen(false); return }
    timer.current = window.setTimeout(() => {
      setResults(searchAll(series, v))
      setOpen(true)
    }, 200)
  }

  const pick = (r: SearchResult) => {
    onPick(r.conceptId)
    setTerm(''); setResults(null); setOpen(false)
  }

  // 点击外部关闭
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={boxRef} style={wrap}>
      <span style={iconSlot}><IconSearch size={14} /></span>
      <input ref={inputRef} className="ct-input" style={input} placeholder="搜索概念、笔记、对话…（Ctrl+K）" aria-label="全局搜索"
        value={term}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && results && results.length > 0) pick(results[0])
        }} />
      {open && results && (
        <div style={dropdown} role="listbox" aria-label="搜索结果">
          {results.length === 0 ? (
            <div style={noResult}>没有匹配的内容</div>
          ) : results.map((r, i) => (
            <button key={i} style={row} className="ct-menu-item" onClick={() => pick(r)} title="定位到画布卡片">
              <span style={rowTop}>
                <span style={name}>{r.conceptName}</span>
                <span style={tag}>{fieldLabel(r.field)}</span>
              </span>
              {/* 第五轮 C：命中关键词高亮 */}
              <span style={snippet}>{highlightSnippet(r.snippet, term)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- 样式（Notion 令牌）----------
const wrap: React.CSSProperties = { position: 'relative', width: 'clamp(180px, 30vw, 300px)', display: 'inline-flex', alignItems: 'center', minWidth: 0 }
const iconSlot: React.CSSProperties = { position: 'absolute', left: 10, color: 'var(--ct-fg-muted)', display: 'inline-flex', pointerEvents: 'none' }
const input: React.CSSProperties = { width: '100%', paddingLeft: 30 }
const dropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 'min(380px, 92vw)', maxHeight: 320, overflowY: 'auto',
  background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-sm)',
  boxShadow: 'var(--ct-shadow-2)', zIndex: 120, padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
}
const noResult: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ct-fg-tertiary)' }
const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch', textAlign: 'left', padding: '7px 10px', borderRadius: 'var(--ct-radius-sm)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }
const rowTop: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const name: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ct-fg)' }
const tag: React.CSSProperties = { fontSize: 10, color: 'var(--ct-primary)', background: 'var(--ct-tint-lavender)', borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }
const snippet: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const markStyle: React.CSSProperties = { background: 'var(--ct-tint-lavender)', color: 'var(--ct-primary)', borderRadius: 3, padding: '0 1px', fontWeight: 600 }
