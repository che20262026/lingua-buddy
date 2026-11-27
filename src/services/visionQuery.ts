/**
 * [查询 Query · 视觉识别] 唯一入口 VisionQueryService
 * ------------------------------------------------------------------
 * 组件只调 analyzeImage(file, opts)，不直接 fetch。遵循项目 Agent/Service 惯例：
 *   默认 Mock + setVisionQueryService() 可替换 + 远程失败自动回退 Mock。
 *
 * 关键治理（对应用户列出的 12 条要求）：
 *  1. 预处理：canvas 压缩最长边 ≤1280 / JPEG 0.8 / drawImage 天然剥 EXIF；
 *     SHA-256 内容哈希；objectURL 及时 revoke；绝不上传原图。
 *  2. 缓存：vision:v1:hash:prompt:lang:level，TTL 7 天，IndexedDB / 内存降级，
 *     只存纯文本不存图，刷新后恢复。
 *  3. 单飞：模块级 Map<key,Promise> 同 key 合并；不同图串行队列并发 1、上限 3。
 *  4. 本地令牌桶 vision: 桶 3/min、30/day（可 configure），桶满不发网络。
 *  5. 请求：一次动作最多 1 次网络视觉请求；429 不自动重试；网络/5xx 最多 2 次退避；
 *     9s AbortController 超时返回降级 JSON，不轮询。
 *  6. 可观测：请求数 / cache_hit / inflight_join / 429 / retry / latency，429 只 warn 一次。
 */
import {
  VISION_BUCKET, VISION_MAX_CONCURRENCY, VISION_MAX_QUEUE, VISION_TIMEOUT_MS, acquireToken, emptyBucket,
  retryDelay, shouldRetry, visionCacheKey, type TokenBucket, type VisionAnalyzeOpts, type VisionResult,
} from '../lib/visionCore'
export type { VisionResult } from '../lib/visionCore'
import { getVisionCache, putVisionCache } from '../lib/visionCache'

export interface VisionQueryService {
  readonly name: string
  analyzeImage(file: File | Blob, opts?: VisionAnalyzeOpts): Promise<VisionResult>
}

/** 固定结构化 Mock —— 明确标注，绝不冒充真实识别 */
export const mockVisionQueryService: VisionQueryService = {
  name: 'mock',
  async analyzeImage(_file, opts = {}) {
    const started = Date.now()
    return {
      ok: true,
      text: '【演示模式 · 未调用真实视觉模型】\n这是一条固定占位文本。请在服务端配置 LLM_API_KEY 后重试，或直接用上方输入框手动输入文字。',
      requestId: opts.requestId || `mock-${started}`,
      degraded: true,
      mock: true,
      latencyMs: Date.now() - started,
    }
  },
}

/** 测试钩子：jsdom 无 Image/Canvas，注入预处理与网络替身以单测单飞/缓存/限流 */
type Preprocessor = (blob: File | Blob) => Promise<{ base64: string; hash: string }>
type Fetcher = (base64: string, opts: VisionAnalyzeOpts, requestId: string, signal?: AbortSignal) => Promise<VisionResult>
let preprocessor: Preprocessor | null = null
let fetcher: Fetcher | null = null
export function setVisionTestHooks(hooks: { preprocess?: Preprocessor | null; fetch?: Fetcher | null } | null): void {
  preprocessor = hooks?.preprocess ?? null
  fetcher = hooks?.fetch ?? null
}

/** 可观测计数（模块级，供冒烟与诊断读取） */
export interface VisionTelemetry {
  requests: number
  cacheHit: number
  inflightJoin: number
  rateLimited: number
  retry: number
  queueFull: number
  timeout: number
  avgLatencyMs: number
}
const telemetry: VisionTelemetry = {
  requests: 0, cacheHit: 0, inflightJoin: 0, rateLimited: 0, retry: 0, queueFull: 0, timeout: 0, avgLatencyMs: 0,
}
export function getVisionTelemetry(): VisionTelemetry { return { ...telemetry } }
export function resetVisionTelemetry(): void {
  Object.assign(telemetry, { requests: 0, cacheHit: 0, inflightJoin: 0, rateLimited: 0, retry: 0, queueFull: 0, timeout: 0, avgLatencyMs: 0 })
  warned429 = false
  inflight.clear()
  queue.length = 0
  active = 0
  bucket = emptyBucket()
}

/**
 * 当前服务：默认走真实实现（内部已自带「远程失败 → Mock 降级」），
 * 只有测试/无后端演示才通过 setVisionQueryService 显式注入 Mock。
 * 用 null 表示「未注入」，getter 动态回退到 visionQueryService，
 * 规避 visionQueryService 在文件末尾定义造成的 TDZ。
 */
