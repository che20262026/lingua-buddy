/**
 * [AI 错误信号] 服务层 → 页面层的只读信箱。
 *
 * 为什么需要它？
 *   服务层（dialogueDirector）为了保证「体验不中断」，对接口的所有失败
 *   （401 / 429 / 500 / 断网 / 超时）都会 catch 后静默回退本地 Mock。
 *   UI 层因此拿不到 reject，也拿不到 HTTP 状态码。
 *
 *   之前只有 PerformanceObserver 能读到精确状态码，可它依赖 Chrome 109+
 *   的 resource timing.responseStatus —— Safari / Firefox 上 status 为 0，
 *   401 与 500 会被静默吞成「未知错误」。
 *   所以这里补一条**不依赖浏览器特性**的通道：服务层把状态码与
 *   服务端中文提示投递过来，页面层取走并翻译成对话气泡里的系统提示。
 *
 * 为什么服务层不直接 import UI 组件？
 *   那是分层倒置。本模块是纯数据的单向信箱（服务层写、页面层读），
 *   与既有的 wasLastDialogueLive() 标记是同一种模式。
 *
 * 纪律：
 * 1. 不发请求、不改请求参数、不写 localStorage、不新增持久化键；
 * 2. 只在响应确实失败时才投递，正常请求一律不打扰；
 * 3. 通知一次性消费（take），避免上一轮的旧提示污染下一轮对话。
 */

/** 服务端限流约定的状态码（保留具名导出，便于调用方表达意图） */
export const RATE_LIMITED_STATUS = 429

export interface AiErrorSignal {
  /** 服务端返回的 HTTP 状态码（429 / 500 / 401 …） */
  status: number
  /** 服务端给的中文提示，作为卡片的诊断信息；缺失时用状态码推导默认文案 */
  message: string
  /** 记录时间戳 */
  at: number
}

/** 按状态码给出兜底文案：限流与服务故障是两种不同的话 */
export function defaultMessageForStatus(status: number): string {
  return status === RATE_LIMITED_STATUS
    ? '请求太频繁，请稍后再试'
    : 'AI 服务暂时不可用，请稍后再试'
}

let signal: AiErrorSignal | null = null

/** 投递一条错误信号（同一轮内后到的覆盖先到的） */
export function recordAiErrorStatus(status: number, message?: string): void {
  const text = typeof message === 'string' ? message.trim() : ''
  signal = {
    status,
    message: text || defaultMessageForStatus(status),
    at: Date.now(),
  }
}

/** 读取并清空：一次性消费 */
export function takeAiErrorSignal(): AiErrorSignal | null {
  const current = signal
  signal = null
  return current
}

/** 只读窥探，不消费（供日志 / 测试使用） */
export function peekAiErrorSignal(): AiErrorSignal | null {
  return signal
}

/**
 * 从错误响应体里提取服务端的中文提示。
 * 正常是 JSON { error: '请求太频繁，请稍后再试' }；
 * 万一上游返回非 JSON（例如网关 HTML），退化成正则提取；
 * 都取不到时返回空串，由 recordAiErrorStatus 按状态码兜底。
 */
export function parseServerErrorMessage(raw: string): string {
  try {
    const data = JSON.parse(raw) as { error?: unknown }
    if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim()
  } catch { /* 非 JSON：走正则兜底 */ }
  const matched = /"error"\s*:\s*"([^"]+)"/.exec(raw)
  return matched?.[1]?.trim() || ''
}
