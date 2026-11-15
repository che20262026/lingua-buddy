/* ================================================================
 * [新增] 观后讨论反馈卡
 *
 * 复用 FeedbackShell（与角色对话卡、研讨卡同一副 details/summary 骨架、
 * 同一套 level → tone 映射），但明确区分「观点反馈」与「语言反馈」。
 * level / praise 字段与现有 Feedback 组件兼容。
 * ================================================================ */

import type { PostWatchFeedback } from '../cultureTypes'
import { FeedbackShell } from './FeedbackCard'
import { Icon } from './ui'

export function PostWatchFeedbackCard({ feedback }: { feedback: PostWatchFeedback }) {
  return (
    <FeedbackShell level={feedback.level} label="观后反馈 · 观点 + 语言">
      <div className="rounded-xl border border-brand-100 bg-white/80 p-2.5">
        <p className="mb-1 flex items-center gap-1.5 font-bold text-brand-600">
          <Icon name="play" size={13} />观点反馈
          <span className="font-normal text-muted">是否回应视频 · 是否有具体细节</span>
        </p>
        <p className="text-ink/80">{feedback.content}</p>
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
        观后讨论不设标准文化解读：这里评的是「有没有回到视频里的具体细节」，不是观点对不对。
      </p>
    </FeedbackShell>
  )
}
