import { useCallback, useEffect, useRef, useState } from 'react'
import { createCharacterTicker, splitCharacters, TYPEWRITER_INTERVAL_MS, type CharacterTicker } from '../lib/typewriter'

export interface UseTypewriterOptions {
  /** 完整目标文本（store 里的 AI 回复，永远不被改写） */
  text: string
  /** 流式模式：传逐段文本的流；一次性 JSON 模式：传 null/undefined */
  stream?: ReadableStream<string> | null
  /** false 时立即显示全文（Mock 回复 / 历史消息 / 减少动效） */
  enabled?: boolean
  /** 定时器模式的每字间隔，默认 30ms */
  intervalMs?: number
}

/** 尊重系统的「减少动态效果」设置 */
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * [React 最佳实践] 打字机 Hook：两条输入路径，一套卸载清理。
 * ------------------------------------------------------------------
 *  · stream 有值 → 逐字上屏：读 ReadableStream<string>，收到一段就 append 一段
 *  · stream 为空 → 30ms 定时器：把完整 JSON 里取出的长文本切成字逐个渲染
 *  · enabled=false / 系统减少动效 → 直接显示全文，不创建任何定时器
 *
 * 关键：effect 的 cleanup 一定执行 stop()，同时清 setInterval、cancel 流 reader。
 * 用户快速切换页面导致组件卸载时，不会留下任何在途定时器或 setState。
 */
export function useTypewriter({
  text,
  stream = null,
  enabled = true,
  intervalMs = TYPEWRITER_INTERVAL_MS,
}: UseTypewriterOptions) {
  const shouldAnimate = enabled && !prefersReducedMotion()
  const [visible, setVisible] = useState(() => (shouldAnimate ? '' : text))
  const [isTyping, setIsTyping] = useState(false)
  const tickerRef = useRef<CharacterTicker | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const cancelledRef = useRef(false)

  /** 唯一的资源释放入口 */
  const stop = useCallback(() => {
    tickerRef.current?.stop()
    tickerRef.current = null
    const reader = readerRef.current
    readerRef.current = null
    if (reader) {
      try { void reader.cancel() } catch { /* 已释放 */ }
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false

    if (!shouldAnimate) {
      setVisible(text)
      setIsTyping(false)
      return () => {
        cancelledRef.current = true
        stop()
      }
    }

    setVisible('')
    setIsTyping(true)

    if (stream) {
      /* ---- 路径 1：后端 SSE 流式，逐段上屏 ---- */
      const reader = stream.getReader()
      readerRef.current = reader
      void (async () => {
        try {
          for (;;) {
            if (cancelledRef.current) break
            const { done, value } = await reader.read()
            if (done || cancelledRef.current) break
            if (value) setVisible((prev) => prev + value)
          }
        } catch {
          /* 流被取消或网络中断：由外层的完整 JSON 结果兜底 */
        } finally {
          try { reader.releaseLock() } catch { /* 忽略 */ }
          readerRef.current = null
          if (!cancelledRef.current) setIsTyping(false)
        }
      })()
    } else {
      /* ---- 路径 2：一次性完整 JSON，30ms 定时器模拟 ---- */
      tickerRef.current = createCharacterTicker(
        splitCharacters(text),
        (next, done) => {
          if (cancelledRef.current) return
          setVisible(next)
          if (done) setIsTyping(false)
        },
        intervalMs,
      )
    }

    return () => {
      /* 切页 / 卸载 / 下一条消息 / text 变化：定时器与流在这里全部收干净 */
      cancelledRef.current = true
      stop()
    }
  }, [text, stream, shouldAnimate, intervalMs, stop])

  /** 用户点一下气泡即可跳过动画，直接看全文 */
  const skip = useCallback(() => {
    stop()
    setVisible(text)
    setIsTyping(false)
  }, [text, stop])

  return { visible, isTyping, skip }
}
