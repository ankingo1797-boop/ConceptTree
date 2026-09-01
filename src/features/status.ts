// 状态元数据统一（第十三轮优化：消除多处重复的状态标签 / 颜色映射）
// 仅放"内容完全一致、可安全共享"的部分；各 UI 的展示顺序（STATUS_ORDER）不同，不在此合并。
import type { ConceptStatus } from '../types'

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  unlearned: '未学习', learning: '学习中', learned: '已掌握', doubtful: '存疑',
}

export const STATUS_META: Record<ConceptStatus, { label: string; color: string; bg: string; border: string }> = {
  unlearned: { label: '未学习', color: 'var(--ct-st-unlearned)', bg: 'var(--ct-st-unlearned-bg)', border: 'var(--ct-st-unlearned-border)' },
  learning: { label: '学习中', color: 'var(--ct-st-learning)', bg: 'var(--ct-st-learning-bg)', border: 'var(--ct-st-learning-border)' },
  learned: { label: '已掌握', color: 'var(--ct-st-learned)', bg: 'var(--ct-st-learned-bg)', border: 'var(--ct-st-learned-border)' },
  doubtful: { label: '存疑', color: 'var(--ct-st-doubtful)', bg: 'var(--ct-st-doubtful-bg)', border: 'var(--ct-st-doubtful-border)' },
}
