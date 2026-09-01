// 第二轮 1.7 反馈 #10：一句话总结提取纯函数测试
import { describe, expect, it } from 'vitest'
import { deriveOneLiner } from '../src/features/oneLiner'

describe('deriveOneLiner 一句话总结提取', () => {
  it('取第一句（中文句号）', () => {
    const text = '机器学习是让计算机从数据中学习规律的技术。它分为监督学习和无监督学习。'
    expect(deriveOneLiner(text)).toBe('机器学习是让计算机从数据中学习规律的技术。')
  })

  it('去掉 markdown 标题与粗体后提取', () => {
    const text = '## 什么是神经网络？\n**神经网络**是模仿大脑神经元的计算模型！下一句继续。'
    const one = deriveOneLiner(text)
    expect(one).toContain('神经网络')
    expect(one).toBe('什么是神经网络？')
  })

  it('去掉列表符号与链接', () => {
    const text = '- 第一点内容 [链接文字](https://example.com)。其余内容。'
    expect(deriveOneLiner(text)).toBe('第一点内容 链接文字。')
  })

  it('超长截断并加省略号', () => {
    const text = '这是一个非常非常长的句子'.repeat(10) + '。'
    const one = deriveOneLiner(text, 30)
    expect(one.length).toBeLessThanOrEqual(31)
    expect(one.endsWith('…')).toBe(true)
  })

  it('代码块内容不参与总结', () => {
    const text = '```\ncode here\n```\n真正的总结在这里。后面还有。'
    expect(deriveOneLiner(text)).toBe('真正的总结在这里。')
  })

  it('空内容返回空字符串', () => {
    expect(deriveOneLiner('')).toBe('')
    expect(deriveOneLiner('```only code```')).toBe('')
  })

  it('无句号时取整段（并截断）', () => {
    const one = deriveOneLiner('没有句号的短文本')
    expect(one).toBe('没有句号的短文本')
  })
})
