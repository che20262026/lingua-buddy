import { useEffect, useState } from 'react'
import { isAiEnabled, probeAiMode, setAiEnabled, type AiStatus } from '../services/aiStatus'
/** [React 最佳实践] 卸载时 abort 探测请求，避免 setStatus 打在已卸载组件上 */
import { useAbortableRequest } from '../hooks/useAbortableRequest'

/**
 * [真实 AI] 设置页的「我现在接的是大模型还是 Mock」检测器。
 * 判据只有一个：GET /.netlify/functions/chat 返回的 mode；密钥永远不进前端。
 * 「强制 Mock」是会话内内存开关，不写 localStorage，刷新即恢复自动检测。
 */
export function AiModeBadge() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [forced, setForced] = useState(() => !isAiEnabled())
  const { nextSignal, isMounted } = useAbortableRequest()

  const check = async (force = false) => {
    const signal = nextSignal()
    setChecking(true)
    try {
      const result = await probeAiMode(force, signal)
      if (isMounted()) setStatus(result)
    } finally {
      if (isMounted()) setChecking(false)
    }
  }

  useEffect(() => { void check() }, [])

  const toggleForce = () => {
    const next = !forced
    setForced(next)
    setAiEnabled(!next)
    void check(true)
  }

  const live = status?.mode === 'live'
  return (
    <div data-testid="ai-mode-badge" className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span data-testid="ai-mode-label" className="text-xs font-bold text-ink">
            {checking ? '正在检测…' : live ? '真实 AI 已接入' : '本地 Mock 演示'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button type="button" data-testid="ai-mode-recheck" onClick={() => void check(true)}
            className="seg-btn rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-muted">
            重新检测
          </button>
          <button type="button" data-testid="ai-mode-force-mock" onClick={toggleForce}
            className="seg-btn rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-muted">
            {forced ? '恢复自动' : '强制 Mock'}
          </button>
        </div>
      </div>
      <p data-testid="ai-mode-detail" className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {status?.detail || '正在检查 /.netlify/functions/chat 是否可用…'}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        开发者可在 DevTools → Network 过滤 /.netlify/functions/chat：GET 是模式探测，每轮对话的 POST 才是真实大模型请求。
      </p>
    </div>
  )
}
