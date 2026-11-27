/**
 * LinguaBuddy · 真实 AI 对话接口（Netlify Functions）
 * ------------------------------------------------------------------
 * 部署位置：netlify/functions/chat.ts
 *   → Netlify 自动映射为 GET/POST /.netlify/functions/chat
 *
 * 本文件由 api/chat.ts「搬运」而来：请求校验、等级注入、密钥脱敏、
 * OpenAI 兼容 /chat/completions、SSE 分支、统一 fallback:true 降级外壳
 * 全部保持同一套语义，只把出口从 Vercel 的 (req, res) 改成 Netlify 的
 * (event) → { statusCode, headers, body }。
 *
 * 单一真源：invokeChat() 同时被本文件的 handler 与本地 Express 联调台
 * server.ts 复用，本地跑的就是生产那一份代码，不存在「本地能跑、上线变样」。
 * api/chat.ts 原样保留作 legacy Vercel 入口，Netlify 不会读取它。
 *
 * 环境变量（只在服务端读取，绝对不要加 VITE_ 前缀；
 * 在 Netlify → Site settings → Environment variables 里配置）：
 *   LLM_API_KEY   必填，OpenAI 兼容服务的密钥
 *   LLM_API_BASE   选填，默认 https://api.deepseek.com/v1
 *   LLM_MODEL      选填，默认 deepseek-chat
 *
 * 契约：
 *   GET  → 模式探测 { ok, mode, configured, provider, model, message }，永不返回密钥
 *   POST → { messages, level, stream? }；成功 { ok:true, mode:'live', content, model, provider }
 *          任何失败 { ok:false, fallback:true, error:'友好提示' } + 5xx，前端据此回退 Mock
 *   限流 → 429 { ok:false, fallback:true, rateLimited:true, scope, error:'中文提示' }
 *          附 Retry-After 与 X-RateLimit-* 头；前端照样回退 Mock，只是额外弹一张友好卡片
 *
 * [防刷限流] 见 netlify/lib/rateLimit.ts：纯内存 Map，按 IP 双窗口计数
 * （默认每分钟 5 次、每天 50 次，仅 POST 计数）。Serverless 实例级近似限流，
 * 挡得住随手刷屏，挡不住分布式攻击——需要更强时换成 Redis 之类的共享存储。
 *
 * ⚠️ 两处平台适配（与 api/chat.ts 的唯一差异，均不改变对前端的契约）：
 * 1. 标准 Netlify Functions 是「缓冲式」响应，不能逐块 flush。stream:true 时
 *    这里把上游 SSE 攒成完整 body 一次性返回；前端 SseDeltaDecoder 本就能
 *    处理一次到齐的多帧，且默认对话走标准 JSON + 30ms 定时器打字机，体验不受影响。
 * 2. Netlify 同步函数默认执行上限约 10s，因此上游超时取 9s（Vercel 版是 15s），
 *    保证一定由本函数返回可降级的 JSON，而不是被平台切断成无 fallback 的 502。
 */

import { checkRateLimit, clientIp, readRateLimitConfig, rateLimitHeaders, type RateLimitDecision } from '../lib/rateLimit'

type ChatRole = 'system' | 'user' | 'assistant'
interface WireMessage { role: ChatRole; content: string }

/** Netlify event / result 的最小契约：仅为类型，不引入 @netlify/functions 依赖 */
export interface NetlifyEvent {
  httpMethod?: string
  body?: string | null
  isBase64Encoded?: boolean
  queryStringParameters?: Record<string, string> | null
  headers?: Record<string, string | undefined>
}
export interface NetlifyResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

/** handler 与本地 Express 共用的最小输入输出 */
export interface ChatRequest {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  /** 请求头：限流需要从中取客户端 IP（Netlify 事件头 / Express req.headers） */
  headers?: Record<string, string | undefined>
}
export interface ChatResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const DEFAULT_BASE = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'
const MAX_MESSAGES = 24
const MAX_CHARS = 4000
/** 见文件头「平台适配 2」：Netlify 同步函数默认 ~10s，留 1s 余量给函数自身 */
const UPSTREAM_TIMEOUT_MS = 9_000

/* ------------------------------------------------------------------ *
 * [查询 Query · 视觉识别] task:'vision' 分支
 * ------------------------------------------------------------------
 * 与对话共用同一个 invokeChat 调用栈（不新建第五套函数），但三点严格隔离：
 *  1. 限流桶前缀 'vision:' —— 与裸 IP 的 chat 桶互不影响；
 *  2. 严格 JSON schema + max_tokens + 单图单次，不允许模型自我追问；
 *  3. requestId 幂等：同一 id 在 TTL 内直接回放结果，不重复打上游。
 * 环境变量只在服务端读取（无 VITE_ 前缀）：
 *   VISION_RATE_LIMIT_PER_MINUTE  默认 3
 *   VISION_RATE_LIMIT_PER_DAY     默认 30
 * ------------------------------------------------------------------ */