let current: VisionQueryService | null = null
export function setVisionQueryService(service: VisionQueryService | null): void {
  current = service
}
export function getVisionQueryService(): VisionQueryService {
  return current ?? visionQueryService
}

/* ---------------- 单飞 / 串行队列 / 本地令牌桶 ---------------- */
const inflight = new Map<string, Promise<VisionResult>>()
const queue: Array<() => void> = []
let active = 0
let bucket: TokenBucket = emptyBucket()
let perMinute = 3
let perDay = 30
let warned429 = false

export function configureVisionLimits(minute: number, day: number): void {
  perMinute = Math.max(0, minute)
  perDay = Math.max(0, day)
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const launch = () => {
      active += 1
      task().finally(() => {
        active -= 1
        const next = queue.shift()
        if (next) next()
      }).then(resolve, reject)
    }
    if (active < VISION_MAX_CONCURRENCY) launch()
    else if (queue.length < VISION_MAX_QUEUE) queue.push(launch)
    else reject(new Error('QUEUE_FULL'))
  })
}

/** 把 File/Blob 压成 ≤1280 的 JPEG data URL，并算 SHA-256；objectURL 立即 revoke */
async function preprocess(blob: File | Blob): Promise<{ base64: string; hash: string }> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('图片解码失败'))
      el.src = url
    })
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 不可用')
    // drawImage 重绘天然剥掉 EXIF（元数据不会进入像素）
    ctx.drawImage(img, 0, 0, width, height)
    const base64 = canvas.toDataURL('image/jpeg', 0.8)
    const hash = await sha256(base64)
    return { base64, hash }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function fitWithin(w: number, h: number) {
  const scale = Math.min(1, 1280 / Math.max(w || 1, h || 1))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

async function sha256(text: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch { /* 非安全上下文降级到简单哈希 */ }
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `fnv-${(h >>> 0).toString(16)}`
}

/** 实际网络调用：复用 /chat 的 task:'vision' 分支，严格一次请求 */
async function fetchVision(
  base64: string, opts: VisionAnalyzeOpts, requestId: string, signal?: AbortSignal,
): Promise<VisionResult> {
  if (fetcher) return fetcher(base64, opts, requestId, signal)
  const started = Date.now()
  const controller = new AbortController()
  const onExternal = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternal, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)
  try {
    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        task: 'vision',
        requestId,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '提取图片中的全部文字，只输出纯文本。' },
          { type: 'image_url', image_url: { url: base64 } },
        ] }],
        promptVersion: opts.promptVersion || 'v1',
        targetLang: opts.targetLang || 'en',
        levelProfile: opts.levelProfile || 'B1',
      }),
    })
    const payload = JSON.parse(await res.text() || '{}') as Record<string, unknown>
    const latencyMs = Date.now() - started
    if (res.status === 429) {
      telemetry.rateLimited += 1
      if (!warned429) { console.warn('[VisionQuery] 视觉识别被限流，请等待后手动重试'); warned429 = true }
      return { ok: false, text: '', code: 'RATE_LIMITED_REMOTE', retryAfterSeconds: Number(payload.retryAfterSeconds) || 30,
        requestId, degraded: true, mock: false, latencyMs }
    }
    if (!res.ok || payload.ok !== true || typeof payload.content !== 'string') {
      return { ok: false, text: '', code: res.status >= 500 ? 'UNAVAILABLE' : 'EMPTY',
        requestId, degraded: true, mock: false, latencyMs }
    }
    return { ok: true, text: payload.content, requestId, degraded: false, mock: false, latencyMs }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    const timedOut = aborted && !signal?.aborted
    if (timedOut) telemetry.timeout += 1
    return { ok: false, text: '', code: aborted ? (timedOut ? 'TIMEOUT' : 'ABORTED') : 'UNAVAILABLE',
      requestId, degraded: true, mock: false, latencyMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternal)
  }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

/**
 * 唯一入口：同 key 单飞合并，不同图串行。
 * 顺序铁律：预处理 →【同步占位】→ 缓存命中 / 单飞 join →【仅真正发起者 acquire 令牌桶】→ 排队 → 网络。
 * 若把 acquire 放在最前，5 次同图并发会各扣 1 个令牌，第 4 次就被本地桶拒 —— 违背验收。
 * inflight 占位必须在任何 await 之前同步写入，否则 5 个并发都在 await 缓存后同时 miss。
 */
