import { useEffect, useRef, useState } from 'react'
import { setupServiceWorker, type UpdateServiceWorker } from '../pwa/registerSW'

type PromptState = 'idle' | 'update' | 'offline'

/**
 * [PWA] 应用更新提示 —— registerType: 'prompt' 的 UI 半边。
 *
 * 更新闭环的四条红线：
 * 1. 固定在应用「底部」、底部导航之上（bottom-），非模态，绝不遮挡输入框；
 * 2. 新 SW 进入 waiting 只触发 onNeedRefresh → 显示「发现新版本，点击刷新」；
 * 3. 用户可以「稍后再说」继续学习，绝不自动 reload、绝不静默刷新；
 * 4. 只有用户亲手点击，才调用 updateServiceWorker(true) 让 waiting SW 接管并重载页面。
 *
 * 离线就绪只是 4 秒后自动消失的轻提示，不打断学习。
 */
export function UpdatePrompt() {
  const [state, setState] = useState<PromptState>('idle')
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const updateRef = useRef<UpdateServiceWorker | null>(null)

  useEffect(() => {
    updateRef.current = setupServiceWorker({
      onNeedRefresh: () => { setDismissed(false); setState('update') },
      onOfflineReady: () => setState('offline'),
    })
  }, [])

  useEffect(() => {
    if (state !== 'offline') return
    const timer = window.setTimeout(() => setState('idle'), 4000)
    return () => window.clearTimeout(timer)
  }, [state])

  /** 全应用唯一允许触发页面重载的入口；只由用户点击调用，参数恒为 true */
  const updateServiceWorker = (reloadPage: boolean) => {
    void updateRef.current?.(reloadPage)
  }

  if (state === 'idle' || (state === 'update' && dismissed)) return null

  if (state === 'offline') {
    return (
      <div data-testid="pwa-offline-ready" aria-live="polite"
        className="glass fixed bottom-[calc(88px_+_env(safe-area-inset-bottom))] left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 animate-in rounded-2xl border border-mint-100 px-4 py-2.5 text-center text-xs font-bold text-mint-600 shadow-float">
        ✨ 已缓存离线学习界面，断网也能打开
      </div>
    )
  }

  return (
    <div data-testid="pwa-update-prompt" role="status" aria-live="polite"
      className="glass fixed bottom-[calc(88px_+_env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 animate-in items-center gap-2 rounded-2xl border border-brand-100 px-3 py-2 shadow-float">
      <button type="button" data-testid="update-prompt-refresh" disabled={updating}
        onClick={() => {
          setUpdating(true)
          updateServiceWorker(true)
        }}
        className="btn-primary flex-1 !px-3 !py-2 !text-xs">
        {updating ? '正在更新…' : '发现新版本，点击刷新'}
      </button>
      <button type="button" onClick={() => setDismissed(true)}
        className="btn-ghost shrink-0 !px-3 !py-2 !text-xs">
        稍后再说
      </button>
    </div>
  )
}
