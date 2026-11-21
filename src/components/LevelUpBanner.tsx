/**
 * [成长系统] LevelUpBanner：升级时页面顶端短暂出现，3 秒后消失。
 *
 * 不是全屏模态、没有遮罩、pointer-events-none，学习流程完全不被打断；
 * 升级不额外发 XP，这里只做一句鼓励与等级名展示。
 */
import { useEffect, useState } from 'react'
import { levelName } from '../growthTypes'
import { GROWTH_EVENT } from '../services/growth'
import type { XpResult } from '../growthTypes'

const CHEERS = [
  '又往前走了一阶，句子正在变稳。',
  '把新词用出去的感觉，比记住它更好。',
  '不声不响的积累，也会留下痕迹。',
  '今天这一步，昨天的你还做不到。',
]

export function LevelUpBanner({ enabled }: { enabled: boolean }) {
  const [banner, setBanner] = useState<{ key: number; level: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const handler = (ev: Event) => {
      const result = (ev as CustomEvent<XpResult>).detail
      if (!result?.granted || !result.leveledUp) return
      setBanner({ key: Date.now() + Math.random(), level: result.newLevel })
    }
    window.addEventListener(GROWTH_EVENT, handler)
    return () => window.removeEventListener(GROWTH_EVENT, handler)
  }, [enabled])

  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), 3000)
    return () => window.clearTimeout(timer)
  }, [banner])

  if (!enabled || !banner) return null
  return (
    <div data-testid="levelup-banner" role="status"
      className="pointer-events-none fixed left-1/2 top-3 z-[58] w-[min(92vw,460px)] -translate-x-1/2 animate-in-centered">
      <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-3 text-white shadow-float">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg">🏅</span>
        <div className="min-w-0">
          <p className="font-display text-sm font-black">升级啦 · Lv.{banner.level} {levelName(banner.level)}</p>
          <p className="mt-0.5 text-[11px] opacity-90">{CHEERS[banner.level % CHEERS.length]}</p>
        </div>
      </div>
    </div>
  )
}
