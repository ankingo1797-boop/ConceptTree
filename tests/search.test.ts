// 第二轮 2b：全局搜索纯函数测试
import { describe, expect, it } from 'vitest'
import { SEARCH_WEIGHTS, fieldLabel, makeSnippet, searchAll } from '../src/features/search'
import type { Concept, Series } from '../src/types'

const mkConcept = (over: Partial<Concept> & { id: string; name: string }): Concept => ({
  summary: '', parentId: null, sessionId: null, status: 'unlearned',
  x: null, y: null, notes: '', history: [], candidates: [],
  createdAt: 't', updatedAt: 't', ...over,
})

const mkSeries = (concepts: Concept[]): Series => ({
  id: 's1', name: 'S', rootConceptId: null,
  concepts: Object.fromEntries(concepts.map((c) => [c.id, c])),
  edges: [], createdAt: 't', updatedAt: 't',
})

describe('searchAll 四类命中', () => {
  it('空词 / 纯空白 → 空结果', () => {
    const s = mkSeries([mkConcept({ id: 'a', name: '机器学习' })])
    expect(searchAll(s, '')).toEqual([])
    expect(searchAll(s, '   ')).toEqual([])
  })

  it('概念名命中（权重 4）', () => {
    const s = mkSeries([mkConcept({ id: 'a', name: '机器学习' })])
    const r = searchAll(s, '机器')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ conceptId: 'a', field: 'name', weight: 4 })
  })

  it('总结/笔记/对话历史分别命中对应字段', () => {
    const s = mkSeries([
      mkConcept({ id: 'a', name: '甲', summary: '总结里有梯度下降' }),
      mkConcept({ id: 'b', name: '乙', notes: '笔记里也写了梯度下降' }),
      mkConcept({ id: 'c', name: '丙', history: [{ role: 'assistant', content: '对话里解释梯度下降' }] }),
    ])
    const r = searchAll(s, '梯度下降')
    expect(r.map((x) => x.field).sort()).toEqual(['history', 'notes', 'summary'])
  })

  it('英文大小写不敏感', () => {
    const s = mkSeries([mkConcept({ id: 'a', name: 'Transformer' })])
    expect(searchAll(s, 'transformer')).toHaveLength(1)
    expect(searchAll(s, 'TRANSFORM')).toHaveLength(1)
  })

  it('权重排序：名称 > 总结 > 笔记 > 对话', () => {
    const s = mkSeries([
      mkConcept({ id: 'h', name: '概念丁', history: [{ role: 'user', content: '关键词X' }] }),
      mkConcept({ id: 'n', name: '概念丙', notes: '关键词X' }),
      mkConcept({ id: 's', name: '概念乙', summary: '关键词X' }),
      mkConcept({ id: 'm', name: '关键词X' }),
    ])
    const r = searchAll(s, '关键词X')
    expect(r.map((x) => x.conceptId)).toEqual(['m', 's', 'n', 'h'])
  })

  it('同一概念多字段命中 → 多条结果', () => {
    const s = mkSeries([mkConcept({ id: 'a', name: '神经网络', summary: '神经网络是…', notes: '我对神经网络的理解' })])
    const r = searchAll(s, '神经网络')
    expect(r).toHaveLength(3)
    expect(new Set(r.map((x) => x.field)).size).toBe(3)
  })

  it('无命中 → 空结果', () => {
    const s = mkSeries([mkConcept({ id: 'a', name: '机器学习', summary: '监督学习' })])
    expect(searchAll(s, '量子纠缠')).toEqual([])
  })

  it('limit 上限生效（默认 20）', () => {
    const many = Array.from({ length: 25 }, (_, i) => mkConcept({ id: 'c' + i, name: '概念' + i, summary: '命中词' }))
    const r = searchAll(mkSeries(many), '命中词')
    expect(r).toHaveLength(20)
  })

  it('对话历史只取第一条命中消息', () => {
    const s = mkSeries([mkConcept({
      id: 'a', name: '甲',
      history: [
        { role: 'user', content: '第一次提到反向传播' },
        { role: 'assistant', content: '第二次提到反向传播' },
      ],
    })])
    const r = searchAll(s, '反向传播')
    expect(r).toHaveLength(1)
    expect(r[0].snippet).toContain('第一次')
  })
})

describe('makeSnippet 片段截取', () => {
  it('命中在开头：无左省略号', () => {
    expect(makeSnippet('机器学习是核心', 0, 4)).toBe('机器学习是核心')
  })

  it('命中在中部：两端省略号 + 压平空白', () => {
    const text = 'A'.repeat(40) + ' 目标词 ' + 'B'.repeat(40)
    const idx = text.indexOf('目标词')
    const s = makeSnippet(text, idx, 3)
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).toContain('目标词')
  })

  it('fieldLabel 与权重常量一致', () => {
    expect(fieldLabel('name')).toBe('名称')
    expect(fieldLabel('history')).toBe('对话')
    expect(SEARCH_WEIGHTS.name).toBeGreaterThan(SEARCH_WEIGHTS.summary)
  })
})
