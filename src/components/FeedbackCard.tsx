/* ================================================================
 * [新增] 共享反馈卡与对话气泡
 *
 * FeedbackCard 原样抽取自 pages/Dialogue.tsx（UI 与文案零变化），
 * 让「角色对话」与「文学研讨」复用同一副 details/summary 骨架、
 * 同一套 level → tone 映射与 Chip/Icon 视觉语言。
 * SeminarFeedbackCard 使用同一骨架，但明确区分「论证反馈 / 语言反馈」。
 * ChatBubble 复用 index.css 里的 .bubble-ai / .bubble-me 与 Avatar。
 * ================================================================ */

import type { ReactNode } from 'react'
import type { Feedback } from '../types'
import type { FeedbackLevel, SeminarFeedback } from '../literaryTypes'
import { cn } from '../lib/utils'
import { Avatar, Icon } from './ui'

export const FEEDBACK_TONE: Record<FeedbackLevel, { label: string; cls: string; dot: string }> = {
  none: { label: '亮点 · 表达很稳', cls: 'border-mint-400/40 bg-mint-100/60', dot: 'bg-mint-500' },
  minor: { label: '建议 · 可以更好', cls: 'border-sun-400/40 bg-sun-100/60', dot: 'bg-sun-400' },
  major: { label: '小错 · 值得改写', cls: 'border-coral-400/40 bg-coral-100/60', dot: 'bg-coral-500' },
}

/** 两处反馈卡共用的可折叠外壳：同一 tone、同一标题栏、同一阴影 */
export function FeedbackShell({ level, label, children }: {
  level: FeedbackLevel
  label?: string
  children: ReactNode
}) {
  const tone = FEEDBACK_TONE[level] || FEEDBACK_TONE.none
  return (
    <details className={cn('mt-2 overflow-hidden rounded-2xl border', tone.cls)} open={false}>
      <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[11px] font-bold text-ink">
        <span className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', tone.dot)} />{label || `本轮反馈 · ${tone.label}`}</span>
        <Icon name="down" size={13} className="text-muted" />
      </summary>
      <div className="space-y-2 border-t border-white/60 px-3.5 pb-3.5 pt-3 text-[11px] leading-relaxed">
        {children}
      </div>
    </details>
  )
}

/** 原角色对话反馈卡，逐字保持旧版 UI */
export function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <FeedbackShell level={feedback.level}>
      <p className="flex items-start gap-1.5"><b className="shrink-0 text-ink">✍️ 语法</b><span className="text-ink/75">{feedback.grammar}</span></p>
      <p className="flex items-start gap-1.5"><b className="shrink-0 text-ink">🔤 用词</b><span className="text-ink/75">{feedback.wordChoice}</span></p>
      <p className="flex items-start gap-1.5"><b className="shrink-0 text-ink">🫧 自然度</b><span className="text-ink/75">{feedback.naturalness}</span></p>
      {feedback.corrected && (
        <div className="rounded-xl bg-white/80 p-2.5">
          <p className="font-bold text-brand-600">推荐改写</p>
          <p className="en-text mt-1 text-xs text-ink">{feedback.corrected}</p>
        </div>
      )}
      <p className="rounded-xl bg-white/80 px-2.5 py-2 font-semibold text-mint-600">{feedback.praise}</p>
      {feedback.ieltsTip && (
        <p className="rounded-xl bg-brand-50 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-brand-700">
          🎯 {feedback.ieltsTip}
        </p>
      )}
    </FeedbackShell>
  )
}

/** 研讨反馈卡：论证反馈与语言反馈分栏，level / praise 与旧卡完全兼容 */
export function SeminarFeedbackCard({ feedback }: { feedback: SeminarFeedback }) {
  return (
    <FeedbackShell level={feedback.level} label="研讨反馈 · 论证 + 语言">
      <div className="rounded-xl border border-brand-100 bg-white/80 p-2.5">
        <p className="mb-1 flex items-center gap-1.5 font-bold text-brand-600">
          <Icon name="target" size={13} />论证反馈
          <span className="font-normal text-muted">观点 · 原文证据 · 逻辑</span>
        </p>
        <p className="text-ink/80">{feedback.argument}</p>
      </div>
      <div className="rounded-xl border border-mint-400/30 bg-white/80 p-2.5">
        <p className="mb-1 flex items-center gap-1.5 font-bold text-mint-600">
          <Icon name="text" size={13} />语言反馈
          <span className="font-normal text-muted">用词 · 句式 · 自然度</span>
        </p>
        <p className="text-ink/80">{feedback.language}</p>
      </div>
      {feedback.corrected && (
        <div className="rounded-xl bg-white/80 p-2.5">
          <p className="font-bold text-brand-600">可模仿的表达</p>
          <p className="en-text mt-1 text-xs text-ink">{feedback.corrected}</p>
        </div>
      )}
      <p className="rounded-xl bg-white/80 px-2.5 py-2 font-semibold text-mint-600">{feedback.praise}</p>
      <p className="rounded-xl bg-brand-50/70 px-2.5 py-2 text-[10px] leading-relaxed text-brand-700">
        研讨没有标准答案：这里评的是「观点是否可被原文检验」，不是主题对不对。
      </p>
    </FeedbackShell>
  )
}

/** 共享气泡：沿用 .bubble-ai / .bubble-me 与 Avatar，研讨页与对话页视觉同源 */
export function ChatBubble({ role, speaker, text, translation, showTranslation, onSpeak,
  avatarTone = 'brand', label, children }: {
  role: 'ai' | 'user'
  speaker: string
  text: string
  translation?: string
  showTranslation?: boolean
  onSpeak?: () => void
  avatarTone?: 'brand' | 'coral' | 'mint' | 'sun'
  label?: string
  children?: ReactNode
}) {
  if (role === 'user') {
    return (
      <div className="flex animate-in flex-col items-end">
        <div className="mb-1 flex items-center gap-1.5 pr-1 text-[10px] font-bold text-muted">{speaker} · 你</div>
        <div className="bubble-me relative max-w-[86%] rounded-3xl rounded-tr-lg bg-brand-500 px-4 py-3 text-white shadow-card">
          <p className="en-text text-[15px] leading-relaxed">{text}</p>
        </div>
        {children && <div className="w-[86%]">{children}</div>}
      </div>
    )
  }
  return (
    <div className="flex animate-in items-start gap-2.5">
      <Avatar name={speaker} size={34} tone={avatarTone} />
      <div className="min-w-0 max-w-[82%] flex-1">
        <p className="mb-1 text-[10px] font-bold text-muted">{label || speaker}</p>
        <div className="bubble-ai relative rounded-3xl rounded-tl-lg border border-brand-50 bg-white px-4 py-3 shadow-card">
          <p className="en-text text-[15px] leading-relaxed text-ink">{text}</p>
          <div className="mt-2 flex items-center gap-3 border-t border-brand-50 pt-2">
            {onSpeak && (
              <button type="button" onClick={onSpeak}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline"><Icon name="speaker" size={13} />朗读</button>
            )}
            {showTranslation && translation && (
              <details className="min-w-0 flex-1 text-right">
                <summary className="text-[11px] font-semibold text-muted">中文大意 ▾</summary>
                <p className="mt-1.5 text-left text-[11px] leading-relaxed text-muted">{translation}</p>
              </details>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
