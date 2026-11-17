/**
 * LinguaBuddy · 纯本地 Express 联调后端
 * ------------------------------------------------------------------
 * 目的：彻底摆脱任何云 CLI（vercel link / netlify login）做本地调试。
 *   npm run dev:server   → 只起后端 http://localhost:3001
 *   npm run dev:full     → concurrently 同时起「后端 3001 + Vite 5173」
 *   npm run dev:mock     → 同上，但后端启用内置假上游（零真 Key 跑通全链路）
 *
 * 设计要点（重要）：
 * 1. **不复制大模型请求逻辑**，而是直接 import netlify/functions/chat.ts 的
 *    invokeChat()。也就是说本地 Express 与 Netlify 生产跑的是同一份核心代码，
 *    Netlify handler 与这里只是「外壳」不同，不存在「本地能跑、上线变样」。
 * 2. 同时响应两条路径：主路径 /.netlify/functions/chat（与生产一致），
 *    以及 legacy /api/chat（旧探针 / 旧文档 / 老 Vercel 部署继续可用）。
 *    Vite proxy 不做 rewrite，因此浏览器里的路径与线上逐字节相同。
 * 3. api/chat.ts 原样保留作 legacy Vercel 入口；Netlify 不会读取它。
 * 4. 环境变量只在服务端读取，绝不回传给前端；/api/health 只暴露布尔值。
 * 5. 仅监听 127.0.0.1（loopback），不对外暴露，沿用项目的防火墙友好约定。
 *
 * 环境变量（.env.local 优先于 .env，系统环境变量优先级最高）：
 *   LLM_API_KEY   OpenAI 兼容服务密钥；不填时 GET 返回 mode:'mock'，前端自动降级
 *   LLM_API_BASE  选填，默认 https://api.deepseek.com/v1
 *   LLM_MODEL     选填，默认 deepseek-chat
 *   PORT          选填，默认 3001
 */
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'

/* ① 先加载环境变量，再 import 核心。
 *    netlify/functions/chat.ts 顶层只有常量、真正读 env 的 readEnv() 在请求时才执行，
 *    但用动态 import 把顺序写死，避免将来有人把 env 读取挪到模块顶层踩坑。 */
for (const file of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), file)
  // dotenv 默认 override:false → .env.local 先加载即优先，系统环境变量不被覆盖
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
}

const { invokeChat } = await import('./netlify/functions/chat.ts')
const { invokeEvaluate } = await import('./netlify/functions/evaluate.ts')

const PORT = Number(process.env.PORT || 3001)
const useMockUpstream = process.argv.includes('--mock')

/* ② 内置假上游模式：显式覆盖成本地地址，零真 Key / 零外网即可验证
 *    GET 探测 → POST 透传 → SSE 流式 → 前端打字机 的完整链路。
 *    日志会明确标注「假上游」，避免误以为接了真实大模型。 */
if (useMockUpstream) {
  process.env.LLM_API_KEY = 'local-dev-placeholder'
  process.env.LLM_API_BASE = `http://127.0.0.1:${PORT}/mock/v1`
  process.env.LLM_MODEL = 'mock-dialogue'
}

/** 假上游返回一份能被 normalizeRemote 解析的 DirectorOutput JSON */
const CANNED = JSON.stringify({
  reply: "That's a lovely idea. Could you tell me a bit more about it?",
  translation: '（中文大意）对你的想法表示欢迎，并邀请你再展开一点。',
  feedback: {
    level: 'none', grammar: '这一句语法没有问题，意思表达得很清楚。',
    wordChoice: '用词自然。', naturalness: '语气友好流畅。', corrected: '',
    praise: '愿意开口表达就很棒 🌱', ieltsTip: '保持每轮 2–3 句的节奏。',
  },
  hints: ['I think ... because ...', 'Could you say more about ...?', 'What I find interesting is that ...'],
  state: { coveredWords: [], mistakes: [], progress: 0.3 },
  end: false,
  effective: true,
})

/** 假上游的「发音考官」回复：形状必须与真实上游一致（外层 choices + 内层 JSON 字符串） */
const CANNED_JUDGE = JSON.stringify({
  score: 88,
  suggestion: '你的 /θ/ 咬舌音没发准，舌尖要轻触上齿再送气。',
})

/** 区分对话与评测两条业务线：评测的 user 消息里带 targetWord 字段 */
function isJudgeRequest(body: unknown): boolean {
  try {
    const messages = (body as { messages?: Array<{ content?: string }> })?.messages
    return Array.isArray(messages) && messages.some((m) => String(m?.content || '').includes('targetWord'))
  } catch { return false }
}

const app = express()
app.disable('x-powered-by')
/* 本地开发服务；浏览器经 Vite 代理访问时本就是同源，这里额外允许直连 / curl */
app.use(cors())
/* Netlify 平台层会自动解析 JSON body，Express 需显式挂载等价中间件 */
app.use(express.json({ limit: '1mb' }))

