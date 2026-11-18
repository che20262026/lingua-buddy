/**
 * LinguaBuddy · 语音转写接口（Netlify Functions）
 * ------------------------------------------------------------------
 * 部署位置：netlify/functions/transcribe.ts
 *   → Netlify 自动映射为 POST /.netlify/functions/transcribe
 *
 * 为什么需要它：
 *   浏览器自带的 webkitSpeechRecognition 底层走 Google 云服务，
 *   **国内网络不可达**——Android Chrome 上表现为「onstart 后静默等待、
 *   最后 onend 无任何结果」，用户以为录音功能坏了。
 *   这条后端通道复用项目已有的 LLM_API_KEY，把录音交给 DeepSeek 官方
 *   ASR 端点转文字：零新增密钥、零用户配置、开箱即用。
 *
 * DeepSeek ASR 契约（api.deepseek.com/v1/tools/asr）：
 *   - POST multipart/form-data，字段 file
 *   - 仅接受 16-bit PCM WAV 或 Ogg Opus（内容探测，不看扩展名）
 *   - ≤ 8 MiB、≤ 120 秒
 *   - 返回 { request_id, text, duration_ms }
 *   - 无语种参数，自动识别（正好支持中英文混说）
 *
 * 安全与健壮：
 *   - 单一真源 invokeTranscribe()：handler 与本地 server.ts 复用同一份代码；
 *   - 密钥只在服务端读取，绝不回传前端；
 *   - 独立限流桶 `asr:` + IP，与 chat / eval / freetalk 三方互不干扰；
 *   - 输入白名单校验（mime / 大小 / base64 合法性），失败统一 fallback:true 外壳；
 *   - 错误脱敏：上游原始响应不直接回给浏览器，只回中文短句。
 *
 * 环境变量（仅服务端）：
 *   LLM_API_KEY      必填，复用对话那把密钥
 *   LLM_API_BASE     选填，默认 https://api.deepseek.com/v1
 *   LLM_ASR_URL      选填，覆盖为任意 OpenAI 兼容 /audio/transcriptions 端点
 *   ASR_RATE_LIMIT_PER_MINUTE / _PER_DAY  选填，本端点专用额度
 */

import type { NetlifyEvent, NetlifyResult } from './chat'
import {
  checkRateLimit, clientIp, parseLimit, rateLimitHeaders,
  type RateLimitConfig, type RateLimitDecision,
} from '../lib/rateLimit'

/** handler 与本地 Express 共用的最小输入输出 */
export interface TranscribeRequest {
  method?: string
  body?: unknown
  headers?: Record<string, string | undefined>
}
export interface TranscribeResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

/** 本项目专用额度：转写比对话贵，给得保守些 */
export const ASR_PER_MINUTE = 6
export const ASR_PER_DAY = 50
export const ASR_RATE_LIMIT_MESSAGE = '转写太频繁了，稍等一下再试'

/** DeepSeek ASR 的硬限制（官方文档） */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const MAX_AUDIO_MS = 120_000
/** 与 chat.ts / evaluate.ts 对齐：Netlify 同步函数默认 ~10s，留 1s 余量 */
const UPSTREAM_TIMEOUT_MS = 9_000
const DEFAULT_BASE = 'https://api.deepseek.com/v1'

/** 只接受浏览器 MediaRecorder 可能产出、且 DeepSeek 认得的格式 */
const ALLOWED_MIME = [
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/pcm',
  'audio/ogg', 'audio/ogg;codecs=opus', 'audio/opus',
] as const

function fallbackBody(error: string) {
  return { ok: false, fallback: true as const, error }
}

function jsonResult(statusCode: number, payload: unknown): TranscribeResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE },
    body: JSON.stringify(payload),
  }
}

function rateLimitedResult(decision: RateLimitDecision): TranscribeResult {
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
      error: ASR_RATE_LIMIT_MESSAGE,
      retryAfterSeconds: decision.retryAfterSeconds,
    }),
  }
}

export function readAsrRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    perMinute: parseLimit(env.ASR_RATE_LIMIT_PER_MINUTE, ASR_PER_MINUTE),
    perDay: parseLimit(env.ASR_RATE_LIMIT_PER_DAY, ASR_PER_DAY),
  }
}

/** 只回显域名，不泄漏完整地址里可能夹带的参数或密钥 */
function safeProvider(url: string): string {
  try { return new URL(url).host } catch { return 'custom' }
}

/** base64 体积估算：4 字符 = 3 字节，减去填充 */
function decodedSize(b64: string): number {
  const clean = b64.replace(/\s/g, '')
  const pad = (clean.match(/=+$/)?.[0].length) ?? 0
  return Math.floor(clean.length * 3 / 4) - pad
}

function isAllowedMime(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const m = raw.trim().toLowerCase().split(';')[0]
  return (ALLOWED_MIME as readonly string[]).includes(m)
    || ALLOWED_MIME.some((a) => a.split(';')[0] === m)
}

/** 从不可信的上游响应里安全提取文字，兼容多种返回形状 */
export function pickTranscript(data: unknown): { text: string; durationMs: number } {
  if (!data || typeof data !== 'object') return { text: '', durationMs: 0 }
  const d = data as Record<string, unknown>
  const text = typeof d.text === 'string' ? d.text.trim()
    : typeof d.transcript === 'string' ? d.transcript.trim() : ''
  const durationMs = typeof d.duration_ms === 'number' && d.duration_ms >= 0
    ? Math.floor(d.duration_ms)
    : 0
  return { text, durationMs }
}

