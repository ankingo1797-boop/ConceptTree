// 第二轮 1.7 反馈 #10：AI 回答结束后自动生成「一句话总结」草稿（用户可再编辑）
// 纯函数：从 AI 回答文本提取第一句有意义的话

/** 去掉 markdown 噪音，取第一句作为一句话总结；空内容返回 '' */
export function deriveOneLiner(text: string, maxLen = 60): string {
  if (!text) return ''
  // 去掉代码块
  let t = text.replace(/```[\s\S]*?```/g, ' ')
  // 去掉行内代码
  t = t.replace(/`[^`]*`/g, ' ')
  // 去掉标题井号、粗体/斜体星号、引用符
  t = t.replace(/^#{1,6}\s*/gm, '')
  t = t.replace(/\*\*|__|\*|_|^>\s?/gm, '')
  // 去掉 markdown 链接，保留文字
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 去掉列表符号
  t = t.replace(/^\s*[-•]\s+/gm, '')
  t = t.replace(/^\s*\d+\.\s+/gm, '')
  // 压平空白
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  // 取第一句（中英文句末标点）
  const m = t.match(/^[^。！？!?；;.]+[。！？!?；;.]/)
  let one = m ? m[0] : t
  one = one.trim()
  if (one.length > maxLen) one = one.slice(0, maxLen).trimEnd() + '…'
  return one
}
