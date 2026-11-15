/**
 * [成长系统] XpToast：每次获得 XP 时右下角浮出「+N XP」，2 秒后消失。
 *
 * - 订阅统一入口 awardXp() 派发的 lingua:growth 事件，不在渲染时轮询账本；
 * - pointer-events-none，绝不遮挡输入框与底部导航；
 * - 设置页「显示 XP 动画」关闭后完全不渲染、也不监听；
 * - 升级横幅由 LevelUpBanner 单独负责，这里只补一行成就提示。
 */
import { useEffect, useState } from 'react'
import { GROWTH_EVENT } from '../services/growth'
import type { XpResult } from '../growthTypes'

interface Notice {
  key: number
  amount: number
  unlocked: number
}

export function XpToast({ enabled }: { enabled: boolean }) {
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    if (!enabled) return
    const handler = (ev: Event) => {
      const result = (ev as CustomEvent<XpResult>).detail
      if (!result?.granted || result.amount <= 0) return
      setNotice({
        key: Date.now() + Math.random(),
        amount: result.amount,
        unlocked: result.unlockedAchievements.length,
      })
    }
    window.addEventListener(GROWTH_EVENT, handler)
    return () => window.removeEventListener(GROWTH_EVENT, handler)
  }, [enabled])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2000)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!enabled || !notice) return null
  return (
    <div data-testid="xp-toast" role="status"
      className="pointer-events-none fixed bottom-24 right-4 z-[55] animate-in sm:right-8">
      <div className="rounded-2xl border border-white/80 bg-white/95 px-4 py-2.5 shadow-float">
        <p className="font-display text-lg font-black text-brand-600">+{notice.amount} XP</p>
        {notice.unlocked > 0 && (
          <p className="mt-0.5 text-[10px] font-bold text-[#8a5b08]">同时解锁 {notice.unlocked} 枚成就 🏅</p>
        )}
      </div>
    </div>
  )
}
