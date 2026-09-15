// 轻量 Markdown 渲染器：把 AI 回答渲染成整洁富文本
// 支持：# 标题、**粗体**、`行内代码`、```代码块```、- 列表、> 引用、--- 分隔线
// 不引入第三方依赖，输出 React 元素（安全转义，无 dangerouslySetInnerHTML）

import React from 'react'

// 行内格式化：**粗体**、`代码`
function renderInline(text, keyPrefix) {
  const parts = []
  // 按 **...** 或 `...` 切分
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, m, i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      parts.push(<strong key={keyPrefix + 'b' + i++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={keyPrefix + 'c' + i++} style={styles.code}>{token.slice(1, -1)}</code>)
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// 整段渲染：按行分块，识别块级语法
export default function Markdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行
    if (!trimmed) { i++; continue }

    // 代码块 ```...```
    if (trimmed.startsWith('```')) {
      let codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      i++ // 跳过闭合 ```
      blocks.push(<pre key={'pre' + key++} style={styles.pre}><code>{codeLines.join('\n')}</code></pre>)
      continue
    }

    // 标题 ## / ### / ####
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const size = level === 1 ? 20 : level === 2 ? 17 : level === 3 ? 15 : 14
      blocks.push(<div key={'h' + key++} style={{ fontSize: size, fontWeight: 700, margin: '10px 0 6px', lineHeight: 1.4 }}>{renderInline(heading[2], 'h' + key)}</div>)
      i++
      continue
    }

    // 分隔线 --- / ***
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={'hr' + key++} style={{ border: 'none', borderTop: '1px solid var(--ct-border-strong)', margin: '10px 0' }} />)
      i++
      continue
    }

    // 引用 > text
    if (trimmed.startsWith('>')) {
      let quoteLines = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(<div key={'q' + key++} style={styles.quote}>{renderInline(quoteLines.join(' '), 'q' + key)}</div>)
      continue
    }

    // 无序列表 - / * item
    if (/^\s*[-*]\s+/.test(line)) {
      let items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={'ul' + key++} style={{ margin: '6px 0 6px 20px', padding: 0 }}>
          {items.map((it, idx) => <li key={idx} style={{ margin: '3px 0' }}>{renderInline(it, 'li' + key + idx)}</li>)}
        </ul>
      )
      continue
    }

    // 有序列表 1. item
    if (/^\s*\d+\.\s+/.test(line)) {
      let items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={'ol' + key++} style={{ margin: '6px 0 6px 20px', padding: 0 }}>
          {items.map((it, idx) => <li key={idx} style={{ margin: '3px 0' }}>{renderInline(it, 'ol' + key + idx)}</li>)}
        </ol>
      )
      continue
    }

    // 普通段落（合并连续行）
    let para = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|-{3,}|\*{3,}|>{1}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim())) {
      para.push(lines[i]); i++
    }
    blocks.push(<p key={'p' + key++} style={{ margin: '4px 0', lineHeight: 1.7 }}>{renderInline(para.join('\n'), 'p' + key)}</p>)
  }

  return <div style={styles.root}>{blocks}</div>
}

const styles = {
  root: { fontSize: 13, lineHeight: 1.7, wordBreak: 'break-word' },
  code: { background: 'var(--ct-code-bg)', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'Consolas, monospace' },
  pre: { background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', color: 'var(--ct-fg)', padding: '10px 12px', borderRadius: 'var(--ct-radius-sm)', overflowX: 'auto', fontSize: 12, lineHeight: 1.6 },
  quote: { borderLeft: '3px solid var(--ct-border-strong)', padding: '4px 10px', margin: '6px 0', color: 'var(--ct-fg-secondary)', background: 'var(--ct-surface)', borderRadius: '0 6px 6px 0' },
}
