/**
 * [对话 UI 状态] AI 请求失败的友好提示卡 —— 出现在 AI 气泡的位置。
 *
 * 设计定调：刻意不用「通用红色警告框」。这是一张「小夜灯」卡片：
 * 左侧一道暖珊瑚色竖轨 + 灯泡图标，第一句先安抚，随后明确告知
 * 「本地演示已接管，练习不会中断」，把「出错了」翻译成「有退路」。
 *
 * 状态覆盖（frontend-design 检查表第 10 条）：默认 / hover / 按下 /
 * focus-visible / 禁用（重试中）/ 各错误码变体 / 缩减动效。
 * 无障碍：role="alert" + aria-live="assertive"；两个按钮均 ≥44px 点击目标，
 * 焦点圈可见；文案不只靠颜色表达状态；无自动消失定时器（错误需用户显式处理）。
 */
import { Icon } from './ui'
import { describeAiError, type AiErrorCode } from './aiErrorChannel'

/**
 * [语气分级] 完整类名写全，避免 Tailwind 扫描不到动态拼接的类：
 * warm = 暖珊瑚（限流、断网等可安抚的暂时性问题）；
 * danger = 红（服务端故障 / 鉴权失败——这确实是"系统坏了"）。
 */
const TONE = {
  warm: {
    badge: 'bg-coral-100 text-coral-600',
    bubble: 'border-coral-400/25',
    rail: 'bg-coral-400/70',
    icon: 'text-coral-500',
    label: 'text-coral-600',
  },
  danger: {
    badge: 'bg-danger-100 text-danger-600',
    bubble: 'border-danger-400/35',
    rail: 'bg-danger-500',
    icon: 'text-danger-500',
    label: 'text-danger-600',
  },
} as const

export function AiErrorCard({
  code,
  detail,
  retrying = false,
  onRetry,
  onDismiss,
  testId = 'ai-error-card',
}: {
  code: AiErrorCode
  detail?: string
  retrying?: boolean
  onRetry: () => void
  onDismiss: () => void
  testId?: string
}) {
  const copy = describeAiError(code)
  const tone = TONE[copy.severity]
  return (
    <div
      data-testid={testId}
      data-severity={copy.severity}
      role="alert"
      aria-live="assertive"
      className="flex animate-in items-start gap-2.5"
    >
      <div
        aria-hidden="true"
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${tone.badge}`}
      >
        <Icon name="bulb" size={18} />
      </div>
      <div className="min-w-0 max-w-[82%] flex-1">
        <p data-testid="ai-error-label" className={`mb-1 text-[10px] font-bold ${tone.label}`}>
          语伴提示 · {copy.label}
        </p>
        <div className={`bubble-ai relative overflow-hidden rounded-3xl rounded-tl-lg border bg-white px-4 py-3.5 shadow-card ${tone.bubble}`}>
          {/* 暖色竖轨：与蓝色 AI 气泡区分，但不用刺眼的纯红错误框 */}
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${tone.rail}`} />
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 shrink-0 ${tone.icon}`}><Icon name="info" size={16} /></span>
            <div className="min-w-0">
              <p data-testid="ai-error-title" className="text-[14px] font-bold leading-relaxed text-ink">
                {copy.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{copy.hint}</p>
              <p className="mt-2 rounded-xl bg-mint-100/70 px-2.5 py-1.5 text-[11px] font-semibold leading-relaxed text-mint-600">
                别担心，本轮已由本地演示接管，练习不会中断 🌱
              </p>
              {detail && (
                <p data-testid="ai-error-detail" className="mt-1.5 font-mono text-[10px] text-muted/80">
                  诊断：{detail}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-50 pt-2.5">
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              data-testid="ai-error-retry"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-brand-500 px-4 text-[12px] font-bold text-white shadow-soft transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="refresh" size={14} />
              {retrying ? '正在重试…' : copy.action}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              data-testid="ai-error-dismiss"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl border border-brand-100 bg-white px-3.5 text-[12px] font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.98]"
            >
              继续用本地演示
            </button>
            <p className="w-full text-[10px] leading-relaxed text-muted/80">
              重试会用同一句话再发一次；也可以直接继续用本地演示。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
