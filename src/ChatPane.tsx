// 对话页：概念对话（流式 AI）+ 候选概念检测（规则+AI增强）+ 笔记 + 添加概念
// 第一轮 B：笔记/总结草稿纪律（700ms 防抖自动保存 + onBlur 保存 + 手动保存冲刷）
// 第二轮 1.7 反馈 #5/6/7：右侧改为「对话｜笔记·详情」标签页导航；反馈 #9 滚动自由；反馈 #10 自动一句话总结
import React from 'react'
import { chatStream, detectCandidates } from './api.ts'
import Markdown from './Markdown.jsx'
import { useSave } from './SaveContext.tsx'
import { dueLabel } from './features/reviewScheduler.ts'
import { deriveOneLiner } from './features/oneLiner.ts'
import { IconChat, IconNote, IconPlus, IconSend } from './icons.tsx'
import SlidingTabs from './components/SlidingTabs.tsx'
import FancySelect from './components/FancySelect.tsx'
import type { ChatMessage, Concept, ConceptStatus, Series } from './types'
import { STATUS_META } from './features/status.ts'

const STATUS_ORDER: ConceptStatus[] = ['unlearned', 'learning', 'learned', 'doubtful']

// 第二轮 3.9 反馈 #11：AI 回答长度控制（注入系统提示词，偏好持久化）
type AnswerLength = 'brief' | 'normal' | 'detailed'
const ANSWER_LENGTH_KEY = 'ct-answer-length'
const ANSWER_LENGTH_PROMPTS: Record<AnswerLength, string> = {
  brief: '请非常简洁地回答：直接给出核心结论，控制在 100 字以内，不要展开。',
  normal: '请适中篇幅回答：讲清楚要点即可，约 300 字。',
  detailed: '请详细回答：涵盖背景、原理与例子，可分点展开，不限篇幅。',
}

interface ChatPaneProps {
  series: Series
  concept: Concept | null
  selectedId: string | null
  onUpdateConcept: (id: string, patch: Partial<Concept>) => void
  onAddConcept: (concept: Partial<Concept> & { name: string; parentId?: string | null }) => string | void
  onToggleReview?: (id: string) => void
  model?: string
}

