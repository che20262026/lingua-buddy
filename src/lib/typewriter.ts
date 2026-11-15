/**
 * 打字机效果的纯逻辑层（无 React / 无 DOM，可独立单测）。
 * ------------------------------------------------------------------
 * 分三块：
 *  1. splitCharacters          —— 按 Unicode 码点切字，emoji 不会被劈成两半
 *  2. SseDeltaDecoder          —— 把跨网络 chunk 的半帧 SSE 拼回完整 data: 帧
 *  3. ReplyFieldExtractor      —— 上游输出的是结构化 JSON，只把 reply 正文增量吐出来
 *  4. createCharacterTicker    —— 30ms 定时器；stop() 是卸载时唯一的清理入口
 */

export const TYPEWRITER_INTERVAL_MS = 30

/** 按 Unicode 码点切分；Array.from 天然兼容 emoji 与中文，不做 UTF-16 半字符切割 */
export function splitCharacters(text: string): string[] {
  return Array.from(text)
}

/**
 * SSE 帧解码器。网络 chunk 可能在 data: 帧中间断开，所以保留未闭合的最后一行。
 * 只取 OpenAI 兼容格式的 choices[0].delta.content，忽略 [DONE] / event: error。
 */
export class SseDeltaDecoder {
  private buffer = ''

  push(chunk: string): string {
    if (!chunk) return ''
    this.buffer += chunk.replace(/\r\n/g, '\n')
    const lines = this.buffer.split('\n')
    /* 最后一行可能还没收全，留到下一帧 */
    this.buffer = lines.pop() ?? ''
    let out = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const frame = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = frame.choices?.[0]?.delta?.content
        if (typeof delta === 'string') out += delta
      } catch {
        /* 半帧 / 非 JSON 事件帧，忽略即可 */
      }
    }
    return out
  }

  /** 流结束时冲刷残留的半帧 */
  flush(): string {
    const rest = this.buffer
    this.buffer = ''
    if (!rest) return ''
    return this.push(`${rest}\n`)
  }
}

/**
 * 流式 JSON 的 reply 字段增量提取器。
 * 上游按 system prompt 返回的是 {reply, translation, feedback, ...}，
 * 若把 delta 原样上屏会显示 {"reply":"Th... 这种源码。这里只输出英文回复正文的新增部分。
 */
export class ReplyFieldExtractor {
  private raw = ''
  private emitted = ''

  push(delta: string): string {
    if (!delta) return ''
    this.raw += delta
    const match = this.raw.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)/)
    if (!match) return ''
    const body = match[1]
    let decoded = ''
    try {
      decoded = JSON.parse(`"${body}"`) as string
    } catch {
      /* 尾部可能是被切断的转义序列（\n / \uXXXX），截掉悬空反斜杠再解 */
      const safe = body.replace(/\\+$/, '')
      try { decoded = JSON.parse(`"${safe}"`) as string } catch { return '' }
    }
    if (decoded.length <= this.emitted.length) return ''
    const next = decoded.slice(this.emitted.length)
    this.emitted = decoded
    return next
  }
}

export interface CharacterTicker {
  /** 卸载 / 跳过 / text 变化时调用，清掉 setInterval，杜绝内存泄漏 */
  stop(): void
}

/**
 * 每 intervalMs 渲染一个字。onTick(visible, done) 第二个参数表示已到末尾。
 * 定时器只在这里创建、只由 stop() 销毁 —— Hook 的 cleanup 直接调它即可。
 */
export function createCharacterTicker(
  characters: string[],
  onTick: (visible: string, done: boolean) => void,
  intervalMs: number = TYPEWRITER_INTERVAL_MS,
): CharacterTicker {
  if (characters.length === 0) {
    onTick('', true)
    return { stop: () => {} }
  }
  let index = 0
  let timer: ReturnType<typeof setInterval> | null = null
  const finish = () => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
  timer = setInterval(() => {
    index += 1
    const done = index >= characters.length
    onTick(characters.slice(0, index).join(''), done)
    if (done) finish()
  }, intervalMs)
  return { stop: finish }
}
