/**
 * [查询 Query · 视觉识别] 纯逻辑层：预处理参数 / 缓存键 / 本地令牌桶 / 退避
 * ------------------------------------------------------------------
 * 无 DOM、无 fetch、无 React，可被 smoke 用 esbuild 直接单测。
 * 所有策略常量只在此定义一次，service 与冒烟共享同一份。
 */

export const VISION_MAX_EDGE = 1280
export const VISION_JPEG_QUALITY = 0.8
export const VISION_PROMPT_VERSION = 'v1'
export const VISION_TIMEOUT_MS = 9_000
export const VISION_MAX_QUEUE = 3
export const VISION_MAX_CONCURRENCY = 1
/** 重试只针对网络错误 / 5xx，最多 2 次；429 绝不重试 */
export const VISION_RETRY_DELAYS_MS = [800, 1600] as const
export const VISION_BUCKET = 'vision:'

export interface VisionAnalyzeOpts {
  promptVersion?: string
  targetLang?: 'en' | 'ru'
  levelProfile?: string
  signal?: AbortSignal
  requestId?: string
}

export interface VisionResult {
  ok: boolean
  /** 识别纯文本；失败为空串，绝不编造 */
  text: string
  code?: 'RATE_LIMITED_LOCAL' | 'RATE_LIMITED_REMOTE' | 'TIMEOUT' | 'QUEUE_FULL' | 'ABORTED' | 'UNAVAILABLE' | 'EMPTY'
  retryAfterSeconds?: number
  requestId: string
  degraded: boolean
  mock: boolean
  latencyMs: number
}

/** 缓存键：图哈希 + prompt 版本 + 目标语言 + 等级档位，任一变化都不复用 */
export function visionCacheKey(imageHash: string, opts: VisionAnalyzeOpts): string {
  return [
    'vision:v1',
    imageHash,
    opts.promptVersion || VISION_PROMPT_VERSION,
    opts.targetLang || 'en',
    opts.levelProfile || 'B1',
  ].join(':')
}

/** 计算压缩目标尺寸：最长边 ≤1280，等比缩放，返回宽高 */
export function fitWithinMaxEdge(w: number, h: number, maxEdge = VISION_MAX_EDGE): { width: number; height: number } {
  if (!w || !h) return { width: 0, height: 0 }
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/**
 * 本地令牌桶（模块无关纯函数）：滚动时间戳窗口。
 * 桶满时返回 allowed=false + 剩余等待秒数；被拒不计数（避免惩罚箱无限续期）。
 */
export interface TokenBucket { minute: number[]; day: number[] }
export const emptyBucket = (): TokenBucket => ({ minute: [], day: [] })
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60_000

export interface TokenDecision { allowed: boolean; retryAfterSeconds: number; remainingMinute: number; remainingDay: number }

export function acquireToken(
  bucket: TokenBucket, perMinute: number, perDay: number, now = Date.now(),
): TokenDecision {
  bucket.minute = bucket.minute.filter((t) => now - t < MINUTE_MS)
  bucket.day = bucket.day.filter((t) => now - t < DAY_MS)
  const usedMinute = bucket.minute.length
  const usedDay = bucket.day.length
  if (perDay > 0 && usedDay >= perDay) {
    return { allowed: false, retryAfterSeconds: earliestWait(bucket.day, DAY_MS, now), remainingMinute: Math.max(0, perMinute - usedMinute), remainingDay: 0 }
  }
  if (perMinute > 0 && usedMinute >= perMinute) {
    return { allowed: false, retryAfterSeconds: earliestWait(bucket.minute, MINUTE_MS, now), remainingMinute: 0, remainingDay: Math.max(0, perDay - usedDay) }
  }
  bucket.minute.push(now)
  bucket.day.push(now)
  return { allowed: true, retryAfterSeconds: 0, remainingMinute: perMinute > 0 ? perMinute - usedMinute - 1 : -1, remainingDay: perDay > 0 ? perDay - usedDay - 1 : -1 }
}

function earliestWait(ts: number[], windowMs: number, now: number): number {
  let min = Infinity
  for (const t of ts) if (t < min) min = t
  return Number.isFinite(min) ? Math.max(1, Math.ceil((min + windowMs - now) / 1000)) : 1
}

/** 指数退避 + 抖动（确定性种子，便于冒烟断言） */
export function retryDelay(attempt: number, jitter = 0): number {
  const base = VISION_RETRY_DELAYS_MS[Math.min(attempt, VISION_RETRY_DELAYS_MS.length - 1)]
  return Math.round(base * (1 + jitter))
}

/** 是否值得重试：仅网络错误 / 5xx（由 code 表达），429 / 超时 / 取消一律不重试 */
export function shouldRetry(code: VisionResult['code'], attempt: number): boolean {
  return code === 'UNAVAILABLE' && attempt < VISION_RETRY_DELAYS_MS.length
}

/** data URL → Blob（拍照链路已有压缩图，交给 service 再做统一预处理与哈希） */
export function dataUrlToBlob(dataUrl: string, type = 'image/jpeg'): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return new Blob([])
  const body = dataUrl.slice(comma + 1)
  try {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type })
  } catch { return new Blob([]) }
}
