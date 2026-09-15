// @vitest-environment jsdom
// 第二轮 4.2：应用内确认框测试（替代原生 confirm 的根治方案）
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmModal } from '../src/ui.tsx'

afterEach(() => cleanup())

describe('ConfirmModal', () => {
  it('点确认触发 onConfirm，点取消触发 onCancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="删除？" message="不可恢复" confirmLabel="删除" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    cleanup()
    render(<ConfirmModal title="删除？" confirmLabel="删除" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Esc 取消、Enter 确认', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="删除？" confirmLabel="删除" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    // 第八轮：关闭带 180ms 出场动画，onCancel 延迟触发
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('渲染消息文案', () => {
    render(<ConfirmModal title="标题" message="删除后不可撤销" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('删除后不可撤销')).toBeTruthy()
  })
})
