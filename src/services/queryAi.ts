/**
 * [查询 Query] 轻量 AI 文本通道 —— 复用现有 /.netlify/functions/chat
 * ------------------------------------------------------------------
 * 为什么不复用 dialogueDirector：那套绑定「对话档位 / 流式 / 记忆」，且是 FROZEN 文件。
 * 查询模块只需要「一句 system + 一段 user → 一段文本」，这里用最小 fetch 独立实现：
 *  - 超时用 aiStatus.createRequestSignal（只读复用，不改 FROZEN 文件）；
 *  - 失败一律返回结构化结果 + 本地降级文本，绝不抛异常打断 UI；
 *  - 与服务端契约一致：messages:[{role,content}]，成功取 { ok, content }。
 */

import { createRequestSignal } from './aiStatus'

const CHAT_ENDPOINT = '/.netlify/functions/chat'
const DEFAULT_TIMEOUT_MS = 20_000

export type QueryAiResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'aborted' | 'timeout' | 'rate-limited' | 'unavailable' | 'empty'; status?: number; detail?: string; fallbackText?: string }

/** 失败分支：UI 错误状态只存这一种，避免成功态误读 status/detail */
export type QueryAiFailure = Extract<QueryAiResult, { ok: false }>

export interface QueryAiInput {
  system: string
  user: string
  signal?: AbortSignal
  timeoutMs?: number
  /** 失败时的本地降级文本（由调用方按语言决定） */
  fallbackText?: string
}

/**
 * 富文本/图片解析通道：imageDataUrl 以 data URL 形式塞进 user 消息的多模态 content。
 * 服务端 chat 会把 content 原样透传给模型；模型不支持图片时会返回文本拒绝，走降级。
 */
export async function askQueryAi(input: QueryAiInput, imageDataUrl?: string): Promise<QueryAiResult> {
  const req = createRequestSignal(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, input.signal)
  try {
    const userContent = imageDataUrl
      ? [
          { type: 'text', text: input.user },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ]
      : input.user
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: userContent },
        ],
      }),
      signal: req.signal,
    })
    let payload: Record<string, unknown> = {}
    try {
      const raw = await res.text()
      const parsed = raw ? JSON.parse(raw) : {}
      if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
    } catch { /* 上游没回 JSON，按状态码兜底 */ }

    if (!res.ok) {
      const reason = res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'unavailable' : 'unavailable'
      return {
        ok: false, reason, status: res.status,
        detail: typeof payload.error === 'string' ? payload.error : `HTTP ${res.status}`,
        fallbackText: input.fallbackText,
      }
    }
    if (payload.ok !== true || typeof payload.content !== 'string' || !payload.content.trim()) {
      return { ok: false, reason: 'empty', detail: typeof payload.error === 'string' ? payload.error : undefined, fallbackText: input.fallbackText }
    }
    return { ok: true, content: payload.content.trim() }
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'AbortError') {
      const timedOut = !input.signal?.aborted
      return { ok: false, reason: timedOut ? 'timeout' : 'aborted', detail: timedOut ? '请求超时（20 秒）' : '请求已取消', fallbackText: input.fallbackText }
    }
    return { ok: false, reason: 'unavailable', detail: '网络未连通', fallbackText: input.fallbackText }
  } finally {
    req.dispose()
  }
}

/** 系统提示词：把整段文本翻成中文，并按源语言切换措辞（全局语言联动） */
export function translationSystemPrompt(srcLang: 'en' | 'ru', targetHint: string): string {
  const src = srcLang === 'ru' ? '俄语' : '英语'
  return `You are a precise bilingual translator. ${targetHint} 请将以下内容翻译为中文，源语言为${src}。` +
    '只输出译文正文，不要解释、不要加标题、不要 Round-trip 校验。保留原有段落与专有名词。'
}

/** 系统提示词：对生词/短语/长难句做结构化解析 */
export function analysisSystemPrompt(srcLang: 'en' | 'ru'): string {
  const src = srcLang === 'ru' ? '俄语' : '英语'
  return `You are a patient ${src} teacher for Chinese learners. 请用中文对下面的${src}文本做结构化解析，` +
    '分三块输出：① 生词表（词 / 音标或转写 / 中文义）；② 实用短语；③ 长难句拆解（骨架 + 直译 + 意译）。' +
    '用 Markdown 小标题与列表，保持简洁，不要编造原文没有的内容。'
}

/** OCR 系统提示词：读图转写 + 翻译 */
export function ocrSystemPrompt(srcLang: 'en' | 'ru'): string {
  const src = srcLang === 'ru' ? '俄语（西里尔字母）' : '英语'
  return `You are an OCR assistant. 请识别图片中的${src}文字，原样转写（保留重音与标点），` +
    '然后空一行给出中文翻译。只输出「原文」+「译文」两部分，不要描述图片、不要寒暄。若图中没有可识别文字，只回复 EMPTY。'
}
