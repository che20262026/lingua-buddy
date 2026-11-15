import { AI_ENDPOINT } from './aiStatus'
import { ReplyFieldExtractor, SseDeltaDecoder } from '../lib/typewriter'

/** 与 /api/chat 的 POST 契约一致（额外带 stream:true 走 SSE 分支） */
export interface DialogueStreamPayload {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  level: string
  meta?: Record<string, unknown>
}

/**
 * [Streaming] 打开 /api/chat 的 SSE 流，转换成「逐段英文回复文本」的 ReadableStream<string>。
 * ------------------------------------------------------------------
 * api/chat.ts 在 stream:true 时把上游 SSE 原样透传（本文件**不修改后端**）。
 * 上游按 prompt 输出结构化 JSON，所以这里做两级解码：
 *   字节 → SseDeltaDecoder（拼回 data: 帧）→ ReplyFieldExtractor（只取 reply 正文增量）
 *
 * 任何失败（无 Key、非 SSE 响应、断网、signal 取消）都返回 null，
 * 调用方自动降级到 30ms 定时器模拟，不影响练习。
 *
 * 返回的流被 cancel() 时会连带 cancel 上游 reader —— 组件卸载即释放连接。
 */
export async function openDialogueReplyStream(
  payload: DialogueStreamPayload,
  signal: AbortSignal,
): Promise<ReadableStream<string> | null> {
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    })
    if (!res.ok || !res.body) return null
    const contentType = res.headers?.get?.('content-type') || ''
    /* 后端没走 SSE（例如返回了 5xx JSON）就不当流处理 */
    if (contentType && !contentType.includes('text/event-stream')) return null

    const upstream = res.body.getReader()
    const bytes = new TextDecoder()
    const frames = new SseDeltaDecoder()
    const reply = new ReplyFieldExtractor()

    return new ReadableStream<string>({
      start(controller) {
        void (async () => {
          try {
            for (;;) {
              const { done, value } = await upstream.read()
              if (done) break
              const rawDelta = frames.push(bytes.decode(value, { stream: true }))
              const piece = reply.push(rawDelta)
              if (piece) controller.enqueue(piece)
            }
            const tailRaw = frames.push(bytes.decode()) + frames.flush()
            const tail = reply.push(tailRaw)
            if (tail) controller.enqueue(tail)
            controller.close()
          } catch (err) {
            try { controller.error(err) } catch { /* 已关闭，忽略 */ }
          } finally {
            try { upstream.releaseLock() } catch { /* 忽略 */ }
          }
        })()
      },
      cancel() {
        /* Hook 卸载时调用：连上游 fetch 的 reader 一起取消 */
        void upstream.cancel().catch(() => {})
      },
    })
  } catch {
    return null
  }
}
