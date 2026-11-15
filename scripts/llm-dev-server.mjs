/**
 * LinguaBuddy · 本地 Serverless 联调台（legacy 备选）
 * ------------------------------------------------------------------
 * 把 api/chat.ts 原样挂成 http://127.0.0.1:3001/api/chat，
 * 并自带一个 OpenAI 兼容的「假上游」，零真 Key / 零外网即可跑通全链路。
 * Vite dev 的 /api 代理指向这里（vite.config.ts），Vercel 部署时不生效。
 *
 * ⚠️ 新的推荐入口是 npm run dev:full（Express + server.ts）与 npm run dev:mock，
 *    本脚本保留作无 Express 依赖的轻量备选。两者都监听 3001，**不要同时启动**。
 *
 * 用法（项目根目录）：
 *   npm run dev:ai                          # 内置假上游 + 同时拉起 Vite dev
 *   npm run dev:ai -- --no-key              # 故意不配 Key：验证 503 + 前端 Mock 降级
 *   npm run dev:ai -- --real                # 读 .env 里的真实 LLM_API_KEY / BASE
 *   node scripts/llm-dev-server.mjs        # 只起后端，另开终端跑 npm run dev
 *
 * 单独验证接口：
 *   curl http://127.0.0.1:3001/api/chat
 *   curl -X POST http://127.0.0.1:3001/api/chat -H "Content-Type: application/json" \
 *        -d '{"messages":[{"role":"user","content":"hi"}],"level":"B1"}'
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const PORT = Number(process.env.LLM_DEV_PORT || 3001)

/** 只读取 .env 里的非 VITE_ 变量；绝不把它们注入前端 */
function readServerEnv() {
  const file = path.join(root, '.env')
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || m[1].startsWith('VITE_') || line.trimStart().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const fileEnv = readServerEnv()
const realKey = fileEnv.LLM_API_KEY || process.env.LLM_API_KEY || ''
const realBase = fileEnv.LLM_API_BASE || process.env.LLM_API_BASE || 'https://api.deepseek.com/v1'
const realModel = fileEnv.LLM_MODEL || process.env.LLM_MODEL || 'deepseek-chat'

let mode = 'mock-upstream'
if (args.includes('--no-key')) {
  delete process.env.LLM_API_KEY
  mode = 'no-key（故意不配密钥，测降级）'
} else if (args.includes('--real')) {
  process.env.LLM_API_KEY = realKey
  process.env.LLM_API_BASE = realBase
  process.env.LLM_MODEL = realModel
  mode = realKey ? '真实上游（.env / 系统环境变量）' : '真实模式但未找到密钥 → 将返回 503'
} else {
  process.env.LLM_API_KEY = 'local-dev-placeholder'
  process.env.LLM_API_BASE = `http://127.0.0.1:${PORT}/mock/v1`
  process.env.LLM_MODEL = 'mock-dialogue'
}

/** 假上游返回的 content：一份能被 normalizeRemote 解析的 DirectorOutput JSON */
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

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })
}

/** OpenAI 兼容假上游：支持 stream:true 的 SSE，便于单独测流式透传 */
async function mockUpstream(req, res) {
  const payload = await readBody(req)
  if (payload.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
    const mid = Math.floor(CANNED.length / 2)
    for (const part of [CANNED.slice(0, mid), CANNED.slice(mid)]) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    id: 'mock-chat-1', model: 'mock-dialogue',
    choices: [{ index: 0, message: { role: 'assistant', content: CANNED }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 48, total_tokens: 60 },
  }))
}

/** 把 api/chat.ts 的 TS 源码用 esbuild 转成 ESM，再从 data: URL 动态导入 */
const chatTs = fs.readFileSync(path.join(root, 'api/chat.ts'), 'utf8')
const { code } = await transform(chatTs, { loader: 'ts', format: 'esm', target: 'node18' })
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname.endsWith('/chat/completions') && url.pathname.startsWith('/mock/')) {
    return mockUpstream(req, res)
  }

  const body = await readBody(req)
  /** 最小 VercelResponse 适配器 */
  const adapter = {
    method: req.method,
    body,
    status(code) { res.statusCode = code; return adapter },
    json(obj) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(obj))
    },
    setHeader(k, v) { if (!res.headersSent) res.setHeader(k, v) },
    write(chunk) { return res.write(chunk) },
    end(chunk) { res.end(chunk) },
  }
  try {
    await handler({ method: req.method || 'GET', body }, adapter)
  } catch (err) {
    if (!res.headersSent) res.statusCode = 503
    res.end(JSON.stringify({ ok: false, fallback: true, error: String(err && err.message ? err.message : err) }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[LLM-DEV] 模式: ${mode}`)
  console.log(`[LLM-DEV] GET  http://127.0.0.1:${PORT}/api/chat             （模式探测）`)
  console.log(`[LLM-DEV] POST http://127.0.0.1:${PORT}/api/chat             （对话生成）`)
  console.log(`[LLM-DEV] 前端请访问 http://127.0.0.1:5173/ ，/api 由 Vite 代理过来`)
  if (args.includes('--with-vite')) console.log('[LLM-DEV] 正在拉起 Vite dev server …')
})

if (args.includes('--with-vite')) {
  const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173'], {
    cwd: root, stdio: 'inherit',
  })
  const stop = () => {
    try { vite.kill('SIGTERM') } catch { /* ignore */ }
    server.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
