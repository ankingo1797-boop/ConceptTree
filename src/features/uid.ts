// 短随机 ID 工具（第十四轮优化：统一多处重复的 id 生成代码）
/** 生成 `prefix-xxxxxxxx` 形式的短随机 ID（8 位 base36） */
export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