const VISION_MAX_TOKENS = 1200
const VISION_MAX_IMAGE_CHARS = 1_600_000 // base64 data URL 上限（压缩后 ≤300KB ≈ 400k 字符，留足余量）
const VISION_IDEMPOTENT_TTL_MS = 5 * 60_000
/** 幂等表：requestId → { at, result }；纯内存、有界、按时间淘汰 */
const visionSeen = new Map<string, { at: number; result: ChatResult }>()
const VISION_SEEN_MAX = 500

function visionRateLimitConfig(): { perMinute: number; perDay: number } {
  const parse = (raw: unknown, fallback: number) => {
    const n = Number(raw)
    return raw === undefined || raw === null || raw === '' || !Number.isFinite(n) || n < 0 ? fallback : Math.floor(n)
  }
  return {
    perMinute: parse(process.env.VISION_RATE_LIMIT_PER_MINUTE, 3),
    perDay: parse(process.env.VISION_RATE_LIMIT_PER_DAY, 30),
  }
}

/** JSON schema 强约束：只回一行 JSON，字段固定，杜绝多轮自我追问 */
const VISION_SCHEMA_SYSTEM =
  'You are a strict OCR vision extractor. Return ONLY one JSON object with exactly one field: ' +
  '{"text":"<all visible text, verbatim, line breaks preserved>"}. ' +
  'No markdown, no translation, no explanation, no questions, no follow-ups. ' +
  'If no text is visible, return {"text":""}. Never call tools or request more images.'

/** 统一降级外壳：前端看到 fallback:true 就知道该用 Mock 了 */
function fallbackBody(error: string) {
  return { ok: false, fallback: true as const, error }
}

/**
 * [防刷限流] 429 响应：中文提示 + Retry-After + 额度观测头。
 * 关键约定：仍然带 fallback:true —— 前端据此照旧回退本地 Mock，
 * 练习不中断，只是额外弹出一张「请求太频繁」的友好卡片，绝不白屏。
 */
function rateLimitedResult(decision: RateLimitDecision): ChatResult {
  const message = decision.scope === 'day' ? '今日额度已用完' : '请求太频繁，请稍后再试'
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...NO_STORE,
      ...rateLimitHeaders(decision),
    },
    body: JSON.stringify({
      ok: false,
      fallback: true,
      rateLimited: true,
      scope: decision.scope === 'day' ? 'day' : 'minute',
      error: message,
      retryAfterSeconds: decision.retryAfterSeconds,
    }),
  }
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

function jsonResult(statusCode: number, payload: unknown): ChatResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE },
    body: JSON.stringify(payload),
  }
}

function readEnv() {
  const key = String(process.env.LLM_API_KEY || '').trim()
  const base = String(process.env.LLM_API_BASE || '').trim() || DEFAULT_BASE
  const model = String(process.env.LLM_MODEL || '').trim() || DEFAULT_MODEL
  return { key, base, model }
}

/** base 可填 /v1，也可直接填完整 .../chat/completions */
function completionUrl(base: string): string {
  const b = base.replace(/\/+$/, '')
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`
}

/** 只回显域名，不泄漏完整地址里可能夹带的参数或密钥 */
function safeProvider(base: string): string {
  try { return new URL(base).host } catch { return 'custom' }
}

/** 脱敏：错误信息里万一混进 sk-xxx，也先抹掉 */
function friendly(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err)
  if (err instanceof Error && err.name === 'AbortError') msg = '上游大模型响应超时'
  return msg.replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 160)
}

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { throw new Error('请求体不是合法 JSON') }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  throw new Error('请求体格式不正确')
}

function levelOf(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^\w.+ -]/g, '').slice(0, 32) : ''
  return s || 'B1'
}

/** 校验 + 清洗 messages，并把 level 并进 system 指令（前端无需重复拼等级约束） */
function buildMessages(raw: unknown, level: string): WireMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('messages 必须是非空数组')
  const list: WireMessage[] = []
  for (const item of raw.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    const content = typeof m.content === 'string' ? m.content.trim().slice(0, MAX_CHARS) : ''
    if (!content) continue
    const role: ChatRole = m.role === 'system' || m.role === 'assistant' ? m.role : 'user'
    list.push({ role, content })
  }
  if (!list.length) throw new Error('messages 中没有可用内容')

  const guard = ` Learner level: ${level}. Keep vocabulary and sentence length at this level.`
  const first = list.findIndex((m) => m.role === 'system')
  if (first >= 0) list[first] = { role: 'system', content: (list[first].content + guard).slice(0, MAX_CHARS) }
  else list.unshift({ role: 'system', content: `You are LinguaBuddy's English dialogue coach.${guard} Return ONLY the JSON requested by the user.` })
  return list
}

