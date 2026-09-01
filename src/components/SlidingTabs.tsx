// 第七轮（UI 优化）：滑动分段标签（对话/笔记切换）
// 设计来源：用户素材「玻璃滑动导航条」；纯 CSS 动画（glider），主题令牌驱动
// a11y：role=tablist/tab + aria-selected（e2e 依赖 getByRole('tab')，勿破坏）
import React from 'react'

export interface SlideTabItem {
  key: string
  label: React.ReactNode
  ariaLabel?: string
}

interface SlidingTabsProps {
  items: SlideTabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export default function SlidingTabs({ items, active, onChange, className = '' }: SlidingTabsProps) {
  const idx = Math.max(0, items.findIndex((t) => t.key === active))
  return (
    <div className={`ct-slide-tabs ${className}`} role="tablist">
      <span
        className="ct-slide-glider"
        aria-hidden="true"
        style={{ width: `calc((100% - 6px) / ${items.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          aria-label={t.ariaLabel}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
