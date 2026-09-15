// 第二轮 2c：主题纯逻辑测试 + 暗色令牌存在性检查
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_KEY, loadThemePref, nextThemePref, resolveTheme, saveThemePref } from '../src/features/theme'

describe('nextThemePref 三态循环', () => {
  it('亮 → 暗 → 跟随系统 → 亮', () => {
    expect(nextThemePref('light')).toBe('dark')
    expect(nextThemePref('dark')).toBe('system')
    expect(nextThemePref('system')).toBe('light')
  })
})

describe('resolveTheme 偏好解析', () => {
  it('手动偏好无视系统', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('跟随系统时取系统状态', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('loadThemePref / saveThemePref 持久化', () => {
  const mkStorage = (init: Record<string, string> = {}) => {
    const store: Record<string, string> = { ...init }
    return { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, _store: store }
  }

  it('保存后可读回', () => {
    const s = mkStorage()
    saveThemePref('dark', s)
    expect(loadThemePref(s)).toBe('dark')
  })

  it('非法值回落 light（默认亮）', () => {
    expect(loadThemePref(mkStorage({ [THEME_KEY]: 'purple' }))).toBe('light')
    expect(loadThemePref(mkStorage())).toBe('light')
  })
})

describe('index.html 暗色令牌覆盖块', () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')

  it('存在 data-theme=dark 覆盖块', () => {
    expect(html).toContain('[data-theme="dark"]')
  })

  it('关键令牌在暗色块里有覆盖', () => {
    // 第八轮：文件中存在多处 [data-theme="dark"] 选择器（噪声/混合模式规则），
    // 暗色令牌块是最后一个出现位置，取它到文件尾的片段断言
    const idx = html.lastIndexOf('[data-theme="dark"]')
    const block = idx >= 0 ? html.slice(idx) : ''
    for (const token of ['--ct-bg', '--ct-panel', '--ct-fg', '--ct-border', '--ct-surface', '--ct-cal-1']) {
      expect(block, token).toContain(token)
    }
  })
})
