// 开场粒子汇聚动画（第十三轮）
// 流程：粒子从屏幕四周边缘飞向中心 logo 轮廓点 → 收拢成树形剪影并淡出、
//       实体大 logo 交叉淡入 → 缩放+平移落到主页 hero 大 logo 位置 →
//       真实 hero 与标语浮现，叠加层淡出卸载。
// 兼容性：jsdom（测试）/退化环境无 Canvas 时跳过粒子绘制，仅保留成品淡入与落位；
//        系统开启「减弱动态效果」时整体跳过（App 侧也不挂载，这里双保险）。
import React from 'react'

/** 粒子数量（第十三轮反馈：更细更多） */
const PARTICLE_N = 820
/** 成型实体大 logo 的基准边长（像素） */
const BIG_LOGO_SIZE = 220
/** 整段动画时长（第十三轮反馈：延长至 3.5 秒） */
const TOTAL_MS = 3500
/** 汇聚阶段时长（前半段；此阶段背景不透明遮住主页） */
const GATHER_MS = 1600
/** 落位（缩小平移）阶段起始：此时背景开始淡出，主页逐渐显现 */
const LAND_MS = 1900
/** 停格阶段起始 */
const SETTLE_MS = 3100

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

type Phase = 'gather' | 'form' | 'land' | 'settle' | 'done'

interface Particle {
  sx: number; sy: number       // 起点（屏幕四周边缘）
  tx: number; ty: number       // 终点（logo 剪影点）
  cx: number; cy: number       // 贝塞尔控制点（制造不规则曲线）
  x: number; y: number         // 当前坐标
  r: number                    // 半径（大小不一）
  alpha: number                // 透明度（远淡近浓）
  speed: number                // 速度因子（前快后慢）
  depth: number                // 景深（0 远 / 1 近），决定绘制次序
}

