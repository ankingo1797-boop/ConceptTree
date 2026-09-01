// 第二轮 2c：主题偏好纯逻辑（亮/暗/跟随系统三态）
// DOM 应用层在 App 里（data-theme 属性），这里只做决策，保证可单测

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'ct-theme'

/** 三态循环：亮 → 暗 → 跟随系统 → 亮 */
export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light'
}

/** 偏好 + 系统状态 → 实际应用主题 */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

/** 读取持久化偏好（容错：非法值回落 light） */
export function loadThemePref(storage?: Pick<Storage, 'getItem'>): ThemePref {
  try {
    const v = (storage || window.localStorage).getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* 隐私模式等 */ }
  return 'light'
}

export function saveThemePref(pref: ThemePref, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage || window.localStorage).setItem(THEME_KEY, pref) } catch { /* ignore */ }
}
