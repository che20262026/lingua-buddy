/**
 * 语音转写前端通道
 * ------------------------------------------------------------------
 * 背景：浏览器自带 webkitSpeechRecognition 在国内 Android 上连不上 Google，
 * 会静默失败——点麦克风后一直"在听"，却一个字都不出。
 * 这条路把录音送到自家 Netlify 函数，由服务端用 DeepSeek ASR 转文字，
 * 前端零密钥、用户零配置。
 */

import { blobToWav } from '../lib/speech'

const ENDPOINT = '/.netlify/functions/transcribe'

export type TranscribeFailure = {
  reason: 'invalid' | 'rate-limited' | 'unavailable' | 'aborted' | 'empty'
  detail?: string
}

export type TranscribeResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; failure: TranscribeFailure }

function classify(status: number, payload: Record<string, unknown>): TranscribeFailure {
  if (status === 429) return { reason: 'rate-limited', detail: typeof payload.error === 'string' ? payload.error : undefined }
  if (status >= 400 && status < 500) return { reason: 'invalid', detail: typeof payload.error === 'string' ? payload.error : undefined }
  return { reason: 'unavailable', detail: typeof payload.error === 'string' ? payload.error : undefined }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result
      if (typeof data !== 'string') { reject(new Error('读取音频失败')); return }
      const comma = data.indexOf(',')
      resolve(comma >= 0 ? data.slice(comma + 1) : data)
    }
    reader.onerror = () => reject(new Error('读取音频失败'))
    reader.readAsDataURL(blob)
  })
}

/** 把录音 Blob 转成 WAV 再送去服务端转写；任何失败都返回结构化原因，不抛异常打断对话 */
export async function transcribeAudioBlob(
  blob: Blob,
  signal?: AbortSignal,
): Promise<TranscribeResult> {
  let audio: string
  try {
    /* Android MediaRecorder 默认 webm/opus —— 必须转成 DeepSeek 认的 16-bit WAV */
    const wav = await blobToWav(blob)
    audio = await toBase64(wav)
  } catch {
    return { ok: false, failure: { reason: 'invalid', detail: '音频格式转换失败' } }
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, mime: 'audio/wav' }),
      ...(signal ? { signal } : {}),
    })
    let payload: Record<string, unknown> = {}
    try {
      const raw = await res.text()
      const parsed = raw ? JSON.parse(raw) : {}
      if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
    } catch { /* 上游没回 JSON，按状态码分类 */ }

    if (!res.ok) return { ok: false, failure: classify(res.status, payload) }
    if (payload.ok !== true || typeof payload.text !== 'string' || !payload.text.trim()) {
      return { ok: false, failure: { reason: 'empty', detail: typeof payload.error === 'string' ? payload.error : undefined } }
    }
    return {
      ok: true,
      text: payload.text.trim(),
      durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
    }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, failure: { reason: 'aborted' } }
    }
    return { ok: false, failure: { reason: 'unavailable' } }
  }
}
