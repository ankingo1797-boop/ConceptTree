// @vitest-environment jsdom
// 第十二轮：翻页倒计时三态文案测试
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import FlipCountdown from '../src/components/FlipCountdown.tsx'

afterEach(cleanup)

describe('FlipCountdown', () => {
  it('days 模式：NN 天后到期', () => {
    const { container } = render(<FlipCountdown days={3} />)
    expect(container.textContent).toContain('天后到期')
    expect(container.textContent).toContain('0')
    expect(container.textContent).toContain('3')
  })

  it('dueToday 模式：今天到期', () => {
    const { container } = render(<FlipCountdown dueToday={2} />)
    expect(container.textContent).toContain('今天到期')
  })

  it('overdue 模式：NN 天已逾期', () => {
    const { container } = render(<FlipCountdown overdue={1} />)
    expect(container.textContent).toContain('天已逾期')
  })
})
