// @vitest-environment jsdom
// 环 2：保存反馈状态机 + 底栏安心锚组件测试
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataFooter } from '../src/App.tsx'
import { SaveProvider, useSave } from '../src/SaveContext.tsx'

afterEach(() => {
  cleanup() // vitest 未开 globals，RTL 自动清理不会注册，手动清理防跨用例污染
  vi.unstubAllGlobals()
})

function Probe() {
  const s = useSave()
  return (
    <div>
      <span data-testid="status">{s.status}</span>
      <button onClick={() => void s.run(() => Promise.resolve())}>ok</button>
    </div>
  )
}

describe('SaveProvider / SaveIndicator 状态机', () => {
  it('成功保存：saving → saved →（1.8s 后）idle', async () => {
    render(<SaveProvider><Probe /></SaveProvider>)
    const status = screen.getByTestId('status')
    expect(status.textContent).toBe('idle')
    fireEvent.click(screen.getByText('ok'))
    await waitFor(() => expect(status.textContent).toBe('saved'), { timeout: 2000 })
    await waitFor(() => expect(status.textContent).toBe('idle'), { timeout: 3000 })
  }, 10000)

  it('失败：error + lastError；重试成功后回到 saved', async () => {
    let behavior: () => Promise<unknown> = () => Promise.reject(new Error('boom'))
    function RetryProbe() {
      const s = useSave()
      return (
        <div>
          <span data-testid="status">{s.status}</span>
          <span data-testid="err">{s.lastError || ''}</span>
          <button onClick={() => void s.run(() => behavior())}>run</button>
          <button onClick={() => s.retry()}>retry</button>
        </div>
      )
    }
    render(<SaveProvider><RetryProbe /></SaveProvider>)
    const status = screen.getByTestId('status')
    fireEvent.click(screen.getByText('run'))
    await waitFor(() => expect(status.textContent).toBe('error'))
    expect(screen.getByTestId('err').textContent).toBe('boom')
    behavior = () => Promise.resolve()
    fireEvent.click(screen.getByText('retry'))
    await waitFor(() => expect(status.textContent).toBe('saved'))
  })

  it('registerSaveHandler 登记草稿，手动保存冲刷时执行', () => {
    const handler = vi.fn()
    function FlushProbe() {
      const s = useSave()
      React.useEffect(() => s.registerSaveHandler(handler), [s])
      return <button onClick={() => s.flushDrafts()}>flush</button>
    }
    render(<SaveProvider><FlushProbe /></SaveProvider>)
    fireEvent.click(screen.getByText('flush'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('未包 Provider 时 useSave 抛出明确错误', () => {
    function Naked() {
      useSave()
      return null
    }
    // 抑制 React 错误边界噪音
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Naked />)).toThrow(/SaveProvider/)
    spy.mockRestore()
  })
})

describe('DataFooter 安心锚', () => {
  it('有备份时显示「仅保存在这台电脑 · 上次备份 X」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ backups: [{ file: 'f.json', size: 10, createdAt: '2026-08-29T12:00:00.000Z' }] }),
    })))
    render(<DataFooter />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('仅保存在这台电脑'))
    expect(screen.getByRole('status').textContent).toContain('上次备份')
  })

  it('无备份时显示「尚未备份」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ backups: [] }) })))
    render(<DataFooter />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('尚未备份'))
  })

  it('备份接口失败时降级为「尚未备份」（不白屏）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, statusText: 'err', json: async () => ({}) })))
    render(<DataFooter />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('尚未备份'))
  })
})
