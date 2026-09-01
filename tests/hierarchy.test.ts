// 第二轮 2.9 反馈 #2：AI 层级分析纯函数测试
import { describe, expect, it } from 'vitest'
import { HIERARCHY_SYSTEM_PROMPT, buildHierarchyList, parseHierarchyPlan, wouldCreateCycle } from '../src/features/hierarchy'

describe('parseHierarchyPlan 解析', () => {
  it('标准 JSON 数组', () => {
    const r = parseHierarchyPlan('[{"parent":"机器学习","child":"神经网络"}]')
    expect(r).toEqual([{ parent: '机器学习', child: '神经网络' }])
  })

  it('容忍 markdown 代码块与前后缀', () => {
    const text = '好的，分析如下：\n```json\n[{"parent": "A", "child": "B"}, {"parent":"B","child":"C"}]\n```\n以上。'
    expect(parseHierarchyPlan(text)).toEqual([
      { parent: 'A', child: 'B' },
      { parent: 'B', child: 'C' },
    ])
  })

  it('丢弃缺字段/空值/非对象项', () => {
    const text = '[{"parent":"A"},{"child":"B"},{},{"parent":" ","child":"C"},"x",{"parent":"D","child":"E"}]'
    expect(parseHierarchyPlan(text)).toEqual([{ parent: 'D', child: 'E' }])
  })

  it('空输入 / 无 JSON / 坏 JSON → []', () => {
    expect(parseHierarchyPlan('')).toEqual([])
    expect(parseHierarchyPlan('没有层级关系')).toEqual([])
    expect(parseHierarchyPlan('[{"parent": 坏掉]')).toEqual([])
  })

  it('trim 名称两端空白', () => {
    expect(parseHierarchyPlan('[{"parent":" 甲 ","child":" 乙 "}]')).toEqual([{ parent: '甲', child: '乙' }])
  })
})

describe('wouldCreateCycle 环保护', () => {
  it('自环：parent == child → true', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true)
  })

  it('直接反向边成环：已有 a→b，加 b→a → true', () => {
    expect(wouldCreateCycle([{ from: 'a', to: 'b' }], 'b', 'a')).toBe(true)
  })

  it('间接祖先成环：a→b→c，加 c→a → true', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true)
  })

  it('正常扩展不成环：a→b，加 a→c / b→c → false', () => {
    const edges = [{ from: 'a', to: 'b' }]
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false)
    expect(wouldCreateCycle(edges, 'b', 'c')).toBe(false)
  })

  it('空边表：任意不同两点不成环', () => {
    expect(wouldCreateCycle([], 'x', 'y')).toBe(false)
  })
})

describe('buildHierarchyList / 系统提示词', () => {
  it('清单格式：名称 + 可选总结', () => {
    const text = buildHierarchyList([
      { name: '机器学习', summary: '从数据中学习' },
      { name: '深度学习' },
    ])
    expect(text).toBe('- 机器学习：从数据中学习\n- 深度学习')
  })

  it('系统提示词约定 JSON 输出', () => {
    expect(HIERARCHY_SYSTEM_PROMPT).toContain('JSON')
    expect(HIERARCHY_SYSTEM_PROMPT).toContain('parent')
  })
})