export default function EntranceOverlay({ dark, onDone }: { dark: boolean; onDone?: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  const [phase, setPhase] = React.useState<Phase>('gather')
  // 落位目标（相对视口中心的位移 + 缩放）。null 表示尚未计算（取居中兜底）
  const [land, setLand] = React.useState<{ dx: number; dy: number; scale: number } | null>(null)

  const reduced = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 阶段推进（用 setTimeout 驱动，便于测试用假定时器断言 onDone）
  React.useEffect(() => {
    if (reduced) { onDone?.(); return }
    const timers = [
      window.setTimeout(() => setPhase('form'), GATHER_MS),
      window.setTimeout(() => setPhase('land'), LAND_MS),
      window.setTimeout(() => setPhase('settle'), SETTLE_MS),
      window.setTimeout(() => { setPhase('done'); onDone?.() }, TOTAL_MS),
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [reduced, onDone])

  // 计算落位目标：读取主页 hero logo 真实矩形
  React.useEffect(() => {
    if (phase !== 'land') return
    const el = document.getElementById('ct-hero-logo')
    const rect = el ? el.getBoundingClientRect() : null
    const vw = window.innerWidth, vh = window.innerHeight
    if (rect && rect.width > 0) {
      setLand({
        dx: (rect.left + rect.width / 2) - vw / 2,
        dy: (rect.top + rect.height / 2) - vh / 2,
        scale: rect.width / BIG_LOGO_SIZE,
      })
    } else {
      setLand({ dx: 0, dy: 0, scale: 104 / BIG_LOGO_SIZE })
    }
  }, [phase])

  // 粒子绘制（仅当有 Canvas 2D 上下文时执行；jsdom 等退化环境自动跳过）
  React.useEffect(() => {
    if (reduced) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = window.innerWidth, h = window.innerHeight
    const resize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w; canvas.height = h }
    resize()
    window.addEventListener('resize', resize)

    // 粒子：起点在屏幕四周边缘；大小、景深、速度、曲线各不相同
    const parts: Particle[] = Array.from({ length: PARTICLE_N }, () => {
      const edge = Math.floor(Math.random() * 4)
      const e = Math.random()
      let sx: number, sy: number
      if (edge === 0) { sx = e * w; sy = -4 }
      else if (edge === 1) { sx = e * w; sy = h + 4 }
      else if (edge === 2) { sx = -4; sy = e * h }
      else { sx = w + 4; sy = e * h }
      const depth = Math.random()
      // 大小：整体更细（约 0.55~2.2px），仍做长尾分布：多数极小、少数略大
      const r = 0.55 + Math.pow(depth, 1.6) * 1.4 + Math.random() * 0.3
      const alpha = 0.45 + depth * 0.55
      // 速度因子（≥1）：越大越早到目标（视觉靠前），=1 最晚到（靠后）；全部在 gather 末收敛
      const speed = 1.0 + Math.random() * 0.4
      return { sx, sy, tx: w / 2, ty: h / 2, cx: w / 2, cy: h / 2, x: sx, y: sy, r, alpha, speed, depth }
    }).sort((a, b) => a.depth - b.depth) // 远（小/暗）先画，近（大/亮）后画，形成前后层次

    // 为单个粒子生成不规则曲线：起点→终点间的二次贝塞尔，控制点沿垂直方向随机偏移再回折
    const setCurve = (p: Particle) => {
      const dx = p.tx - p.sx, dy = p.ty - p.sy
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len, ny = dx / len // 垂直法线
      const cf = 0.2 + Math.random() * 0.6  // 控制点在路径上的位置（不对称，更显随意）
      const perp = (Math.random() * 0.6 - 0.3) * len // 垂直偏移幅度（左右随机，最大约路径一半）
      p.cx = p.sx + dx * cf + nx * perp
      p.cy = p.sy + dy * cf + ny * perp
    }
    for (const p of parts) setCurve(p)

    // 二次贝塞尔求值
    const bez = (p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number, t: number) => {
      const u = 1 - t
      return { x: u * u * p0x + 2 * u * t * p1x + t * t * p2x, y: u * u * p0y + 2 * u * t * p1y + t * t * p2y }
    }

    // 异步采样 logo.png 剪影点，作为粒子收拢终点（放大到以视口中心为原点的 BIG_LOGO_SIZE 盒子内）
    const img = new Image()
    img.src = '/logo.png'
    img.onload = () => {
      try {
        const s = 96
        const oc = document.createElement('canvas')
        oc.width = s; oc.height = s
        const octx = oc.getContext('2d')
        if (!octx) return
        octx.drawImage(img, 0, 0, s, s)
        const data = octx.getImageData(0, 0, s, s).data
        const pts: { x: number; y: number }[] = []
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          if (data[(y * s + x) * 4 + 3] > 128) pts.push({ x: (x + 0.5) / s, y: (y + 0.5) / s })
        }
        if (!pts.length) return
        for (let i = 0; i < parts.length; i++) {
          const pp = pts[Math.floor(Math.random() * pts.length)]
          parts[i].tx = w / 2 + (pp.x - 0.5) * BIG_LOGO_SIZE
          parts[i].ty = h / 2 + (pp.y - 0.5) * BIG_LOGO_SIZE
          setCurve(parts[i])
        }
      } catch { /* 采样失败时粒子收拢到中心，不崩溃 */ }
    }

    const start = performance.now()
    let raf = 0
    const draw = (now: number) => {
      const t = Math.min(1, (now - start) / GATHER_MS) // gather 进度
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        // 前快后慢：近（大）粒子稍早到，远（小）粒子稍晚到；全部在 gather 末收敛
        const pt = Math.min(1, t * p.speed)
        const eased = easeInOut(pt)
        const b = bez(p.sx, p.sy, p.cx, p.cy, p.tx, p.ty, eased)
        p.x = b.x; p.y = b.y
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = dark ? `rgba(255,255,255,${p.alpha})` : `rgba(20,20,20,${p.alpha})`
        ctx.fill()
      }
      if (now - start < GATHER_MS + 150) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [reduced, dark])

  // 实体大 logo 样式
  const imgStyle: React.CSSProperties = {
    position: 'absolute', left: '50%', top: '50%',
    width: BIG_LOGO_SIZE, height: BIG_LOGO_SIZE,
    marginLeft: -BIG_LOGO_SIZE / 2, marginTop: -BIG_LOGO_SIZE / 2,
    transformOrigin: 'center',
    transition: 'transform 1.15s cubic-bezier(.4,0,.2,1), opacity .3s ease',
    opacity: phase === 'gather' ? 0 : 1,
    transform: land ? `translate(${land.dx}px, ${land.dy}px) scale(${land.scale})` : 'none',
  }

  // 背景遮罩：gather/form 阶段不透明（看不见主页），land 阶段 1.2s 淡出，主页逐渐显现
  const backdropStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: 'var(--ct-bg)',
    opacity: phase === 'gather' || phase === 'form' ? 1 : 0,
    transition: 'opacity 1.2s ease',
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        pointerEvents: 'auto',
      }}
    >
      <div style={backdropStyle} />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: phase === 'gather' ? 1 : 0, transition: 'opacity .3s ease' }} />
      <img ref={imgRef} src="/logo.png" alt="" className={dark ? 'ct-logo-glow-dark' : 'ct-logo-glow-light'} style={imgStyle} />
    </div>
  )
}
