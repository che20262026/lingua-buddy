/**
 * LinguaBuddy · 纯内存 IP 限流（Netlify Functions 侧）
 * ------------------------------------------------------------------
 * 为什么放在 netlify/lib/ 而不是 netlify/functions/？
 *   functions 目录下的**每个文件**都会被 Netlify 编译成一个独立端点；
 *   共享代码必须挪出去，否则会凭空多出一个 /api/rateLimit 端点。
 *   esbuild 打包函数时会沿 import 链把本文件内联进 chat.ts，不影响部署。
 *
 * 设计取舍（均为有意为之）：
 * 1. **纯内存 Map**：Serverless 实例无状态、冷启动即清零，这是「近似限流」。
 *    它挡得住随手刷屏的脚本与失控的重试循环，挡不住有组织的分布式攻击
 *    （那种场景需要 Redis / Upstash 之类的共享存储）。诚实说明强于假装严密。
 * 2. **只数 POST**：GET 是前端的能力探测（不消耗大模型额度），把它计进来
 *    会让「打开设置页」这种无成本操作白白吃掉配额。GET / OPTIONS 永不计数。
 * 3. **被拒的请求不计数**：否则客户端持续猛打会把窗口无限续期，
 *    变成「惩罚箱」——用户正常操作也会被永久锁死。
 * 4. **窗口用滚动时间戳数组**（最近 60 秒 / 最近 24 小时），
 *    而不是固定窗口计数：固定窗口在边界会出现「一秒钟打满两次配额」的漏洞。
 * 5. **有界内存**：桶表上限 MAX_BUCKETS，超限按最后活跃时间淘汰最旧者，
 *    同时清理 24 小时无活动的死桶，防止伪造 IP 把内存撑爆。
 *
 * 环境变量（只在服务端读取；0 表示该维度不限制）：
 *   RATE_LIMIT_PER_MINUTE  每分钟每 IP 次数上限，默认 5
 *   RATE_LIMIT_PER_DAY     每天每 IP 次数上限，默认 50
 */

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60_000
const DEFAULT_PER_MINUTE = 5
const DEFAULT_PER_DAY = 50
/** 桶表上限：超过后按最后活跃时间淘汰最旧的桶 */
const MAX_BUCKETS = 5000
/** 死桶清理的最小时间间隔：避免每次请求都全表扫描 */
const PRUNE_INTERVAL_MS = 60_000

export interface RateLimitConfig {
  perMinute: number
  perDay: number
}

export type RateLimitScope = 'minute' | 'day'

export interface RateLimitDecision {
  /** true = 放行；false = 触发限流 */
  allowed: boolean
  /** 触发的窗口：分钟窗或日窗 */
  scope?: RateLimitScope
  /** 建议重试等待秒数（按最早那条记录过期时间算） */
  retryAfterSeconds: number
  /** 本次通过后，分钟窗剩余额度 */
  remainingMinute: number
  /** 本次通过后，日窗剩余额度 */
  remainingDay: number
  limit: RateLimitConfig
}

interface Bucket {
  /** 分钟窗内的时间戳 */
  minute: number[]
  /** 日窗内的时间戳 */
  day: number[]
  /** 最后活跃时间，用于淘汰最旧的桶 */
  touchedAt: number
}

const buckets = new Map<string, Bucket>()
let lastPruneAt = 0

/** 解析限流配置：非法值回落默认，0 表示关闭该维度 */
export function readRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    perMinute: toLimit(env.RATE_LIMIT_PER_MINUTE, DEFAULT_PER_MINUTE),
    perDay: toLimit(env.RATE_LIMIT_PER_DAY, DEFAULT_PER_DAY),
  }
}

