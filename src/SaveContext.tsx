// 保存反馈状态机 + 草稿冲刷注册表
// 设计来源：docs/DESIGN-REFERENCES.md §3.1-3.2（木子工作台 run()/registerSaveHandler 模式）
// 语义：saving → saved（1.8s 闪灭）/ error（可重试）；手动保存 = 冲刷所有已登记草稿
import React from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SaveContextValue {
  status: SaveStatus
  lastError: string | null
  /** 包装一次持久化：负责状态机流转；失败不抛出（指示器显示 error） */
  run: (fn: () => Promise<unknown>) => Promise<void>
  /** 失败后重试上一次持久化 */
  retry: () => void
  /** 登记草稿冲刷函数（自动保存编辑器用），返回注销函数 */
  registerSaveHandler: (fn: () => void) => () => void
  /** 冲刷全部草稿，返回登记数量 */
  flushDrafts: () => number
}

const SaveContext = React.createContext<SaveContextValue | null>(null)

export function useSave(): SaveContextValue {
  const ctx = React.useContext(SaveContext)
  if (!ctx) throw new Error('useSave 必须在 SaveProvider 内使用')
  return ctx
}

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<SaveStatus>('idle')
  const [lastError, setLastError] = React.useState<string | null>(null)
  const flashTimer = React.useRef<number | null>(null)
  const lastFn = React.useRef<(() => Promise<unknown>) | null>(null)
  const handlers = React.useRef(new Set<() => void>())

  const run = React.useCallback((fn: () => Promise<unknown>) => {
    lastFn.current = fn
    setStatus('saving')
    setLastError(null)
    if (flashTimer.current !== null) { window.clearTimeout(flashTimer.current); flashTimer.current = null }
    return Promise.resolve()
      .then(fn)
      .then(() => {
        setStatus('saved')
        flashTimer.current = window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800)
      })
      .catch((e) => {
        setLastError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      })
  }, [])

  const retry = React.useCallback(() => {
    if (lastFn.current) void run(lastFn.current)
  }, [run])

  const registerSaveHandler = React.useCallback((fn: () => void) => {
    handlers.current.add(fn)
    return () => { handlers.current.delete(fn) }
  }, [])

  const flushDrafts = React.useCallback(() => {
    const n = handlers.current.size
    handlers.current.forEach((fn) => { try { fn() } catch { /* 单个草稿失败不阻塞其他 */ } })
    return n
  }, [])

  const value = React.useMemo(
    () => ({ status, lastError, run, retry, registerSaveHandler, flushDrafts }),
    [status, lastError, run, retry, registerSaveHandler, flushDrafts],
  )
  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>
}

/** 顶栏保存指示器：保存中… / ✓ 已保存 / 保存失败·重试 */
export function SaveIndicator() {
  const { status, lastError, retry } = useSave()
  if (status === 'saving') return <span style={indStyle} role="status">保存中…</span>
  if (status === 'saved') return <span style={{ ...indStyle, color: 'var(--ct-st-learned)' }} role="status">✓ 已保存</span>
  if (status === 'error') {
    return (
      <span style={{ ...indStyle, color: 'var(--ct-destructive)' }} role="status">
        保存失败{lastError ? `（${lastError}）` : ''}
        <button style={retryBtn} onClick={retry}>重试</button>
      </span>
    )
  }
  return null
}

const indStyle: React.CSSProperties = { fontSize: 12, color: 'var(--ct-fg-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 6 }
const retryBtn: React.CSSProperties = { cursor: 'pointer', fontSize: 11, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--ct-border)', color: 'var(--ct-destructive)', background: 'rgba(224,49,49,.06)', fontFamily: 'inherit' }
