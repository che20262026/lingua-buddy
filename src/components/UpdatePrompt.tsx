import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { isServiceWorkerSupported } from '../pwa/registerSW'
import { startUpdateChecks } from '../pwa/updateChecker'

/**
 * [PWA] 应用更新提示 —— registerType: 'prompt' 的 UI 半边。
 *
 * 本组件是全应用**唯一**的 Service Worker 注册入口：virtual:pwa-register/react
 * 的 useRegisterSW hook 在内部完成 registerSW 调用。切勿再引入第二个注册点，
 * 否则 SW 会被注册两次 —— waiting 触发两遍、onNeedRefresh 回调两遍、
 * controlling 之后重复刷新页面。
 *
 * 更新闭环的四条红线：
 * 1. 固定在应用「底部」、底部导航之上（bottom-），非模态，绝不遮挡输入框与导航栏；
 * 2. 新 SW 进入 waiting 只置 needRefresh → 显示「发现新版本，点击刷新」；
 * 3. 用户可以「稍后再说」继续学习，绝不自动 reload、绝不静默刷新；
 * 4. 只有用户亲手点击，才调用 updateServiceWorker(true) 让 waiting SW 接管并重载页面。
 *
 * 离线就绪只是 4 秒后自动消失的轻提示，不打断学习。
 */
export function UpdatePrompt() {
  // 无 serviceWorker 的环境（隐私模式 / 老浏览器 / jsdom）：插件侧已静默降级为
  // noop，这里直接不渲染任何提示，避免出现点了没反应的死界面。
  const supported = isServiceWorkerSupported()
  const [updating, setUpdating] = useState(false)
  /** 会话内「稍后再说」过的版本不再重复弹；下次冷启动 ref 重置可再弹 */
  const dismissedInSession = useRef(false)

  /**
   * useRegisterSW 自己维护 needRefresh / offlineReady 两个状态，
   * 并把 setter 一并交出来 —— 「稍后再说」正是用 setNeedRefresh(false) 收起提示，
   * 下一个版本到来时插件会再次置 true，提示自然重现。
   */
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    /** 与既有语义一致：等首屏资源加载完再注册，不与页面首屏抢带宽 */
    immediate: false,
    onRegisterError(error) {
      console.warn('[LinguaBuddy] Service Worker 注册失败，应用仍可在线使用：', error)
    },
    /**
     * 提示幂等：本会话点过「稍后再说」后，即便再次发现同一新版本也不叠加提示。
     * 冷启动时 dismissedInSession 重置为 false，提示可再次出现。
     */
    onNeedRefresh() {
      if (dismissedInSession.current) setNeedRefresh(false)
    },
  })

  /** 挂载主动更新检查（定时 / 回前台 / 恢复网络），卸载即清理，绝不重复注册 SW */
  useEffect(() => {
    if (!supported) return
    return startUpdateChecks()
  }, [supported])

  /** 离线就绪提示只亮 4 秒，随后自动隐去；用插件自身的 setter 收起，不留本地状态 */
  useEffect(() => {
    if (!offlineReady) return
    const timer = window.setTimeout(() => setOfflineReady(false), 4000)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!supported) return null

  /** 更新提示优先：两者同框出现时只显示更新卡片，避免遮挡打架 */
  if (needRefresh) {
    return (
      <div data-testid="pwa-update-prompt" role="status" aria-live="polite"
        className="glass fixed bottom-[calc(88px_+_env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 animate-in items-center gap-2 rounded-2xl border border-brand-100 px-3 py-2 shadow-float">
        <button type="button" data-testid="update-prompt-refresh" disabled={updating}
          onClick={() => {
            setUpdating(true)
            // 全应用唯一允许触发页面重载的入口；只由用户点击调用，参数恒为 true
            void updateServiceWorker(true)
          }}
          className="btn-primary flex-1 !px-3 !py-2 !text-xs">
          {updating ? '正在更新…' : '发现新版本，点击刷新'}
        </button>
        <button type="button" data-testid="update-prompt-dismiss" onClick={() => {
          dismissedInSession.current = true
          setNeedRefresh(false)
        }}
          className="btn-ghost shrink-0 !px-3 !py-2 !text-xs">
          稍后再说
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div data-testid="pwa-offline-ready" aria-live="polite"
        className="glass fixed bottom-[calc(88px_+_env(safe-area-inset-bottom))] left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 animate-in rounded-2xl border border-mint-100 px-4 py-2.5 text-center text-xs font-bold text-mint-600 shadow-float">
        ✨ 已缓存离线学习界面，断网也能打开
      </div>
    )
  }

  return null
}
