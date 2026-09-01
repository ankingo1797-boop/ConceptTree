// 视口命令层（第一轮 C，PRD §12.4 C1/C2）
// 设计来源：StarMap executeCameraCommand 集中命令模式（DESIGN-REFERENCES §1.1）
// 纯函数：给定当前视口状态 + 意图，算出目标 {scale, pan}；动画与去重在 CanvasPane 执行
import type { Position } from './types'

export const CARD_W = 180   // 卡片宽（与 CanvasPane styles.card 一致）
export const CARD_H = 90    // 卡片估算高（含 summary/footer）
export const PAD = 60       // overview 边距
export const MIN_SCALE = 0.3
export const MAX_SCALE = 2.5
export const FOCUS_SCALE = 1.0

export interface ViewportState {
  scale: number
  pan: Position
  vw: number
  vh: number
}

export type FlyIntent =
  | { kind: 'overview'; targets: Position[] }              // fit-all 带边距
  | { kind: 'focus'; target: Position; scale?: number }    // 目标居中（默认 1.0x）
  | { kind: 'pan-to'; target: Position }                   // 只平移居中，保持缩放（小地图）

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

export function computeFly(state: ViewportState, intent: FlyIntent): { scale: number; pan: Position } {
  // focus：目标卡片中心落到视口中心
  if (intent.kind === 'focus') {
    const scale = clampScale(intent.scale ?? FOCUS_SCALE)
    const cx = intent.target.x + CARD_W / 2
    const cy = intent.target.y + CARD_H / 2
    return { scale, pan: { x: state.vw / 2 - cx * scale, y: state.vh / 2 - cy * scale } }
  }

  // pan-to：保持当前缩放，目标居中
  if (intent.kind === 'pan-to') {
    const cx = intent.target.x + CARD_W / 2
    const cy = intent.target.y + CARD_H / 2
    return { scale: state.scale, pan: { x: state.vw / 2 - cx * state.scale, y: state.vh / 2 - cy * state.scale } }
  }

  // overview：包围盒 fit-all
  if (intent.targets.length === 0) return { scale: 1, pan: { x: 0, y: 0 } }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of intent.targets) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + CARD_W)
    maxY = Math.max(maxY, p.y + CARD_H)
  }
  const W = maxX - minX, H = maxY - minY
  const scale = clampScale(Math.min((state.vw - PAD * 2) / W, (state.vh - PAD * 2) / H))
  return {
    scale,
    pan: {
      x: (state.vw - W * scale) / 2 - minX * scale,
      y: (state.vh - H * scale) / 2 - minY * scale,
    },
  }
}

// ---- 屏外裁剪（PRD §12.4 C3）----

/** 计算视口内可见的卡片 id（世界坐标判定，带 margin 防边缘闪现） */
export function computeVisibleIds(
  positions: Record<string, Position>,
  state: Pick<ViewportState, 'pan' | 'scale' | 'vw' | 'vh'>,
  margin = 200,
): string[] {
  const x0 = -state.pan.x / state.scale - margin
  const y0 = -state.pan.y / state.scale - margin
  const x1 = (state.vw - state.pan.x) / state.scale + margin
  const y1 = (state.vh - state.pan.y) / state.scale + margin
  const out: string[] = []
  for (const [id, p] of Object.entries(positions)) {
    if (p.x + CARD_W >= x0 && p.x <= x1 && p.y + CARD_H >= y0 && p.y <= y1) out.push(id)
  }
  return out
}

/** 集合相等守卫：成员完全一致时返回 true（跳过冗余重渲染，StarMap 模式） */
export function sameMembers(a: string[], b: string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  const set = new Set(b)
  for (const id of a) if (!set.has(id)) return false
  return true
}

// ---- 第二轮 1.7 反馈 #2：以光标为中心的缩放（纯函数，可单测）----

/**
 * 给定当前 {pan, scale}、光标屏幕坐标与目标缩放，算出保持光标下世界点不动的新 {pan, scale}。
 * 推导：world = (cursor - pan) / scale 不变 → pan' = cursor - (cursor - pan) * (scale' / scale)
 */
export function zoomAtPoint(
  pan: Position,
  scale: number,
  cursor: Position,
  nextScale: number,
): { pan: Position; scale: number } {
  const s = clampScale(nextScale)
  const ratio = s / scale
  return {
    scale: s,
    pan: {
      x: cursor.x - (cursor.x - pan.x) * ratio,
      y: cursor.y - (cursor.y - pan.y) * ratio,
    },
  }
}

/** 滚轮缩放的倍率：由 deltaY 连续映射（触控板平滑，鼠标滚轮约为 ±10%） */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015)
}