/**
 * [视觉识别] 严格受限的单图单次提取。复用同一上游调用栈，但：
 *  - 桶前缀 vision:（readRateLimitConfig 的解析规则仍复用同一份 parseLimit）；
 *  - requestId 幂等（5 分钟 TTL，有界 500 条）；
 *  - 只接受一条 image_url，system 强制 JSON schema，max_tokens 限死；
 *  - 429/5xx 结构化 + Retry-After 透传，超时走 fallback 外壳，绝不 502 裸奔。
 */
async function invokeVision(
  req: ChatRequest, body: Record<string, unknown>, key: string, base: string, model: string,
): Promise<ChatResult> {
  try {
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim().slice(0, 80) : ''
    const now = Date.now()
    if (requestId) {
      for (const [id, entry] of visionSeen) {
        if (now - entry.at > VISION_IDEMPOTENT_TTL_MS) visionSeen.delete(id)
      }
      const seen = visionSeen.get(requestId)
      if (seen && now - seen.at <= VISION_IDEMPOTENT_TTL_MS) {
        return { ...seen.result, headers: { ...seen.result.headers, 'X-Vision-Idempotent': 'hit' } }
      }
    }

    /** 独立桶：桶键加 'vision:' 前缀，与裸 IP 的 chat 桶彻底隔离 */
    const decision = checkRateLimit(`vision:${clientIp(req.headers)}`, visionRateLimitConfig())
    if (!decision.allowed) {
      const limited = rateLimitedResult(decision)
      return { ...limited, headers: { ...limited.headers, 'X-Vision-Task': 'vision' } }
    }

    /** 严格校验：messages 只允许 1 条 user，content 里最多 1 个 image_url */
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (messages.length !== 1 || !messages[0] || typeof messages[0] !== 'object') {
      return jsonResult(400, fallbackBody('视觉识别只接受单条图片消息。'))
    }
    const content = (messages[0] as Record<string, unknown>).content
    if (!Array.isArray(content)) return jsonResult(400, fallbackBody('视觉识别需要图文 content 数组。'))
    const images = content.filter((p): p is { type: string; image_url?: { url?: string } } =>
      !!p && typeof p === 'object' && (p as Record<string, unknown>).type === 'image_url')
    if (images.length !== 1) return jsonResult(400, fallbackBody('一次只接受一张图片。'))
    const url = images[0]?.image_url?.url
    if (typeof url !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(url) || url.length > VISION_MAX_IMAGE_CHARS) {
      return jsonResult(400, fallbackBody('图片格式或体积不符合要求（仅 JPEG/PNG/WebP data URL）。'))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    let upstream: Response
    try {
      upstream = await fetch(completionUrl(base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: VISION_SCHEMA_SYSTEM }, { role: 'user', content }],
          temperature: 0,
          max_tokens: VISION_MAX_TOKENS,
          stream: false,
        }),
        signal: controller.signal,
      })
    } finally { clearTimeout(timer) }

    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get('retry-after') || '30'
      return {
        statusCode: 429,
        headers: { ...NO_STORE, 'Retry-After': retryAfter, 'X-Vision-Task': 'vision' },
        body: JSON.stringify({ ok: false, fallback: true, rateLimited: true, scope: 'upstream', error: '视觉模型繁忙，请稍后手动重试', retryAfterSeconds: Number(retryAfter) || 30 }),
      }
    }
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 120)
      return jsonResult(502, fallbackBody(`视觉模型返回 HTTP ${upstream.status}${detail ? `（${detail}）` : ''}，已自动回退本地 Mock 演示。`))
    }

    const data = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const rawContent = data?.choices?.[0]?.message?.content
    if (typeof rawContent !== 'string') throw new Error('视觉模型未返回文本')
    /** 严格解析 JSON schema，失败按空文本降级（不编造识别结果） */
    let text = ''
    try {
      const parsed = JSON.parse(rawContent.trim()) as { text?: unknown }
      if (typeof parsed.text === 'string') text = parsed.text.slice(0, MAX_CHARS)
    } catch { text = '' }
    const result = jsonResult(200, { ok: true, mode: 'live', content: text, model, provider: safeProvider(base), vision: true })
    if (requestId) {
      visionSeen.set(requestId, { at: now, result })
      if (visionSeen.size > VISION_SEEN_MAX) {
        const oldest = [...visionSeen.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (oldest) visionSeen.delete(oldest[0])
      }
    }
    return { ...result, headers: { ...result.headers, 'X-Vision-Task': 'vision' } }
  } catch (err) {
    return jsonResult(503, fallbackBody(`视觉识别暂时不可用：${friendly(err)}，已自动回退本地 Mock 演示。`))
  }
}

