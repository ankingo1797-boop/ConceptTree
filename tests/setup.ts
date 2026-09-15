// 第七轮：jsdom 测试环境全局桩
// reactbits 组件（CountUp 的 useInView、ClickSpark 的 ResizeObserver）依赖浏览器观测 API，
// jsdom 不提供，统一在此打桩（行为：视为"可见/尺寸稳定"，动画类直接落终态由组件自身处理）
import { vi } from 'vitest'

if (typeof globalThis.IntersectionObserver === 'undefined') {
  vi.stubGlobal('IntersectionObserver', class {
    root = null
    rootMargin = ''
    thresholds = []
    constructor(private cb?: IntersectionObserverCallback) {}
    observe(el: Element) {
      // 立即视为进入视口（触发入场动画/计数）
      this.cb && this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

if (typeof globalThis.matchMedia === 'undefined') {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

// SplitText 依赖 document.fonts（字体加载状态）
if (typeof document !== 'undefined' && !document.fonts) {
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve(), status: 'loaded', check: () => true, addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  })
}
