/**
 * [对话 UI 状态] AI 请求错误的「只读旁路通道」—— 纯前端状态，不属于网络请求逻辑。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────
 * 服务层 `dialogueDirector.ts` 的 `createServerlessGenerator()` 为了保证
 * 「体验不中断」，对 /.netlify/functions/chat 的所有失败（401 / 429 / 500 / 断网 / 超时）
 * 都会 catch 后静默回退本地 Mock。也就是说 UI 层既拿不到 reject，也拿不到
 * HTTP 状态码，只剩 `wasLastDialogueLive() === false`。
 *
 * 本轮约束是「只改前端 UI 组件，不动任何网络请求逻辑和后端代码」，所以这里
 **不包裹 fetch、不改请求参数、不改降级策略、不新增请求**，而是：
 *   ① `PerformanceObserver` 只读观察浏览器「已经记录好」的 resource timing，
 *      从中读取同源 /.netlify/functions/chat 的 responseStatus（Chrome 109+ 暴露），
 *      于是 401 / 429 / 500 这类精确码能被 UI 感知；
 *   ② 该 API 不可用、或错误发生在连接层（无 resource entry）时，
 *      由 Dialogue 用「探测为 live 但本轮回退 Mock」这一只读信号上报 unknown。
 *
 * 两条路都只是「观察 + 发布 UI 状态」。任何组件都可订阅，但发布者不参与
 * 请求链路，因此本模块对网络行为零影响：不支持的浏览器会自动退化为
 * no-op，界面照常走既有 Mock 流程，不会白屏、不会崩溃。
 * ────────────────────────────────────────────────────────────────────────
 */

/** 会被单独映射文案的状态码；其余 4xx/5xx 归入 unknown，仍展示友好卡片 */
export type AiErrorCode =
  | 400 | 401 | 402 | 403 | 404 | 408 | 429
  | 500 | 502 | 503 | 504
  | 'network' | 'unknown'

export interface AiErrorState {
  code: AiErrorCode
  /** 原始 HTTP 状态码，用于「诊断」行；连接层错误为 undefined */
  status?: number
  /** 简短诊断信息（如 HTTP 429），不展示密钥或任何敏感值 */
  detail?: string
  at: number
}

export interface AiErrorCopy {
  /** 卡片顶部的小标签 */
  label: string
  /** 主标题：用户第一眼要读懂的一句 */
  title: string
  /** 具体原因与下一步建议 */
  hint: string
  /** 重试按钮文案 */
  action: string
}

/* ---------------- 模块级发布 / 订阅（不写 localStorage、不新增持久化键） ---------------- */

type Listener = (state: AiErrorState | null) => void
const listeners = new Set<Listener>()
let current: AiErrorState | null = null

export function getAiError(): AiErrorState | null { return current }

export function subscribeAiError(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function publish(next: AiErrorState | null): void {
  current = next
  /* 单个订阅者抛错不应影响其它订阅者，也不应冒泡成未捕获异常 */
  listeners.forEach((listener) => {
    try { listener(next) } catch { /* 忽略 */ }
  })
}

/** 发布一条错误；重复上报以最新一次为准 */
export function reportAiError(code: AiErrorCode, detail?: string, status?: number): void {
  publish({ code, status, detail, at: Date.now() })
}

/** 用户点「重试」/「继续用本地演示」，或开启新一轮对话时清空 */
export function clearAiError(): void { publish(null) }

/**
 * 开发期调试钩子：允许在 DevTools Console 里手动预览任意错误码卡片，
 * 例如 `__linguaReportAiError(401)` / `(429)` / `(500)`。
 * 只在 Vite dev 下挂载，生产 bundle 中不存在；纯 UI 状态，不触碰请求链路。
 */
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  ;(window as unknown as { __linguaReportAiError?: typeof reportAiError }).__linguaReportAiError = reportAiError
}

/* ---------------- 状态码 → 友好文案 ---------------- */

/** 把任意 HTTP 码归一到 UI 能识别的枚举；未知码统一 unknown */
export function codeFromStatus(status: number): AiErrorCode {
  const known: AiErrorCode[] = [400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504]
  if (known.includes(status as AiErrorCode)) return status as AiErrorCode
  if (status >= 500) return 500
  if (status >= 400) return 'unknown'
  return 'unknown'
}

