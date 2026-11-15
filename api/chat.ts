/**
 * LinguaBuddy · 真实 AI 对话 Serverless 接口（Vercel Node Runtime）
 * ------------------------------------------------------------------
 * 部署位置：项目根目录 api/chat.ts → Vercel 自动映射为 POST/GET /api/chat
 *
 * 环境变量（只在服务端读取，绝对不要加 VITE_ 前缀）：
 *   LLM_API_KEY   必填，OpenAI 兼容服务的密钥
 *   LLM_API_BASE   选填，默认 https://api.deepseek.com/v1
 *                  （DeepSeek / Kimi / OpenAI 都填到 /v1 这一层，函数自动补 /chat/completions）
 *   LLM_MODEL      选填，默认 deepseek-chat
 *
 * 契约：
 *   GET  /api/chat           → 模式探测，前端据此显示「真实 AI / 本地 Mock」徽章，永不返回密钥
 *   POST /api/chat           → { messages: [{role, content}], level: string, stream?: boolean }
 *                            成功：{ ok: true, mode: 'live', content: string, model }
 *                            stream:true 时透传上游 SSE（text/event-stream）
 *                            任何失败：{ ok: false, fallback: true, error: '友好提示' } + 5xx
 *                            fallback: true 是给前端的暗号 —— 立刻回退本地 Mock，不打断练习
 *
 * 安全：密钥不出现在日志、响应、错误信息里；messages 有数量与长度上限；上游 30 秒超时。
 */

type ChatRole = 'system' | 'user' | 'assistant'
interface WireMessage { role: ChatRole; content: string }

/** 最小请求/响应契约：与 Vercel 的 VercelRequest / VercelResponse 结构兼容，无需额外依赖 */
interface ApiRequest {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}
interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
  setHeader(name: string, value: string): void
  write(chunk: string): boolean | void
  end(chunk?: string): void
}

const DEFAULT_BASE = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'
const MAX_MESSAGES = 24
const MAX_CHARS = 4000
/** 上游超时 15 秒：LLM 挂起时不让 Vercel 函数一直占着连接（code-review 硬性要求） */
const UPSTREAM_TIMEOUT_MS = 15_000

/** 统一降级外壳：前端看到 fallback:true 就知道该用 Mock 了 */
function fallbackBody(error: string) {
  return { ok: false, fallback: true as const, error }
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

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  /* 整个函数体包在 try 里：任何意外都不会变成 500 崩溃页，而是可执行降级的 JSON */
  try {
    const method = String(req.method || 'GET').toUpperCase()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS')
      res.status(204).end()
      return
    }

    const { key, base, model } = readEnv()

    /** GET：前端用来判断「真实 AI 还是 Mock」，只读配置存在性，绝不回传密钥 */
    if (method === 'GET') {
      res.status(200).json({
        ok: true,
        mode: key ? 'live' : 'mock',
        configured: Boolean(key),
        provider: safeProvider(base),
        model,
        message: key
          ? '真实 AI 已接入'
          : '服务端未配置 LLM_API_KEY，前端将使用本地 Mock',
      })
      return
    }

    if (method !== 'POST') {
      res.status(405).json(fallbackBody('仅支持 GET / POST 请求'))
      return
    }

    if (!key) {
      res.status(503).json(fallbackBody('服务端未配置 LLM_API_KEY，已自动回退本地 Mock 演示。'))
      return
    }

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
      res.status(502).json(fallbackBody(`大模型服务返回 HTTP ${upstream.status}${detail ? `（${detail}）` : ''}，已自动回退本地 Mock。`))
      return
    }

    /** 可选流式：上游 SSE 原样透传，不缓冲、不改写（Vercel Node 函数支持 res.write） */
    if (stream && upstream.body) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (chunk) res.write(chunk)
        }
        const tail = decoder.decode()
        if (tail) res.write(tail)
      } catch (streamErr) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: friendly(streamErr) })}\n\n`)
      }
      res.end()
      return
    }

    /** 标准 JSON：把上游 choices[0].message.content 透传给前端，由服务层解析成 DirectorOutput */
    const data = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('上游未返回文本内容')
    res.status(200).json({ ok: true, mode: 'live', content, model, provider: safeProvider(base) })
    return
  } catch (err) {
    res.status(503).json(fallbackBody(`AI 服务暂时不可用：${friendly(err)}，已自动回退本地 Mock 演示。`))
  }
}