function friendly(err: unknown): string {
  const name = (err as { name?: string })?.name || ''
  if (name === 'AbortError') return '转写超时'
  return '服务暂时不可用'
}

/**
 * 单一真源：把一段 base64 音频送去转写。
 * 同时被 Netlify handler 与本地 Express 联调台 server.ts 调用。
 */
export async function invokeTranscribe(req: TranscribeRequest): Promise<TranscribeResult> {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const url = String(process.env.LLM_ASR_URL || '').trim()
      || `${String(process.env.LLM_API_BASE || DEFAULT_BASE).replace(/\/+$/, '')}/tools/asr`
    return jsonResult(200, {
      ok: true,
      configured: Boolean(String(process.env.LLM_API_KEY || '').trim()),
      provider: safeProvider(url),
      maxBytes: MAX_AUDIO_BYTES,
      maxDurationMs: MAX_AUDIO_MS,
    })
  }
  if (method !== 'POST') {
    return jsonResult(405, fallbackBody('仅支持 POST 提交音频'))
  }

  /* 限流：桶键 asr: + IP，与其余三个端点互不干扰 */
  const decision = checkRateLimit(
    `asr:${clientIp(req.headers)}`,
    readAsrRateLimitConfig(),
  )
  if (!decision.allowed) return rateLimitedResult(decision)

  const key = String(process.env.LLM_API_KEY || '').trim()
  if (!key) {
    return jsonResult(503, fallbackBody('服务端未配置 LLM_API_KEY，语音转写暂不可用'))
  }

  let payload: Record<string, unknown>
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!raw || typeof raw !== 'object') throw new Error('请求体为空')
    payload = raw as Record<string, unknown>
  } catch {
    return jsonResult(400, fallbackBody('请求体不是合法 JSON'))
  }

  const b64 = typeof payload.audio === 'string' ? payload.audio.replace(/\s/g, '') : ''
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return jsonResult(400, fallbackBody('音频数据无效'))
  }
  const bytes = decodedSize(b64)
  if (bytes <= 0 || bytes > MAX_AUDIO_BYTES) {
    return jsonResult(413, fallbackBody('音频过大（上限 8MB）'))
  }
  if (!isAllowedMime(payload.mime)) {
    return jsonResult(400, fallbackBody('音频格式不支持，请用 WAV 或 Ogg Opus'))
  }
  const durationMs = typeof payload.durationMs === 'number'
    && Number.isFinite(payload.durationMs) ? payload.durationMs : 0
  if (durationMs > MAX_AUDIO_MS) {
    return jsonResult(413, fallbackBody('音频过长（上限 120 秒）'))
  }

  const url = String(process.env.LLM_ASR_URL || '').trim()
    || `${String(process.env.LLM_API_BASE || DEFAULT_BASE).replace(/\/+$/, '')}/tools/asr`

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS) : null
  try {
    /* Netlify Functions 有 Buffer；本地 server.ts 也有（Node 环境）。
       Buffer 不可用时用 atob 兜底，保持纯 JS 路径也能跑。 */
    const binary = typeof Buffer !== 'undefined'
      ? Buffer.from(b64, 'base64')
      : (() => {
          const out = new Uint8Array(bytes)
          const raw = globalThis.atob(b64)
          for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
          return out
        })()

    const form = new FormData()
    const mime = String(payload.mime).toLowerCase().split(';')[0]
    const ext = mime.includes('wav') ? 'wav' : 'ogg'
    form.append('file', new Blob([binary as BlobPart], { type: mime }), `speech.${ext}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      ...(controller ? { signal: controller.signal } : {}),
    })

    if (!res.ok) {
      /* 脱敏：只读状态码，不把上游正文回给浏览器 */
      return jsonResult(res.status === 429 ? 429 : 502,
        fallbackBody(`转写服务返回 HTTP ${res.status}，请稍后重试`))
    }

    const raw = await res.text()
    let data: unknown = raw
    try { data = JSON.parse(raw) } catch { /* 纯文本也接受 */ }
    const { text, durationMs: upstreamMs } = pickTranscript(data)
    if (!text) return jsonResult(502, fallbackBody('转写服务没有返回文字'))

    return jsonResult(200, {
      ok: true,
      text: text.slice(0, 2000), // 不可信数据：截断
      durationMs: upstreamMs || durationMs,
      mode: 'live',
    })
  } catch (err) {
    return jsonResult(504, fallbackBody(`转写失败：${friendly(err)}，可直接输入文字继续`))
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Netlify Functions 入口：event → invokeTranscribe → { statusCode, headers, body } */
export const handler = async (event: NetlifyEvent): Promise<NetlifyResult> => {
  let rawBody: unknown = event.body ?? undefined
  if (typeof rawBody === 'string' && event.isBase64Encoded && typeof Buffer !== 'undefined') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
  }
  try {
    const result = await invokeTranscribe({
      method: event.httpMethod || 'GET',
      body: rawBody,
      headers: event.headers,
    })
    return { statusCode: result.statusCode, headers: result.headers, body: result.body }
  } catch (err) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE },
      body: JSON.stringify(fallbackBody(`转写函数异常：${friendly(err)}`)),
    }
  }
}