const COPY: Record<AiErrorCode, AiErrorCopy> = {
  400: {
    label: '请求没被接受', title: 'AI 正在开小差，请稍后再试',
    hint: '服务端没能理解这次请求。稍等片刻重试一次，或继续使用本地演示练习。', action: '重试',
  },
  401: {
    label: '密钥校验未通过', title: 'AI 正在开小差，请稍后再试',
    hint: '服务端的大模型密钥可能无效或已过期，请检查部署环境的 LLM_API_KEY 配置。', action: '重试',
  },
  402: {
    label: '账户额度', title: '余额不足，AI 暂时休息一下',
    hint: '大模型账户额度已用尽。充值后重试；这期间本地演示会继续陪你练习。', action: '重试',
  },
  403: {
    label: '访问被拒绝', title: 'AI 正在开小差，请稍后再试',
    hint: '服务端拒绝了这次调用，通常是密钥权限或模型白名单问题。', action: '重试',
  },
  404: {
    label: '接口未找到', title: 'AI 正在开小差，请稍后再试',
    hint: '没有找到 /.netlify/functions/chat 函数。本地请用 npm run dev:full 同时启动前后端；线上请确认 Netlify 函数已部署。', action: '重试',
  },
  408: {
    label: '响应超时', title: 'AI 想得太久了，请稍后再试',
    hint: '上游模型在 9 秒内没有回话。网络恢复或稍等后重试即可。', action: '重试',
  },
  429: {
    label: '请求太密集', title: 'AI 有点忙，歇一下再试',
    hint: '触发了服务商限流。等几十秒再点重试，本地演示不受影响。', action: '稍后重试',
  },
  500: {
    label: '服务端异常', title: 'AI 正在开小差，请稍后再试',
    hint: '大模型服务内部出错了。稍后重试；连续失败请查看 Netlify 函数日志。', action: '重试',
  },
  502: {
    label: '上游网关异常', title: 'AI 正在开小差，请稍后再试',
    hint: '服务端没能连上大模型供应商，通常是上游临时故障。', action: '重试',
  },
  503: {
    label: '服务暂不可用', title: 'AI 正在开小差，请稍后再试',
    hint: '服务正在维护或未配置密钥。稍后重试，或先用本地演示继续。', action: '重试',
  },
  504: {
    label: '网关超时', title: 'AI 想得太久了，请稍后再试',
    hint: '请求在网关层超时了。稍等片刻重试一次即可。', action: '重试',
  },
  network: {
    label: '网络未连通', title: '网络好像断开了',
    hint: '检查一下网络后重试。本地演示完全离线，随时可以继续练习。', action: '重试',
  },
  unknown: {
    label: 'AI 未响应', title: 'AI 正在开小差，请稍后再试',
    hint: '这次没能拿到真实 AI 的回复，已自动切到本地演示，练习不会中断。', action: '重试',
  },
}

export function describeAiError(code: AiErrorCode): AiErrorCopy {
  return COPY[code] || COPY.unknown
}

/* ---------------- 只读观察：从浏览器已记录的 performance entry 取状态码 ---------------- */

/**
 * 观察同源 /.netlify/functions/chat 资源条目的 responseStatus，把 4xx/5xx 发布成 UI 错误。
 * - 只读：不发起、不包裹、不改写任何 fetch；
 * - 防御：API 缺失 / 构造异常 / 条目无 responseStatus 时静默退化为 no-op；
 * - 清理：返回 disconnect 函数，由调用方在组件卸载时执行。
 */
export function observeChatHttpStatus(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}
  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
  try {
    const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes
    if (Array.isArray(supported) && !supported.includes('resource')) return () => {}
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceResourceTiming & { responseStatus?: number }
        /* 只认 /.netlify/functions/chat，且只认挂载之后产生的条目，避免把历史请求误报成当前轮错误 */
        if (!/\/\.netlify\/functions\/chat(?:[?#]|$)/.test(timing.name)) continue
        if (timing.startTime < startedAt) continue
        const status = typeof timing.responseStatus === 'number' ? timing.responseStatus : 0
        if (status < 400) continue
        reportAiError(codeFromStatus(status), `HTTP ${status}`, status)
      }
    })
    observer.observe({ type: 'resource', buffered: true })
    return () => {
      try { observer.disconnect() } catch { /* 已释放 */ }
    }
  } catch {
    /* 老浏览器 / jsdom / 隐私模式下 PerformanceObserver 不可用：静默降级 */
    return () => {}
  }
}