export default function ChatPane({ series, concept, selectedId, onUpdateConcept, onAddConcept, onToggleReview, model }: ChatPaneProps) {
  // 第二轮 1.7 反馈 #5/6/7：标签页导航（对话｜笔记·详情），各自独占全高
  const [tab, setTab] = React.useState<'chat' | 'details'>('chat')
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatMessage[]>(concept?.history || [])
  const [streaming, setStreaming] = React.useState(false)
  const [detectMode, setDetectMode] = React.useState<'rule' | 'ai'>('rule')
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState(concept?.notes || '')
  const [noteSaved, setNoteSaved] = React.useState(false)
  const [manualName, setManualName] = React.useState('')
  const [candCollapsed, setCandCollapsed] = React.useState(true) // 第二轮 1.8 反馈 #1：候选区默认折叠，减少视觉占用
  const [summaryDraft, setSummaryDraft] = React.useState(concept?.summary || '')   // 受控：支持 AI 自动回填（反馈 #10）
  const [summaryHint, setSummaryHint] = React.useState<string | null>(null)
  // 第二轮 3.9 反馈 #11：回答长度偏好
  const [answerLen, setAnswerLen] = React.useState<AnswerLength>(() => {
    try {
      const v = localStorage.getItem(ANSWER_LENGTH_KEY)
      return v === 'brief' || v === 'detailed' ? v : 'normal'
    } catch { return 'normal' }
  })
  const changeAnswerLen = (v: AnswerLength) => {
    setAnswerLen(v)
    try { localStorage.setItem(ANSWER_LENGTH_KEY, v) } catch { /* ignore */ }
  }
  const abortRef = React.useRef<AbortController | null>(null)
  const messagesRef = React.useRef<HTMLDivElement | null>(null)
  // 第二轮 1.7 反馈 #9：仅当用户停留在底部时才自动跟随滚动；上滚看历史即放手
  const stickRef = React.useRef(true)
  const selectedIdRef = React.useRef(selectedId)
  React.useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // ---- 草稿纪律（第一轮 B）----
  const { registerSaveHandler } = useSave()
  // 注意：conceptRef 只在 [concept] effect 中更新（声明在切换冲刷 effect 之后），
  // 保证切换概念时冲刷的仍是旧概念，不会把旧草稿写进新概念
  const conceptRef = React.useRef(concept)
  const noteRef = React.useRef(concept?.notes || '')
  const summaryDraftRef = React.useRef(concept?.summary || '')
  const draftTimer = React.useRef<number | null>(null)

  // 冲刷草稿：仅在内容有差异时写（diff 守卫），走统一的 persist → saveStatus
  const saveDrafts = React.useCallback(() => {
    const c = conceptRef.current
    if (!c) return
    const patch: Partial<Concept> = {}
    if (noteRef.current !== (c.notes || '')) patch.notes = noteRef.current
    if (summaryDraftRef.current.trim() !== (c.summary || '')) patch.summary = summaryDraftRef.current.trim()
    if (Object.keys(patch).length > 0) onUpdateConcept(c.id, patch)
  }, [onUpdateConcept])
  const saveDraftsRef = React.useRef(saveDrafts)
  React.useEffect(() => { saveDraftsRef.current = saveDrafts })

  // 登记到手动保存（顶栏 💾 冲刷全部草稿）
  React.useEffect(() => registerSaveHandler(() => saveDraftsRef.current()), [registerSaveHandler])

  const scheduleDraftSave = React.useCallback(() => {
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => { draftTimer.current = null; saveDraftsRef.current() }, 700)
  }, [])

  const flushDraftNow = React.useCallback(() => {
    if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null }
    saveDraftsRef.current()
  }, [])

  const [candidates, setCandidates] = React.useState<string[] | null>(concept?.candidates || null)

  // 切换概念时重置本地状态（候选概念从概念数据恢复）
  React.useEffect(() => {
    // 先冲刷上一个概念的草稿（refs 仍指向旧概念），再重置
    flushDraftNow()
    // 中止未完成的流式请求（防旧请求污染）
    if (abortRef.current) { try { abortRef.current.abort() } catch { /* ignore */ } }
    setMessages(concept?.history || [])
    setNote(concept?.notes || '')
    noteRef.current = concept?.notes || ''
    summaryDraftRef.current = concept?.summary || ''
    setSummaryDraft(concept?.summary || '')
    setSummaryHint(null)
    setCandidates(concept?.candidates || null)
    setError(null)
    setNoteSaved(false)
    setManualName('')
    setStreaming(false)
    stickRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // 在冲刷 effect 之后更新，保证切换瞬间冲刷的仍是旧概念
  React.useEffect(() => { conceptRef.current = concept }, [concept])

  // 消息变更时持久化到 concept.history（对话历史保存）
  React.useEffect(() => {
    if (concept && messages.length > 0 && messages !== concept.history) {
      onUpdateConcept(concept.id, { history: messages })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // 候选概念变更时持久化到 concept.candidates（仅在内容确实变化时写，避免循环）
  React.useEffect(() => {
    if (concept && candidates !== null && candidates !== concept.candidates) {
      onUpdateConcept(concept.id, { candidates })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  // 第二轮 1.7 反馈 #9：仅当用户停留在底部时才自动滚到底（上滚看历史不会被拽回去）
  const onMessagesScroll = () => {
    const el = messagesRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
  React.useEffect(() => {
    const el = messagesRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, streaming, tab])

  const send = () => {
    if (!input.trim() || !concept || streaming) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
    const next: ChatMessage[] = [...messages, userMsg]
    const myConceptId = concept.id
    setMessages(next)
    setInput('')
    setStreaming(true)
    setError(null)
    stickRef.current = true // 自己发送 → 恢复跟随

    // 追加一个空的 assistant 消息用于流式填充
    setMessages([...next, { role: 'assistant', content: '' }])

    let acc = ''
    abortRef.current = new AbortController()
    // 第二轮 3.9 反馈 #11：按长度偏好注入系统提示词
    chatStream([{ role: 'system', content: '你是学习伙伴。' + ANSWER_LENGTH_PROMPTS[answerLen] }, ...next], {
      model,
      signal: abortRef.current.signal,
      onDelta: (delta) => {
        acc += delta
        // 若已切换概念，丢弃旧流式更新（防覆盖）
        if (selectedIdRef.current !== myConceptId) return
        setMessages([...next, { role: 'assistant', content: acc }])
      },
      onDone: () => {
        if (selectedIdRef.current !== myConceptId) return
        setMessages([...next, { role: 'assistant', content: acc }])
        setStreaming(false)
        // 回答完成后自动检测候选概念（规则）
        autoDetect(acc)
        // 第二轮 1.8 反馈 #4：一句话总结由 AI 基于整个回答生成（失败回退首句提取）
        summarizeAnswer(acc, myConceptId)
      },
      onError: (msg) => {
        if (selectedIdRef.current !== myConceptId) return
        setError(msg); setStreaming(false)
      },
    })
  }

  // 第二轮 1.8 反馈 #4：一句话总结由 AI 基于【整个回答】生成，不再随手取首句；
  // AI 不可用/超时/空结果时回退到首句提取（deriveOneLiner），保证总有草稿可编辑
  const summarizeAnswer = (answerText: string, conceptId: string) => {
    const applyLine = (line: string, hint: string) => {
      if (!line) { setSummaryHint(null); return }
      summaryDraftRef.current = line
      setSummaryDraft(line)
      setSummaryHint(hint)
      scheduleDraftSave()
    }
    const fallback = () => applyLine(deriveOneLiner(answerText), '已自动生成一句话总结，可随时修改')
    const c = conceptRef.current
    if (!c || (c.summary || '').trim()) return          // 已有总结 → 不覆盖
    if (answerText.trim().length < 40) { fallback(); return } // 回答太短不值得总结
    setSummaryHint('正在根据整个回答生成一句话总结…')
    chatStream([
      { role: 'system', content: '你是总结助手。把用户给出的学习内容总结成一句话（不超过 60 字）。只输出总结本身，不要任何前缀、引号或解释。' },
      { role: 'user', content: answerText },
    ], {
      model,
      onDelta: () => { /* 只要最终结果 */ },
      onDone: (full) => {
        if (selectedIdRef.current !== conceptId) return
        let line = (full || '').trim().replace(/^["'“”\s]+|["'“”\s]+$/g, '').replace(/\s+/g, ' ')
        if (!line) line = deriveOneLiner(answerText)
        if (line.length > 80) line = line.slice(0, 80).trimEnd() + '…'
        applyLine(line, 'AI 已根据整个回答生成一句话总结，可随时修改')
      },
      onError: () => {
        if (selectedIdRef.current !== conceptId) return
        fallback()
      },
    })
  }

  // 候选概念检测：规则（默认）或 AI 增强
  const autoDetect = (text) => {
    const existing = Object.values(series.concepts || {}).map((c) => c.name)
    if (detectMode === 'rule') {
      detectCandidates(text, existing).then((r) => setCandidates(r.candidates || []))
    } else {
      // AI 增强：把回答发给 AI 让其提取候选概念，解析返回的 JSON 数组
      setError(null)
      chatStream([
        { role: 'system', content: '你是概念提取器。从用户消息中提取值得学习的概念术语。只输出一个 JSON 字符串数组，如 ["概念1","概念2"]。不要输出任何其他内容。' },
        { role: 'user', content: text },
      ], {
        model,
        onDelta: () => { /* 流式忽略 */ },
        onDone: (full) => {
          const parsed = parseJsonArray(full)
          if (parsed && parsed.length > 0) {
            setCandidates(parsed.filter((c) => !existing.includes(c)).slice(0, 20))
          } else {
            autoDetectRule(text)  // AI 未返回有效 JSON → 规则兜底
          }
        },
        onError: () => autoDetectRule(text),
      })
    }
  }
  const autoDetectRule = (text) => {
    const existing = Object.values(series.concepts || {}).map((c) => c.name)
    detectCandidates(text, existing).then((r) => setCandidates(r.candidates || []))
  }

  // 从 AI 返回文本中解析 JSON 数组（容忍 markdown 代码块、前后缀）
  function parseJsonArray(text) {
    if (!text) return null
    // 提取 [...] 部分
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return null
    try {
      const arr = JSON.parse(m[0])
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    } catch { /* 继续尝试其他方式 */ }
    // 退而求其次：按行/逗号拆
    try {
      const items = m[0].replace(/[\[\]"']/g, '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      return items
    } catch { return null }
  }

  const addCandidate = (name) => {
    if (!concept) return
    // 候选概念 = 当前概念的【子概念】（挂到当前概念下，产生父子边）
    onAddConcept({ name, parentId: concept.id, status: 'unlearned', summary: '' })
    setCandidates((cs) => (cs || []).filter((c) => c !== name))
  }

  const saveNote = () => {
    flushDraftNow()
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1500)
  }

  // 第二轮 1.7 反馈 #8：状态改为显式四选一（去掉不透明的循环切换，避免误触）
  const setStatus = (s: ConceptStatus) => {
    if (concept && concept.status !== s) onUpdateConcept(concept.id, { status: s })
  }

  if (!concept) {
    return (
      <div style={styles.pane}>
        <div style={styles.hint}>从左侧画布选择一个概念，在这里与 AI 对话学习它。回答中的候选概念会自动检测，点击即可加入树。</div>
        {/* 第三轮 3b：空系列/未选中时也能手动添加概念（挂在根） */}
        <div style={styles.candidates}>
          <div style={styles.candidatesTitle}>手动添加概念（不需要 AI）</div>
          <div style={styles.manualRow}>
            <input
              style={styles.manualInput}
              placeholder="输入概念名称（回车确认）"
              aria-label="手动添加概念"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualName.trim()) {
                  onAddConcept({ name: manualName.trim(), status: 'unlearned', summary: '' })
                  setManualName('')
                }
              }}
            />
            <button style={styles.manualBtn} disabled={!manualName.trim()}
              onClick={() => { onAddConcept({ name: manualName.trim(), status: 'unlearned', summary: '' }); setManualName('') }}>
              添加
            </button>
          </div>
        </div>
      </div>
    )
  }

  const smeta = STATUS_META[concept.status] || STATUS_META.unlearned
  void smeta // （头部状态徽章移除后保留计算，供后续视觉复用）

  return (
    <div style={styles.pane}>
      {/* 第七轮 UI 优化：滑动分段标签（对话｜笔记·详情），弹性 glider 动效 */}
      <SlidingTabs
        items={[
          { key: 'chat', label: (<><IconChat size={14} /> 对话</>) },
          { key: 'details', label: (<><IconNote size={14} /> 笔记·详情</>) },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'chat' | 'details')}
      />

      {tab === 'chat' ? (
        <>
          {/* 概念头部（紧凑：名称 + 复习徽章） */}
          <div style={styles.conceptHeader}>
            <div style={styles.conceptName}>{concept.name}</div>
            {concept.review && <span style={styles.reviewChip} title="已加入复习计划">⏰ {dueLabel(concept.review.dueAt)}</span>}
          </div>
          {/* 第二轮 3.9 反馈 #4：对话标签里也能直接调整学习状态（显式四选一） */}
          <div style={styles.statusGroup}>
            {STATUS_ORDER.map((s) => (
              <button key={s}
                style={{ ...styles.statusOpt, padding: '3px 10px', ...(concept.status === s ? { background: STATUS_META[s].bg, color: STATUS_META[s].color, borderColor: STATUS_META[s].color, fontWeight: 600 } : {}) }}
                onClick={() => setStatus(s)}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>

          {/* 对话历史：占满剩余高度，独立滚动（反馈 #5/#9） */}
          <div style={styles.messages} ref={messagesRef} onScroll={onMessagesScroll}>
            {messages.length === 0 && <div style={styles.hint}>输入一个问题开始学习「{concept.name}」…</div>}
            {messages.map((m, i) => (
              <div key={i} style={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                <div style={{ ...styles.msgRole, color: m.role === 'user' ? 'rgba(255,255,255,.8)' : 'var(--ct-fg-muted)' }}>{m.role === 'user' ? '你' : 'AI'}</div>
                <div style={styles.msgContent}>
                  {m.role === 'user'
                    ? m.content
                    : (m.content
                        ? <Markdown text={m.content} />
                        : (i === messages.length - 1 && streaming ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ct-fg-muted)', fontSize: 12 }}>
                              <span className="ct-thinking"><span className="ct-thinking-dot" /><span className="ct-thinking-dot" /><span className="ct-thinking-dot" /></span>
                              思考中…
                            </span>
                          ) : ''))}
                </div>
              </div>
            ))}
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {/* 候选概念（对话流的一部分；第二轮 1.8 反馈 #1：可折叠，默认收起） */}
          {candidates !== null && (
            <div style={styles.candidates}>
              <button style={styles.candidatesHead} onClick={() => setCandCollapsed((v) => !v)}
                aria-expanded={!candCollapsed} title={candCollapsed ? '展开候选概念' : '折叠候选概念'}>
                <span style={styles.candidatesTitle}>
                  {candidates.length > 0 ? `候选概念 ${candidates.length} 个（挂到「${concept.name}」下）` : '未检测到候选概念'}
                </span>
                {candidates.length > 0 && <span style={styles.candidatesFold}>{candCollapsed ? '展开' : '收起'}</span>}
              </button>
              {candidates.length > 0 && !candCollapsed && (
                <div style={styles.candidateList}>
                  {candidates.map((c) => (
                    <button key={c} style={styles.candidateChip} onClick={() => addCandidate(c)} title="点击加入概念树"><IconPlus size={12} /> {c}</button>
                  ))}
                </div>
              )}
              {/* 手动添加概念（不依赖 AI 检测） */}
              <div style={styles.manualRow}>
                <input
                  style={styles.manualInput}
                  placeholder="手动添加概念（回车确认）"
                  aria-label="手动添加概念"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualName.trim()) {
                      addCandidate(manualName.trim())
                      setManualName('')
                    }
                  }}
                />
                <button style={styles.manualBtn} disabled={!manualName.trim()}
                  onClick={() => { addCandidate(manualName.trim()); setManualName('') }}>
                  添加
                </button>
              </div>
            </div>
          )}

          {/* 输入区（第七轮：聚焦发光容器，小而跟手） */}
          <div style={styles.inputArea} className="ct-chat-box">
            <textarea style={styles.input} rows={2} placeholder={`提问「${concept.name}」…（可粘贴 AI 回答检测候选概念）`}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <div style={styles.inputActions}>
              {/* 第七轮：原生 select → 自定义下拉（可主题化、hover 高亮） */}
              <FancySelect
                ariaLabel="AI 回答长度偏好"
                value={answerLen}
                onChange={(v) => changeAnswerLen(v as AnswerLength)}
                options={[
                  { value: 'brief', label: '回答: 简洁' },
                  { value: 'normal', label: '回答: 适中' },
                  { value: 'detailed', label: '回答: 详细' },
                ]}
              />
              <FancySelect
                ariaLabel="候选概念检测方式"
                value={detectMode}
                onChange={(v) => setDetectMode(v as 'rule' | 'ai')}
                options={[
                  { value: 'rule', label: '检测: 规则' },
                  { value: 'ai', label: '检测: AI增强' },
                ]}
              />
              <button className="ct-reveal" style={styles.sendBtn} onClick={send} disabled={!input.trim() || streaming || !concept}>
                {streaming ? '对话中…' : (<><IconSend size={14} /> 发送</>)}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* 笔记·详情：整页可上下滚动（反馈 #5） */
        <div style={styles.detailsCol}>
          <div style={styles.conceptHeader}>
            <div style={styles.conceptName}>{concept.name}</div>
          </div>
          {concept.parentId && <div style={styles.meta}>父概念: {series.concepts[concept.parentId]?.name || '?'}</div>}

          {/* 一句话总结（反馈 #10：AI 自动回填 + 可编辑） */}
          <div style={styles.fieldLabel}>一句话总结</div>
          {/* 第二轮 3.9 反馈 #6：一句话总结改多行，长内容完整可见 */}
          <textarea
            style={styles.summaryEditInput}
            rows={2}
            placeholder="一句话总结（悬停卡片时显示，自动保存）"
            value={summaryDraft}
            onChange={(e) => { setSummaryDraft(e.target.value); summaryDraftRef.current = e.target.value; scheduleDraftSave() }}
            onBlur={() => flushDraftNow()}
          />
          {summaryHint && <div style={styles.summaryHint}>{summaryHint}</div>}

          {/* 学习状态（显式四选一，反馈 #8） */}
          <div style={styles.fieldLabel}>学习状态</div>
          <div style={styles.statusGroup}>
            {STATUS_ORDER.map((s) => (
              <button key={s}
                style={{ ...styles.statusOpt, ...(concept.status === s ? { background: STATUS_META[s].bg, color: STATUS_META[s].color, borderColor: STATUS_META[s].color, fontWeight: 600 } : {}) }}
                onClick={() => setStatus(s)}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>

          {/* 复习计划（第一轮 1.5 修复 #7：规则可见化） */}
          <div style={styles.fieldLabel}>复习计划</div>
          <div style={styles.reviewRow}>
            {concept.review ? (
              <>
                <span style={styles.reviewOn}>⏰ 已加入复习 · {dueLabel(concept.review.dueAt)}</span>
                <button style={styles.reviewToggle} onClick={() => onToggleReview && onToggleReview(concept.id)}>移出复习</button>
              </>
            ) : (
              <>
                <span style={styles.reviewOff}>未加入复习</span>
                <button style={styles.reviewToggle} onClick={() => onToggleReview && onToggleReview(concept.id)} title="加入后从明天起按递增间隔安排复习">加入复习</button>
              </>
            )}
          </div>

          {/* 笔记（反馈 #6：更大的书写区） */}
          <div style={styles.noteBox}>
            <div style={styles.noteHeader}>
              <span style={styles.noteTitle}><IconNote size={14} /> 我的笔记</span>
              <span style={styles.noteHint}>自己的理解，与 AI 回答分离</span>
            </div>
            <textarea style={styles.noteInput} placeholder="写下你自己的理解、例子或疑问…（自动保存）"
              value={note}
              onChange={(e) => { setNote(e.target.value); noteRef.current = e.target.value; scheduleDraftSave() }}
              onBlur={() => flushDraftNow()} />
            <div style={styles.noteActions}>
              <button style={styles.noteBtn} onClick={saveNote} disabled={note === (concept.notes || '')}>
                {noteSaved ? '✓ 已保存' : '保存笔记'}
              </button>
            </div>
          </div>

          <div style={styles.meta}>对话记录 {messages.length} 条 · 最后更新 {concept.updatedAt?.slice(0, 10) || '—'}</div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pane: { display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, height: '100%', padding: 12, boxSizing: 'border-box' },
  tabBar: { display: 'flex', gap: 2, borderBottom: '1px solid var(--ct-border)', flex: 'none' },
  tab: { cursor: 'pointer', padding: '8px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ct-fg-tertiary)', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', marginBottom: -1, transition: 'color .15s ease, border-color .15s ease' },
  tabActive: { color: 'var(--ct-fg)', borderBottomColor: 'var(--ct-primary)', fontWeight: 600 },
  conceptHeader: { display: 'flex', alignItems: 'center', gap: 8, flex: 'none' },
  conceptName: { fontWeight: 700, fontSize: 16, color: 'var(--ct-fg)', fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.01em', wordBreak: 'break-word' },
  statusPill: { fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, border: '1px solid var(--ct-border)', whiteSpace: 'nowrap' },
  reviewChip: { fontSize: 11, color: 'var(--ct-primary)', background: 'var(--ct-tint-lavender)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: 'var(--ct-fg-secondary)', marginTop: 4 },
  statusGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  statusOpt: { cursor: 'pointer', padding: '5px 14px', borderRadius: 999, border: '1px solid var(--ct-border)', background: 'var(--ct-panel)', fontSize: 12, color: 'var(--ct-fg-secondary)', fontFamily: 'inherit', transition: 'background .15s ease, border-color .15s ease' },
  reviewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 'var(--ct-radius-sm)', background: 'var(--ct-surface-soft)', border: '1px solid var(--ct-border)', fontSize: 12 },
  reviewOn: { color: 'var(--ct-primary)', fontWeight: 600 },
  reviewOff: { color: 'var(--ct-fg-muted)' },
  reviewToggle: { cursor: 'pointer', padding: '3px 12px', borderRadius: 999, border: '1px solid var(--ct-border)', background: 'var(--ct-panel)', fontSize: 11, color: 'var(--ct-primary)', fontFamily: 'inherit' },
  summaryEditInput: { width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', fontSize: 13, color: 'var(--ct-fg)', background: 'var(--ct-panel)', fontFamily: 'inherit', resize: 'vertical', minHeight: 48, lineHeight: 1.5 },
  summaryHint: { fontSize: 11, color: 'var(--ct-primary)' },
  meta: { fontSize: 12, color: 'var(--ct-fg-tertiary)' },
  detailsCol: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 },
  messages: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 2px' },
  userMsg: { background: 'linear-gradient(135deg, var(--ct-primary), var(--ct-primary-hover))', color: '#fff', borderRadius: 14, borderBottomRightRadius: 4, padding: '8px 12px', alignSelf: 'flex-end', maxWidth: '90%', boxShadow: '0 2px 12px var(--ct-glow-primary)' },
  assistantMsg: { background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', color: 'var(--ct-fg)', borderRadius: 14, borderBottomLeftRadius: 4, padding: '8px 12px', alignSelf: 'flex-start', maxWidth: '90%', boxShadow: 'var(--ct-shadow-1)' },
  msgRole: { fontSize: 10, color: 'rgba(255,255,255,.75)', marginBottom: 3, fontWeight: 600 },
  msgContent: { fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  hint: { color: 'var(--ct-fg-muted)', fontSize: 13, textAlign: 'center', padding: '20px 8px', lineHeight: 1.6 },
  inputArea: { display: 'flex', flexDirection: 'column', gap: 6 },
  input: { width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', background: 'transparent', color: 'var(--ct-fg)' },
  inputActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  detectSelect: { padding: '5px 8px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', fontSize: 12, background: 'var(--ct-panel)', color: 'var(--ct-fg-secondary)', fontFamily: 'inherit' },
  sendBtn: { cursor: 'pointer', padding: '7px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--ct-primary), var(--ct-primary-hover))', color: '#fff', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'filter .18s ease, transform .18s ease', boxShadow: '0 2px 12px var(--ct-glow-primary)' },
  error: { color: 'var(--ct-destructive)', fontSize: 12 },
  candidates: { border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', padding: 10, background: 'var(--ct-surface-soft)', flex: 'none' },
  candidatesHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit', textAlign: 'left' },
  candidatesTitle: { fontSize: 12, fontWeight: 600, color: 'var(--ct-fg-secondary)' },
  candidatesFold: { fontSize: 11, color: 'var(--ct-link)', whiteSpace: 'nowrap' },
  candidateList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  candidateChip: { cursor: 'pointer', padding: '4px 12px', borderRadius: 999, border: '1px solid var(--ct-border)', color: 'var(--ct-fg)', background: 'var(--ct-panel)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'border-color .15s ease, background .15s ease', fontFamily: 'inherit' },
  manualRow: { display: 'flex', gap: 6, marginTop: 8 },
  manualInput: { flex: 1, padding: '6px 10px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', fontSize: 12, fontFamily: 'inherit', background: 'var(--ct-panel)', color: 'var(--ct-fg)' },
  manualBtn: { cursor: 'pointer', padding: '6px 14px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', color: 'var(--ct-primary)', background: 'var(--ct-panel)', fontSize: 12, fontFamily: 'inherit', transition: 'border-color .15s ease, background .15s ease' },
  noteBox: { border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--ct-panel)', flex: 1, minHeight: 260 },
  noteHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  noteTitle: { fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ct-fg)' },
  noteHint: { fontSize: 11, color: 'var(--ct-fg-muted)' },
  noteInput: { width: '100%', flex: 1, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', minHeight: 200, background: 'var(--ct-surface-soft)', color: 'var(--ct-fg)', lineHeight: 1.6 },
  noteActions: { display: 'flex', justifyContent: 'flex-end' },
  noteBtn: { cursor: 'pointer', padding: '5px 12px', borderRadius: 'var(--ct-radius-sm)', border: '1px solid var(--ct-border)', background: 'var(--ct-panel)', fontSize: 12, color: 'var(--ct-fg)', fontFamily: 'inherit', transition: 'border-color .15s ease, background .15s ease' },
}
