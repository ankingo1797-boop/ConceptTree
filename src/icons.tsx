// 内联 SVG 图标库（第一轮 1.5：ui-ux-pro-max 预交付清单——不用 emoji 当图标）
// 风格：heroicons outline 系，stroke=currentColor，随文字颜色与字号缩放。
import React from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
  title?: string
}

function Svg({ size = 16, strokeWidth = 1.8, className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      style={{ flex: 'none', verticalAlign: '-0.2em' }}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const IconTree = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2.4" />
    <circle cx="5.5" cy="18.5" r="2.4" />
    <circle cx="18.5" cy="18.5" r="2.4" />
    <path d="M12 7.4v4.1M12 11.5l-5 4.8M12 11.5l5 4.8" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.34 3.94c-.09-.54.37-.94.92-.94h1.48c.55 0 1.01.4 1.1.94l.14.85c.06.37.31.69.65.87l.15.09c.32.2.72.26 1.07.12l.8-.3a1.13 1.13 0 011.37.5l.74 1.28c.27.48.16 1.08-.26 1.43l-.65.54c-.29.24-.44.61-.43.99v.18c0 .38.14.75.43.99l.65.54c.42.35.53.95.26 1.43l-.74 1.29c-.27.47-.87.67-1.37.49l-.8-.3c-.35-.13-.75-.07-1.07.13l-.15.09c-.33.18-.58.5-.64.87l-.14.85c-.09.54-.55.94-1.1.94h-1.48c-.55 0-1.01-.4-1.1-.94l-.13-.85c-.06-.37-.31-.69-.65-.87l-.15-.09c-.32-.2-.72-.26-1.07-.12l-.8.3a1.13 1.13 0 01-1.37-.5l-.74-1.28a1.13 1.13 0 01.26-1.43l.65-.54c.29-.24.44-.61.43-.99v-.18c0-.38-.14-.75-.43-.99l-.65-.54a1.13 1.13 0 01-.26-1.43l.74-1.29c.27-.47.87-.67 1.37-.49l.8.3c.35.14.75.08 1.07-.12l.15-.09c.33-.18.59-.5.65-.87l.13-.85z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h11l3 3v15H5V3z" />
    <path d="M8 3v5h7V3M8 21v-7h8v7" />
  </Svg>
)

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 8.7a4 4 0 011.1 6.4l-3.4 3.4a4 4 0 11-5.7-5.7l1.6-1.6" />
    <path d="M10.8 15.3a4 4 0 01-1.1-6.4l3.4-3.4a4 4 0 115.7 5.7l-1.6 1.6" />
  </Svg>
)

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2M6.5 7l1 13h9l1-13" />
    <path d="M10 11v5m4-5v5" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5" />
    <path d="M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 4.5v15m7.5-7.5h-15" /></Svg>
)

export const IconMinus = (p: IconProps) => (
  <Svg {...p}><path d="M19.5 12h-15" /></Svg>
)

export const IconSearch = (p: IconProps) => (
  <Svg {...p}><path d="M21 21l-5.2-5.2m0 0a7.5 7.5 0 10-10.6-10.6 7.5 7.5 0 0010.6 10.6z" /></Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="M4.5 12.75l6 6 9-13.5" /></Svg>
)

export const IconX = (p: IconProps) => (
  <Svg {...p}><path d="M6 18L18 6M6 6l12 12" /></Svg>
)

export const IconQuestion = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.9 9.3c.3-1.2 1.4-2 2.6-1.8 1.2.2 2 1.3 1.8 2.5-.1.9-.8 1.5-1.6 1.9-.5.3-.7.7-.7 1.2v.4" />
    <path d="M12 16.6h.01" />
  </Svg>
)

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 118 0v3" />
  </Svg>
)

export const IconBack = (p: IconProps) => (
  <Svg {...p}><path d="M15.75 19.5L8.25 12l7.5-7.5" /></Svg>
)

export const IconFit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.75 3.75v4m0-4h4m-4 0L9 9M3.75 20.25v-4m0 4h4m-4 0L9 15M20.25 3.75h-4m4 0v4m0-4L15 9m5.25 11.25h-4m4 0v-4m0 4L15 15" />
  </Svg>
)

export const IconUndo = (p: IconProps) => (
  <Svg {...p}><path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></Svg>
)

export const IconRedo = (p: IconProps) => (
  <Svg {...p}><path d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 0113-5.2L20 9m0-4.5V9h-4.5M19.5 12a7.5 7.5 0 01-13 5.2L4 15m0 4.5V15h4.5" />
  </Svg>
)

export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.9 4.5l2.6 2.6L8.4 18.2 5 19l.8-3.4L16.9 4.5z" />
    <path d="M14.5 6.9l2.6 2.6" />
  </Svg>
)

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Svg>
)

export const IconHand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5v19M2.5 12h19" />
    <path d="M9.5 5L12 2.5 14.5 5M9.5 19l2.5 2.5L14.5 19M5 9.5L2.5 12 5 14.5M19 9.5l2.5 2.5L19 14.5" />
  </Svg>
)

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
  </Svg>
)

export const IconSend = (p: IconProps) => (
  <Svg {...p}><path d="M6 12L3.3 3.1a59.8 59.8 0 0118.2 8.9A59.8 59.8 0 013.3 20.9L6 12zm0 0h7.5" /></Svg>
)

export const IconBackup = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
    <path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13" />
    <path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
  </Svg>
)

export const IconPlusCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8.5v7m3.5-3.5h-7" />
  </Svg>
)

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
  </Svg>
)

// 第二轮：日历/搜索/主题切换用图标
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4m8-4v4" />
    <path d="M7.5 13.5h2m3 0h2m-7 3.5h2m3 0h2" />
  </Svg>
)

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}><path d="M14.5 5.5L8 12l6.5 6.5" /></Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}><path d="M9.5 5.5L16 12l-6.5 6.5" /></Svg>
)

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5m0 14v2.5M2.5 12H5m14 0h2.5M5.3 5.3l1.8 1.8m9.8 9.8l1.8 1.8m0-13.4l-1.8 1.8M7.1 16.9l-1.8 1.8" />
  </Svg>
)

export const IconMoon = (p: IconProps) => (
  <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>
)

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
    <path d="M9 20.5h6m-3-3v3" />
  </Svg>
)