function toLimit(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/**
 * 取客户端 IP：优先信任平台在边缘写入的头，客户端可伪造的头排最后。
 * Netlify 会写 x-nf-client-connection-ip（真实来源 IP）；
 * x-forwarded-for 只有在平台已清洗过时才可信，这里只取第一跳。
 */
export function clientIp(headers?: Record<string, string | undefined> | null): string {
  if (!headers) return 'unknown'
  const pick = (name: string): string => {
    const v = headers[name] ?? headers[name.toLowerCase()]
    return typeof v === 'string' ? v.trim() : ''
  }
  const nf = pick('x-nf-client-connection-ip')
  if (nf) return nf
  const real = pick('x-real-ip')
  if (real) return real
  const forwarded = pick('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/** 清理死桶与超限桶：平时每分钟最多全表扫一次 */
function prune(now: number): void {
  if (buckets.size < MAX_BUCKETS && now - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = now
  for (const [ip, bucket] of buckets) {
    if (bucket.minute.length === 0 && bucket.day.length === 0) buckets.delete(ip)
  }
  if (buckets.size <= MAX_BUCKETS) return
  const oldest = [...buckets.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)
  for (let i = 0; i < oldest.length - MAX_BUCKETS; i++) buckets.delete(oldest[i][0])
}

/** 最早那条记录何时过期 → 建议等待秒数（用循环取最小值，避免大数组展开撑爆调用栈） */
function retryAfter(timestamps: number[], windowMs: number, now: number): number {
  if (!timestamps.length) return 0
  let earliest = timestamps[0]
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] < earliest) earliest = timestamps[i]
  }
  const waitMs = earliest + windowMs - now
  return Math.max(1, Math.ceil(waitMs / 1000))
}

/**
 * 核心判定：命中则记录本次请求，被拒则不记录（见文件头「取舍 3」）。
 * @param now 注入时间，便于测试复用（默认取真实时钟）
 */
export function checkRateLimit(
  ip: string,
  config: RateLimitConfig = readRateLimitConfig(),
  now: number = Date.now(),
): RateLimitDecision {
  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { minute: [], day: [], touchedAt: now }
    buckets.set(ip, bucket)
  }
  /* 只保留窗口内的记录 */
  bucket.minute = bucket.minute.filter((t) => now - t < MINUTE_MS)
  bucket.day = bucket.day.filter((t) => now - t < DAY_MS)
  bucket.touchedAt = now

  const minuteUsed = bucket.minute.length
  const dayUsed = bucket.day.length

  if (config.perDay > 0 && dayUsed >= config.perDay) {
    return {
      allowed: false,
      scope: 'day',
      retryAfterSeconds: retryAfter(bucket.day, DAY_MS, now),
      remainingMinute: Math.max(0, config.perMinute - minuteUsed),
      remainingDay: 0,
      limit: config,
    }
  }
  if (config.perMinute > 0 && minuteUsed >= config.perMinute) {
    return {
      allowed: false,
      scope: 'minute',
      retryAfterSeconds: retryAfter(bucket.minute, MINUTE_MS, now),
      remainingMinute: 0,
      remainingDay: Math.max(0, config.perDay - dayUsed),
      limit: config,
    }
  }

  /* 放行：记下这一次 */
  bucket.minute.push(now)
  bucket.day.push(now)
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingMinute: config.perMinute > 0 ? Math.max(0, config.perMinute - minuteUsed - 1) : -1,
    remainingDay: config.perDay > 0 ? Math.max(0, config.perDay - dayUsed - 1) : -1,
    limit: config,
  }
}

/** 限流响应头：Retry-After 告诉客户端等多久，X-RateLimit-* 便于观测 */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit-Minute': String(decision.limit.perMinute),
    'X-RateLimit-Limit-Day': String(decision.limit.perDay),
  }
  if (!decision.allowed) {
    headers['Retry-After'] = String(decision.retryAfterSeconds)
    headers['X-RateLimit-Remaining'] = '0'
    headers['X-RateLimit-Scope'] = decision.scope === 'day' ? 'day' : 'minute'
  }
  return headers
}

/** 供测试与本地调试清空计数 */
export function resetRateLimiter(): void {
  buckets.clear()
  lastPruneAt = 0
}

/** 当前被追踪的 IP 数量（观测用） */
export function trackedIpCount(): number {
  return buckets.size
}
