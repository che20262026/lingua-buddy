/**
 * 可选的语音转文字（ASR）通道。
 *
 * 默认不启用：设置里端点留空时应用仍是零后端、零密钥。
 * 用户填入 OpenAI 兼容的 /audio/transcriptions 地址后，本地录音 Blob
 * 会在浏览器自带听写失败时被送去转写，作为「自动出字」的第二条路。
 *
 * 只做纯 HTTP 调用，不内置任何密钥；密钥由用户填写并只存本机 localStorage。
 */

import type { Settings } from '../types'
import type { AsrResultLike } from '../lib/speech'

export type AsrConfig = Pick<Settings, 'asrEndpoint' | 'asrKey' | 'asrModel'>

export const isAsrConfigured = (cfg: Partial<AsrConfig> | undefined): boolean =>
  Boolean(cfg?.asrEndpoint?.trim())

/**
 * 用户可能填 base URL、/v1、/chat/completions 或完整 transcription 地址，
 * 统一归一到 /audio/transcriptions，少一个「地址填错就没反应」的坑。
 */
export function normalizeAsrEndpoint(raw: string): string {
  const url = (raw || '').trim().replace(/\/+$/, '')
  if (!url) return ''
  if (/\/audio\/transcriptions(\?|$)/i.test(url)) return url
  if (/\/chat\/completions(\?|$)/i.test(url)) {
    return url.replace(/\/chat\/completions(\?.*)?$/i, '/audio/transcriptions')
  }
  if (/\/audio\/translations(\?|$)/i.test(url)) {
    return url.replace(/\/audio\/translations(\?.*)?$/i, '/audio/transcriptions')
  }
  if (/\/v\d+(?:\/|$)/i.test(url) || /\/api\/v\d+(?:\/|$)/i.test(url)) {
    return `${url}/audio/transcriptions`
  }
  return `${url}/v1/audio/transcriptions`
}

/** 兼容常见返回体：{text} / {transcript} / {results:[…]} / {data:{…}} / {choices:[…]} */
export function pickAsrText(data: unknown): string {
  if (typeof data === 'string') {
    const s = data.trim()
    if (!s.startsWith('{') && !s.startsWith('[')) return s
    try { return pickAsrText(JSON.parse(s)) } catch { return s }
  }
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  for (const key of ['text', 'transcript', 'output_text', 'content']) {
    if (typeof d[key] === 'string' && String(d[key]).trim()) return String(d[key]).trim()
  }
  if (d.data && typeof d.data === 'object') {
    const inner = pickAsrText(d.data)
    if (inner) return inner
  }
  if (Array.isArray(d.results)) {
    const joined = d.results
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).transcript : ''))
      .filter((t): t is string => typeof t === 'string' && !!t.trim())
      .join(' ')
      .trim()
    if (joined) return joined
  }
  if (Array.isArray(d.choices) && d.choices[0] && typeof d.choices[0] === 'object') {
    const c = d.choices[0] as Record<string, unknown>
    if (typeof c.text === 'string' && c.text.trim()) return c.text.trim()
    if (c.message && typeof c.message === 'object') {
      const m = c.message as Record<string, unknown>
      if (typeof m.content === 'string' && m.content.trim()) return m.content.trim()
    }
  }
  if (Array.isArray(d.segments)) {
    const joined = d.segments
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).text : ''))
      .filter((t): t is string => typeof t === 'string' && !!t.trim())
      .join(' ')
      .trim()
    if (joined) return joined
  }
  return ''
}

function blobFileName(blob: Blob): string {
  const type = (blob.type || '').toLowerCase()
  if (type.includes('mp4') || type.includes('m4a')) return 'speech.m4a'
  if (type.includes('ogg')) return 'speech.ogg'
  if (type.includes('wav')) return 'speech.wav'
  if (type.includes('mpeg') || type.includes('mp3')) return 'speech.mp3'
  return 'speech.webm'
}

/** 把录音送去转写；任何失败都返回中文原因，绝不抛异常打断对话 */
export async function transcribeAudio(
  blob: Blob,
  cfg: AsrConfig,
  language = 'en',
  timeoutMs = 15000,
): Promise<AsrResultLike> {
  if (!isAsrConfigured(cfg)) return { error: '未配置转写服务地址' }
  if (typeof fetch !== 'function') return { error: '当前环境没有网络请求能力，无法调用转写服务' }

  const endpoint = normalizeAsrEndpoint(cfg.asrEndpoint)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const form = new FormData()
    form.append('file', blob, blobFileName(blob))
    form.append('model', cfg.asrModel?.trim() || 'whisper-1')
    if (language) form.append('language', language)
    form.append('response_format', 'json')

    const headers: Record<string, string> = {}
    if (cfg.asrKey?.trim()) headers.Authorization = `Bearer ${cfg.asrKey.trim()}`
    const res = await fetch(endpoint, {
      method: 'POST', headers, body: form,
      ...(controller ? { signal: controller.signal } : {}),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { error: `转写服务返回 HTTP ${res.status}${detail ? `：${detail.slice(0, 120)}` : ''}` }
    }
    const raw = await res.text()
    let data: unknown = raw
    try { data = JSON.parse(raw) } catch { /* 纯文本返回也接受 */ }
    const text = pickAsrText(data)
    return text ? { text } : { error: '转写服务没有返回可识别的文字' }
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'AbortError') return { error: `转写服务超时（${Math.round(timeoutMs / 1000)} 秒），可重试或先补写文字` }
    return { error: `转写服务调用失败：${name || String(err)}` }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
