// 第二轮 1.7：视口缩放纯函数测试（反馈 #2：滚轮缩放以光标为中心）
import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, wheelZoomFactor, zoomAtPoint } from '../src/viewport'

describe('zoomAtPoint 光标锚定缩放', () => {
  it('缩放后光标下的世界点保持不动', () => {
    const pan = { x: -100, y: -50 }
    const scale = 1
    const cursor = { x: 300, y: 200 }
    const next = zoomAtPoint(pan, scale, cursor, 2)
    expect(next.scale).toBe(2)
    // 世界点（缩放前）
    const wx = (cursor.x - pan.x) / scale
    const wy = (cursor.y - pan.y) / scale
    // 缩放后同一世界点仍映射到光标处
    expect(next.pan.x + wx * next.scale).toBeCloseTo(cursor.x)
    expect(next.pan.y + wy * next.scale).toBeCloseTo(cursor.y)
  })

  it('缩小同样锚定光标', () => {
    const pan = { x: 40, y: 90 }
    const scale = 1.6
    const cursor = { x: 120, y: 80 }
    const next = zoomAtPoint(pan, scale, cursor, 0.8)
    const wx = (cursor.x - pan.x) / scale
    const wy = (cursor.y - pan.y) / scale
    expect(next.pan.x + wx * next.scale).toBeCloseTo(cursor.x)
    expect(next.pan.y + wy * next.scale).toBeCloseTo(cursor.y)
  })

  it('目标缩放越界时被夹取到 [MIN, MAX]', () => {
    const r1 = zoomAtPoint({ x: 0, y: 0 }, 1, { x: 10, y: 10 }, 99)
    expect(r1.scale).toBe(MAX_SCALE)
    const r2 = zoomAtPoint({ x: 0, y: 0 }, 1, { x: 10, y: 10 }, 0.001)
    expect(r2.scale).toBe(MIN_SCALE)
  })

  it('缩放不变（1→1）时 pan 不变', () => {
    const pan = { x: 77, y: -33 }
    const next = zoomAtPoint(pan, 1, { x: 500, y: 300 }, 1)
    expect(next.pan.x).toBeCloseTo(pan.x)
    expect(next.pan.y).toBeCloseTo(pan.y)
  })
})

describe('wheelZoomFactor 滚轮倍率', () => {
  it('向上滚（负 deltaY）放大，向下滚缩小', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('deltaY 为 0 时倍率为 1（不变）', () => {
    expect(wheelZoomFactor(0)).toBeCloseTo(1)
  })

  it('方向对称：放大与缩小互为倒数', () => {
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1)
  })
})
