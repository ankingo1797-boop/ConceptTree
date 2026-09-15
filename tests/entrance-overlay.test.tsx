// 第十三轮：开场粒子汇聚动画测试
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EntranceOverlay from '../src/EntranceOverlay.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('EntranceOverlay', () => {
  it('正常路径：渲染后约 3.5s 触发 onDone', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<EntranceOverlay dark={false} onDone={onDone} />)
    expect(onDone).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(3500) })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('减弱动效：挂载后立即 onDone，不推进动画', () => {
    const onDone = vi.fn()
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }))
    render(<EntranceOverlay dark={false} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('jsdom 无 Canvas 环境不抛错', () => {
    vi.useFakeTimers()
    expect(() => render(<EntranceOverlay dark onDone={() => {}} />)).not.toThrow()
    act(() => { vi.advanceTimersByTime(3500) })
  })
})
