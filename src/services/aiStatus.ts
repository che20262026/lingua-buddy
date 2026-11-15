/**
 * [真实 AI] 前端「当前是真实大模型还是本地 Mock」的唯一判据。
 * ---------------------------------------------------------------
 * 密钥只在服务端，前端看不见 process.env，所以唯一可靠的办法是打一次
 * GET /.netlify/functions/chat：后端按 LLM_API_KEY 是否存在回 mode='live' | 'mock'。
 *
 * 结果缓存 60 秒，避免每轮对话都发探测请求；断网 / 纯 Vite dev（没有
 * 函数代理）/ 无痕模式下都静默判定为 mock，不打印错误、不打断用户。
 * 无 localStorage 键、无全局轮询 —— 保持 31 键存储模型零改动。
 */

/** 全应用唯一的 AI 端点：Netlify 生产与本地 Vite 代理走同一路径（不做 rewrite） */
export const AI_ENDPOINT = '/.netlify/functions/chat'

export type AiMode = 'live' | 'mock'
export interface AiStatus {
  mode: AiMode
  detail: string
  provider?: string
  model?: string
}

const CACHE_TTL_MS = 60_000
const PROBE_TIMEOUT_MS = 2_500

let cached: { at: number; status: AiStatus } | null = null
/** 会话内的「强制 Mock」开关，只存内存，刷新即恢复自动检测 */
let forceMock = false

export function isAiEnabled(): boolean { return !forceMock }
export function setAiEnabled(enabled: boolean): void {
  forceMock = !enabled
  cached = null
}

function remember(status: AiStatus): AiStatus {
  cached = { at: Date.now(), status }
  return status
}

function mock(reason: string): AiStatus {
  return remember({ mode: 'mock', detail: reason })
}

/**
 * [React 最佳实践] 把「超时」与「组件卸载」两个取消源合并成一个 fetch signal。
 * 外部 signal 触发时内部 controller 立刻 abort，真正中断在途请求（不只是忽略结果）；
 * dispose() 清理定时器与监听器，杜绝内存泄漏。
 */
export function createRequestSignal(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) onExternalAbort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

/**
 * 探测当前接入模式。force=true 时跳过缓存（设置页「重新检测」按钮用）。
 * signal 由调用方组件提供，卸载即取消；任何异常都静默返回 mock。
 */
export async function probeAiMode(force = false, signal?: AbortSignal): Promise<AiStatus> {
  if (signal?.aborted) return mock('请求已取消，使用本地 Mock')
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.status
  if (forceMock) return mock('已在设置页强制使用本地 Mock（刷新页面可恢复自动检测）')
  if (typeof fetch !== 'function') return mock('当前环境没有 fetch，使用本地 Mock')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return mock('设备处于离线状态，使用本地 Mock')

  const gate = createRequestSignal(PROBE_TIMEOUT_MS, signal)
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: gate.signal,
    })
    /* 用 text() + JSON.parse 而不是直接 json()：Vite dev 无函数代理时该路径
       会回落到 index.html（text/html）；解析失败一律判为 Mock，不抛到界面上 */
    const raw = await res.text()
    const data = JSON.parse(raw) as { ok?: boolean; mode?: string; message?: string; provider?: string; model?: string }
    if (!res.ok || data.ok !== true) throw new Error(`HTTP ${res.status}`)
    if (data.mode === 'live') {
      return remember({
        mode: 'live',
        detail: `已连接 ${String(data.provider || 'LLM')} · ${String(data.model || 'default')}`,
        provider: String(data.provider || ''),
        model: String(data.model || ''),
      })
    }
    return mock(String(data.message || '服务端未配置 LLM_API_KEY'))
  } catch {
    return mock('未检测到 /.netlify/functions/chat（本地 Vite dev、断网或未配置密钥），使用本地 Mock')
  } finally {
    gate.dispose()
  }
}
