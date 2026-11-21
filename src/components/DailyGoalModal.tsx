import { useEffect, useId, useRef } from 'react'
import type { DailyTask } from '../services/dailyPlan'
import { Icon, ProgressRing } from './ui'

/**
 * [今日目标] 弹窗组件 —— 原先平铺在首页的「今日小目标」卡片搬到这里。
 *
 * 首页只留一个显眼的入口卡；完整内容（XP 进度环、连续天数、总 XP、
 * 按当前等级推荐的今日任务、雅思目标档位）都在弹窗里，首页因此干净很多。
 *
 * 交互与可访问性：
 *   - 移动端底部 sheet、桌面端居中卡片（沿用项目 SyncLoginDialog 的形态）；
 *   - Esc 关闭（桌面习惯）+ 点遮罩关闭（轻关闭）+ 右下角 × 关闭；
 *   - role="dialog" / aria-modal / aria-labelledby 指向标题，标题 id 用 useId
 *     生成，保证多实例不撞 id；
 *   - 打开后焦点落到主按钮；遮罩与面板各自 contain 滚动链，
 *     滚到边界不会把背后的页面一起带着滚（不去锁 html/body 的 overflow）。
 *   - 纯 CSS 动效，只动 transform / opacity。
 */

export interface DailyGoalModalProps {
  open: boolean
  onClose: () => void
  /** 「隐藏」：关闭并记住，本次会话不再自动弹出 */
  onHide: () => void
  todayXp: number
  dailyGoal: number
  totalXp: number
  streak: number
  task: DailyTask
  /** 雅思目标档位一行，例如「当前目标 IELTS 7.0 · 学术英语（CEFR C1）」 */
  levelLine: string
}

export function DailyGoalModal({
  open, onClose, onHide, todayXp, dailyGoal, totalXp, streak, task, levelLine,
}: DailyGoalModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  /* Esc 关闭：桌面端习惯；移动端有物理返回键也能走同一条路 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* 打开后把焦点落到主按钮，读屏与键盘用户不会还停在触发入口上 */
  useEffect(() => {
    if (!open) return
    const btn = panelRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')
    btn?.focus()
  }, [open])

  if (!open) return null

  const pct = Math.min(1, todayXp / Math.max(dailyGoal, 1))

  return (
    <div data-testid="daily-goal-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="dlg-backdrop fixed inset-0 z-[85] flex items-end justify-center bg-ink/40 px-3 pb-3 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={onClose}>
      <div ref={panelRef}
        className="dlg-panel flex max-h-[86vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}>

        {/* 头部 */}
        <div className="flex items-center justify-between gap-2 border-b border-brand-50 px-4 pb-2.5 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name="target" size={18} />
            </div>
            <div>
              <p id={titleId} className="font-display text-sm font-black text-ink">今日目标</p>
              <p className="text-[10px] text-muted">每天一点点就够</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭今日目标弹窗"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-brand-50">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* 正文 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="flex items-center gap-4">
            <ProgressRing value={pct} label={`${todayXp}`} sub={`/ ${dailyGoal} XP`} size={86} />
            <div className="min-w-0">
              <p className="text-xs leading-relaxed text-muted">
                完成一轮对话 <span className="font-bold text-brand-600">+8 XP</span>，覆盖目标词另有奖励。
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                连续学习 <span className="font-bold text-brand-600">{streak}</span> 天啦。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="chip bg-sun-100 text-[#a56a08]"><Icon name="flame" size={12} />{streak} 天连续</span>
                <span className="chip bg-brand-50 text-brand-600"><Icon name="star" size={12} />{totalXp} 总 XP</span>
              </div>
            </div>
          </div>

          {/* 雅思目标档位 */}
          <p className="mt-4 rounded-2xl bg-brand-50/70 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-brand-700">
            {levelLine}
          </p>

          {/* 今日推荐：读 active 等级，不读 recommended */}
          <div className="mt-3 rounded-2xl border border-brand-100 bg-white px-3 py-3">
            <p className="text-[10px] font-black tracking-[0.16em] text-muted">今日推荐</p>
            <p className="mt-1 font-display text-sm font-bold text-ink">{task.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{task.detail}</p>
            <p className="mt-1.5 text-[10px] font-semibold text-brand-600">
              按当前等级 {task.level} 推荐 · 来自「{task.module}」内容池
            </p>
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex gap-2 border-t border-brand-50 px-4 py-3">
          <button type="button" onClick={onHide}
            className="min-h-[44px] flex-1 rounded-2xl px-3 py-2.5 text-[12px] font-bold text-muted transition hover:bg-brand-50">
            隐藏，不再自动弹出
          </button>
          <button type="button" onClick={onClose} data-autofocus
            className="min-h-[44px] flex-1 rounded-2xl bg-brand-500 px-3 py-2.5 text-[12px] font-bold text-white shadow-soft transition hover:bg-brand-600">
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
