// 第五轮 B：Markdown 导出纯函数测试
import { describe, expect, it } from 'vitest'
import { seriesToMarkdown } from '../src/features/exportMarkdown'
import type { Concept, Series } from '../src/types'

const NOW = new Date('2026-08-15T10:00:00')

const C = (over: Partial<Concept> & { id: string; name: string }): Concept => ({
  summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [],
  createdAt: 't', updatedAt: 't', ...over,
})

const base = (concepts: Record<string, Concept>, edges: Series['edges']): Series => ({
  id: 's1', name: '机械学习', rootConceptId: null,
  concepts, edges, createdAt: 't', updatedAt: 't',
})

describe('seriesToMarkdown', () => {
  it('标题与元信息：系列名、日期、概念计数', () => {
    const md = seriesToMarkdown(base({ a: C({ id: 'a', name: '机器学习', status: 'learned' }) }, []), NOW)
    expect(md).toContain('# 机械学习 · 概念学习树')
    expect(md).toContain('2026-08-15')
    expect(md).toContain('共 1 个概念')
    expect(md).toContain('已掌握 1')
  })

  it('层级结构：根 ##，子 ###，孙 ####', () => {
    const md = seriesToMarkdown(base(
      {
        r: C({ id: 'r', name: '根' }),
        m: C({ id: 'm', name: '中层' }),
        l: C({ id: 'l', name: '叶子' }),
      },
      [
        { id: 'e1', from: 'r', to: 'm', type: 'parent-child' },
        { id: 'e2', from: 'm', to: 'l', type: 'parent-child' },
      ],
    ), NOW)
    expect(md).toContain('## 根（未学习）')
    expect(md).toContain('### 中层（未学习）')
    expect(md).toContain('#### 叶子（未学习）')
    expect(md.indexOf('## 根')).toBeLessThan(md.indexOf('### 中层'))
    expect(md.indexOf('### 中层')).toBeLessThan(md.indexOf('#### 叶子'))
  })

  it('总结用引用块、笔记独立段落、复习信息行', () => {
    const md = seriesToMarkdown(base({
      a: C({
        id: 'a', name: '梯度下降', status: 'learning',
        summary: '沿负梯度方向更新参数', notes: '我的理解：步长很关键',
        review: { box: 1, dueAt: '2026-08-16T09:00:00', reps: 3, lapses: 1, lastReviewedAt: null },
      }),
    }, []), NOW)
    expect(md).toContain('> 沿负梯度方向更新参数')
    expect(md).toContain('**笔记**：')
    expect(md).toContain('我的理解：步长很关键')
    expect(md).toContain('已复习 3 次 · 忘记 1 次 · 下次到期 2026-08-16')
  })

  it('环中的概念归入「其他概念」（不丢失、不死循环）', () => {
    const md = seriesToMarkdown(base(
      {
        x: C({ id: 'x', name: '环概念X' }),
        y: C({ id: 'y', name: '环概念Y' }),
      },
      [
        { id: 'e1', from: 'x', to: 'y', type: 'parent-child' },
        { id: 'e2', from: 'y', to: 'x', type: 'parent-child' },
      ],
    ), NOW)
    expect(md).toContain('## 其他概念')
    expect(md).toContain('环概念X')
    expect(md).toContain('环概念Y')
  })

  it('复习概览：连续天数/累计次数/今日到期', () => {
    const md = seriesToMarkdown(base({
      a: C({
        id: 'a', name: '甲',
        review: { box: 0, dueAt: '2026-08-15T09:00:00', reps: 1, lapses: 0, lastReviewedAt: null, reviewLog: ['2026-08-15', '2026-08-14'] },
      }),
    }, []), NOW)
    expect(md).toContain('## 复习概览')
    expect(md).toContain('连续复习天数：2')
    expect(md).toContain('累计复习次数：2')
    expect(md).toContain('复习计划中：1')
    expect(md).toContain('今日到期：1')
  })

  it('空系列：仍有标题与零值概览', () => {
    const md = seriesToMarkdown(base({}, []), NOW)
    expect(md).toContain('# 机械学习 · 概念学习树')
    expect(md).toContain('共 0 个概念')
    expect(md).toContain('连续复习天数：0')
  })

  it('超深链条（>6 层）转列表格式，不产生 #######', () => {
    const concepts: Record<string, Concept> = {}
    const edges: Series['edges'] = []
    for (let i = 0; i < 8; i++) {
      concepts['n' + i] = C({ id: 'n' + i, name: '深度' + i })
      if (i > 0) edges.push({ id: 'e' + i, from: 'n' + (i - 1), to: 'n' + i, type: 'parent-child' })
    }
    const md = seriesToMarkdown(base(concepts, edges), NOW)
    expect(md).not.toContain('#######')
    expect(md).toContain('- **深度7**')
  })
})
