import { useEffect, useState } from 'react'

/**
 * [应用开场] 全屏冷启动动画 —— 原首页那块蓝色大 Hero 的继任者。
 *
 * 为什么从首页搬到这里：
 *   - 「蓝底大 UI」原本占了首页第一屏，却只是一段静态文案，反而把真正的
 *     「今日目标」和「对话区」挤到下面 —— 首页显得很乱；
 *   - 改成冷启动时的一次性开场动画后，首页第一屏直接让位给功能，
 *     而品牌表达仍然保留，还多了一段「浮现感」。
 *
 * 播放策略：
 *   - 每次会话只播一次，用 sessionStorage 记录（不是 localStorage，
 *     关掉标签页就该重新欢迎一次；也不新增任何 localStorage 键）；
 *   - 播完自动淡出并卸载，不留在 DOM 里挡路；
 *   - 隐私模式 / 存储被禁用时静默降级为「只播一次」。
 *
 * 可访问性：
 *   - 纯品牌开场，对读屏用户是装饰性内容，标记 aria-hidden；
 *   - 全程只动 opacity 与 transform，并响应 prefers-reduced-motion。
 */

/** sessionStorage 键：仅本次会话有效，不落 localStorage */
const SPLASH_KEY = 'lingua_home_splash_played'
/** 完全显示时长（毫秒） */
const HOLD_MS = 2000
/** 淡出时长（毫秒） */
const FADE_MS = 520

function alreadyPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_KEY) === '1'
  } catch {
    // 隐私模式 / 存储被禁用：退化成「本次页面生命周期内不重复」
    return false
  }
}

function markPlayed(): void {
  try {
    window.sessionStorage.setItem(SPLASH_KEY, '1')
  } catch {
    /* 存不了就算了，不影响功能 */
  }
}

/** 四步引导：与原蓝底 Hero 里的文案逐字一致 */
const STEPS = ['① 贴文本', '② 生成场景', '③ 开口对话', '④ 收报告与复习']

export function AppSplash() {
  const [visible, setVisible] = useState(() => !alreadyPlayed())
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    // 一开始播就记「已播放」：同一会话里再回到首页不会重复打断
    markPlayed()
    const hideTimer = window.setTimeout(() => setLeaving(true), HOLD_MS)
    const dropTimer = window.setTimeout(() => setVisible(false), HOLD_MS + FADE_MS)
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(dropTimer)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      data-testid="app-splash"
      className={`splash-root fixed inset-0 z-[90] flex flex-col items-center justify-center bg-gradient-to-br from-brand-500 via-brand-600 to-[#5b46c9] px-6 text-center text-white ${leaving ? 'splash-leave' : ''}`}>
      <div className="splash-mark flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/15 font-display text-3xl font-black shadow-float">
        L
      </div>

      <h1 className="splash-line mt-7 font-display text-[26px] font-black leading-tight sm:text-[32px]">
        把一段英文，<br />变成一场能开口的对话
      </h1>

      <div className="mt-6 grid w-full max-w-[248px] grid-cols-2 gap-2">
        {STEPS.map((s, i) => (
          <span key={s} className="splash-chip rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold"
            style={{ animationDelay: `${180 + i * 70}ms` }}>
            {s}
          </span>
        ))}
      </div>

      <p className="splash-line mt-8 text-[11px] font-semibold tracking-[0.18em] text-white/70">
        语伴英语 · 对话冒险
      </p>
    </div>
  )
}