/** 健康检查：确认后端活着、以及是否已配置真实密钥（只回布尔值） */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'lingua-buddy-local-api',
    port: PORT,
    configured: Boolean(String(process.env.LLM_API_KEY || '').trim()),
    mockUpstream: useMockUpstream,
    endpoints: ['/api/health', '/.netlify/functions/chat', '/.netlify/functions/evaluate', '/api/chat (legacy)'],
  })
})

/** OpenAI 兼容假上游：支持 stream:true 的 SSE，便于单独测流式透传 */
if (useMockUpstream) {
  app.post('/mock/v1/chat/completions', (req, res) => {
    /* 发音评测与对话共用同一个假上游端点，靠请求内容区分：
       评测的 user 消息里带 targetWord，返回「考官 JSON」而不是对话 JSON。 */
    const canned = isJudgeRequest(req.body) ? CANNED_JUDGE : CANNED
    const stream = req.body?.stream === true
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-store')
      res.flushHeaders?.()
      const mid = Math.floor(canned.length / 2)
      for (const part of [canned.slice(0, mid), canned.slice(mid)]) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
    res.json({
      id: 'local-mock-chat-1', model: 'mock-dialogue',
      choices: [{ index: 0, message: { role: 'assistant', content: canned }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 48, total_tokens: 60 },
    })
  })
}

/**
 * 把 Express 请求头归一化后透传给核心函数：
 * 限流从中取客户端 IP，本地才与线上同一套判定。
 */
function toClientHeaders(req: express.Request): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(req.headers)) {
    headers[name] = Array.isArray(value) ? value[0] : value
  }
  return headers
}

/**
 * 核心路由：把 Express 请求转成核心函数期望的最小形状后委托出去，
 * 再把 { statusCode, headers, body } 写回响应。
 * 路径都保留前缀（Vite proxy 不做 rewrite）。
 */
app.all(['/.netlify/functions/chat', '/api/chat'], async (req, res) => {
  try {
    const result = await invokeChat({
      method: req.method,
      body: req.body,
      query: req.query,
      headers: toClientHeaders(req),
    })
    res.status(result.statusCode)
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
    res.end(result.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      res.status(503).json({ ok: false, fallback: true, error: `本地后端异常：${message}` })
    } else {
      res.end()
    }
  }
})

/**
 * [AI 发音评测] 与 chat 同源的第二个函数端点：
 * 同样复用 netlify/functions/evaluate.ts 的 invokeEvaluate —— 本地跑的就是生产那份代码。
 * 限流桶带 eval: 前缀，与对话桶互相独立。
 */
app.all(['/.netlify/functions/evaluate'], async (req, res) => {
  try {
    const result = await invokeEvaluate({
      method: req.method,
      body: req.body,
      headers: toClientHeaders(req),
    })
    res.status(result.statusCode)
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
    res.end(result.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      res.status(503).json({ ok: false, fallback: true, error: `本地后端异常：${message}` })
    } else {
      res.end()
    }
  }
})

app.use((_req, res) => {
  res.status(404).json({
    ok: false, fallback: true,
    error: '未知接口；本地仅提供 /api/health、/.netlify/functions/chat、/.netlify/functions/evaluate 与 legacy /api/chat',
  })
})

/* Express 错误中间件：JSON 解析失败（如坏请求体）也返回可降级的友好 JSON */
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)
  if (!res.headersSent) {
    res.status(400).json({ ok: false, fallback: true, error: `请求解析失败：${message}` })
  }
})

const server = app.listen(PORT, '127.0.0.1', () => {
  const key = String(process.env.LLM_API_KEY || '').trim()
  const mode = useMockUpstream
    ? '内置假上游 --mock（零真 Key / 零外网，仅用于链路验证）'
    : key
      ? '真实上游（读 .env.local / .env / 系统环境变量）'
      : '未配置 LLM_API_KEY → GET 返回 mode:mock，前端自动回退本地演示'
  console.log('')
  console.log('[LOCAL-SERVER] Express 后端已启动（纯本地，无需 Netlify CLI / 账号登录）')
  console.log(`[LOCAL-SERVER]    http://localhost:${PORT}/api/health`)
  console.log(`[LOCAL-SERVER]    http://localhost:${PORT}/.netlify/functions/chat  （主路径）`)
  console.log(`[LOCAL-SERVER]    http://localhost:${PORT}/.netlify/functions/evaluate  （AI 发音评测）`)
  console.log(`[LOCAL-SERVER]    http://localhost:${PORT}/api/chat  （legacy 兼容）`)
  console.log(`[LOCAL-SERVER] 模式: ${mode}`)
  console.log('[LOCAL-SERVER] Vite dev 的 /.netlify/functions 与 /api 已代理到 http://127.0.0.1:' + PORT)
  console.log('[LOCAL-SERVER] 前端请访问 http://localhost:5173/')
  console.log('')
})

/** Ctrl+C / 终端关闭时优雅退出，不留悬挂端口 */
const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
