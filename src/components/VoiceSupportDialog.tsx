/**
 * VoiceSupportDialog · 语音不可用时的明确弹窗
 * ------------------------------------------------------------------
 * 设计定调（Playful / toy-like，兼容降级版）：
 *   暖白卡片 + 角色主题色强调 + 圆角大按钮；只做一件事——
 *   把「为什么不能用」和「现在还能做什么」说清楚，绝不静默失败。
 * 可访问性：role=alertdialog + aria-modal + 可见焦点圈 + ≥44px 触摸目标；
 * 只动 opacity/transform，减少动态效果时关闭。
 */

import { Icon } from './ui'

export interface VoiceNotice {
  title: string
  message: string
  /** iframe / 非安全上下文时给一条可操作出路 */
  showNewTab?: boolean
}

export interface VoiceSupportDialogProps {
  notice: VoiceNotice
  onClose: () => void
}

export function VoiceSupportDialog({ notice, onClose }: VoiceSupportDialogProps) {
  return (
    <div className="voice-notice-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="voice-notice-card w-full max-w-sm rounded-3xl border border-white/80 bg-white/95 p-5 shadow-float"
        role="alertdialog" aria-modal="true" aria-labelledby="voice-notice-title"
        aria-describedby="voice-notice-message" data-testid="voice-support-dialog">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sun-100 text-[#a56a08]">
            <Icon name="info" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="voice-notice-title" className="font-display text-base font-bold text-ink">
              {notice.title}
            </h3>
            <p id="voice-notice-message" className="mt-1.5 text-sm leading-relaxed text-muted"
              data-testid="voice-notice-message">
              {notice.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {notice.showNewTab && (
            <button type="button" className="btn-ghost !min-h-[44px] !px-4 !text-xs"
              onClick={() => {
                try { window.open(window.location.href, '_blank', 'noopener,noreferrer') } catch { /* 忽略 */ }
              }}>
              在新标签页打开
            </button>
          )}
          <button type="button" className="btn-primary !min-h-[44px] !px-5 !text-xs"
            onClick={onClose} data-testid="voice-notice-ok" autoFocus>
            好的，用文字输入
          </button>
        </div>
      </div>
    </div>
  )
}