async function analyzeImage(file: File | Blob, opts: VisionAnalyzeOpts = {}): Promise<VisionResult> {
  const requestId = opts.requestId || `vq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const started = Date.now()

  let base64: string
  let hash: string
  try {
    const prepared = preprocessor ? await preprocessor(file) : await preprocess(file)
    base64 = prepared.base64
    hash = prepared.hash
  } catch {
    const fallback = await getVisionQueryService().analyzeImage(file, { ...opts, requestId })
    return { ...fallback, degraded: true, latencyMs: Date.now() - started }
  }

  const key = visionCacheKey(hash, opts)
  const existing = inflight.get(key)
  if (existing) {
    telemetry.inflightJoin += 1
    return existing
  }

  // 同步占位 deferred：后续同 key 请求立刻 join，不会各自发网络
  let settle!: (r: VisionResult) => void
  const task = new Promise<VisionResult>((resolve) => { settle = resolve })
  inflight.set(key, task)

  void (async () => {
    try {
      const cached = await getVisionCache(key)
      if (cached) {
        telemetry.cacheHit += 1
        settle({ ok: true, text: cached.text, requestId, degraded: cached.degraded, mock: cached.mock, latencyMs: Date.now() - started })
        return
      }
      // 只有真正要发网络的那一个请求扣令牌：桶满直接返回倒计时，不排队不发光
      const token = acquireToken(bucket, perMinute, perDay)
      if (!token.allowed) {
        telemetry.rateLimited += 1
        if (!warned429) { console.warn(`[VisionQuery] 本地 ${VISION_BUCKET} 桶已满，等待后手动重试`); warned429 = true }
        settle({ ok: false, text: '', code: 'RATE_LIMITED_LOCAL', retryAfterSeconds: token.retryAfterSeconds,
          requestId, degraded: true, mock: false, latencyMs: Date.now() - started })
        return
      }
      const result = await runExclusive(async () => {
        telemetry.requests += 1
        let r = await fetchVision(base64, opts, requestId, opts.signal)
        for (let attempt = 0; shouldRetry(r.code, attempt); attempt++) {
          telemetry.retry += 1
          await sleep(retryDelay(attempt), opts.signal)
          if (opts.signal?.aborted) return { ...r, code: 'ABORTED' as const }
          r = await fetchVision(base64, opts, requestId, opts.signal)
        }
        if (r.ok) {
          await putVisionCache({ key, text: r.text, degraded: r.degraded, mock: r.mock, createdAt: Date.now() })
        }
        return r
      })
      settle(result)
    } catch (err) {
      settle(err instanceof Error && err.message === 'QUEUE_FULL'
        ? { ok: false, text: '', code: 'QUEUE_FULL' as const, requestId, degraded: true, mock: false, latencyMs: Date.now() - started }
        : { ok: false, text: '', code: 'UNAVAILABLE' as const, requestId, degraded: true, mock: false, latencyMs: Date.now() - started })
    }
  })()

  try { return await task }
  finally { inflight.delete(key) }
}

export const visionQueryService: VisionQueryService = {
  name: 'remote-with-mock-fallback',
  analyzeImage,
}

/**
 * 组件统一调用入口：当前服务失败时回退 Mock 文本并标注降级。
 *
 * 语义铁律（修复「失败被翻成 ok:true」缺陷）：
 *  - 失败必须保持 ok:false —— 否则 UI 的 `if (!result.ok)` 进不去，
 *    会把占位文本当识别结果 setText + runAnalysis，自动再打一次 /chat 放大请求，
 *    倒计时与手动重试按钮也全部失效。
 *  - Mock 文本只作「仅用文本继续查询」的后备，绝不冒充真实识别结果；
 *  - 降级标记 degraded:true / mock:false —— 与主动演示模式（mock:true）区分，
 *    UI 标注「降级模式」而非「演示模式」。
 */
export async function analyzeVisionImage(file: File | Blob, opts?: VisionAnalyzeOpts): Promise<VisionResult> {
  const result = await getVisionQueryService().analyzeImage(file, opts)
  // 主动演示模式（注入的 Mock 服务）：原样返回，UI 标注「演示模式」
  if (result.ok && result.degraded && result.mock) return result
  // 真实服务失败：回退文本但保持失败语义，交给 UI 显示倒计时 + 手动重试 / 文本继续
  if (!result.ok && !result.mock) {
    const mock = await mockVisionQueryService.analyzeImage(file, opts)
    return {
      ok: false,
      text: mock.text,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
      requestId: result.requestId,
      degraded: true,
      mock: false,
      latencyMs: result.latencyMs,
    }
  }
  return result
}
