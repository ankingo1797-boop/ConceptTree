// 第十八轮：首次进入的欢迎引导（一次性）
// 内容：一句话介绍 + 3 步上手 + 「载入示例系列」/「配置 AI」/「开始使用」三个动作。
import React from 'react'

export default function WelcomeModal({ onConfigure, onLoadSample, onStart }: {
  onConfigure: () => void
  onLoadSample: () => void
  onStart: () => void
}) {
  return (
    <div style={backdrop} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="欢迎使用概念学习树" className="ct-glass ct-pop" style={dialog}>
        <div style={title}>🌳 欢迎使用「概念学习树」</div>
        <p style={desc}>从一个概念出发，顺着 AI 回答里的子概念不断生长成一棵知识树——随时回溯、继续、复习，让学习从"线性聊天"变成"结构化积累"。</p>
        <ol style={steps}>
          <li>新建一个「系列」（学习主题），比如「机器学习」</li>
          <li>选中概念 → 右侧与 AI 对话 → 点回答里的候选词，概念就长进树里</li>
          <li>把学透的标为「已掌握」，到期会自动提醒你复习</li>
        </ol>
        <div style={row}>
          <button className="ct-btn" style={btn} onClick={onLoadSample}>载入示例系列</button>
          <span style={{ flex: 1 }} />
          <button className="ct-btn" style={btn} onClick={onConfigure}>配置 AI</button>
          <button className="ct-btn ct-btn-primary" style={btn} onClick={onStart}>开始使用</button>
        </div>
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }
const dialog: React.CSSProperties = { width: 'min(520px, 92vw)', background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-lg)', boxShadow: 'var(--ct-shadow-4)', padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 14 }
const title: React.CSSProperties = { fontSize: 19, fontWeight: 700, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)' }
const desc: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.7, color: 'var(--ct-fg-secondary)', margin: 0 }
const steps: React.CSSProperties = { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: 'var(--ct-fg)' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }
const btn: React.CSSProperties = { padding: '8px 16px' }
