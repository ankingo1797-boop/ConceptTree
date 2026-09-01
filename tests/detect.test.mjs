// 环 0：detect 行为快照（重构前后行为一致的证据）
// 环 3：H1 回归断言（后缀模式过度吞字）
import { describe, expect, it } from 'vitest'
import { detectCandidates } from '../server/detect.mjs'

describe('detectCandidates', () => {
  it('检出英文 PascalCase 与中文词表术语', () => {
    const c = detectCandidates('机器学习是人工智能的核心领域。Transformer 架构和深度学习很重要。', [])
    expect(c).toContain('Transformer')
    expect(c).toContain('机器学习')
    expect(c).toContain('深度学习')
  })

  it('过滤已存在的概念名', () => {
    const c = detectCandidates('机器学习与 Transformer', ['机器学习'])
    expect(c).not.toContain('机器学习')
    expect(c).toContain('Transformer')
  })

  it('空/非字符串输入返回空数组', () => {
    expect(detectCandidates('', [])).toEqual([])
    expect(detectCandidates(null, [])).toEqual([])
    expect(detectCandidates(undefined, [])).toEqual([])
  })

  it('忽略英文停用词与句首虚词', () => {
    const c = detectCandidates('The and With are not candidates', [])
    expect(c).toEqual([])
  })

  it('最多返回 20 个候选', () => {
    const many = Array.from({ length: 30 }, (_, i) => 'Word' + i).join(' and ')
    const c = detectCandidates(many, [])
    expect(c.length).toBeLessThanOrEqual(20)
  })

  // ---- H1 回归：后缀模式不得过度吞字 ----
  it('H1：「架构和深度学习」不再产出「架构和深度学」这类跨虚词候选', () => {
    const c = detectCandidates('机器学习是人工智能的核心领域。Transformer 架构和深度学习很重要。', [])
    expect(c).not.toContain('架构和深度学')
    expect(c.some((x) => x.includes('和'))).toBe(false) // 任何候选都不得横跨虚词「和」
    expect(c).toContain('深度学习') // 词表路径不受影响
    expect(c).toContain('Transformer')
  })

  it('H1：后缀模式仍正常捕获「前缀后缀+合法延伸」', () => {
    const c = detectCandidates('梯度下降收敛很快', [])
    expect(c).toContain('梯度下降') // 后缀「梯度」+ 延伸「下降」
  })

  it('H1：含「的」的噪声候选被拒绝', () => {
    const c = detectCandidates('卷积神经网络的优化值得研究', [])
    expect(c.some((x) => x.includes('的'))).toBe(false)
  })
})
