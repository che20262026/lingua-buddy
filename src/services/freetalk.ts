/**
 * 大肥鱼自由对话 · 前端服务层
 * ------------------------------------------------------------------
 * 职责：把「角色 + 口音 + 对话历史」发给 /.netlify/functions/freetalk，
 *      拿回一句人设化回复；任何失败都**不让对话中断**，而是让本地演示大肥鱼顶上，
 *      同时把失败原因分类交给 UI（限流 / 参数不合法 / 服务不可用 / 已取消）。
 *
 * 与其它模块一致的降级约定：
 *   - 服务层负责降级，UI 只负责展示（错误码 → AiErrorCard）；
 *   - 人设永远不丢：兜底文案来自 src/data/fatFishFallbacks.ts，语气与角色一致；
 *   - 不依赖浏览器特性判断错误码，直接读 res.status（Safari 没有
 *     PerformanceObserver 的 responseStatus，靠它会把 429 静默吞掉）。
 */

import { findFatFishCharacter } from '../data/fatFishCharacters'
import { fallbackFor } from '../data/fatFishFallbacks'
import type { FatFishAccent, FatFishId, FreeTalkMessage, FreeTalkSummary } from '../freetalkTypes'

/** 全应用唯一的自由对话端点（Netlify 生产与本地 Vite 代理同一路径，不做 rewrite） */
export const FREETALK_ENDPOINT = '/.netlify/functions/freetalk'

/** 后端上游 9s 超时 + 网络往返，留足余量 */
const FREETALK_TIMEOUT_MS = 15_000

export type FreeTalkFailureReason = 'rate-limited' | 'invalid' | 'unavailable' | 'aborted'

export interface FreeTalkFailure {
  reason: FreeTalkFailureReason
  /** 用户看到的中文提示 */
  message: string
  /** 诊断小字（HTTP 码等），不展示任何密钥 */
  detail?: string
  status?: number
}

export interface FreeTalkTurnResult {
  /** 这一轮该显示的回复（真实 AI 或本地演示） */
  reply: string
  /** true = 真实 AI；false = 本地演示接管 */
  live: boolean
  /** 失败时的分类信息；live=true 时为 undefined */
  failure?: FreeTalkFailure
}

export interface FreeTalkSummaryResult {
  summary: FreeTalkSummary
  live: boolean
  failure?: FreeTalkFailure
}

/** 失败原因 → 用户看到的中文提示 */
export function freeTalkFailureMessage(reason: FreeTalkFailureReason): string {
  if (reason === 'rate-limited') return '鱼塘太挤了，请稍后再聊'
  if (reason === 'aborted') return '这次没聊完，大肥鱼还在换气。'
  if (reason === 'invalid') return '这条请求没能送出去，先检查一下角色与口音。'
  return '大肥鱼潜水去了，本地演示先顶一下。'
}

