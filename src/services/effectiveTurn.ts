/**
 * 有效轮次判定（Dialogue / Seminar / PostWatch 共用）
 *
 * XP 只奖励「完成单元」：用户输入过短（<8 词）、纯表情/符号、明显复读上一条、
 * 与场景目标无关且无任何目标词命中，均视为无效，不发 XP。
 * 判定标准同时以 EFFECTIVE_RULE_PROMPT 写进三个 Agent 的 payload，自定义端点可直接返回 effective。
 */
export const EFFECTIVE_RULE_PROMPT = [
  '判断用户这一轮是否为「有效输入」并返回 effective: boolean。',
  '无效：少于 8 个英文词且未命中任何目标词/短语；纯表情、标点或数字；',
  '与上一条用户输入高度重复（仅改一两个词）；与当前场景/章节/视频完全无关。',
  '有效：至少 8 个词，或虽短但用上了目标词/短语并推进了当前话题。',
  '只做这一项二值判断，不给发音分数、不给准确率、不做音素级评价。',
].join(' ')

export interface EffectiveOptions {
  previous?: string
  targetWords?: string[]
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim()

const wordCount = (s: string): number => normalize(s).split(' ').filter(Boolean).length

export function isEffectiveTurn(text: string, opts: EffectiveOptions = {}): boolean {
  const raw = (text || '').trim()
  if (!raw) return false
  // 纯符号 / 纯数字 / 纯表情（非字母）
  if (!/[A-Za-z]/.test(raw)) return false
  // 明显复读上一条
  const prev = normalize(opts.previous || '')
  const now = normalize(raw)
  if (prev && (now === prev || (now.length > 8 && prev.includes(now)))) return false

  const hitTarget = (opts.targetWords ?? []).some((t) => {
    const key = normalize(t)
    return key.length >= 3 && now.includes(key)
  })
  return wordCount(raw) >= 8 || hitTarget
}

/** 一轮有效对话的 XP（单场景累计上限由成长服务裁决） */
export const EFFECTIVE_ROUND_XP = 2
