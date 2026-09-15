// 环 6：视口命令层纯函数测试（PRD §12.4 C1/C2）
import { describe, expect, it } from 'vitest'
import { CARD_H, CARD_W, FOCUS_SCALE, MAX_SCALE, MIN_SCALE, clampScale, computeFly, computeVisibleIds, sameMembers } from '../src/viewport'

const st = { scale: 1, pan: { x: 0, y: 0 }, vw: 800, vh: 500 }

describe('computeFly focus', () => {
  it('目标卡片中心 = 视口中心（默认 1.0x）', () => {
    const r = computeFly(st, { kind: 'focus', target: { x: 100, y: 50 } })
    expect(r.scale).toBe(FOCUS_SCALE)
    expect(r.pan.x + (100 + CARD_W / 2) * r.scale).toBeCloseTo(400)
    expect(r.pan.y + (50 + CARD_H / 2) * r.scale).toBeCloseTo(250)
  })

  it('自定义 scale 越界时被夹取', () => {
    expect(computeFly(st, { kind: 'focus', target: { x: 0, y: 0 }, scale: 5 }).scale).toBe(MAX_SCALE)
    expect(computeFly(st, { kind: 'focus', target: { x: 0, y: 0 }, scale: 0.01 }).scale).toBe(MIN_SCALE)
  })
})

describe('computeFly pan-to', () => {
  it('只平移居中，缩放保持不变（小地图语义）', () => {
    const r = computeFly({ ...st, scale: 1.7 }, { kind: 'pan-to', target: { x: 300, y: 200 } })
    expect(r.scale).toBe(1.7)
    expect(r.pan.x + (300 + CARD_W / 2) * 1.7).toBeCloseTo(400)
    expect(r.pan.y + (200 + CARD_H / 2) * 1.7).toBeCloseTo(250)
  })
})

describe('computeFly overview', () => {
  it('大树：内容完整落在视口内（带边距），缩放被夹取', () => {
    const targets = [{ x: 0, y: 0 }, { x: 1000, y: 800 }]
    const r = computeFly(st, { kind: 'overview', targets })
    expect(r.scale).toBeGreaterThanOrEqual(MIN_SCALE)
    expect(r.scale).toBeLessThanOrEqual(MAX_SCALE)
    expect(r.pan.x).toBeGreaterThan(0)
    expect(r.pan.y).toBeGreaterThan(0)
    expect(r.pan.x + (1000 + CARD_W) * r.scale).toBeLessThan(800)
    expect(r.pan.y + (800 + CARD_H) * r.scale).toBeLessThan(500)
  })

  it('小树：缩放到上限 2.5（不无限放大）', () => {
    const r = computeFly(st, { kind: 'overview', targets: [{ x: 100, y: 100 }] })
    expect(r.scale).toBe(MAX_SCALE)
  })

  it('空树：回到初始视口', () => {
    expect(computeFly(st, { kind: 'overview', targets: [] })).toEqual({ scale: 1, pan: { x: 0, y: 0 } })
  })

  it('居中对称：包围盒中心对准视口中心', () => {
    const targets = [{ x: 0, y: 0 }, { x: 400, y: 200 }]
    const r = computeFly(st, { kind: 'overview', targets })
    const cx = r.pan.x + ((400 + CARD_W) / 2) * r.scale
    const cy = r.pan.y + ((200 + CARD_H) / 2) * r.scale
    expect(cx).toBeCloseTo(400)
    expect(cy).toBeCloseTo(250)
  })
})

describe('clampScale', () => {
  it('边界', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE)
    expect(clampScale(9)).toBe(MAX_SCALE)
    expect(clampScale(1.2)).toBe(1.2)
  })
})

describe('computeVisibleIds 屏外裁剪', () => {
  const view = { pan: { x: 0, y: 0 }, scale: 1, vw: 800, vh: 500 }

  it('视口内的卡片保留，远处的裁掉', () => {
    const pos = {
      a: { x: 100, y: 100 },      // 视口内
      b: { x: 5000, y: 5000 },    // 远（超出 margin）
      c: { x: -2500, y: 100 },    // 远左（超出 margin）
    }
    expect(computeVisibleIds(pos, view).sort()).toEqual(['a'])
  })

  it('margin 内的边缘卡片不裁（防闪现）', () => {
    const pos = { edge: { x: 800 + 150, y: 100 } } // 视口右外 150 < margin 200
    expect(computeVisibleIds(pos, view)).toEqual(['edge'])
  })

  it('缩放与平移参与判定', () => {
    // 世界坐标 (3000, 3000) 的卡片，通过 pan 平移进视口
    const pos = { far: { x: 3000, y: 3000 } }
    expect(computeVisibleIds(pos, view)).toEqual([])
    const panned = { ...view, pan: { x: -2800, y: -2800 } }
    expect(computeVisibleIds(pos, panned)).toEqual(['far'])
  })

  it('空位置表 → 空', () => {
    expect(computeVisibleIds({}, view)).toEqual([])
  })
})

describe('sameMembers 集合相等守卫', () => {
  it('成员相同（顺序无关）→ true', () => {
    expect(sameMembers(['a', 'b'], ['b', 'a'])).toBe(true)
  })
  it('长度不同 → false', () => {
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false)
  })
  it('成员不同 → false', () => {
    expect(sameMembers(['a', 'b'], ['a', 'c'])).toBe(false)
  })
  it('同一引用 → true', () => {
    const arr = ['x']
    expect(sameMembers(arr, arr)).toBe(true)
  })
})
