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
 *
 * ⚠️ 两处平台适配（与 api/chat.ts 的唯一差异，均不改变对前端的契约）：
 * 1. 标准 Netlify Functions 是「缓冲式」响应，不能逐块 flush。stream:true 时
 *    这里把上游 SSE 攒成完整 body 一次性返回；前端 SseDeltaDecoder 本就能
 *    处理一次到齐的多帧，且默认对话走标准 JSON + 30ms 定时器打字机，体验不受影响。
 * 2. Netlify 同步函数默认执行上限约 10s，因此上游超时取 9s（Vercel 版是 15s），
 *    保证一定由本函数返回可降级的 JSON，而不是被平台切断成无 fallback 的 502。
 */

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

/** 统一降级外壳：前端看到 fallback:true 就知道该用 Mock 了 */
function fallbackBody(error: string) {
  return { ok: false, fallback: true as const, error }
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
    if (!key) return jsonResult(503, fallbackBody('服务端未配置 LLM_API_KEY，已自动回退本地 Mock 演示。'))

    const body = parseBody(req.body)
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