/**
 * 与平台无关的核心：三端（Netlify handler / 本地 Express / 冒烟运行时测试）共用。
 * 整个函数体包在 try 里，任何意外都变成可执行降级的 JSON，而不是函数崩溃。
 */
export async function invokeChat(req: ChatRequest): Promise<ChatResult> {
  try {
    const method = String(req.method || 'GET').toUpperCase()

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: { ...NO_STORE, Allow: 'GET, POST, OPTIONS' }, body: '' }
    }

    const { key, base, model } = readEnv()

    /** GET：前端用来判断「真实 AI 还是 Mock」，只读配置存在性，绝不回传密钥 */
    if (method === 'GET') {
      return jsonResult(200, {
        ok: true,
        mode: key ? 'live' : 'mock',
        configured: Boolean(key),
        provider: safeProvider(base),
        model,
        message: key
          ? '真实 AI 已接入'
          : '服务端未配置 LLM_API_KEY，前端将使用本地 Mock',
      })
    }

    if (method !== 'POST') return jsonResult(405, fallbackBody('仅支持 GET / POST 请求'))

    const body = parseBody(req.body)

    /** [视觉识别] 独立分支：独立桶 / 幂等 / 严格 schema，绝不占用对话额度 */
    if (body.task === 'vision') return await invokeVision(req, body, key, base, model)

    if (!key) return jsonResult(503, fallbackBody('服务端未配置 LLM_API_KEY，已自动回退本地 Mock 演示。'))

    /**
     * [防刷限流] 只对真正消耗大模型额度的 POST 计数：
     * GET 能力探测不消耗额度，因此永不计数（否则打开设置页就会吃掉配额）。
     * 判定顺序刻意放在「未配密钥 → 503」之后：没有上游调用就没有滥用成本，
     * 不该用 429 盖住「服务端未配置密钥」这个更准确的信息。
     */
    const decision = checkRateLimit(clientIp(req.headers), readRateLimitConfig())
    if (!decision.allowed) return rateLimitedResult(decision)

    const level = levelOf(body.level)
    const messages = buildMessages(body.messages, level)
    const stream = body.stream === true

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    let upstream: Response
    try {
      upstream = await fetch(completionUrl(base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          stream,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 120)
      return jsonResult(502, fallbackBody(`大模型服务返回 HTTP ${upstream.status}${detail ? `（${detail}）` : ''}，已自动回退本地 Mock。`))
    }

    /** 可选流式：Netlify 缓冲式响应，把上游 SSE 攒成完整 body 一次性返回 */
    if (stream && upstream.body) {
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      const chunks: string[] = []
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (chunk) chunks.push(chunk)
        }
        const tail = decoder.decode()
        if (tail) chunks.push(tail)
      } catch (streamErr) {
        chunks.push(`event: error\ndata: ${JSON.stringify({ error: friendly(streamErr) })}\n\n`)
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
          'X-Content-Type-Options': 'nosniff',
        },
        body: chunks.join(''),
      }
    }

    /** 标准 JSON：把上游 choices[0].message.content 透传给前端，由服务层解析成 DirectorOutput */
    const data = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('上游未返回文本内容')
    return jsonResult(200, { ok: true, mode: 'live', content, model, provider: safeProvider(base) })
  } catch (err) {
    return jsonResult(503, fallbackBody(`AI 服务暂时不可用：${friendly(err)}，已自动回退本地 Mock 演示。`))
  }
}

/** Netlify Functions 入口：event → invokeChat → { statusCode, headers, body } */
export const handler = async (event: NetlifyEvent): Promise<NetlifyResult> => {
  let rawBody: unknown = event.body ?? undefined
  if (typeof rawBody === 'string' && event.isBase64Encoded && typeof Buffer !== 'undefined') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
  }
  try {
    const result = await invokeChat({
      method: event.httpMethod || 'GET',
      body: rawBody,
      query: (event.queryStringParameters || {}) as Record<string, unknown>,
      headers: event.headers,
    })
    return { statusCode: result.statusCode, headers: result.headers, body: result.body }
  } catch (err) {
    /* invokeChat 内部已兜底；这里只防 event 解析层面的意外 */
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE },
      body: JSON.stringify(fallbackBody(`Netlify 函数异常：${friendly(err)}，已自动回退本地 Mock 演示。`)),
    }
  }
}