/** 从用户这句话里挑一个关键词，作为兜底回复的 {topic} */
export function topicOf(text: string): string {
  const words = (text || '')
    .replace(/[^A-Za-z0-9'\- ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
  return (words[0] || 'that').slice(0, 40)
}

/** 稳定散列：同一句话永远挑到同一个语气词，兜底回复不会「每刷一次就变」 */
function hashOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/** 本地演示回复：用该角色的兜底模板 + 该角色的语气词 */
export function mockFreeTalkReply(
  characterId: FatFishId,
  userText: string,
): string {
  const character = findFatFishCharacter(characterId)
  const fallback = fallbackFor(characterId)
  const toneWords = character?.toneWords ?? ['Well,']
  const tone = toneWords[hashOf(userText) % toneWords.length]
  return fallback.reply
    .replace('{tone}', tone)
    .replace('{topic}', topicOf(userText))
    .replace('{character}', character?.name ?? '大肥鱼')
}

/** 本地演示总结：同样保持角色口吻 */
export function mockFreeTalkSummary(
  characterId: FatFishId,
  userText: string,
): FreeTalkSummary {
  const character = findFatFishCharacter(characterId)
  const fallback = fallbackFor(characterId)
  const toneWords = character?.toneWords ?? ['Well,']
  const tone = toneWords[hashOf(userText) % toneWords.length]
  const topic = topicOf(userText)
  return {
    feeling: fallback.feeling.replace('{tone}', tone).replace('{topic}', topic),
    pronunciation: fallback.pronunciation.replace('{tone}', tone).replace('{topic}', topic),
  }
}

/** 把内部消息转成后端约定的形状（后端只认 role + content） */
function toWire(messages: FreeTalkMessage[]): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map((m) => ({ role: m.role === 'ai' ? 'ai' : 'user', content: m.text.trim().slice(0, 800) }))
}

/**
 * 发一次请求；返回「成功或降级」的统一结果，不抛异常。
 * 抛异常会让 UI 每处都要 try/catch，而这里本来就能给出可展示的失败分类。
 */
async function request(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number; failure?: FreeTalkFailure }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FREETALK_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    const res = await fetch(FREETALK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    /* 本地 Vite dev 无函数代理时该路径会回落到 index.html（text/html）；
       解析失败一律判为 unavailable，不把异常抛给界面 */
    const raw = await res.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {
        ok: false, data: {}, status: res.status,
        failure: {
          reason: res.status === 429 ? 'rate-limited' : 'unavailable',
          message: freeTalkFailureMessage(res.status === 429 ? 'rate-limited' : 'unavailable'),
          detail: `HTTP ${res.status}`,
          status: res.status,
        },
      }
    }
    if (res.status === 429) {
      return {
        ok: false, data, status: 429,
        failure: {
          reason: 'rate-limited',
          message: typeof data.error === 'string' ? data.error : freeTalkFailureMessage('rate-limited'),
          detail: 'HTTP 429',
          status: 429,
        },
      }
    }
    if (res.status >= 400 && res.status < 500) {
      return {
        ok: false, data, status: res.status,
        failure: {
          reason: 'invalid',
          message: typeof data.error === 'string' ? data.error : freeTalkFailureMessage('invalid'),
          detail: `HTTP ${res.status}`,
          status: res.status,
        },
      }
    }
    if (!res.ok || data.ok !== true) {
      return {
        ok: false, data, status: res.status,
        failure: {
          reason: 'unavailable',
          message: typeof data.error === 'string' ? data.error : freeTalkFailureMessage('unavailable'),
          detail: `HTTP ${res.status}`,
          status: res.status,
        },
      }
    }
    return { ok: true, data, status: res.status }
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'AbortError') {
      return {
        ok: false, data: {}, status: 0,
        failure: { reason: 'aborted', message: freeTalkFailureMessage('aborted'), detail: '请求超时或已取消' },
      }
    }
    return {
      ok: false, data: {}, status: 0,
      failure: {
        reason: 'unavailable',
        message: freeTalkFailureMessage('unavailable'),
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

/** 闲聊一轮 */
export async function sendFreeTalkTurn(input: {
  character: FatFishId
  accent: FatFishAccent
  messages: FreeTalkMessage[]
  signal?: AbortSignal
}): Promise<FreeTalkTurnResult> {
  const res = await request({
    character: input.character,
    accent: input.accent,
    mode: 'chat',
    messages: toWire(input.messages),
  }, input.signal)

  if (res.ok) {
    const reply = typeof res.data.reply === 'string' ? res.data.reply.trim() : ''
    if (reply) return { reply, live: true }
  }
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')
  return {
    reply: mockFreeTalkReply(input.character, lastUser?.text ?? ''),
    live: false,
    failure: res.failure,
  }
}

/** 「结束并总结」 */
export async function summarizeFreeTalk(input: {
  character: FatFishId
  accent: FatFishAccent
  messages: FreeTalkMessage[]
  signal?: AbortSignal
}): Promise<FreeTalkSummaryResult> {
  const res = await request({
    character: input.character,
    accent: input.accent,
    mode: 'summary',
    messages: toWire(input.messages),
  }, input.signal)

  if (res.ok) {
    const raw = res.data.summary as Partial<FreeTalkSummary> | undefined
    const feeling = typeof raw?.feeling === 'string' ? raw.feeling.trim() : ''
    const pronunciation = typeof raw?.pronunciation === 'string' ? raw.pronunciation.trim() : ''
    /* 上游只给了其中一段时，另一段用该角色的本地文案补齐——
       宁可给一句本地的人设化兜底，也不要让总结卡片出现空白栏。 */
    if (feeling || pronunciation) {
      const mock = mockFreeTalkSummary(input.character, [...input.messages].reverse().find((m) => m.role === 'user')?.text ?? '')
      return {
        summary: {
          feeling: feeling || mock.feeling,
          pronunciation: pronunciation || mock.pronunciation,
        },
        live: true,
      }
    }
  }
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')
  return {
    summary: mockFreeTalkSummary(input.character, lastUser?.text ?? ''),
    live: false,
    failure: res.failure,
  }
}
